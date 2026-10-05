import type {
  ActivitySummary,
  ActivityType,
  ConstraintType,
  DependencySummary,
  DependencyType,
  LagCalendarSource,
} from '@repo/types';

import type { UpdateParentsFn } from './record-commands';
import {
  APPLIED,
  checkActivities,
  checkDeletable,
  isNotFound,
  checkDependencies,
  linkName,
  notApplicable,
  pick,
  ReplayFailure,
  replayActivities,
  replayActivity,
  replayDependency,
  writeOrSetAside,
  type ReplayContext,
  type ReplayResult,
} from './replay';

import type {
  ActivityDefinitionInput,
  DissolveSummaryResponse,
  PlacedActivityInput,
} from '@/features/activities/api/use-activities';
import { typeChangeReexpressesDates } from '@/features/activities/model/type-change-dates';
import { isDurationDerivedType } from '@/features/activities/schemas/activity-schemas';
import { ApiFetchError } from '@/lib/api/client';
import { minorToMajorInput } from '@/lib/format-money';

/**
 * A single reversible plan-authoring edit (ADR-0048, amended by ADR-0176). `redo` re-applies the
 * original edit; `undo` applies its inverse. Both replay plan **inputs** through the existing REST
 * mutation hooks — never engine-owned derived columns — so the CPM engine and its recalc parity gate
 * stay untouched; the normal ADR-0032 auto-recalc redraws the outputs after either direction.
 *
 * **A replay checks before it writes.** Each builder below declares the rows it touched and the
 * fields it wrote; a replay re-reads those rows, compares ONLY the written fields against the state
 * the step left, and — when they match — writes only those fields with the row's CURRENT version. A
 * mismatch writes nothing and answers `not-applicable`, which the history sets aside (ADR-0176 D2,
 * D3). A multi-row step succeeds or fails as a whole.
 *
 * The state a replay expects is the **server's saved row**, never the value the client sent: the
 * server normalises (a milestone's dates, ADR-0162), so comparing what was sent would refuse a
 * perfectly good undo. After a replay applies, the opposite direction's expectation is refreshed from
 * that write's response, for the same reason.
 *
 * Builders stay pure and cheap to construct — a label, the captured rows and the mutation function(s)
 * they need, closing over nothing React.
 */
export interface Command {
  /** Human label for the edit — surfaces in the Undo/Redo controls, announcements and the strip. */
  readonly label: string;
  /** Apply the inverse of the edit (restore the pre-edit state), or say why it cannot be applied. */
  undo: (ctx: ReplayContext) => Promise<ReplayResult>;
  /** Re-apply the original edit (restore the post-edit state), or say why it cannot be applied. */
  redo: (ctx: ReplayContext) => Promise<ReplayResult>;
  /**
   * Optional coalescing descriptor (ADR-0048 M2.3). A pointer drag or a held-key nudge fires many
   * intermediate writes for one user gesture; the seam records a command per successful write, but
   * the user thinks of the whole gesture as ONE reversible step. When set, the history store merges a
   * freshly-recorded command with the top-of-undo-stack command that shares its {@link
   * CommandCoalescing.key}, provided the two land within one interaction window (mirroring the
   * ADR-0032 coalesced-recalc boundary). Discrete edits (a dialog save) leave this unset and never
   * coalesce.
   */
  readonly coalescing?: CommandCoalescing;
  /**
   * Whether replaying this step can change what the scheduling engine would compute. Defaults to
   * `true` when omitted — a replay that forgot to say is recalculated, never silently skipped. Only
   * the two layout-only builders ({@link relaneCommand}, {@link autoArrangeCommand}) say `false`:
   * a lane index is not a scheduling input, so recalculating after one is wasted work.
   */
  readonly affectsSchedule?: boolean;
}

/** How a coalescable command folds into the previous same-key step. */
export interface CommandCoalescing {
  /** Same-key consecutive commands recorded within one interaction collapse to a single undo step. */
  readonly key: string;
  /**
   * Build the combined command from `previous` (the older, top-of-stack command) and this newer one:
   * undo restores `previous`'s pre-edit state, redo re-applies THIS command's post-edit state, and the
   * expectation a replay checks is THIS command's saved row (the live row after the whole gesture).
   * Called as `newCommand.coalescing.merge(topOfStack)`.
   */
  merge: (previous: Command) => Command;
}

/** Internal: the pre-edit params a coalescable command stashes so a later merge can read them. */
interface CoalesceState<P> {
  readonly before: P;
}

/**
 * Attach coalescing to a command built from a `{ before, after }` pair. `rebuild` re-runs the owning
 * builder (so the merged command is itself coalescable and checks against the newest saved row);
 * `merge` reads the *older* command's stashed `before` and rebuilds original-before → this-after — so
 * a chain of N intermediate writes always collapses to one step spanning the first pre-edit and last
 * post-edit state, regardless of how many merges happened along the way.
 */
function coalescable<P>(
  command: Command,
  spec: { key: string; before: P; after: P; rebuild: (before: P, after: P) => Command },
): Command {
  const coalescing: CommandCoalescing & CoalesceState<P> = {
    key: spec.key,
    before: spec.before,
    merge: (previous: Command): Command => {
      const prev = previous.coalescing as
        (CommandCoalescing & Partial<CoalesceState<P>>) | undefined;
      const prevBefore = prev && 'before' in prev ? prev.before : spec.before;
      return spec.rebuild(prevBefore, spec.after);
    },
  };
  return { ...command, coalescing };
}

/** `useUpdateActivityFields().mutateAsync` — a partial PATCH of exactly the fields in `patch`. */
export type PatchActivityFieldsFn = (input: {
  activityId: string;
  version: number;
  patch: Record<string, unknown>;
}) => Promise<ActivitySummary>;

/** `useRepositionLane().mutateAsync` — the minimal, layout-only lane PATCH. */
export type RepositionLaneFn = (input: {
  activityId: string;
  laneIndex: number;
  version: number;
}) => Promise<ActivitySummary>;

/**
 * Project an activity row into the full definition PATCH body `useUpdateActivity` expects — the same
 * `ActivitySummary → form-values` seed the edit dialog performs on open. `laneIndex` is carried
 * separately by the caller — it isn't part of the definition schema. (Still the canvas's start-edge
 * resize seed; the undo steps no longer resend it whole — see {@link definitionStepCommand}.)
 */
export function activityDefinitionInput(activity: ActivitySummary): ActivityDefinitionInput {
  return {
    name: activity.name,
    code: activity.code ?? '',
    type: activity.type,
    durationType: activity.durationType,
    // The exact stored minutes, not the rounded day (ADR-0070): a round-trip must preserve a
    // sub-day duration, and `durationMinutes` overrides the text field for exactly this case. The
    // text is still filled in so the shape stays one type, and it is what the day-denominated
    // reading of the same value would be.
    duration: String(activity.durationDays),
    durationMinutes: activity.durationMinutes,
    constraintType: activity.constraintType ?? '',
    constraintDate: activity.constraintDate ?? '',
    secondaryConstraintType: activity.secondaryConstraintType ?? '',
    secondaryConstraintDate: activity.secondaryConstraintDate ?? '',
    scheduleAsLateAsPossible: activity.scheduleAsLateAsPossible,
    expectedFinish: activity.expectedFinish ?? '',
    externalEarlyStart: activity.externalEarlyStart ?? '',
    externalLateFinish: activity.externalLateFinish ?? '',
    calendarId: activity.calendarId ?? '',
    parentId: activity.parentId ?? '',
    levelingPriority: activity.levelingPriority ?? undefined,
    percentCompleteType: activity.percentCompleteType,
    accrualType: activity.accrualType,
    physicalPercentComplete: activity.physicalPercentComplete ?? undefined,
    budgetedExpense: minorToMajorInput(activity.budgetedExpense),
    actualExpense: minorToMajorInput(activity.actualExpense),
    description: activity.description ?? '',
  };
}

/**
 * One activity's field step: the fields it wrote, the state each direction expects to find, and the
 * write that restores a target. Every single-row activity builder below is this with a different
 * field list and write.
 *
 * `after` is what a REDO writes and `saved` is what the server held after the forward write — the
 * undo's expectation. They differ exactly where the server normalised, which is why the expectation
 * is read from `saved`. After a replay applies, the other direction's expectation becomes that
 * write's response (the same reason, one hop along).
 */
function fieldStep<K extends keyof ActivitySummary>(params: {
  id: string;
  name: string;
  fields: readonly K[];
  before: Pick<ActivitySummary, K>;
  after: Pick<ActivitySummary, K>;
  saved: Pick<ActivitySummary, K>;
  write: (target: Pick<ActivitySummary, K>, row: ActivitySummary) => Promise<ActivitySummary>;
}): Pick<Command, 'undo' | 'redo'> {
  const { id, name, fields, before, after, write } = params;
  let atUndo: Pick<ActivitySummary, K> = pick(params.saved, fields);
  let atRedo: Pick<ActivitySummary, K> = pick(before, fields);
  const replay = (
    ctx: ReplayContext,
    expect: Pick<ActivitySummary, K>,
    target: Pick<ActivitySummary, K>,
    settle: (saved: Pick<ActivitySummary, K>) => void,
  ): Promise<ReplayResult> =>
    fields.length === 0
      ? Promise.resolve(APPLIED)
      : replayActivity(ctx, { id, name, expect }, async (row) => {
          settle(pick(await write(target, row), fields));
        });
  return {
    undo: (ctx) =>
      replay(ctx, atUndo, before, (saved) => {
        atRedo = saved;
      }),
    redo: (ctx) =>
      replay(ctx, atRedo, after, (saved) => {
        atUndo = saved;
      }),
  };
}

