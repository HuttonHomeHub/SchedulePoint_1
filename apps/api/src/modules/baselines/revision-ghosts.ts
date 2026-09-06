import type { RevisionGhostBar, RevisionLinkChange } from '@repo/types';

import type { RevisionEdge, RevisionRow } from './revision-delta';

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

/**
 * **The changed logic** — the differentiating half of the change picture (ADR-0127). A re-sequence
 * is only visible as a re-sequence if the links are drawn.
 *
 * Keyed on the dependency id, exactly as the change list's `RELOGICKED` rows are, so the picture
 * and the list agree about what "one changed link" means. It reuses `edgeChanged`'s rule by
 * comparing the same fields — deliberately NOT by importing the classifier, because that would
 * couple a geometry projection to a display module; the shared rule is small and the divergence
 * that matters (the lag calendar counting only alongside a lag) is asserted in both suites.
 *
 * ## What it refuses to draw, and why it is a COUNT
 *
 * A link has no geometry of its own: it is anchored to two bars. A removed link whose endpoint is
 * no longer in the plan therefore has nowhere to start or end — the endpoint's ghost knows its
 * frozen lane but is not a `RenderActivity`, so the shared router cannot anchor to it. Such links
 * are counted, never drawn at a guessed position and never silently dropped.
 *
 * An ADDED or CHANGED link is always drawable: it exists in the new revision, so both its endpoints
 * do too.
 */
export interface RevisionLinkResult {
  readonly links: RevisionLinkChange[];
  readonly undrawable: number;
}

/** The planner-authored fields. Mirrors the classifier's `edgeChanged`, including its lag rule. */
function edgeAuthoredDiffers(from: RevisionEdge, to: RevisionEdge): boolean {
  return (
    from.type !== to.type ||
    from.lagMinutes !== to.lagMinutes ||
    // Only alongside a lag: switching the lag calendar of a zero-lag link changes no date, so
    // lighting the link would point a planner at an edit with no consequence.
    (to.lagMinutes !== 0 && from.lagCalendar !== to.lagCalendar)
  );
}

export function buildRevisionLinkChanges(
  fromEdges: readonly RevisionEdge[],
  toEdges: readonly RevisionEdge[],
  /** Ids present in the LIVE plan — the only place a link can be anchored. */
  liveActivityIds: ReadonlySet<string>,
): RevisionLinkResult {
  const fromById = new Map(fromEdges.map((e) => [e.dependencyId, e]));
  const toById = new Map(toEdges.map((e) => [e.dependencyId, e]));
  const links: RevisionLinkChange[] = [];
  let undrawable = 0;

  const push = (edge: RevisionEdge, state: RevisionLinkChange['state']): void => {
    if (!liveActivityIds.has(edge.predecessorId) || !liveActivityIds.has(edge.successorId)) {
      undrawable += 1;
      return;
    }
    links.push({
      dependencyId: edge.dependencyId,
      predecessorId: edge.predecessorId,
      successorId: edge.successorId,
      state,
    });
  };

  for (const to of toEdges) {
    const from = fromById.get(to.dependencyId);
    if (!from) push(to, 'ADDED');
    else if (edgeAuthoredDiffers(from, to)) push(to, 'CHANGED');
  }
  for (const from of fromEdges) {
    if (!toById.has(from.dependencyId)) push(from, 'REMOVED');
  }
  return { links, undrawable };
}
