import type { ActivitySummary } from '@repo/types';

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
}): Command {
  const { label, update, before, after } = params;
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
  return {
    label,
    undo: () => restore(before),
    redo: () => restore(after),
  };
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
    label: params.label ?? 'Move activity',
    update: params.update,
    before: params.before,
    after: params.after,
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
  return {
    label: params.label ?? 'Move activity to lane',
    undo: () => move(fromLaneIndex),
    redo: () => move(toLaneIndex),
  };
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
    label: params.label ?? 'Edit activity',
    update: params.update,
    before: params.before,
    after: params.after,
  });
}
