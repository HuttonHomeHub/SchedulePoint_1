import type {
  ActivitySummary,
  DependencySummary,
  DependencyType,
  LagCalendarSource,
} from '@repo/types';

import type { PlacedActivityInput } from '@/features/activities/api/use-activities';
import type { ActivityFormValues } from '@/features/activities/schemas/activity-schemas';
import { minorToMajorInput } from '@/lib/format-money';

/**
 * A single reversible plan-authoring edit (ADR-0048). `redo` re-applies the original edit; `undo`
 * applies its inverse. Both replay plan **inputs** through the existing REST mutation hooks — never
 * engine-owned derived columns — so the CPM engine and its recalc parity gate stay untouched; the
 * normal ADR-0032 auto-recalc redraws the outputs after either direction.
 *
 * The type is intentionally minimal and cheap to construct: a label plus two thunks. The builders
 * below are pure — they capture the pre-edit and post-edit values plus the mutation function(s) they
 * need, closing over nothing React. The optimistic `version` the mutation hooks require is threaded
 * forward from each call's response (a fresh version after every undo/redo), mirroring how the seam's
 * own handlers read the live version before a write.
 */
export interface Command {
  /** Human label for the edit — M3 surfaces it in the Undo/Redo controls + announcements. */
  readonly label: string;
  /** Apply the inverse of the edit (restore the pre-edit state). */
  undo: () => Promise<void>;
  /** Re-apply the original edit (restore the post-edit state). */
  redo: () => Promise<void>;
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
}

/** How a coalescable command folds into the previous same-key step. */
export interface CommandCoalescing {
  /** Same-key consecutive commands recorded within one interaction collapse to a single undo step. */
  readonly key: string;
  /**
   * Build the combined command from `previous` (the older, top-of-stack command) and this newer one:
   * undo restores `previous`'s pre-edit state, redo re-applies THIS command's post-edit state, and
   * version threading re-seeds from THIS command's post-edit version (the live row's current version
   * after the whole gesture). Called as `newCommand.coalescing.merge(topOfStack)`.
   */
  merge: (previous: Command) => Command;
}

/** Internal: the pre-edit params a coalescable command stashes so a later merge can read them. */
interface CoalesceState<P> {
  readonly before: P;
}

/**
 * Attach coalescing to a command built from a `{ before, after }` pair. `rebuild` re-runs the owning
 * builder (so the merged command is itself coalescable and threads the newer version); `merge` reads
 * the *older* command's stashed `before` and rebuilds original-before → this-after — so a chain of N
 * intermediate writes always collapses to one step spanning the first pre-edit and last post-edit
 * state, regardless of how many merges happened along the way.
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

/** The single-activity definition PATCH input `useUpdateActivity` already takes. */
export type UpdateActivityInput = {
  activityId: string;
  version: number;
  laneIndex?: number;
} & ActivityFormValues;

/** `useUpdateActivity().mutateAsync` — resolves to the saved activity, carrying the new `version`. */
export type UpdateActivityFn = (input: UpdateActivityInput) => Promise<ActivitySummary>;

/** `useRepositionLane().mutateAsync` — the minimal, layout-only lane PATCH. */
export type RepositionLaneFn = (input: {
  activityId: string;
  laneIndex: number;
  version: number;
}) => Promise<ActivitySummary>;

/**
 * Project an activity row into the full definition PATCH body `useUpdateActivity` expects — the same
 * `ActivitySummary → form-values` seed the edit dialog performs on open, so re-issuing it restores the
 * activity's **whole** definition (name, duration, constraints, calendar, WBS parent, cost/EV inputs,
 * …). `laneIndex` is carried separately by the caller — it isn't part of the definition schema.
 *
 * Restoring the full definition (not a hand-picked field diff) is what makes the inverse correct: a
 * canvas reposition rewrites the primary constraint AND resends every other definition field, so only
 * a full-snapshot restore reliably reverses whatever the edit changed.
 */
