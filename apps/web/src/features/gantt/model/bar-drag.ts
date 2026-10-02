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
 * **Every write returns its outcome, and the HOST announces after it** (ADR-0170 D6). The row used
 * to announce the instant it called, so a stale-version refusal or a lost pen was spoken as a
 * success: the host discarded the promise (`void`) and nothing downstream could tell. The row
 * passes the sentence to say on success; the host owns the single announcement of the real result.
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
  /**
   * Whether a day (an offset from `plannedStartIso`) is worked on the plan calendar — built once
   * by the host, keyed to `plannedStartIso`. Null while the calendar has not loaded, which makes
   * every conversion fall back to the calendar span (`drawnSpanPlacement`).
   */
  isWorkingDay: ((dayOffset: number) => boolean) | null;
  /**
   * Move a bar to a new start day. Lane-free by construction; see above. `applied` is the sentence
   * the host announces once the write has landed.
   */
  moveTo: (activityId: string, startDay: number, applied: string) => Promise<void>;
  /** Change a bar's duration in working days, the start held. */
  resizeTo: (activityId: string, durationDays: number, applied: string) => Promise<void>;
  /** Move a bar's start, the finish held: a start day and the working days to the finish. */
  resizeStart: (
    activityId: string,
    startDay: number,
    durationDays: number,
    applied: string,
  ) => Promise<void>;
  /** Say something now (refusals) — the same live region the rest of the workspace uses. */
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

/** Which end of a bar a resize holds still, by the end it moves. */
export type BarEdge = 'start' | 'finish';

/** Why a started or finished activity's start cannot be moved — said by the handle's refusal AND the Start cell. */
export function startEdgeFrozenReason(): string {
  return 'This activity has started, so its start is its actual start and cannot be moved here.';
}

/**
 * The OBJECT's reason an edge cannot be resized, or null. Summary, then milestone, then
 * level-of-effort, then (start edge only) frozen by actuals.
 *
 * The order is "most fundamental first": a summary is not a task at all, so telling it "it has
 * started" would be true of nothing. Shared by the finish handle, the keyboard resize, the start
 * handle and the typed `Start` cell, so they cannot give four answers to one question.
 *
 * The first three mirror `isResizeEligibleType` (`features/tsld/render/hit-test.ts`). The frozen
 * rule mirrors the engine's `isFrozenByActuals` — an activity with any actual is drawn from its
 * actual and ignores a hand-placed start — so a start-edge write there would save an inert
 * placement, change the duration and move the FINISH, the opposite of the gesture's promise.
 */
export function edgeObjectReason(
  activity: Pick<ActivitySummary, 'type' | 'actualStart' | 'actualFinish'>,
  edge: BarEdge,
): string | null {
  if (activity.type === 'WBS_SUMMARY') return 'A summary follows the activities inside it.';
  if (activity.type === 'START_MILESTONE' || activity.type === 'FINISH_MILESTONE') {
    return 'A milestone marks a moment, so it has no duration.';
  }
  if (activity.type === 'LEVEL_OF_EFFORT') {
    return 'A level-of-effort activity takes its span from the activities it is tied to.';
  }
  if (edge === 'start' && Boolean(activity.actualStart ?? activity.actualFinish)) {
    return startEdgeFrozenReason();
  }
  return null;
}

/**
 * Whether one edge of this bar may be resized, and why not — the object's reason before the
 * reader's, as {@link barMoveGate} does.
 */
export function barEdgeGate(
  activity: Pick<ActivitySummary, 'type' | 'actualStart' | 'actualFinish'>,
  drag: Pick<GanttBarDrag, 'canEdit' | 'reason'>,
  edge: BarEdge,
): { resizable: boolean; reason: string | null } {
  const objectReason = edgeObjectReason(activity, edge);
  if (objectReason !== null) return { resizable: false, reason: objectReason };
  if (!drag.canEdit) return { resizable: false, reason: drag.reason };
  return { resizable: true, reason: null };
}

/**
 * Announce AFTER a bar write settles, never before (ADR-0170 D6).
 *
 * Each write used to be a `void`ed promise with the row announcing success the instant it called,
 * so a stale-version refusal read as a move that had worked and a rejection was an unhandled
 * promise. The outcome is the workspace's own (`TsldEditOutcome`): applied → the row's success
 * sentence; a domain conflict → its sentence; neither (the pen path has already spoken for a lost
 * lock) → nothing more; a throw → the failure sentence. Matches the diagram
 * (`TsldPanel.tsx`, the reposition/resize `.then` handlers).
 */
export async function settleBarWrite(
  write: Promise<{ applied: boolean; conflict: string | null }>,
  applied: string,
  failed: string,
  announce: (message: string) => void,
): Promise<void> {
  try {
    const outcome = await write;
    if (outcome.applied) announce(applied);
    else if (outcome.conflict !== null) announce(outcome.conflict);
  } catch {
    announce(failed);
  }
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

/** The diagram's sentence verbatim (`TsldPanel.tsx`), so one operation reads one way in both views. */
export function startEdgeAnnouncement(
  name: string,
  startDisplay: string,
  durationDays: number,
): string {
  return `Moved the start of “${name}” to ${startDisplay} (${String(durationDays)} ${durationDays === 1 ? 'day' : 'days'}, finish unchanged); dates will update.`;
}

export function resizeAnnouncement(name: string, durationDays: number): string {
  return `${name} is now ${String(durationDays)} ${durationDays === 1 ? 'day' : 'days'} long.`;
}