/**
 * The definition fields an edit can write — every one a partial PATCH accepts and a row carries
 * under the same name. Duration is the exact stored minutes (ADR-0070), never the rounded day.
 */
const DEFINITION_KEYS = [
  'name',
  'code',
  'description',
  'type',
  'durationMinutes',
  'durationType',
  'constraintType',
  'constraintDate',
  'secondaryConstraintType',
  'secondaryConstraintDate',
  'scheduleAsLateAsPossible',
  'expectedFinish',
  'externalEarlyStart',
  'externalLateFinish',
  'calendarId',
  'parentId',
  'levelingPriority',
  'percentCompleteType',
  'accrualType',
  'physicalPercentComplete',
  'budgetedExpense',
  'actualExpense',
  'laneIndex',
] as const satisfies readonly (keyof ActivitySummary)[];

type DefinitionKey = (typeof DEFINITION_KEYS)[number];

/** A constraint is written with its date or not at all — the API pairs them (both-or-neither). */
const CONSTRAINT_PAIRS: readonly (readonly [DefinitionKey, DefinitionKey])[] = [
  ['constraintType', 'constraintDate'],
  ['secondaryConstraintType', 'secondaryConstraintDate'],
];

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * The fields a definition edit changed, diffed from the **server's** before and after rows — not from
 * the form, which could miss a field the write changed (a normalised date, a recomputed duration).
 */
function changedDefinitionFields(before: ActivitySummary, after: ActivitySummary): DefinitionKey[] {
  const changed = new Set<DefinitionKey>(
    DEFINITION_KEYS.filter((key) => !sameValue(before[key], after[key])),
  );
  // A duration-derived target (summary, hammock, level of effort) takes its duration from elsewhere;
  // the client never writes one for it (`durationFields` sends `0`), so it is not this step's field.
  if (isDurationDerivedType(before.type) || isDurationDerivedType(after.type)) {
    changed.delete('durationMinutes');
  }
  for (const [typeKey, dateKey] of CONSTRAINT_PAIRS) {
    if (changed.has(typeKey) || changed.has(dateKey)) {
      changed.add(typeKey);
      changed.add(dateKey);
    }
  }
  // The dates the server re-expresses when a zero-duration activity's type crosses the
  // finish-milestone convention (ADR-0162 decision 3) are CONSEQUENCES of the type change, not things
  // the planner wrote, so a step neither compares nor writes them: sent back with the type they would
  // be read in the new type's convention (`typeChangeCommand`'s docblock), and the server
  // re-expresses them again in the other direction by itself — which returns the row byte-identical.
  // A constraint whose TYPE changed too was a real edit and keeps its date.
  if (typeChangeReexpressesDates(before.type, before.durationMinutes, after.type)) {
    changed.delete('externalEarlyStart');
    changed.delete('externalLateFinish');
    for (const [typeKey, dateKey] of CONSTRAINT_PAIRS) {
      if (sameValue(before[typeKey], after[typeKey])) {
        changed.delete(typeKey);
        changed.delete(dateKey);
      }
    }
  }
  return DEFINITION_KEYS.filter((key) => changed.has(key));
}

/**
 * The definition a row held when a step left it — what a step that DELETES the row expects to find.
 * Deleting is the one write a field comparison cannot be skipped for: it destroys whatever a
 * colleague changed since, along with everything cascaded from it. A duration-derived type's
 * duration is not its own (the engine rolls it up), so it is not part of the definition.
 */
function definitionState(
  row: ActivitySummary,
  omit: readonly DefinitionKey[] = [],
): Partial<ActivitySummary> {
  return pick(
    row,
    DEFINITION_KEYS.filter(
      (key) =>
        !omit.includes(key) && !(key === 'durationMinutes' && isDurationDerivedType(row.type)),
    ),
  );
}

/** The partial PATCH body for a target's values of `fields`. */
function patchBody<K extends DefinitionKey>(
  target: Pick<ActivitySummary, K>,
  fields: readonly K[],
): Record<string, unknown> {
  return Object.fromEntries(fields.map((key) => [key, target[key] ?? null]));
}

/**
 * The core of the definition edits: a diffed, field-scoped step over the partial PATCH.
 *
 * It used to resend the activity's WHOLE definition on every undo, which is wrong twice over. It
 * reverted fields the step never touched (so a colleague's later edit to a different field was
 * silently undone along with ours), and it resent dates alongside a type, which the server reads in
 * the new type's convention — the editor's milestone conversion (F-3). Writing only what the step
 * changed fixes both, and is what makes "only the written fields are compared" possible at all.
 */
function definitionStepCommand(params: {
  label: string;
  patch: PatchActivityFieldsFn;
  before: ActivitySummary;
  after: ActivitySummary;
  /** When set, the command coalesces with same-key neighbours (a canvas drag/nudge — ADR-0048 M2.3). */
  coalesceKey?: string;
}): Command {
  const { label, patch, before, after, coalesceKey } = params;
  const fields = changedDefinitionFields(before, after);
  const step = fieldStep({
    id: after.id,
    name: before.name,
    fields,
    before,
    after,
    saved: after,
    write: (target, row) =>
      patch({ activityId: row.id, version: row.version, patch: patchBody(target, fields) }),
  });
  const command: Command = { label, ...step };
  if (coalesceKey === undefined) return command;
  return coalescable(command, {
    key: coalesceKey,
    before,
    after,
    rebuild: (b, a) => definitionStepCommand({ label, patch, before: b, after: a, coalesceKey }),
  });
}

/**
 * Reverse a canvas **lane move** — the layout-only `{ laneIndex, version }` PATCH (no constraint, no
 * recalc). The inverse moves the bar back to its previous lane; redo moves it to the new one. The
 * version each write carries is the row's current one, read at replay.
 */
export function relaneCommand(params: {
  repositionLane: RepositionLaneFn;
  activityId: string;
  fromLaneIndex: number;
  toLaneIndex: number;
  /** The row the forward write returned — the state an undo expects to find. */
  saved: ActivitySummary;
  /** The moved activity's name, so the default label says whose lane it was (M1-T1). */
  activityName: string;
  label?: string;
}): Command {
  const { repositionLane, activityId, fromLaneIndex, toLaneIndex, saved } = params;
  const step = fieldStep({
    id: activityId,
    name: params.activityName,
    fields: ['laneIndex'],
    before: { laneIndex: fromLaneIndex },
    after: { laneIndex: toLaneIndex },
    saved,
    write: (target, row) =>
      repositionLane({ activityId, laneIndex: target.laneIndex, version: row.version }),
  });
  const command: Command = {
    label: params.label ?? `Move “${params.activityName}” to lane`,
    ...step,
    affectsSchedule: false,
  };
  return coalescable(command, {
    key: `relane:${activityId}`,
    before: fromLaneIndex,
    after: toLaneIndex,
    // A vertical drag / `Alt+↑/↓` lane nudge is one gesture — collapse its intermediate lanes to a
    // single step (the newest saved row seeds the rebuilt command; ADR-0048 M2.3).
    rebuild: (from, to) =>
      relaneCommand({
        repositionLane,
        activityId,
        fromLaneIndex: from,
        toLaneIndex: to,
        saved,
        activityName: params.activityName,
        ...(params.label !== undefined ? { label: params.label } : {}),
      }),
  });
}

/**
 * Reverse a canvas **finish-edge duration resize** (ADR-0052 M2) — a field-scoped step whose only
 * intended change is the duration. Coalesces per activity (`resize:{id}`) so a drag / held-`Shift+←/→`
 * burst collapses to ONE undo step, exactly like {@link visualStartCommand}'s day-move coalescing.
 */
export function durationResizeCommand(params: {
  patch: PatchActivityFieldsFn;
  before: ActivitySummary;
  after: ActivitySummary;
  label?: string;
}): Command {
  return definitionStepCommand({
    // Name the entity ("Resize “Excavate”"), mirroring the toast convention (S1).
    label: params.label ?? `Resize “${params.before.name}”`,
    patch: params.patch,
    before: params.before,
    after: params.after,
    coalesceKey: `resize:${params.before.id}`,
  });
}

/**
 * Reverse a **definition edit** from the activity form (rename / duration / constraint / …). Undo
 * restores the fields the edit changed and nothing else; redo re-applies them — the same mechanism as
 * {@link durationResizeCommand}, differing only in the default label and in coalescing nothing.
 */
