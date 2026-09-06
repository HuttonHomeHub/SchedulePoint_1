import type { RevisionGhostBar } from '@repo/types';

import type { RevisionRow } from './revision-delta';

/**
 * **The change picture's geometry** — where the changed bars WERE, for a canvas that draws the
 * difference behind the live scene (ADR-0126 / ADR-0127).
 *
 * One pure function over the same two projections the delta and the change list read. No engine, no
 * I/O; `computeSchedule` is not imported and the structural gate over this file's family asserts it.
 *
 * ## Only what CHANGED, and only geometry
 *
 * The product owner's call (CQ-2, 2026-09-06) was that the overlay paints the **difference**, not
 * the whole old scene — a ghost behind every unchanged bar is a picture of the plan rather than of
 * what happened to it, and on a 500-activity programme it is a second plan drawn on top of the
 * first.
 *
 * So "changed" here is narrower than the change list's: a bar is ghosted when it **moved** — a
 * different start, finish or lane — or when it is gone. A renamed activity is a real change and its
 * bar is in exactly the same place, so a ghost for it would be an outline drawn under its own live
 * bar: invisible, and paid for on every frame.
 *
 * ## The lane is recorded, never guessed
 *
 * `laneIndex` comes from the FROZEN side (ADR-0126's `baseline_activities.lane_index`), which is
 * what makes REMOVED work drawable at all — it has no live bar to sit behind, and putting it
 * somewhere plausible would be a false statement about where the work was. A baseline captured
 * before that column existed records nothing, and such an activity is **counted and not drawn**:
 * see the returned `undrawable`, which the panel states in words. Silently dropping it would leave
 * a picture missing rows in the one place a reader cannot check, because a diagram has no
 * "showing N of M".
 */
export interface RevisionGhostResult {
  readonly ghosts: RevisionGhostBar[];
  /** Changed activities whose OLD position was never recorded. Reported, never folded into zero. */
  readonly undrawable: number;
}

/** Both milestone types draw as a diamond rather than a bar, matching the live painter (ADR-0026). */
function isMilestone(row: RevisionRow): boolean {
  return row.type === 'START_MILESTONE' || row.type === 'FINISH_MILESTONE';
}

/**
 * A summary's dates are an engine rollup over its children, so it is never something a planner
 * moved — the delta excludes it from criticality and carrier selection for the same reason
 * (`revision-delta.ts`), and a ghost for one would draw the consequence of a change rather than the
 * change.
 */
function isSummary(row: RevisionRow): boolean {
  return row.type === 'WBS_SUMMARY';
}

export function buildRevisionGhosts(
  fromRows: readonly RevisionRow[],
  toRows: readonly RevisionRow[],
): RevisionGhostResult {
  const toById = new Map(toRows.map((r) => [r.activityId, r]));
  const ghosts: RevisionGhostBar[] = [];
  let undrawable = 0;

  for (const from of fromRows) {
    if (isSummary(from)) continue;
    const to = toById.get(from.activityId);
    const removed = to === undefined;
    if (!removed) {
      const moved =
        from.earlyStart !== to.earlyStart ||
        from.earlyFinish !== to.earlyFinish ||
        from.laneIndex !== to.laneIndex;
      if (!moved) continue;
    }

    // An old side with no dates has no geometry to draw — an unscheduled capture, which the
    // completion half already reports as non-assessable. Not counted as undrawable: nothing was
    // lost by a missing COLUMN, the plan was never calculated.
    if (from.earlyStart === null || from.earlyFinish === null) continue;

    // The lane, on the other hand, IS a missing column on a pre-ADR-0126 baseline — and it is the
    // one field a guess would falsify. Counted and dropped.
    if (from.laneIndex === null) {
      undrawable += 1;
      continue;
    }

    ghosts.push({
      activityId: from.activityId,
      name: from.name,
      fromStart: from.earlyStart,
      fromFinish: from.earlyFinish,
      laneIndex: from.laneIndex,
      isMilestone: isMilestone(from),
      removed,
    });
  }

  return { ghosts, undrawable };
}
