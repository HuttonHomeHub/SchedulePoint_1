import type { ActivitySummary } from '@repo/types';

/**
 * **Indent and Outdent** (ADR-0095 M5-T4) — where a row goes when a planner presses them, and when
 * they are refused.
 *
 * Pure, and separate from the menu, because the interesting part is entirely a question about the
 * TREE and none of it is about React: which row above is eligible to be a parent, what "one level
 * out" means at the top level, and which refusals a planner can act on.
 *
 * ## Indent does NOT convert a task into a summary, and that is the load-bearing decision
 *
 * P6 and MS Project both indent by making the row **above** the parent, converting it to a summary
 * on the way. SchedulePoint cannot: ADR-0038 makes "only a `WBS_SUMMARY` may be a parent" a service
 * invariant, and — the part that matters — **a summary carries no logic and may never be a
 * dependency endpoint**. So the borrowed gesture would silently strip every link on the row above,
 * or fail at the API with a message about an invariant the planner never invoked.
 *
 * Indent therefore files the row under the nearest **existing summary** above it at its own depth,
 * and says so plainly when there is none. That is a smaller capability than P6's and an honest one:
 * the alternative is a gesture whose real effect is deleting somebody's logic.
 */

export interface StructureMove {
  /** The row's new parent, or null for the top level. */
  parentId: string | null;
}

export interface StructureRefusal {
  /** Why the move cannot happen, in words a planner can act on. */
  reason: string;
}

export type StructureOutcome = StructureMove | StructureRefusal;

export function isRefusal(outcome: StructureOutcome): outcome is StructureRefusal {
  return 'reason' in outcome;
}

/** A summary is the only thing that may parent (ADR-0038). */
function isSummary(activity: ActivitySummary): boolean {
  return activity.type === 'WBS_SUMMARY';
}

/**
 * File `activity` under the nearest summary above it, in the order the GRID is showing.
 *
 * "Above" means the display order the planner is looking at, not plan order — indent is a gesture
 * about the picture in front of them, and answering it from a different ordering would move the row
 * somewhere they cannot see.
 *
 * The candidate must be at the row's own depth: a summary one level deeper is not "the section
 * above", it is a section inside the previous one, and filing under it would jump two levels for
 * one keypress.
 */
export function indentTarget(
  ordered: readonly ActivitySummary[],
  activityId: string,
): StructureOutcome {
  const index = ordered.findIndex((a) => a.id === activityId);
  if (index === -1) return { reason: 'That activity is not in this view.' };
  const activity = ordered[index]!;

  if (isSummary(activity)) {
    // A summary CAN be filed under another summary (ADR-0038's tree is arbitrary-depth), so this is
    // not refused for being a summary — only for having nowhere to go, below.
  }

  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = ordered[i]!;
    // Stop at the first row that is a SIBLING — same parent — because that is what "the row above"
    // means at this level. Rows nested deeper belong to a section we are not in.
    if (candidate.parentId !== activity.parentId) continue;
    if (!isSummary(candidate)) {
      return {
        reason:
          'The row above is an activity, not a summary. Only a summary can contain other activities.',
      };
    }
    if (candidate.id === activity.id) break;
    return { parentId: candidate.id };
  }

  return { reason: 'There is no summary above this row to file it under.' };
}

/**
 * Move `activity` one level out — to its parent's parent, or to the top level.
 *
 * Refused at the top level rather than being a silent no-op: a control that does nothing and says
 * nothing is the lit-but-inert shape this register keeps recording.
 */
export function outdentTarget(
  activities: readonly ActivitySummary[],
  activityId: string,
): StructureOutcome {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const activity = byId.get(activityId);
  if (activity === undefined) return { reason: 'That activity is not in this view.' };
  if (activity.parentId === null || activity.parentId === undefined) {
    return { reason: 'This row is already at the top level.' };
  }
  const parent = byId.get(activity.parentId);
  // A parent that is not in the set (paged out, or soft-deleted mid-session) still has a knowable
  // answer for the planner: out of it means the top level. Guessing something else would move the
  // row somewhere nobody asked for.
  return { parentId: parent?.parentId ?? null };
}