export function updateCommand(params: {
  patch: PatchActivityFieldsFn;
  before: ActivitySummary;
  after: ActivitySummary;
  label?: string;
}): Command {
  return definitionStepCommand({
    // Name the entity ("Edit “Excavate”"), like {@link durationResizeCommand} (S1).
    label: params.label ?? `Edit “${params.before.name}”`,
    patch: params.patch,
    before: params.before,
    after: params.after,
  });
}

/**
 * Reverse **Make milestone…** (ADR-0162 decision 4): a plain `PATCH {version, type}` each way.
 *
 * Exact because the server re-expresses the unsent stored dates when a zero-duration activity's type
 * crosses the milestone convention, in BOTH directions (decision 3): converting a Monday placement
 * to a finish milestone stores the Sunday, and converting back stores the Monday again. So the
 * inverse sends the type and nothing else, and the row returns byte-identical — the journey pins it.
 * A full-definition inverse would be wrong here: it would resend the pre-edit dates alongside the
 * type, and a date sent WITH the type is read in the new type's convention. The check compares the
 * type alone for the same reason: the dates are the server's to move.
 *
 * Discrete (no coalescing): one dialog confirm is one step.
 */
export function typeChangeCommand(params: {
  patch: PatchActivityFieldsFn;
  activityId: string;
  before: ActivityType;
  after: ActivityType;
  /** The row the forward write returned — the state an undo expects to find. */
  saved: ActivitySummary;
  /** The converted activity's name, so the default label names its subject (M1-T1). */
  activityName: string;
  label?: string;
}): Command {
  const step = fieldStep({
    id: params.activityId,
    name: params.activityName,
    fields: ['type'],
    before: { type: params.before },
    after: { type: params.after },
    saved: params.saved,
    write: (target, row) =>
      params.patch({ activityId: row.id, version: row.version, patch: { type: target.type } }),
  });
  return { label: params.label ?? `Make “${params.activityName}” a milestone`, ...step };
}

// ---------------------------------------------------------------------------------------------------
// M2: create / delete, dependency add / remove, Visual-mode placement, and batch auto-arrange.
// ---------------------------------------------------------------------------------------------------

/** `useCreatePlacedActivity().mutateAsync` — a canvas-placed create; resolves to the created row. */
export type CreatePlacedActivityFn = (input: PlacedActivityInput) => Promise<ActivitySummary>;
/**
 * `useDeleteActivity().mutateAsync` — soft-deletes an activity by id and resolves the batch it was
 * deleted in, so an undo can restore exactly what it removed (`docs/TECH_DEBT.md` #116 item 5).
 */
export type DeleteActivityFn = (activityId: string) => Promise<{ deleteBatchId: string }>;

/** `useRestoreDeleteBatch().mutateAsync` — puts a whole batch back, ids and links intact. */
export type RestoreDeleteBatchFn = (input: { deleteBatchId: string }) => Promise<ActivitySummary[]>;

/**
 * Reverse a canvas **create** — undo deletes the just-created activity and keeps the batch the
 * delete returned; redo is the id-stable `restore-batch` of that delete, **not a re-create**.
 *
 * A re-create mints a new id, and every later step that names the old one (a move, a link, a resize)
 * would then address a row that no longer exists — the redo would silently strand the rest of the
 * history. The restore brings the same id back, with its links, exactly as {@link
 * pasteActivitiesCommand} already does for the same reason. Only the create itself is reversed here;
 * the follow-up recalc is never recorded (recompute-don't-restore, ADR-0048).
 *
 * Undo needs the row to still be there — the one thing a delete cannot do without.
 */
export function createActivityCommand(params: {
  created: ActivitySummary;
  deleteActivity: DeleteActivityFn;
  restoreBatch: RestoreDeleteBatchFn;
  label?: string;
}): Command {
  const { created, deleteActivity, restoreBatch } = params;
  let present = true;
  let batchId: string | null = null;
  // The definition the row was left with — by the create, then by each restore.
  let expected = definitionState(created);
  return {
    // Name the created entity ("Add “Excavate”"), mirroring the toast convention (S1).
    label: params.label ?? `Add “${created.name}”`,
    undo: async (ctx) => {
      if (!present) return APPLIED;
      // Deleting takes the row's links with it, and a new bar has none: any link on it now is
      // somebody else's, as is any edit to it. Either sets the step aside rather than delete it.
      const checked = await checkDeletable(ctx, {
        rows: [{ id: created.id, name: created.name, expect: expected }],
        isExpectedLink: () => false,
        knownIds: new Set([created.id]),
      });
      if (!checked.ok) return checked.result;
      return writeOrSetAside(created.name, async () => {
        batchId = (await deleteActivity(created.id)).deleteBatchId;
        present = false;
      });
    },
    redo: async () => {
      if (present || batchId === null) return APPLIED;
      return writeOrSetAside(created.name, async () => {
        const restored = await restoreBatch({ deleteBatchId: batchId as string });
        present = true;
        batchId = null;
        const row = restored.find((r) => r.id === created.id);
        if (row !== undefined) expected = definitionState(row);
      });
    },
  };
}

/**
 * Reverse an activity delete — **one id-stable restore, not a re-create**
 * (`docs/TECH_DEBT.md` #92).
 *
 * `DELETE …/activities/:id` answers `{ deleteBatchId }` and `POST …/activities/restore-batch/:batchId`
 * puts that batch back with its ids and its links intact (`docs/TECH_DEBT.md` #113, ADR-0048 M4). A
 * re-create would lose every dependency the activity had and would leave `activity.deleted` without
 * its `activity.restored` pair in the audit log. A cascade stamps ONE `deleteBatchId` across the
 * whole subtree, so a phase delete is this same command (`docs/TECH_DEBT.md` #230).
 *
 * The batch id is **rethreaded on every redo**: a redo is a new delete and therefore a new batch, so
 * an undo reusing the first id would restore nothing and report success. A refused restore (the phase
 * it was filed under has since been deleted, `PARENT_DELETED`) is the server's decision and reads as
 * such; the redo needs the row to be there.
 */
export function deleteActivityCommand(params: {
  activity: ActivitySummary;
  /** The batch the forward delete returned — what the restore is keyed on. */
  deleteBatchId: string;
  restoreBatch: RestoreDeleteBatchFn;
  deleteActivity: DeleteActivityFn;
  label?: string;
}): Command {
  const { activity, restoreBatch, deleteActivity } = params;
  let batchId = params.deleteBatchId;
  // The delete already happened at the call site, so the command starts in the ABSENT state.
  let present = false;
  const restored = restoredSet();
  return {
    // Name the deleted entity ("Delete “Excavate”"), mirroring the toast convention (S1).
    label: params.label ?? `Delete “${activity.name}”`,
    undo: async (ctx) => {
      if (present) {
        // A retry after the restore landed but the link read failed: finish recording, don't restore.
        await restored.recordLinks(ctx);
        return APPLIED;
      }
      const result = await writeOrSetAside(activity.name, async () => {
        restored.remember(await restoreBatch({ deleteBatchId: batchId }));
        present = true;
      });
      if (result.kind === 'applied') await restored.recordLinks(ctx);
      return result;
    },
    redo: async (ctx) => {
      if (!present) return APPLIED;
      const checked = await restored.checkDeletable(ctx, activity.name);
      if (!checked.ok) return checked.result;
      return writeOrSetAside(activity.name, async () => {
        // The id is stable across the restore, so the redo deletes exactly what was restored.
        batchId = (await deleteActivity(activity.id)).deleteBatchId;
        present = false;
      });
    },
  };
}

/** `useDissolveSummary().mutateAsync` — promotes the summary's children and soft-deletes it. */
export type DissolveSummaryFn = (activityId: string) => Promise<DissolveSummaryResponse>;

/**
 * Reverse a summary **dissolve** — put the summary back and file its children under it again.
 *
 * A dissolve is one server-side compound (promote every child, delete the summary), and
 * `restore-batch` undoes only the second half: the summary returns **alone**, the promotion is not
 * undone (`docs/API.md`). So undo is two writes — the id-stable restore, then one all-or-nothing
 * `updateParents` that sets ONLY `parentId` on the children, at the versions a fresh read finds. The
 * children's other fields are never compared or written: a colleague renaming one is no reason to
 * refuse, and the undo must not put the old name back.
 *
 * **Checked before either write.** Each child must still sit where the dissolve put it; if one was
 * moved, edited-and-moved or deleted since, nothing is written at all and the whole step is skipped.
 * Restoring the summary and then refusing to re-file would leave a half-undone grouping for no gain.
 *
 * **The half that can still fail** is the second write, after the summary is already back. That state
 * is left as it is — a visible, empty summary is harmless and the planner can file work under it — and
 * the planner is told the children were NOT moved back (`unfiled`, or a {@link ReplayFailure} when the
 * cause was a transport fault). A retry after such a failure does not restore twice; it re-files.
 *
 * Redo dissolves again and **rethreads the new batch id**, as {@link deleteActivityCommand} does: it is
 * a new delete, so reusing the first batch would restore nothing and report success. It is refused
 * when the summary was edited, linked, or given a child the step did not put there — a dissolve would
 * promote somebody else's work out of the phase along with the planner's.
 */
