import type { SwimlaneSummary } from '@repo/types';

import type { Command } from './commands';
import {
  APPLIED,
  notApplicable,
  writeOrSetAside,
  type ReplayContext,
  type ReplayResult,
} from './replay';

/**
 * The undo steps for the **swimlane list** (swimlanes M2-T9; feature-spec US-2: "the change applies at
 * once, as one undo step"). Same contract as `commands.ts` (ADR-0176): read fresh, compare the fields
 * the step wrote, and write with the row's CURRENT version — or write nothing and say why.
 *
 * What is NOT here, deliberately: assigning an activity to a swimlane (M2-T10), and the plan's
 * `swimlaneSource` write. The source is a plan setting, and the product owner decided plan settings
 * stay outside undo (`coverage.ts` `planSettings`). So undoing a setup removes the swimlanes it
 * created and leaves the source at `MANUAL`: the plan then shows an empty set (just "No swimlane"),
 * which is what a hand-made plan with nothing in it is.
 *
 * Members are never written by these steps. A soft-deleted swimlane keeps its members' `swimlaneId`
 * and their remembered lanes, which is why a delete's undo is one id-stable restore and not a
 * re-create (a re-create would mint a new id and orphan every member).
 */

export type CreateSwimlaneFn = (input: {
  name: string;
  after?: string;
}) => Promise<SwimlaneSummary>;
export type RenameSwimlaneFn = (input: {
  swimlaneId: string;
  name: string;
  version: number;
}) => Promise<SwimlaneSummary>;
export type ReorderSwimlanesFn = (input: {
  order: { id: string; version: number }[];
}) => Promise<SwimlaneSummary[]>;
export type DeleteSwimlaneFn = (input: { swimlaneId: string; version?: number }) => Promise<void>;
export type RestoreSwimlaneFn = (input: { swimlaneId: string }) => Promise<SwimlaneSummary>;

/** The active swimlanes by id, read fresh. */
async function currentSwimlanes(
  ctx: ReplayContext,
): Promise<{ list: readonly SwimlaneSummary[]; byId: ReadonlyMap<string, SwimlaneSummary> }> {
  const list = await ctx.readSwimlanes();
  return { list, byId: new Map(list.map((s) => [s.id, s] as const)) };
}

/**
 * Reverse **adding** swimlanes — one at a time from the gutter or the manage dialog, or all of a
 * setup. Undo deletes what was created; redo is the id-stable restore of it, **not a re-create**, so
 * any later step that names the id (a rename, a move) still addresses the same swimlane.
 *
 * Undo requires each swimlane to still be there under the name it was left with: a colleague who
 * renamed it has made it theirs, and deleting it would take their work with it.
 */
export function swimlaneAddCommand(params: {
  created: readonly SwimlaneSummary[];
  remove: DeleteSwimlaneFn;
  restore: RestoreSwimlaneFn;
}): Command {
  const { created, remove, restore } = params;
  const expected = new Map(created.map((s) => [s.id, s.name] as const));
  // Which of them are in the plan now. A retry after a partial failure skips what already moved.
  const live = new Set(created.map((s) => s.id));
  const first = created[0];
  return {
    label:
      created.length === 1 && first !== undefined
        ? `Add swimlane “${first.name}”`
        : `Add ${String(created.length)} swimlanes`,
    subjects: [],
    affectsSchedule: false,
    undo: async (ctx): Promise<ReplayResult> => {
      const { byId } = await currentSwimlanes(ctx);
      for (const id of live) {
        const row = byId.get(id);
        const name = expected.get(id) ?? '';
        if (row === undefined) return notApplicable('gone', name);
        if (row.name !== name) return notApplicable('changed', name);
      }
      // Last first, so a failure part-way leaves the earlier ones in place and the order intact.
      for (const swimlane of [...created].reverse()) {
        if (!live.has(swimlane.id)) continue;
        const row = byId.get(swimlane.id);
        const result = await writeOrSetAside(swimlane.name, () =>
          remove({ swimlaneId: swimlane.id, ...(row ? { version: row.version } : {}) }),
        );
        if (result.kind !== 'applied') return result;
        live.delete(swimlane.id);
      }
      return APPLIED;
    },
    redo: async (): Promise<ReplayResult> => {
      for (const swimlane of created) {
        if (live.has(swimlane.id)) continue;
        const result = await writeOrSetAside(swimlane.name, () =>
          restore({ swimlaneId: swimlane.id }),
        );
        if (result.kind !== 'applied') return result;
        live.add(swimlane.id);
      }
      return APPLIED;
    },
  };
}

