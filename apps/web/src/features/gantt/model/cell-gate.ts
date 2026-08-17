import type { ActivitySummary } from '@repo/types';

import { GANTT_CELL_SCOPES, type GanttCellKey } from './cell-edit';

import type {
  ActivityEditorGating,
  ScopeGate,
} from '@/features/activities/lib/activity-editor-gating';

/**
 * **Which gate governs a grid cell — resolved from the editor's object, never rebuilt.**
 *
 * `deriveActivityEditorGating` already fuses role and pen into a `ScopeGate` per scope, and
 * ADR-0060 §6 makes it the **one** derivation: a host handed only `canEditSchedule` cannot tell a
 * missing role from a missing pen, so it would have to guess which sentence to show and would
 * eventually guess differently from its sibling. ADR-0062 pinned Logic and Resources to the same
 * object by an identity test rather than by a comment, and this does the same for the grid.
 *
 * So {@link ganttCellGate} **returns the editor's own object**, by reference. The identity
 * assertion in the test beside this file is the enforcement: a second `{ writable, reason }`
 * assembled here would pass every behavioural test and fail that one.
 */

/** Why a cell that could otherwise be typed into is not, right now. */
export interface GanttCellGate extends ScopeGate {
  /**
   * True when the cell shows a value but cannot be changed. **Read-only, never `disabled`**
   * (ADR-0083): the value stays legible at full contrast, the tab stop survives, and the reason is
   * linked with `aria-describedby` rather than sitting beside the control as text a screen-reader
   * user reaches only by chance.
   */
  readOnly: boolean;
}

/**
 * The gate for one cell on one activity.
 *
 * Three things can shut a cell, and they are deliberately different facts:
 *
 * 1. **Permission** — the editor's scope gate, by reference (above).
 * 2. **The activity's own shape** — a `WBS_SUMMARY`'s dates and duration are an engine rollup of
 *    its children (ADR-0038), so there is nothing on it to type; a milestone has no duration at
 *    all. These are omissions of a capability the object does not have, not refusals aimed at the
 *    reader, and the reason says so.
 * 3. **The plan not being calculated yet** — handled by the caller passing `hasComputedSchedule`,
 *    because it is a property of the plan rather than of this row. **Name and duration stay
 *    editable** there and only the dates go read-only: a duration is an *input*, not a rollup, and
 *    a freshly-created uncalculated plan is exactly when a planner is typing initial durations.
 *    Blocking the one field this epic centres on at that moment would have been the conservative
 *    choice and the wrong one (M2-T4, after a ux re-review corrected the first draft).
 */
export function ganttCellGate({
  key,
  activity,
  gating,
  hasComputedSchedule,
}: {
  key: GanttCellKey;
  activity: Pick<ActivitySummary, 'type'>;
  gating: ActivityEditorGating;
  hasComputedSchedule: boolean;
}): GanttCellGate {
  const scope: ScopeGate = GANTT_CELL_SCOPES[key] === 'progress' ? gating.progress : gating.general;

  const isSummary = activity.type === 'WBS_SUMMARY';
  const isMilestone = activity.type === 'START_MILESTONE' || activity.type === 'FINISH_MILESTONE';

  if (isSummary && key !== 'name') {
    return {
      writable: false,
      readable: true,
      readOnly: true,
      reason: 'A summary rolls this up from the activities inside it.',
    };
  }

  if (isMilestone && key === 'duration') {
    return {
      writable: false,
      readable: true,
      readOnly: true,
      reason: 'A milestone marks a moment, so it has no duration.',
    };
  }

  if (!hasComputedSchedule && (key === 'earlyStart' || key === 'earlyFinish')) {
    return {
      writable: false,
      readable: true,
      readOnly: true,
      reason: 'Recalculate the plan to set dates.',
    };
  }

  // Permission last, so the reasons above — which are about the OBJECT — are not masked by one
  // about the reader. Telling a Viewer "your role cannot edit this" about a summary's rolled-up
  // finish date would be true and useless: nobody can type there.
  return { ...scope, readOnly: !scope.writable };
}