export function dissolveCommand(params: {
  /** The summary as it was before the dissolve. */
  summary: ActivitySummary;
  /** What the dissolve answered: the promoted children and the batch the summary went in. */
  result: DissolveSummaryResponse;
  /** The children's names for messages; a child with no entry is named generically. */
  childNames?: ReadonlyMap<string, string>;
  restoreBatch: RestoreDeleteBatchFn;
  dissolve: DissolveSummaryFn;
  updateParents: UpdateParentsFn;
  label?: string;
}): Command {
  const { summary, restoreBatch, dissolve, updateParents } = params;
  const names = params.childNames ?? new Map<string, string>();
  let batchId = params.result.deleteBatchId;
  // Where each child sits while the summary is dissolved — the parent the dissolve promoted it to.
  let promotedTo = new Map(params.result.promoted.map((child) => [child.id, child.parentId]));
  // The dissolve already happened at the call site: the summary is deleted and its children are out.
  let present = false;
  let refiled = false;
  const restored = restoredSet();

  const expectations = (parentFor: (id: string) => string | null) =>
    [...promotedTo.keys()].map((id) => {
      const name = names.get(id);
      return { id, ...(name === undefined ? {} : { name }), expect: { parentId: parentFor(id) } };
    });

  /** Every child must be where the dissolve put it — the check both undo's writes depend on. */
  const checkPromoted = (ctx: ReplayContext) =>
    checkActivities(
      ctx,
      expectations((id) => promotedTo.get(id) ?? null),
    );

  const notRefiledDetail =
    `“${summary.name}” is back, but its activities were not moved back under it. ` +
    'Undo again to try once more.';

  const refile = async (
    ctx: ReplayContext,
    known?: ReadonlyMap<string, ActivitySummary>,
  ): Promise<ReplayResult> => {
    const unfiled = notApplicable('unfiled', summary.name);
    if (promotedTo.size > 0) {
      let rows = known;
      if (rows === undefined) {
        // A retry reads again; a read that fails says nothing about the children, but the planner must
        // still be told the summary is already back rather than shown the generic failure.
        let checked: Awaited<ReturnType<typeof checkPromoted>>;
        try {
          checked = await checkPromoted(ctx);
        } catch (err) {
          throw new ReplayFailure(notRefiledDetail, err);
        }
        if (!checked.ok) return unfiled;
        rows = checked.rows;
      }
      const current = rows;
      try {
        await updateParents({
          parents: [...promotedTo.keys()].flatMap((id) => {
            const row = current.get(id);
            return row === undefined ? [] : [{ id, parentId: summary.id, version: row.version }];
          }),
        });
      } catch (err) {
        if (err instanceof ApiFetchError && (err.status === 409 || err.status === 404)) {
          return unfiled;
        }
        throw new ReplayFailure(notRefiledDetail, err);
      }
    }
    refiled = true;
    try {
      await restored.recordLinks(ctx);
    } catch (err) {
      // The undo has applied. Unread links only make a later redo refuse (unknown links are never
      // assumed), so reporting the whole step as failed would be the wrong answer.
      console.error('Could not read the links on a restored summary after undoing a dissolve', err);
    }
    return APPLIED;
  };

  return {
    label: params.label ?? `Dissolve “${summary.name}”`,
    undo: async (ctx) => {
      if (present && refiled) return APPLIED;
      if (present) return refile(ctx);
      const checked = await checkPromoted(ctx);
      if (!checked.ok) return checked.result;
      let consumed = false;
      const result = await writeOrSetAside(summary.name, async () => {
        try {
          restored.remember(await restoreBatch({ deleteBatchId: batchId }));
          present = true;
        } catch (err) {
          // Not "deleted after your edit": the batch is gone because somebody restored it from Recently
          // deleted, or an earlier restore committed and its answer never arrived.
          if (!(err instanceof ApiFetchError && err.status === 404)) throw err;
          consumed = true;
        }
      });
      if (consumed) return notApplicable('already-restored', summary.name);
      if (result.kind !== 'applied') return result;
      return refile(ctx, checked.rows);
    },
    redo: async (ctx) => {
      if (!present) return APPLIED;
      const children = await checkActivities(
        ctx,
        expectations(() => summary.id),
      );
      if (!children.ok) return children.result;
      const checked = await restored.checkDeletable(ctx, summary.name, [...promotedTo.keys()]);
      if (!checked.ok) return checked.result;
      return writeOrSetAside(summary.name, async () => {
        const dissolved = await dissolve(summary.id);
        batchId = dissolved.deleteBatchId;
        promotedTo = new Map(dissolved.promoted.map((child) => [child.id, child.parentId]));
        present = false;
        refiled = false;
      });
    },
  };
}

/**
 * What a restore brought back, remembered so the redo that deletes it again can tell the planner's
 * own state from somebody else's: the definition each restored row was left with and the links that
 * were on them. A delete cascades, so a colleague's later edit, link or child under any of these would
 * be destroyed along with them — {@link checkDeletable} refuses instead.
 */
function restoredSet() {
  let rows: readonly ActivitySummary[] = [];
  let links: ReadonlySet<string> | null = null;
  return {
    /** Remember what a restore returned; the links are read separately, right after. */
    remember(restored: readonly ActivitySummary[]): void {
      rows = restored;
      links = null;
    },
    /** Read the links on the restored rows, once. */
    async recordLinks(ctx: ReplayContext): Promise<void> {
      if (links !== null) return;
      links = new Set((await ctx.readLinksOf(rows.map((r) => r.id))).keys());
    },
    /** Whether the restored rows may be deleted again, resolving them at their current versions. */
    async checkDeletable(
      ctx: ReplayContext,
      name: string,
      /** Activities that are legitimately filed under a restored summary (a dissolve's children). */
      alsoKnown: readonly string[] = [],
    ) {
      if (rows.length === 0) return { ok: false as const, result: notApplicable('gone', name) };
      const known = links;
      return checkDeletable(ctx, {
        rows: rows.map((row) => ({ id: row.id, name: row.name, expect: definitionState(row) })),
        // Not read yet means unknown, and unknown links are refused rather than assumed.
        isExpectedLink: (link) => known?.has(link.id) ?? false,
        knownIds: new Set([...rows.map((row) => row.id), ...alsoKnown]),
      });
    },
  };
}

/**
 * The dependency-create input `useCreateDependency` takes (endpoints + type + lag).
 *
 * The lag is **minutes** rather than the union the hook accepts: this input is only ever built from
 * a persisted row, which knows its exact minutes, so there is no case here that lacks them.
 */
export interface DependencyLinkInput {
  planId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagMinutes: number;
  lagCalendar: LagCalendarSource;
}
/** `useCreateDependency().mutateAsync` — resolves to the created edge (carrying its new id). */
export type CreateDependencyFn = (input: DependencyLinkInput) => Promise<DependencySummary>;
/** `useDeleteDependency().mutateAsync` — removes an edge by id. */
export type DeleteDependencyFn = (dependencyId: string) => Promise<void>;

/**
 * Project a dependency row into the create input that re-issues it (endpoints/type/lag/lag-calendar).
 *
 * The lag is carried in **minutes**, which is what the row stores and the engine applies (ADR-0036).
 * It used to be `lagDays` — a rounded read of the same value — so undoing the removal of a two-hour
 * cure lag restored the link with **no lag at all**, silently and with no error anywhere. Undo must
 * restore what was there, not what the day-granular view of it happened to look like (ADR-0070 §5).
 */
export function dependencyLinkOf(dependency: DependencySummary): DependencyLinkInput {
  return {
    planId: dependency.planId,
    predecessorId: dependency.predecessor.id,
    successorId: dependency.successor.id,
    type: dependency.type,
    lagMinutes: dependency.lagMinutes,
    lagCalendar: dependency.lagCalendar,
  };
}

/** The fields of a link a step writes, and so the ones a replay compares. */
const LINK_FIELDS = ['type', 'lagMinutes', 'lagCalendar'] as const;
type LinkState = Pick<DependencySummary, (typeof LINK_FIELDS)[number]>;

/**
 * A small state machine over a link that either exists (a known live id) or doesn't. Add and remove
 * are this toggle, differing only in start state and which direction `undo` runs. A re-created link
 * gets a NEW id each time (there is no restore endpoint for a single edge), so the toggle tracks the
 * live id and the state that link was last left in. Idempotent in each direction: a retried replay
 * cannot double-create or double-delete.
 */