/**
 * Reverse a **rename**: only the name is compared and written, so a colleague's reorder is not in its
 * way. Stateless — each direction names the name it expects to find and the one it writes.
 */
export function swimlaneRenameCommand(params: {
  swimlaneId: string;
  /** The name before the rename. */
  before: string;
  /** The row the server saved. */
  after: SwimlaneSummary;
  rename: RenameSwimlaneFn;
}): Command {
  const { swimlaneId, before, after, rename } = params;
  const replay = async (ctx: ReplayContext, from: string, to: string): Promise<ReplayResult> => {
    const { byId } = await currentSwimlanes(ctx);
    const row = byId.get(swimlaneId);
    if (row === undefined) return notApplicable('gone', from);
    if (row.name !== from) return notApplicable('changed', from);
    return writeOrSetAside(from, () => rename({ swimlaneId, name: to, version: row.version }));
  };
  return {
    label: `Rename swimlane “${before}”`,
    subjects: [],
    affectsSchedule: false,
    undo: (ctx) => replay(ctx, after.name, before),
    redo: (ctx) => replay(ctx, before, after.name),
  };
}

const sameOrder = (list: readonly { id: string }[], ids: readonly string[]): boolean =>
  list.length === ids.length && list.every((s, i) => s.id === ids[i]);

/**
 * Reverse a **reorder** (move up, move down). The whole order is one write, so the check is the whole
 * order: if a colleague added, removed or moved any swimlane since, the order the step left is not
 * the order on the server, and writing the old one would silently undo their change as well.
 */
export function swimlaneReorderCommand(params: {
  /** The order before, as read when the write was made. */
  before: readonly SwimlaneSummary[];
  /** The order the server saved. */
  after: readonly SwimlaneSummary[];
  /** The swimlane the planner moved, for the label. */
  movedName: string;
  reorder: ReorderSwimlanesFn;
}): Command {
  const { before, after, movedName, reorder } = params;
  const replay = async (
    ctx: ReplayContext,
    from: readonly SwimlaneSummary[],
    to: readonly SwimlaneSummary[],
  ): Promise<ReplayResult> => {
    const { list, byId } = await currentSwimlanes(ctx);
    if (
      !sameOrder(
        list,
        from.map((s) => s.id),
      )
    )
      return notApplicable('changed', movedName);
    // The CURRENT version of each, not the one remembered: a rename in between bumped it and is not
    // a reason to refuse an order change.
    const order = to.flatMap((s) => {
      const row = byId.get(s.id);
      return row === undefined ? [] : [{ id: s.id, version: row.version }];
    });
    return writeOrSetAside(movedName, () => reorder({ order }));
  };
  return {
    label: `Move swimlane “${movedName}”`,
    subjects: [],
    affectsSchedule: false,
    undo: (ctx) => replay(ctx, after, before),
    redo: (ctx) => replay(ctx, before, after),
  };
}

/**
 * Reverse a **delete** — one id-stable restore (US-2: "Undo restores the swimlane, and every member
 * returns to its remembered lane in it"). Nothing is written to the members, because the delete never
 * touched them: they kept their `swimlaneId`, and the server restores the swimlane under its old
 * position. Redo deletes it again, if it is still there under the name it was restored with.
 */
export function swimlaneDeleteCommand(params: {
  deleted: SwimlaneSummary;
  remove: DeleteSwimlaneFn;
  restore: RestoreSwimlaneFn;
}): Command {
  const { deleted, remove, restore } = params;
  return {
    label: `Delete swimlane “${deleted.name}”`,
    subjects: [],
    affectsSchedule: false,
    // The delete already happened at the call site, so undo is the restore.
    undo: () => writeOrSetAside(deleted.name, () => restore({ swimlaneId: deleted.id })),
    redo: async (ctx) => {
      const { byId } = await currentSwimlanes(ctx);
      const row = byId.get(deleted.id);
      if (row === undefined) return notApplicable('gone', deleted.name);
      if (row.name !== deleted.name) return notApplicable('changed', deleted.name);
      return writeOrSetAside(deleted.name, () =>
        remove({ swimlaneId: deleted.id, version: row.version }),
      );
    },
  };
}
