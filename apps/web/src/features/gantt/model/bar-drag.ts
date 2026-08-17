import type { ActivitySummary } from '@repo/types';

/**
 * **Moving a bar: what the Gantt needs from its host, and what it may never decide itself.**
 *
 * The write is `onTsldReposition` / `onTsldResize` — the workspace functions the canvas already
 * uses, which carry the Early/Visual split, the undo command, the pen path, the 409 path and the
 * recalculation notify (spec F5). **No new write path**: a second one is how a surface comes to
 * skip a guard its neighbour enforces, and here the guard most easily skipped is the one that only
 * fails when somebody else is working.
 *
 * `laneIndex` is deliberately absent from both calls. Both take it optionally
 * (`use-plan-workspace-model.ts:956,1106` — read, not assumed), and omitting it makes "a Gantt drag
 * never changes lane" **structural** rather than a rule somebody has to keep. The Gantt has no lane
 * axis at all; a vertical drag there is a row reorder question this milestone does not answer.
 */

/** What one bar gesture asks the workspace to do. */
export interface GanttBarDrag {
  /**
   * Fused role + pen, minus the Late overlay — the SAME binding the canvas receives, derived once
   * by the workspace (`host-parity.structural.test.ts`). Arming from `canEditSchedule` alone would
   * let bars move underneath a banner reading "editing is paused".
   */
  canEdit: boolean;
  /** Why moving is shut, when it is. Shown on the row rather than silently doing nothing. */
  reason: string | null;
  /** The plan's `plannedStart` — the origin `startDay` counts from. Null before the plan loads. */
  plannedStartIso: string | null;
  /** Move a bar to a new start day. Lane-free by construction; see above. */
  moveTo: (activityId: string, startDay: number) => void;
  /** Change a bar's duration in whole days. */
  resizeTo: (activityId: string, durationDays: number) => void;
  /** Announce the outcome — the same live region the rest of the workspace uses. */
  announce: (message: string) => void;
}

/** How many days one keyboard nudge moves. */
export const NUDGE_DAYS = 1;

/**
 * Whether this activity's bar may be moved at all, and why not.
 *
 * Separate from the permission gate because these are facts about the OBJECT: a summary's dates are
 * an engine rollup of its children (ADR-0038), so there is nothing on it to drag and no good answer
 * to what dragging one would mean for the forty activities inside it — the same reasoning that made
 * the ADR-0063 WBS band select-only. Checked before permission so a reason about the object is
 * never masked by one about the reader.
 */
export function barMoveGate(
  activity: Pick<ActivitySummary, 'type'>,
  drag: Pick<GanttBarDrag, 'canEdit' | 'reason'>,
): { movable: boolean; reason: string | null } {
  if (activity.type === 'WBS_SUMMARY') {
    return { movable: false, reason: 'A summary follows the activities inside it.' };
  }
  if (!drag.canEdit) {
    return { movable: false, reason: drag.reason };
  }
  return { movable: true, reason: null };
}

/**
 * The sentence announced after a nudge or a drop.
 *
 * Announced at all because ADR-0064's gate pass found four controls silent while their keyboard
 * siblings announced — one correct pattern applied to a control and not its neighbour, four times
 * in one diff. A move with no confirmation is indistinguishable from a move that did not happen,
 * and on a chart the visual change may be off-screen.
 */
export function moveAnnouncement(name: string, startIso: string): string {
  return `${name} moved to ${startIso}.`;
}

export function resizeAnnouncement(name: string, durationDays: number): string {
  return `${name} is now ${String(durationDays)} ${durationDays === 1 ? 'day' : 'days'} long.`;
}