function linkToggle(params: {
  dependency: DependencySummary;
  startPresent: boolean;
  createDependency: CreateDependencyFn;
  deleteDependency: DeleteDependencyFn;
}): { ensurePresent: Command['redo']; ensureAbsent: Command['redo'] } {
  const { dependency, createDependency, deleteDependency } = params;
  const link = dependencyLinkOf(dependency);
  const name = linkName(dependency);
  let liveId: string | null = params.startPresent ? dependency.id : null;
  let state: LinkState = pick(dependency, LINK_FIELDS);
  return {
    ensurePresent: async (ctx) => {
      if (liveId !== null) return APPLIED;
      // Both ends must still be there; a link to a deleted bar is the server's 404 anyway, but
      // naming the missing bar is the planner's whole answer.
      const endpoints = [dependency.predecessor, dependency.successor];
      const rows = await ctx.readActivities(endpoints.map((e) => e.id));
      const missing = endpoints.find((e) => !rows.has(e.id));
      if (missing !== undefined) return notApplicable('gone', missing.name);
      return writeOrSetAside(name, async () => {
        const created = await createDependency(link);
        liveId = created.id;
        state = pick(created, LINK_FIELDS);
      });
    },
    ensureAbsent: async (ctx) => {
      if (liveId === null) return APPLIED;
      const id = liveId;
      const checked = await checkDependencies(ctx, [{ id, name, expect: state }]);
      if (!checked.ok) return checked.result;
      return writeOrSetAside(name, async () => {
        await deleteDependency(id);
        liveId = null;
      });
    },
  };
}

/** A link step's default label, naming both endpoints like {@link dependencyEditCommand}'s. */
function linkLabel(verb: string, dependency: DependencySummary): string {
  return `${verb} “${dependency.predecessor.name}” → “${dependency.successor.name}”`;
}

/**
 * Reverse a dependency **add** — undo removes the just-created edge (when it is still as it was
 * created); redo re-creates it (a new id) from the captured endpoints/type/lag. The follow-up recalc
 * is never recorded (ADR-0048).
 */
export function dependencyAddCommand(params: {
  dependency: DependencySummary;
  createDependency: CreateDependencyFn;
  deleteDependency: DeleteDependencyFn;
  label?: string;
}): Command {
  const toggle = linkToggle({ ...params, startPresent: true });
  return {
    label: params.label ?? linkLabel('Add link', params.dependency),
    undo: toggle.ensureAbsent,
    redo: toggle.ensurePresent,
  };
}

/**
 * Reverse a dependency **remove** — undo re-creates the removed edge (a new id) from its captured
 * endpoints/type/lag; redo removes it again. Symmetric to {@link dependencyAddCommand}.
 */
export function dependencyRemoveCommand(params: {
  dependency: DependencySummary;
  createDependency: CreateDependencyFn;
  deleteDependency: DeleteDependencyFn;
  label?: string;
}): Command {
  // The remove already happened at the call site, so the command starts in the ABSENT state.
  const toggle = linkToggle({ ...params, startPresent: false });
  return {
    label: params.label ?? linkLabel('Remove link', params.dependency),
    undo: toggle.ensurePresent,
    redo: toggle.ensureAbsent,
  };
}

/**
 * Reverse **Link in sequence** — the chain of FS links one gesture created, as ONE step. Undo removes
 * every link of the chain (all-or-nothing: any link already gone or changed sets the whole step
 * aside); redo re-creates them in order (new ids), rolling the partial chain back if one is refused —
 * half a sequence is worse than none, because the plan then looks finished.
 */
export function linkChainCommand(params: {
  /** The links the forward gesture created, in creation order. */
  created: readonly DependencySummary[];
  createDependency: CreateDependencyFn;
  deleteDependency: DeleteDependencyFn;
  label?: string;
}): Command {
  const { createDependency, deleteDependency } = params;
  const links = params.created.map(dependencyLinkOf);
  let live: { id: string; name: string; state: LinkState }[] | null = params.created.map((d) => ({
    id: d.id,
    name: linkName(d),
    state: pick(d, LINK_FIELDS),
  }));
  // Links an undo has already deleted, kept until it finishes so a retry can skip them.
  const removed = new Set<string>();
  return {
    label: params.label ?? `Link ${params.created.length} activities in sequence`,
    undo: async (ctx) => {
      if (live === null) return APPLIED;
      // A retry after a failure part-way must not be refused as "gone" for the very links the first
      // attempt removed, so those are neither checked nor deleted again.
      const current = live.filter((l) => !removed.has(l.id));
      const checked = await checkDependencies(
        ctx,
        current.map((l) => ({ id: l.id, name: l.name, expect: l.state })),
      );
      if (!checked.ok) return checked.result;
      return writeOrSetAside(current[0]?.name ?? '', async () => {
        for (const link of [...current].reverse()) {
          // Already gone is what undo wants (somebody removed it between the check and here).
          await deleteDependency(link.id).catch((error: unknown) => {
            if (!isNotFound(error)) throw error;
          });
          removed.add(link.id);
        }
        live = null;
        removed.clear();
      });
    },
    redo: async () => {
      if (live !== null) return APPLIED;
      const made: { id: string; name: string; state: LinkState }[] = [];
      const result = await writeOrSetAside(links.length > 0 ? 'The chain' : '', async () => {
        try {
          for (const link of links) {
            const dependency = await createDependency(link);
            made.push({
              id: dependency.id,
              name: linkName(dependency),
              state: pick(dependency, LINK_FIELDS),
            });
          }
        } catch (error) {
          for (const link of [...made].reverse()) {
            // Best-effort, as the forward path: a failed rollback leaves links the planner can
            // delete, whereas throwing here would replace the real error with a second one.
            await deleteDependency(link.id).catch(() => undefined);
          }
          throw error;
        }
      });
      if (result.kind === 'applied') live = made;
      return result;
    },
  };
}

/**
 * Reverse a canvas **Level of Effort span** create (Stage D, `docs/specs/canvas-activity-types/`) — the
 * composite `createActivity(LEVEL_OF_EFFORT) → SS(start → LOE) → FF(LOE → finish)` as ONE reversible
 * step (ADR-0048): **undo** deletes the LOE, which cascades its SS + FF edges (a leaf LOE carries no
 * subtree), so no orphan edge survives; **redo** re-composes the whole span from the captured inputs (a
 * NEW LOE id). Only the compose is reversed here; the follow-up recalc is never recorded
 * (recompute-don't-restore). No `HAMMOCK` is ever created — the LOE is the span-derived hammock
 * (Stage D Q1).
 *
 * Undo needs the LOE to still be there; redo needs both drivers, and names the one that is gone.
 */
export function createLoeSpanCommand(params: {
  /** The just-created LOE row (its id starts the step in the PRESENT state). */
  loe: ActivitySummary;
  /** The placement input that re-creates the LOE on redo (name / type / duration / lane). */
  placedInput: PlacedActivityInput;
  planId: string;
  startDriverId: string;
  finishDriverId: string;
  createPlaced: CreatePlacedActivityFn;
  createDependency: CreateDependencyFn;
  deleteActivity: DeleteActivityFn;
  label?: string;
}): Command {
  const { planId, startDriverId, finishDriverId, createPlaced, createDependency } = params;
  // The LOE that exists right now, and the definition it was left with; `null` while it is undone.
  let live: { id: string; expected: Partial<ActivitySummary> } | null = {
    id: params.loe.id,
    expected: definitionState(params.loe),
  };
  const name = params.loe.name;
  return {
    // The quoted name was always the generic default ("Level of effort"), so it added nothing — drop it
    // and read plainly "Add level-of-effort span" (S3).
    label: params.label ?? 'Add level-of-effort span',
    undo: async (ctx) => {
      if (live === null) return APPLIED;
      const { id, expected } = live;
      // Deleting the LOE cascades its edges, so only the span's own two (start → LOE, LOE → finish)
      // may be on it; a link a colleague added, or an edit to the LOE, sets the step aside.
      const checked = await checkDeletable(ctx, {
        rows: [{ id, name, expect: expected }],
        isExpectedLink: (link) =>
          (link.type === 'SS' &&
            link.predecessor.id === startDriverId &&
            link.successor.id === id) ||
          (link.type === 'FF' &&
            link.predecessor.id === id &&
            link.successor.id === finishDriverId),
        knownIds: new Set([id]),
      });
      if (!checked.ok) return checked.result;
      return writeOrSetAside(name, async () => {
        await params.deleteActivity(id);
        live = null;
      });
    },
    redo: async (ctx) => {
      if (live !== null) return APPLIED;
      const drivers = await ctx.readActivities([startDriverId, finishDriverId]);
      // Unnamed: the span's two ends are the planner's own words for them, and the builder holds only
      // their ids.
      if (!drivers.has(startDriverId)) return notApplicable('gone', 'The start activity');
      if (!drivers.has(finishDriverId)) return notApplicable('gone', 'The finish activity');
      return writeOrSetAside(name, async () => {
        const loe = await createPlaced(params.placedInput);
        try {
          await createDependency({
            planId,
            predecessorId: startDriverId,
            successorId: loe.id,
            type: 'SS',
            lagMinutes: 0,
            lagCalendar: 'PROJECT_DEFAULT',
          });
          await createDependency({
            planId,
            predecessorId: loe.id,
            successorId: finishDriverId,
            type: 'FF',
            lagMinutes: 0,
            lagCalendar: 'PROJECT_DEFAULT',
          });
        } catch (error) {
          // A half-composed span must not survive: the step is still undone (`live` is null), so a
          // retry composes again, and a LOE left behind would be an orphan with no logic. Best-effort,
          // as the forward path's rollback: the delete cascades whichever edge did land.
          await params.deleteActivity(loe.id).catch(() => undefined);
          throw error;
        }
        // Only now is the span whole, and only now does the step count as redone.
        live = { id: loe.id, expected: definitionState(loe) };
      });
    },
  };
}

