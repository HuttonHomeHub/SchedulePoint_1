import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';

import type { Command } from './commands';
import { notApplicable, writeOrSetAside, type ReplayContext, type ReplayResult } from './replay';

/**
 * The undo steps for a plan's **code types and values** (P6 activity codes, M3-T1; `m3-ui-design.md`
 * §8.2). Same contract as `swimlane-commands.ts` and `commands.ts` (ADR-0176): read fresh, compare the
 * fields the step wrote, and write with the row's CURRENT version — or write nothing and say why.
 *
 * **Deleting is undone by one id-stable restore, adding by a delete and a restore**, never by a
 * re-create: a re-create would mint a new id, and every later step that names the old one — and every
 * activity that carries the value — would be orphaned. A type's delete takes its values in one batch
 * and its restore brings back exactly those.
 *
 * What is NOT here: setting a value on activities (`activityCodesCommand`, M3-T3).
 */

export type RenameCodeTypeFn = (input: {
  codeTypeId: string;
  name: string;
  version: number;
}) => Promise<CodeTypeSummary>;
export type ReorderCodeTypesFn = (input: {
  order: { id: string; version: number }[];
}) => Promise<CodeTypeSummary[]>;
export type DeleteCodeTypeFn = (input: { codeTypeId: string; version?: number }) => Promise<void>;
export type RestoreCodeTypeFn = (input: { codeTypeId: string }) => Promise<CodeTypeSummary>;
export type EditCodeValueFn = (input: {
  codeValueId: string;
  codeTypeId: string;
  shortCode?: string;
  description?: string | null;
  version: number;
}) => Promise<CodeValueSummary>;
export type ReorderCodeValuesFn = (input: {
  codeTypeId: string;
  order: { id: string; version: number }[];
}) => Promise<CodeValueSummary[]>;
export type DeleteCodeValueFn = (input: {
  codeValueId: string;
  codeTypeId: string;
  version?: number;
}) => Promise<void>;
export type RestoreCodeValueFn = (input: {
  codeValueId: string;
  codeTypeId: string;
}) => Promise<CodeValueSummary>;

const sameOrder = (list: readonly { id: string }[], ids: readonly string[]): boolean =>
  list.length === ids.length && list.every((row, i) => row.id === ids[i]);

/** The live types by id, read fresh. */
async function currentTypes(
  ctx: ReplayContext,
): Promise<{ list: readonly CodeTypeSummary[]; byId: ReadonlyMap<string, CodeTypeSummary> }> {
  const list = await ctx.readCodeTypes();
  return { list, byId: new Map(list.map((type) => [type.id, type] as const)) };
}

/** One type's live values by id, read fresh; `undefined` when the type is gone. */
async function currentValues(
  ctx: ReplayContext,
  codeTypeId: string,
): Promise<
  { list: readonly CodeValueSummary[]; byId: ReadonlyMap<string, CodeValueSummary> } | undefined
> {
  const list = await ctx.readCodeValues(codeTypeId);
  return list === undefined
    ? undefined
    : { list, byId: new Map(list.map((value) => [value.id, value] as const)) };
}

/**
 * Reverse **adding a code type**. Undo deletes it, if it is still there under the name it was left
 * with: a colleague who renamed it has made it theirs. Redo is the id-stable restore.
 *
 * **Restoring a deleted type from the Deleted list is the same step with the same two halves** (it
 * leaves a live type that undo deletes and redo restores), so it is this builder with `restored`
 * set, which changes the label and nothing else.
 */
export function codeTypeAddCommand(params: {
  created: CodeTypeSummary;
  remove: DeleteCodeTypeFn;
  restore: RestoreCodeTypeFn;
  restored?: boolean;
}): Command {
  const { created, remove, restore, restored = false } = params;
  return {
    label: `${restored ? 'Restore' : 'Add'} code type “${created.name}”`,
    subjects: [],
    affectsSchedule: false,
    undo: async (ctx): Promise<ReplayResult> => {
      const { byId } = await currentTypes(ctx);
      const row = byId.get(created.id);
      if (row === undefined) return notApplicable('gone', created.name);
      if (row.name !== created.name) return notApplicable('changed', created.name);
      return writeOrSetAside(created.name, () =>
        remove({ codeTypeId: created.id, version: row.version }),
      );
    },
    redo: () => writeOrSetAside(created.name, () => restore({ codeTypeId: created.id })),
  };
}