export function activityDefinitionInput(activity: ActivitySummary): ActivityFormValues {
  return {
    name: activity.name,
    code: activity.code ?? '',
    type: activity.type,
    durationType: activity.durationType,
    durationDays: activity.durationDays,
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
 * The core of the reposition + update inverses: capture the before/after activity snapshots and
 * re-issue the full-definition PATCH to restore either. The version is threaded from each response so
 * the optimistic lock always carries the **current** version, starting from the post-edit
 * `after.version` (the next thing the stack does from here is an undo, from that state).
 */
function definitionSnapshotCommand(params: {
  label: string;
  update: UpdateActivityFn;
  before: ActivitySummary;
  after: ActivitySummary;
  /** When set, the command coalesces with same-key neighbours (a canvas drag/nudge — ADR-0048 M2.3). */
  coalesceKey?: string;
}): Command {
  const { label, update, before, after, coalesceKey } = params;
  let version = after.version;
  const restore = async (target: ActivitySummary): Promise<void> => {
    const saved = await update({
      activityId: target.id,
      version,
      ...activityDefinitionInput(target),
      laneIndex: target.laneIndex,
    });
    version = saved.version;
  };
  const command: Command = {
    label,
    undo: () => restore(before),
    redo: () => restore(after),
  };
  if (coalesceKey === undefined) return command;
  return coalescable(command, {
    key: coalesceKey,
    before,
    after,
    rebuild: (b, a) =>
      definitionSnapshotCommand({ label, update, before: b, after: a, coalesceKey }),
  });
}

/**
 * Reverse a canvas **reposition** — a day move (optionally + a lane change): the EARLY-mode PATCH that
 * writes an SNET-at-new-start constraint (ADR-0023) plus the new lane. The inverse restores the whole
 * pre-edit definition (the prior constraint) and lane; redo re-applies the dropped placement. (A pure
 * lane move goes through {@link relaneCommand}; a VISUAL-mode `visualStart` drop is an M2 command.)
 */
export function repositionCommand(params: {
  update: UpdateActivityFn;
  before: ActivitySummary;
  after: ActivitySummary;
  label?: string;
}): Command {
  return definitionSnapshotCommand({
    // Name the entity so the toolbar accessible name + the "Undid …" announcement read concretely
    // ("Undid move “Excavate”"), mirroring the app's `Activity “${name}” …` toast convention (S1).
    label: params.label ?? `Move “${params.before.name}”`,
    update: params.update,
    before: params.before,
    after: params.after,
    // A pointer drag / key-repeat nudge of one bar in time is a single gesture — coalesce its
    // intermediate day-moves into one undo step (keyed per activity; ADR-0048 M2.3).
    coalesceKey: `reposition:${params.before.id}`,
  });
}

/**
 * Reverse a canvas **lane move** — the layout-only `{ laneIndex, version }` PATCH (no constraint, no
 * recalc). The inverse moves the bar back to its previous lane; redo moves it to the new one. Version
 * threaded from each response, starting from the post-edit `version`.
 */
export function relaneCommand(params: {
  repositionLane: RepositionLaneFn;
  activityId: string;
  fromLaneIndex: number;
  toLaneIndex: number;
  version: number;
  label?: string;
}): Command {
  const { repositionLane, activityId, fromLaneIndex, toLaneIndex } = params;
  let version = params.version;
  const move = async (laneIndex: number): Promise<void> => {
    const saved = await repositionLane({ activityId, laneIndex, version });
    version = saved.version;
  };
  const command: Command = {
    label: params.label ?? 'Move activity to lane',
    undo: () => move(fromLaneIndex),
    redo: () => move(toLaneIndex),
  };
  return coalescable(command, {
    key: `relane:${activityId}`,
    before: fromLaneIndex,
    after: toLaneIndex,
    // A vertical drag / `Alt+↑/↓` lane nudge is one gesture — collapse its intermediate lanes to a
    // single step (the newest post-edit `version` seeds the rebuilt command; ADR-0048 M2.3).
    rebuild: (from, to) =>
      relaneCommand({
        repositionLane,
        activityId,
        fromLaneIndex: from,
        toLaneIndex: to,
        version,
        ...(params.label !== undefined ? { label: params.label } : {}),
      }),
  });
}

/**
 * Reverse a **definition edit** from the activity form (rename / duration / constraint / …). Restores
 * the full pre-edit definition on undo and the post-edit definition on redo — the same mechanism as
 * {@link repositionCommand}, differing only in the default label.
 */
export function updateCommand(params: {
  update: UpdateActivityFn;
  before: ActivitySummary;
  after: ActivitySummary;
  label?: string;
}): Command {
  return definitionSnapshotCommand({
    // Name the entity ("Edit “Excavate”"), like {@link repositionCommand} (S1).
    label: params.label ?? `Edit “${params.before.name}”`,
    update: params.update,
    before: params.before,
    after: params.after,
  });
}

// ---------------------------------------------------------------------------------------------------
// M2: create / delete, dependency add / remove, Visual-mode placement, and batch auto-arrange.
// ---------------------------------------------------------------------------------------------------

/** `useCreatePlacedActivity().mutateAsync` — a canvas-placed create; resolves to the created row. */
export type CreatePlacedActivityFn = (input: PlacedActivityInput) => Promise<ActivitySummary>;
/** `useCreateActivity().mutateAsync` — a full-definition create; resolves to the created row. */
export type CreateActivityFn = (input: ActivityFormValues) => Promise<ActivitySummary>;
/** `useDeleteActivity().mutateAsync` — soft-deletes an activity by id. */
export type DeleteActivityFn = (activityId: string) => Promise<void>;

/**
 * A small state machine over an entity that either exists (a known live id) or doesn't. Both the
 * create and the (leaf) delete inverses are this toggle, differing only in their start state and which
 * direction `undo` runs. `create` resolves the entity's **new** id each time — the conservative M2
 * rule (ADR-0048): a re-created activity/dependency gets a fresh id, so redo-of-delete then deletes
 * that new id. Idempotent in each direction (a double-undo can't double-create or double-delete).
 */
function existenceToggle(params: {
  startId: string | null;
  create: () => Promise<string>;
  remove: (id: string) => Promise<void>;
}): { ensurePresent: () => Promise<void>; ensureAbsent: () => Promise<void> } {
  let liveId = params.startId;
  return {
    ensurePresent: async (): Promise<void> => {
      if (liveId === null) liveId = await params.create();
    },
    ensureAbsent: async (): Promise<void> => {
      if (liveId !== null) {
        await params.remove(liveId);
        liveId = null;
      }
    },
  };
}

/**
 * Reverse a canvas **create** — undo deletes the just-created activity; redo re-creates it from the
 * same placement input (a new id). Only the create itself is reversed here; the follow-up recalc is
 * never recorded (recompute-don't-restore, ADR-0048).
 */
export function createActivityCommand(params: {
  created: ActivitySummary;
  input: PlacedActivityInput;
  createPlaced: CreatePlacedActivityFn;
  deleteActivity: DeleteActivityFn;
  label?: string;
}): Command {
  const toggle = existenceToggle({
    startId: params.created.id,
    create: async () => (await params.createPlaced(params.input)).id,
    remove: params.deleteActivity,
  });
  return {
    // Name the created entity ("Add “Excavate”"), mirroring the toast convention (S1).
    label: params.label ?? `Add “${params.created.name}”`,
    undo: toggle.ensureAbsent,
    redo: toggle.ensurePresent,
  };
}

/**
 * Reverse a **leaf** activity delete — undo re-creates the whole pre-delete definition (a NEW id, the
 * conservative M2 rule; id-stable/cascade-clean restore is the deferred M4) and restores its lane;
 * redo deletes it again. Only leaves belong here — a summary-with-subtree (cascade) delete instead
 * truncates history (see the recording seam), because a partial re-create would be a broken undo.
 */
export function deleteActivityCommand(params: {
  activity: ActivitySummary;
  createActivity: CreateActivityFn;
  repositionLane: RepositionLaneFn;
  deleteActivity: DeleteActivityFn;
  label?: string;
}): Command {
  const { activity } = params;
  const toggle = existenceToggle({
    // The delete already happened at the call site, so the command starts in the ABSENT state.
    startId: null,
    create: async () => {
      const recreated = await params.createActivity(activityDefinitionInput(activity));
      // The create endpoint doesn't take a lane, so restore the original lane afterwards (only when
      // it differs, to avoid a gratuitous second write).
      if (recreated.laneIndex !== activity.laneIndex) {
        const relaned = await params.repositionLane({
          activityId: recreated.id,
          laneIndex: activity.laneIndex,
          version: recreated.version,
        });
        return relaned.id;
      }
      return recreated.id;
    },
    remove: params.deleteActivity,
  });
  return {
    // Name the deleted entity ("Delete “Excavate”"), mirroring the toast convention (S1).
    label: params.label ?? `Delete “${activity.name}”`,
    undo: toggle.ensurePresent,
    redo: toggle.ensureAbsent,
  };
}

/** The dependency-create input `useCreateDependency` takes (endpoints + type + lag). */
export interface DependencyLinkInput {
  planId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
  lagCalendar: LagCalendarSource;
}
/** `useCreateDependency().mutateAsync` — resolves to the created edge (carrying its new id). */
export type CreateDependencyFn = (input: DependencyLinkInput) => Promise<DependencySummary>;
/** `useDeleteDependency().mutateAsync` — removes an edge by id. */
export type DeleteDependencyFn = (dependencyId: string) => Promise<void>;

/** Project a dependency row into the create input that re-issues it (endpoints/type/lag/lag-calendar). */
export function dependencyLinkOf(dependency: DependencySummary): DependencyLinkInput {
  return {
    planId: dependency.planId,
    predecessorId: dependency.predecessor.id,
    successorId: dependency.successor.id,
    type: dependency.type,
    lagDays: dependency.lagDays,
    lagCalendar: dependency.lagCalendar,
  };
}

function dependencyToggle(params: {
  dependency: DependencySummary;
  startId: string | null;
  createDependency: CreateDependencyFn;
  deleteDependency: DeleteDependencyFn;
}): { ensurePresent: () => Promise<void>; ensureAbsent: () => Promise<void> } {
  const link = dependencyLinkOf(params.dependency);
  return existenceToggle({
    startId: params.startId,
    create: async () => (await params.createDependency(link)).id,
    remove: params.deleteDependency,
  });
}

/**
 * Reverse a dependency **add** — undo removes the just-created edge; redo re-creates it (a new id)
 * from the captured endpoints/type/lag. The follow-up recalc is never recorded (ADR-0048).
 */
export function dependencyAddCommand(params: {
  dependency: DependencySummary;
  createDependency: CreateDependencyFn;
  deleteDependency: DeleteDependencyFn;
  label?: string;
}): Command {
  const toggle = dependencyToggle({
    dependency: params.dependency,
    startId: params.dependency.id,
    createDependency: params.createDependency,
    deleteDependency: params.deleteDependency,
  });
  return {
    label: params.label ?? 'Add link',
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
  const toggle = dependencyToggle({
    dependency: params.dependency,
    // The remove already happened at the call site, so the command starts in the ABSENT state.
    startId: null,
    createDependency: params.createDependency,
    deleteDependency: params.deleteDependency,
  });
  return {
    label: params.label ?? 'Remove link',
    undo: toggle.ensurePresent,
    redo: toggle.ensureAbsent,
  };
}

/**
 * Reverse a canvas **Level of Effort span** create (Stage D, `docs/specs/canvas-activity-types/`) — the
 * composite `createActivity(LEVEL_OF_EFFORT) → SS(start → LOE) → FF(LOE → finish)` as ONE reversible
 * step (ADR-0048): **undo** deletes the LOE, which cascades its SS + FF edges (a leaf LOE carries no
 * subtree), so no orphan edge survives; **redo** re-composes the whole span from the captured inputs (a
 * NEW LOE id — the conservative M2 rule, {@link existenceToggle}). Only the compose is reversed here;
 * the follow-up recalc is never recorded (recompute-don't-restore). No `HAMMOCK` is ever created — the
 * LOE is the span-derived hammock (Stage D Q1).
 */
export function createLoeSpanCommand(params: {
  /** The just-created LOE row (its id starts the toggle in the PRESENT state). */
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
  const toggle = existenceToggle({
    startId: params.loe.id,
    // Redo re-composes the whole span: re-create the LOE, then its SS + FF edges (a fresh LOE id).
    create: async (): Promise<string> => {
      const loe = await createPlaced(params.placedInput);
      await createDependency({
        planId,
        predecessorId: startDriverId,
        successorId: loe.id,
        type: 'SS',
        lagDays: 0,
        lagCalendar: 'PROJECT_DEFAULT',
      });
      await createDependency({
        planId,
        predecessorId: loe.id,
        successorId: finishDriverId,
        type: 'FF',
        lagDays: 0,
        lagCalendar: 'PROJECT_DEFAULT',
      });
      return loe.id;
    },
    // Undo deletes the LOE — the cascade removes its SS + FF edges with it.
    remove: params.deleteActivity,
  });
  return {
    // The quoted name was always the generic default ("Level of effort"), so it added nothing — drop it
    // and read plainly "Add level-of-effort span" (S3).
    label: params.label ?? 'Add level-of-effort span',
    undo: toggle.ensureAbsent,
    redo: toggle.ensurePresent,
  };
}

/** `useSetActivityVisualStart().mutateAsync` — a Visual-mode placement PATCH (ADR-0033). */
export type SetVisualStartFn = (input: {
  activityId: string;
  visualStart: string | null;
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
 * redo re-applies the dropped one. Coalescable like {@link repositionCommand} — a Visual-mode drag /
 * nudge burst on one bar collapses to a single undo step. Version threaded from each response.
 */
export function visualStartCommand(params: {
  setVisualStart: SetVisualStartFn;
  activityId: string;
  before: VisualPlacement;
  after: VisualPlacement;
  version: number;
  label?: string;
}): Command {
  const { setVisualStart, activityId, before, after } = params;
  let version = params.version;
  const place = async (target: VisualPlacement): Promise<void> => {
    const saved = await setVisualStart({
      activityId,
      visualStart: target.visualStart,
      laneIndex: target.laneIndex,
      version,
    });
    version = saved.version;
  };
  const command: Command = {
    label: params.label ?? 'Move activity',
    undo: () => place(before),
    redo: () => place(after),
  };
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
        version,
        ...(params.label !== undefined ? { label: params.label } : {}),
      }),
  });
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
 * lanes, each through the same all-or-nothing batch endpoint. Versions are threaded from each batch
 * response (seeded from the forward pass) so the optimistic lock always carries the current version.
 */
export function autoArrangeCommand(params: {
  batchPositions: BatchPositionsFn;
  before: readonly LanePlacement[];
  after: readonly LanePlacement[];
  versions: ReadonlyMap<string, number>;
  label?: string;
}): Command {
  const { batchPositions } = params;
  const versions = new Map(params.versions);
  const apply = async (placements: readonly LanePlacement[]): Promise<void> => {
    const positions = placements.flatMap((p) => {
      const version = versions.get(p.id);
      return version === undefined ? [] : [{ id: p.id, laneIndex: p.laneIndex, version }];
    });
    if (positions.length === 0) return;
    const saved = await batchPositions({ positions });
    for (const row of saved) versions.set(row.id, row.version);
  };
  return {
    label: params.label ?? 'Auto-arrange lanes',
    undo: () => apply(params.before),
    redo: () => apply(params.after),
  };
}