/** `useSetActivityVisualStart().mutateAsync` — a Visual-mode placement PATCH (ADR-0033).
 * `durationDays` rides only the VISUAL start-edge resize (ADR-0052 §3). */
export type SetVisualStartFn = (input: {
  activityId: string;
  visualStart: string | null;
  durationDays?: number;
  laneIndex?: number;
  version: number;
}) => Promise<ActivitySummary>;

/** A Visual-mode placement: the hand-placed `visualStart` (null = revert to computed) plus its lane. */
export interface VisualPlacement {
  visualStart: string | null;
  laneIndex: number;
}

/**
 * Reverse a Visual-Planning **`visualStart` set** (ADR-0033 M3): undo restores the prior placement,
 * redo re-applies the dropped one. Coalescable — a drag / nudge burst on one bar collapses to a
 * single undo step. The check compares the placement the SERVER saved, not the date the drop sent.
 *
 * **This is the ONLY inverse a canvas move has since the collapse** (one-planning-surface M-F-T3).
 */
export function visualStartCommand(params: {
  setVisualStart: SetVisualStartFn;
  activityId: string;
  before: VisualPlacement;
  after: VisualPlacement;
  /** The row the forward write returned — the state an undo expects to find. */
  saved: ActivitySummary;
  /** The placed activity's name, so the default label names its subject (M1-T1). */
  activityName: string;
  label?: string;
}): Command {
  const { setVisualStart, activityId, before, after, saved } = params;
  const step = fieldStep({
    id: activityId,
    name: params.activityName,
    fields: ['visualStart', 'laneIndex'],
    before,
    after,
    saved,
    write: (target, row) =>
      setVisualStart({
        activityId,
        visualStart: target.visualStart,
        laneIndex: target.laneIndex,
        version: row.version,
      }),
  });
  const command: Command = { label: params.label ?? `Move “${params.activityName}”`, ...step };
  return coalescable(command, {
    key: `visual:${activityId}`,
    before,
    after,
    rebuild: (b, a) =>
      visualStartCommand({
        setVisualStart,
        activityId,
        before: b,
        after: a,
        saved,
        activityName: params.activityName,
        ...(params.label !== undefined ? { label: params.label } : {}),
      }),
  });
}

/**
 * Reverse a **VISUAL-mode start-edge resize** (ADR-0052 M3 / §3) — the minimal
 * `PATCH {visualStart, durationDays}` that moved a bar's hand-placed start while pinning its
 * finish. The inverse restores the prior placement AND duration through the same seam; redo
 * re-applies the dropped pair. It carries FULL activity snapshots (like
 * {@link durationResizeCommand}) and shares its `resize:{id}` coalescing key, so a start-drag
 * burst — or a start-then-finish drag on one bar within the interaction window — collapses to a
 * single step whose restore path is the NEWEST command's (the merge rule); the snapshots keep a
 * cross-builder merge type-safe in both directions.
 */
export function visualResizeCommand(params: {
  setVisualStart: SetVisualStartFn;
  before: ActivitySummary;
  after: ActivitySummary;
  label?: string;
}): Command {
  const { setVisualStart, before, after } = params;
  const step = fieldStep({
    id: after.id,
    name: before.name,
    fields: ['visualStart', 'durationMinutes', 'durationDays'],
    before,
    after,
    saved: after,
    write: (target, row) =>
      setVisualStart({
        activityId: row.id,
        visualStart: target.visualStart,
        durationDays: target.durationDays,
        version: row.version,
      }),
  });
  const command: Command = {
    // Name the entity ("Resize “Excavate”"), matching the EARLY-mode resize label (S1).
    label: params.label ?? `Resize “${before.name}”`,
    ...step,
  };
  return coalescable(command, {
    key: `resize:${before.id}`,
    before,
    after,
    rebuild: (b, a) =>
      visualResizeCommand({
        setVisualStart,
        before: b,
        after: a,
        ...(params.label !== undefined ? { label: params.label } : {}),
      }),
  });
}

/**
 * The signed lag in exactly one of the two units the API accepts — structurally
 * `UpdateDependencyInput`'s own `LagInput`, restated here so this module stays free of the query
 * layer. Sending both is a 422 by design, which is why it is a union and not two optional fields.
 */
export type CommandLagInput = { lagDays: number } | { lagMinutes: number };

/**
 * `useUpdateDependency().mutateAsync` — the dependency PATCH (type + lag + lag calendar).
 *
 * **The lag is a union, and that is the fix rather than a generalisation** (`docs/TECH_DEBT.md`
 * #65). `DependencySummary.lagDays` is documented as _"rounded from the stored minutes. A sub-day lag
 * reads back as 0 here"_, so an inverse restoring a 90-minute cure lag in days would have restored
 * **zero**: an undo that loses data, which is worse than no undo at all. #233 is the separate
 * question of whether the lag-drag gesture should be sending days at all.
 */
export type UpdateDependencyFn = (
  input: {
    dependencyId: string;
    type: DependencyType;
    lagCalendar: LagCalendarSource;
    version: number;
  } & CommandLagInput,
) => Promise<DependencySummary>;

/** The one lag field a {@link CommandLagInput} writes, read off a row. */
function lagFieldOf(lag: CommandLagInput): 'lagDays' | 'lagMinutes' {
  return 'lagMinutes' in lag ? 'lagMinutes' : 'lagDays';
}

/**
 * Reverse a **lag-anchor drag / lag nudge** (ADR-0052 M3) — the dependency PATCH whose only
 * intended change is the lag. The inverse restores the prior lag; redo re-applies the new one. The
 * type and lag calendar are echoed from the link AS IT IS NOW, so a colleague's change to either is
 * never reverted by ours. Coalesces per dependency (`lag:{dependencyId}`) so a drag / held-key burst
 * collapses to ONE undo step, exactly like {@link relaneCommand}'s lane coalescing.
 */
export function lagDragCommand(params: {
  updateDependency: UpdateDependencyFn;
  /** The pre-edit row: the undo target is read from it. */
  dependency: DependencySummary;
  /**
   * What the forward write sent — `{ lagMinutes }` normally, `{ lagDays }` on the degraded path
   * where the lag calendar's hours-per-day is not resolvable (`docs/TECH_DEBT.md` #233).
   *
   * **It is the resolved write and not the gesture's day**, because undo has to restore the exact
   * stored value: re-sending a ROUNDED day would destroy the sub-day remainder the forward write
   * preserved.
   */
  after: CommandLagInput;
  /** The link the forward write returned — the state an undo expects to find. */
  saved: DependencySummary;
  label?: string;
}): Command {
  const { updateDependency, dependency, after, saved } = params;
  // The undo target mirrors the forward write's unit: minutes are what is stored, so restoring
  // them is exact; days are used only where the factor was unknown going in, and re-sending days
  // is then the same lossy-but-honest degradation the forward path took.
  const before: CommandLagInput =
    'lagMinutes' in after ? { lagMinutes: dependency.lagMinutes } : { lagDays: dependency.lagDays };
  const field = lagFieldOf(after);
  const name = linkName(dependency);
  let atUndo: Partial<DependencySummary> = { [field]: saved[field] };
  let atRedo: Partial<DependencySummary> = { [field]: dependency[field] };
  const replay = (
    ctx: ReplayContext,
    expect: Partial<DependencySummary>,
    target: CommandLagInput,
    settle: (state: Partial<DependencySummary>) => void,
  ): Promise<ReplayResult> =>
    replayDependency(ctx, { id: dependency.id, name, expect }, async (row) => {
      const result = await updateDependency({
        dependencyId: row.id,
        type: row.type,
        ...target,
        lagCalendar: row.lagCalendar,
        version: row.version,
      });
      settle({ [field]: result[field] });
    });
  const command: Command = {
    // Name both endpoints, mirroring the link labels' entity-naming convention (S1).
    label:
      params.label ??
      `Change lag “${dependency.predecessor.name}” → “${dependency.successor.name}”`,
    undo: (ctx) =>
      replay(ctx, atUndo, before, (state) => {
        atRedo = state;
      }),
    redo: (ctx) =>
      replay(ctx, atRedo, after, (state) => {
        atUndo = state;
      }),
  };
  return coalescable(command, {
    key: `lag:${dependency.id}`,
    before,
    after,
    // A burst rebuilds oldest-before → newest-after. The rebuilt row carries the oldest `before` in
    // whichever unit that step used, so a burst that began before the calendar list resolved still
    // undoes to where it started.
    rebuild: (b, a) =>
      lagDragCommand({
        updateDependency,
        dependency:
          'lagMinutes' in b
            ? { ...dependency, lagMinutes: b.lagMinutes }
            : { ...dependency, lagDays: b.lagDays },
        after: a,
        saved,
        ...(params.label !== undefined ? { label: params.label } : {}),
      }),
  });
}