/** Reverse a **rename** of a type: only the name is compared and written. */
export function codeTypeRenameCommand(params: {
  codeTypeId: string;
  /** The name before the rename. */
  before: string;
  /** The row the server saved. */
  after: CodeTypeSummary;
  rename: RenameCodeTypeFn;
}): Command {
  const { codeTypeId, before, after, rename } = params;
  const replay = async (ctx: ReplayContext, from: string, to: string): Promise<ReplayResult> => {
    const { byId } = await currentTypes(ctx);
    const row = byId.get(codeTypeId);
    if (row === undefined) return notApplicable('gone', from);
    if (row.name !== from) return notApplicable('changed', from);
    return writeOrSetAside(from, () => rename({ codeTypeId, name: to, version: row.version }));
  };
  return {
    label: `Rename code type “${before}”`,
    subjects: [],
    affectsSchedule: false,
    undo: (ctx) => replay(ctx, after.name, before),
    redo: (ctx) => replay(ctx, before, after.name),
  };
}

/**
 * Reverse a **reorder** of the types. The whole order is one write, so the check is the whole order:
 * if a colleague added, removed or moved any type since, the order the step left is not the order on
 * the server, and writing the old one would silently undo their change as well.
 */
export function codeTypeReorderCommand(params: {
  before: readonly CodeTypeSummary[];
  after: readonly CodeTypeSummary[];
  /** The type the planner moved, for the label. */
  movedName: string;
  reorder: ReorderCodeTypesFn;
}): Command {
  const { before, after, movedName, reorder } = params;
  const replay = async (
    ctx: ReplayContext,
    from: readonly CodeTypeSummary[],
    to: readonly CodeTypeSummary[],
  ): Promise<ReplayResult> => {
    const { list, byId } = await currentTypes(ctx);
    if (
      !sameOrder(
        list,
        from.map((type) => type.id),
      )
    ) {
      return notApplicable('changed', movedName);
    }
    // The CURRENT version of each: a rename in between bumped it and is not a reason to refuse.
    const order = to.flatMap((type) => {
      const row = byId.get(type.id);
      return row === undefined ? [] : [{ id: type.id, version: row.version }];
    });
    return writeOrSetAside(movedName, () => reorder({ order }));
  };
  return {
    label: `Move code type “${movedName}”`,
    subjects: [],
    affectsSchedule: false,
    undo: (ctx) => replay(ctx, after, before),
    redo: (ctx) => replay(ctx, before, after),
  };
}

/**
 * Reverse **deleting a type** — one id-stable restore, which brings back the values the delete took.
 * Nothing is written to any activity: the delete never touched them. Redo deletes it again, if it is
 * still there under the name it was restored with.
 */
export function codeTypeDeleteCommand(params: {
  deleted: CodeTypeSummary;
  remove: DeleteCodeTypeFn;
  restore: RestoreCodeTypeFn;
}): Command {
  const { deleted, remove, restore } = params;
  return {
    label: `Delete code type “${deleted.name}”`,
    subjects: [],
    affectsSchedule: false,
    undo: () => writeOrSetAside(deleted.name, () => restore({ codeTypeId: deleted.id })),
    redo: async (ctx) => {
      const { byId } = await currentTypes(ctx);
      const row = byId.get(deleted.id);
      if (row === undefined) return notApplicable('gone', deleted.name);
      if (row.name !== deleted.name) return notApplicable('changed', deleted.name);
      return writeOrSetAside(deleted.name, () =>
        remove({ codeTypeId: deleted.id, version: row.version }),
      );
    },
  };
}

/**
 * Reverse **adding a value**. Undo deletes it if it still has the short code it was left with (and a
 * type that is itself gone sets the step aside); redo is the id-stable restore, which the server
 * refuses with `PARENT_DELETED` while the type is deleted.
 */