/**
 * Did an **Edit link** save actually change anything? (`docs/TECH_DEBT.md` #65, CQ-2.)
 *
 * The dialog resends the whole form, so a planner who opens it, reads it and presses Save issues a
 * real PATCH that changes no field. Recording an undo step for that puts an entry on the stack whose
 * inverse moves nothing — the ADR-0064 "a confirmation that names nothing" shape, one surface along,
 * and worse here because it pushes a genuine edit one press further out of reach.
 *
 * Compared on `lagMinutes` and never `lagDays`: two lags an hour apart are equal in days, so a days
 * comparison would suppress the step for exactly the edits this row exists to make undoable.
 *
 * **Deliberately NOT used to suppress the PATCH itself.** Whether the write is worth sending is the
 * dialog's question and involves the optimistic version; this answers only whether the *history*
 * gained a step. Conflating them would make an undo concern silently change what the server sees.
 */
export function dependencyEditChanged(
  before: Pick<DependencySummary, 'type' | 'lagMinutes' | 'lagCalendar'>,
  after: Pick<DependencySummary, 'type' | 'lagMinutes' | 'lagCalendar'>,
): boolean {
  return (
    before.type !== after.type ||
    before.lagMinutes !== after.lagMinutes ||
    before.lagCalendar !== after.lagCalendar
  );
}

/**
 * Reverse an **Edit link** dialog save — the third way a link changes, and until #65 the only one
 * that recorded nothing. Adding and removing a link were already symmetric, and the lag-anchor drag
 * records {@link lagDragCommand}; so `Shift+←/→` on a link was undoable and typing into the same
 * link's lag field was not.
 *
 * **All three fields move together, in one PATCH** (CQ-1). The forward write is atomic — a save
 * that changes the type and the lag is one request — so an inverse that restored only the lag would
 * leave the row in a state the planner never authored and the history unable to describe. They are
 * also compared together: the step wrote all three, so all three must still read as it left them.
 *
 * **The lag rides as `lagMinutes`.** `DependencySummary.lagDays` is rounded from the stored minutes
 * and a sub-day lag reads back as `0` — see {@link UpdateDependencyFn} and {@link dependencyLinkOf}.
 *
 * **No coalescing, and that is a decision rather than an omission.** A dialog closes on save, so five
 * saves inside the 500 ms window is unreachable; and sharing the lag drag's key would be actively
 * wrong, merging a drag with a following dialog save into one step the planner never performed.
 */
export function dependencyEditCommand(params: {
  updateDependency: UpdateDependencyFn;
  /** The row as it stood when the dialog opened — the undo target. */
  before: DependencySummary;
  /** The row the PATCH returned: the redo target, and the state an undo expects to find. */
  after: DependencySummary;
  label?: string;
}): Command {
  const { updateDependency, before, after } = params;
  const name = linkName(before);
  let atUndo: LinkState = pick(after, LINK_FIELDS);
  let atRedo: LinkState = pick(before, LINK_FIELDS);
  const replay = (
    ctx: ReplayContext,
    expect: LinkState,
    target: LinkState,
    settle: (state: LinkState) => void,
  ): Promise<ReplayResult> =>
    replayDependency(ctx, { id: before.id, name, expect }, async (row) => {
      const result = await updateDependency({
        dependencyId: row.id,
        type: target.type,
        lagMinutes: target.lagMinutes,
        lagCalendar: target.lagCalendar,
        version: row.version,
      });
      settle(pick(result, LINK_FIELDS));
    });
  return {
    // Both endpoints named, the link labels' entity-naming convention (S1) — and deliberately the
    // same wording as a lag drag, because to the planner they are the same edit by another route.
    label: params.label ?? `Edit link “${before.predecessor.name}” → “${before.successor.name}”`,
    undo: (ctx) =>
      replay(ctx, atUndo, before, (state) => {
        atRedo = state;
      }),
    redo: (ctx) =>
      replay(ctx, atRedo, after, (state) => {
        atUndo = state;
      }),
  };
}

/** `useBatchPositions().mutateAsync` — an all-or-nothing lane batch; resolves to the updated rows. */
export type BatchPositionsFn = (input: {
  positions: { id: string; laneIndex: number; version: number }[];
}) => Promise<ActivitySummary[]>;

/** One row's lane in an auto-arrange snapshot. */
export interface LanePlacement {
  id: string;
  laneIndex: number;
}

/**
 * Reverse a canvas **auto-arrange** — one batch relane of many bars collapses to a SINGLE reversible
 * step (ADR-0048 M2.3): undo restores every affected row's prior lane, redo re-applies the packed
 * lanes, each through the same all-or-nothing batch endpoint. Every row must still hold the lane the
 * step left, or the whole step is set aside — a half-restored arrangement is not one anybody drew.
 */
export function autoArrangeCommand(params: {
  batchPositions: BatchPositionsFn;
  before: readonly LanePlacement[];
  after: readonly LanePlacement[];
  /** The rows the forward batch returned — the lanes an undo expects to find. */
  saved: readonly ActivitySummary[];
  label?: string;
}): Command {
  const { batchPositions } = params;
  const lanes = (placements: readonly LanePlacement[]): Map<string, number> =>
    new Map(placements.map((p) => [p.id, p.laneIndex]));
  const savedLanes = new Map(params.saved.map((row) => [row.id, row.laneIndex]));
  let atUndo = lanes(
    params.after.map((p) => ({ ...p, laneIndex: savedLanes.get(p.id) ?? p.laneIndex })),
  );
  let atRedo = lanes(params.before);
  const replay = (
    ctx: ReplayContext,
    expect: ReadonlyMap<string, number>,
    target: readonly LanePlacement[],
    settle: (next: Map<string, number>) => void,
  ): Promise<ReplayResult> =>
    replayActivities(
      ctx,
      [...expect].map(([id, laneIndex]) => ({ id, expect: { laneIndex } })),
      async (rows) => {
        const positions = target.flatMap((p) => {
          const row = rows.get(p.id);
          return row === undefined
            ? []
            : [{ id: p.id, laneIndex: p.laneIndex, version: row.version }];
        });
        if (positions.length === 0) return;
        const result = await batchPositions({ positions });
        settle(new Map(result.map((row) => [row.id, row.laneIndex])));
      },
    );
  return {
    label:
      params.label ??
      `Auto-arrange ${params.after.length === 1 ? '1 activity' : `${params.after.length} activities`}`,
    undo: (ctx) =>
      replay(ctx, atUndo, params.before, (next) => {
        atRedo = next;
      }),
    redo: (ctx) =>
      replay(ctx, atRedo, params.after, (next) => {
        atUndo = next;
      }),
    affectsSchedule: false,
  };
}

/** `useBatchPlacements().mutateAsync` — an all-or-nothing time+lane batch; resolves to the rows. */
export type BatchPlacementsFn = (input: {
  placements: {
    id: string;
    version: number;
    constraintType: ConstraintType | null;
    constraintDate: string | null;
    visualStart: string | null;
    laneIndex: number | null;
  }[];
}) => Promise<ActivitySummary[]>;

/** One row's placement in a bulk-move snapshot — the complete set of fields the batch writes. */
export interface ActivityPlacement {
  id: string;
  constraintType: ConstraintType | null;
  constraintDate: string | null;
  visualStart: string | null;
  laneIndex: number | null;
}

/** The placement fields a batch writes, as a row carries them. */
const PLACEMENT_FIELDS = ['constraintType', 'constraintDate', 'visualStart', 'laneIndex'] as const;
type PlacementState = Pick<ActivitySummary, (typeof PLACEMENT_FIELDS)[number]>;

/**
 * The state a placement expects to find — read from the server's row where there is one (that is
 * where a snapped date shows), else the placement itself. A placement whose lane is `null` is read by
 * the batch as "leave the lane", so the step never wrote the lane and has no expectation about it: an
 * overlap resolve that moved the bar sideways since must not make this undo refuse.
 */
function placementExpectation(
  placement: ActivityPlacement,
  row: ActivitySummary | undefined,
): Partial<PlacementState> {
  const source = row ? pick(row, PLACEMENT_FIELDS) : placement;
  const expected: Partial<PlacementState> = {
    constraintType: source.constraintType,
    constraintDate: source.constraintDate,
    visualStart: source.visualStart,
  };
  // Whether the lane is compared follows what the step WROTE, never what the row happens to hold:
  // a step that writes a lane compares it even if the saved row says nothing about it.
  if (placement.laneIndex !== null) expected.laneIndex = source.laneIndex ?? placement.laneIndex;
  return expected;
}

/**
 * Reverse a **bulk move** — a plural drag of many bars in time and/or lane collapses to a SINGLE
 * reversible step, the `autoArrangeCommand` shape one field set wider. Also the shape of apply
 * levelling and of an overlap resolve that moves time.
 *
 * **Deliberately not coalescable**, and the reason is worth stating rather than leaving to the
 * absence of a descriptor: there are no intermediate writes to merge (the ghosts are client-side
 * and one request goes out on release), and merging two bulk moves would produce an undo that
 * restores a set **nobody ever selected** — the union of two different selections, in a state
 * neither of them was in.
 *
 * All-or-nothing: every row must still hold the placement the step left (compared against the
 * server's saved rows, which is where a snapped date shows), or the whole step is set aside.
 */