export function codeValueAddCommand(params: {
  created: CodeValueSummary;
  typeName: string;
  remove: DeleteCodeValueFn;
  restore: RestoreCodeValueFn;
  /** The value came back from the Deleted list rather than being made: same halves, another label. */
  restored?: boolean;
}): Command {
  const { created, typeName, remove, restore, restored = false } = params;
  const target = { codeValueId: created.id, codeTypeId: created.codeTypeId };
  return {
    label: `${restored ? 'Restore' : 'Add'} value “${created.shortCode}” ${restored ? 'of' : 'to'} ${typeName}`,
    subjects: [],
    affectsSchedule: false,
    undo: async (ctx): Promise<ReplayResult> => {
      const values = await currentValues(ctx, created.codeTypeId);
      const row = values?.byId.get(created.id);
      if (row === undefined) return notApplicable('gone', created.shortCode);
      if (row.shortCode !== created.shortCode) return notApplicable('changed', created.shortCode);
      return writeOrSetAside(created.shortCode, () => remove({ ...target, version: row.version }));
    },
    redo: () => writeOrSetAside(created.shortCode, () => restore(target)),
  };
}

/** Reverse an **edit** of a value: the short code and the description are compared and written. */
export function codeValueEditCommand(params: {
  before: CodeValueSummary;
  after: CodeValueSummary;
  edit: EditCodeValueFn;
}): Command {
  const { before, after, edit } = params;
  const replay = async (
    ctx: ReplayContext,
    from: CodeValueSummary,
    to: CodeValueSummary,
  ): Promise<ReplayResult> => {
    const values = await currentValues(ctx, from.codeTypeId);
    const row = values?.byId.get(from.id);
    if (row === undefined) return notApplicable('gone', from.shortCode);
    if (row.shortCode !== from.shortCode || row.description !== from.description) {
      return notApplicable('changed', from.shortCode);
    }
    return writeOrSetAside(from.shortCode, () =>
      edit({
        codeValueId: from.id,
        codeTypeId: from.codeTypeId,
        shortCode: to.shortCode,
        description: to.description,
        version: row.version,
      }),
    );
  };
  return {
    label: `Edit value “${before.shortCode}”`,
    subjects: [],
    affectsSchedule: false,
    undo: (ctx) => replay(ctx, after, before),
    redo: (ctx) => replay(ctx, before, after),
  };
}

/** Reverse a **reorder** of one type's values, on the whole-order check the types use. */
export function codeValueReorderCommand(params: {
  codeTypeId: string;
  before: readonly CodeValueSummary[];
  after: readonly CodeValueSummary[];
  movedName: string;
  reorder: ReorderCodeValuesFn;
}): Command {
  const { codeTypeId, before, after, movedName, reorder } = params;
  const replay = async (
    ctx: ReplayContext,
    from: readonly CodeValueSummary[],
    to: readonly CodeValueSummary[],
  ): Promise<ReplayResult> => {
    const values = await currentValues(ctx, codeTypeId);
    if (values === undefined) return notApplicable('gone', movedName);
    if (
      !sameOrder(
        values.list,
        from.map((value) => value.id),
      )
    ) {
      return notApplicable('changed', movedName);
    }
    const order = to.flatMap((value) => {
      const row = values.byId.get(value.id);
      return row === undefined ? [] : [{ id: value.id, version: row.version }];
    });
    return writeOrSetAside(movedName, () => reorder({ codeTypeId, order }));
  };
  return {
    label: `Move value “${movedName}”`,
    subjects: [],
    affectsSchedule: false,
    undo: (ctx) => replay(ctx, after, before),
    redo: (ctx) => replay(ctx, before, after),
  };
}

/**
 * Reverse **deleting a value** — one id-stable restore: every activity that carried it carries it
 * again, with nothing written to the activities. A type deleted in between answers 409
 * `PARENT_DELETED`, which `writeOrSetAside` already reads as `parent-deleted`. Redo deletes it again
 * if it is still there under the short code it was restored with.
 */
export function codeValueDeleteCommand(params: {
  deleted: CodeValueSummary;
  remove: DeleteCodeValueFn;
  restore: RestoreCodeValueFn;
}): Command {
  const { deleted, remove, restore } = params;
  const target = { codeValueId: deleted.id, codeTypeId: deleted.codeTypeId };
  return {
    label: `Delete value “${deleted.shortCode}”`,
    subjects: [],
    affectsSchedule: false,
    undo: () => writeOrSetAside(deleted.shortCode, () => restore(target)),
    redo: async (ctx) => {
      const values = await currentValues(ctx, deleted.codeTypeId);
      const row = values?.byId.get(deleted.id);
      if (row === undefined) return notApplicable('gone', deleted.shortCode);
      if (row.shortCode !== deleted.shortCode) return notApplicable('changed', deleted.shortCode);
      return writeOrSetAside(deleted.shortCode, () => remove({ ...target, version: row.version }));
    },
  };
}