export function bulkPlacementCommand(params: {
  batchPlacements: BatchPlacementsFn;
  before: readonly ActivityPlacement[];
  after: readonly ActivityPlacement[];
  /** The rows the forward batch returned — the placements an undo expects to find. */
  saved: readonly ActivitySummary[];
  label?: string;
}): Command {
  const { batchPlacements } = params;
  const savedById = new Map(params.saved.map((row) => [row.id, row]));
  const expectations = (
    placements: readonly ActivityPlacement[],
    from?: ReadonlyMap<string, ActivitySummary>,
  ): Map<string, Partial<PlacementState>> =>
    new Map(placements.map((p) => [p.id, placementExpectation(p, from?.get(p.id))]));
  let atUndo = expectations(params.after, savedById);
  let atRedo = expectations(params.before);
  const replay = (
    ctx: ReplayContext,
    expect: ReadonlyMap<string, Partial<PlacementState>>,
    target: readonly ActivityPlacement[],
    settle: (next: Map<string, Partial<PlacementState>>) => void,
  ): Promise<ReplayResult> =>
    replayActivities(
      ctx,
      [...expect].map(([id, fields]) => ({ id, expect: fields })),
      async (rows) => {
        const placements = target.flatMap((p) => {
          const row = rows.get(p.id);
          return row === undefined ? [] : [{ ...p, version: row.version }];
        });
        if (placements.length === 0) return;
        const result = await batchPlacements({ placements });
        settle(expectations(target, new Map(result.map((row) => [row.id, row]))));
      },
    );
  return {
    label: params.label ?? `Move ${params.after.length} activities`,
    undo: (ctx) =>
      replay(ctx, atUndo, params.before, (next) => {
        atRedo = next;
      }),
    redo: (ctx) =>
      replay(ctx, atRedo, params.after, (next) => {
        atUndo = next;
      }),
  };
}

/** `useBulkDeleteActivities().mutateAsync` — sweeps a set and resolves to the batch that ties it. */
export type BulkDeleteActivitiesFn = (input: {
  activities: { id: string; version: number }[];
}) => Promise<{ deleteBatchId: string; activityCount: number; dependencyCount: number }>;

/**
 * Reverse a **bulk delete** — one restore, not N re-creates.
 *
 * This is the command CQ-4 was asked about, and the answer it was given. The M1–M2 fallback for a
 * single delete is re-create-with-a-new-id, which loses every link the deleted activity had; for a
 * plural delete that would also lose the links **between** the deleted activities, so a planner who
 * removed a phase and pressed undo would get their bars back with the logic gone — silently, and
 * with nothing on screen saying so. `restore-batch` puts the ids back, so the links come with them.
 *
 * The batch id is captured from the forward write and **rethreaded on every redo**: a redo is a new
 * delete and therefore a new batch, so an undo that reused the first id would restore nothing. The
 * redo is all-or-nothing: every row must be there, and is deleted at the version it holds now.
 */
export function bulkDeleteCommand(params: {
  bulkDelete: BulkDeleteActivitiesFn;
  restoreBatch: RestoreDeleteBatchFn;
  /** The rows that were deleted, with the names a refusal can say. */
  activities: readonly { id: string; name?: string }[];
  /** The batch the forward write returned. */
  deleteBatchId: string;
  label?: string;
}): Command {
  const { bulkDelete, restoreBatch } = params;
  let batchId = params.deleteBatchId;
  let present = false;
  const restored = restoredSet();
  const name = params.activities[0]?.name ?? 'An activity in this step';
  return {
    label: params.label ?? `Delete ${params.activities.length} activities`,
    undo: async (ctx) => {
      if (present) {
        await restored.recordLinks(ctx);
        return APPLIED;
      }
      const result = await writeOrSetAside(name, async () => {
        restored.remember(await restoreBatch({ deleteBatchId: batchId }));
        present = true;
      });
      if (result.kind === 'applied') await restored.recordLinks(ctx);
      return result;
    },
    redo: async (ctx) => {
      if (!present) return APPLIED;
      // Every restored row must still read as the restore left it, with no link or child that is not
      // the restore's own: a bulk delete at the row's current version would otherwise go straight
      // through a colleague's edit.
      const checked = await restored.checkDeletable(ctx, name);
      if (!checked.ok) return checked.result;
      return writeOrSetAside(name, async () => {
        const result = await bulkDelete({
          activities: [...checked.rows.values()].map((row) => ({
            id: row.id,
            version: row.version,
          })),
        });
        batchId = result.deleteBatchId;
        present = false;
      });
    },
  };
}

/**
 * Reverse a **paste / duplicate** — the whole copy as ONE reversible step
 * (`docs/specs/activity-copy-paste/` M1-T1, ADR-0048).
 *
 * **Undo is a bulk delete; redo is the id-stable batch restore.** The clones are linked to *each
 * other* (the internal edges `planClone` carries), and re-creating N activities restores the bars
 * while silently losing the logic between them — the CQ-4 argument that made {@link
 * bulkDeleteCommand} a restore rather than N re-creates, one gesture along. The batch id the undo
 * produces is exactly what makes the redo id-stable.
 *
 * There is deliberately **no compose-from-inputs fallback**: `redo` only ever runs after `undo`,
 * and `undo` always yields a batch id, so the branch would be unreachable.
 *
 * Undo is all-or-nothing: every clone must still be there. Idempotent in both directions: a retried
 * undo cannot double-delete and a retried redo cannot double-create.
 */
export function pasteActivitiesCommand(params: {
  /** The clones just created, in creation order (parent before child), as the server saved them. */
  created: readonly ActivitySummary[];
  /**
   * The clones with no cloned parent — the tops of what was copied.
   *
   * **A band's undo cannot go through `bulkDelete`, and that is the API's deliberate design rather
   * than an oversight to work around.** `bulkDelete` refuses any batch containing a `WBS_SUMMARY`
   * (422 `SUMMARY_NOT_BULK_ELIGIBLE`, `activities.service.ts:1277-1281`): deleting a summary takes
   * its whole subtree, and letting that ride inside a forty-bar selection would make the most
   * destructive operation in the product the easiest to trigger by accident.
   *
   * So undoing a band copy deletes its **root**, once, and lets the documented cascade take the
   * subtree. When the roots ARE the whole set (a flat copy) this is the same call as before.
   */
  roots: readonly { id: string }[];
  bulkDelete: BulkDeleteActivitiesFn;
  /** Single delete; cascades a summary's subtree (ADR-0038). Used when the set is not flat. */
  deleteActivity: DeleteActivityFn;
  restoreBatch: RestoreDeleteBatchFn;
  /** Concrete, per the S1 entity-naming convention: `Duplicate “Excavate”` / `Copy 15 activities`. */
  label: string;
}): Command {
  const { bulkDelete, deleteActivity, restoreBatch } = params;
  const isFlat = params.roots.length === params.created.length;
  // `false` means "the clones are not in the plan right now" — the absent state of the toggle.
  let live = true;
  let batchId: string | null = null;
  // What the clones were left with. Duration is left out: carrying a clone's resources recomputes it
  // after the row is saved (ADR-0040), so the saved row is not the final word on it.
  const stateOf = (rows: readonly ActivitySummary[]) =>
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      expect: definitionState(row, ['durationMinutes']),
    }));
  let expected = stateOf(params.created);
  return {
    label: params.label,
    undo: async (ctx) => {
      if (!live) return APPLIED;
      // Deleting the clones takes their links with them. A copy carries only the links BETWEEN its
      // clones, so a link with an end outside the copy — or any edit, or a child filed under a cloned
      // summary — is somebody else's, and sets the whole step aside.
      const cloneIds = new Set(expected.map((row) => row.id));
      const checked = await checkDeletable(ctx, {
        rows: expected,
        isExpectedLink: (link) =>
          cloneIds.has(link.predecessor.id) && cloneIds.has(link.successor.id),
        knownIds: cloneIds,
      });
      if (!checked.ok) return checked.result;
      const rows = checked.rows;
      return writeOrSetAside(expected[0]?.name ?? 'An activity in this step', async () => {
        if (isFlat) {
          const result = await bulkDelete({
            activities: expected.flatMap((c) => {
              const row = rows.get(c.id);
              return row === undefined ? [] : [{ id: c.id, version: row.version }];
            }),
          });
          batchId = result.deleteBatchId;
        } else {
          // Roots only, one at a time — each cascade sweeps its own subtree. The batch id of the
          // LAST one is kept, which is exact while a paste has a single root — `planClone`'s band
          // path produces exactly one — and is why a multi-root non-flat paste is not offered.
          batchId = null;
          for (const root of params.roots) {
            batchId = (await deleteActivity(root.id)).deleteBatchId;
          }
        }
        live = false;
      });
    },
    redo: async () => {
      if (live || batchId === null) return APPLIED;
      return writeOrSetAside(expected[0]?.name ?? 'An activity in this step', async () => {
        expected = stateOf(await restoreBatch({ deleteBatchId: batchId as string }));
        live = true;
        batchId = null;
      });
    },
  };
}
