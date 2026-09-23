import type { ActivitySummary } from '@repo/types';

import type { ActivityPlacement } from '@/features/undo-redo';
import { barDatesFor } from '@/lib/bar-dates';

/**
 * Turning a plural drag into the rows the batch endpoint takes
 * (`docs/specs/canvas-multi-select/` M4-T2).
 *
 * Pure, and since the collapse (M-F-T3) it has **one behaviour rather than two**: a move writes
 * `visualStart`, on every plan.
 *
 * This file used to carry a `BulkMoveMode` mirroring the single-bar drag's `EARLY` branch, where a
 * move pinned an `SNET` constraint at the dropped day. That branch is gone from both paths in the
 * same commit, and deleting the **parameter** rather than defaulting it is what stops one of them
 * keeping the old behaviour by omission — which is the disagreement the mode-aware-in-one-place
 * rule existed to prevent, arriving by the other door.
 */

/** A day + lane delta, as the drag produced it. */
export interface BulkMoveDelta {
  /** Days to shift every selected activity. May be negative; 0 means "lane-only". */
  readonly dayDelta: number;
  /** Lanes to shift every selected activity. May be negative; 0 means "time-only". */
  readonly laneDelta: number;
}

/** Shift an ISO calendar date by whole days. Calendar-naive on purpose: `constraintDate` and
 *  `visualStart` are plain dates, and the working-day walk belongs to the engine, not the client. */
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The placement a row already has — the `before` half of the undo snapshot. */
export function currentPlacement(activity: ActivitySummary): ActivityPlacement {
  return {
    id: activity.id,
    constraintType: activity.constraintType,
    constraintDate: activity.constraintDate,
    visualStart: activity.visualStart,
    laneIndex: activity.laneIndex,
  };
}

/**
 * The placement a row would have after the move — the `after` half.
 *
 * **Every field is present**, including the ones the move does not touch, because the endpoint
 * takes complete rows: an omitted `constraintType` is a validation error there, never a silent
 * "leave it alone", which is what stops a bulk lane drag from quietly unpinning twelve constraints.
 *
 * A **lane-only** move (`dayDelta === 0`) leaves every date field exactly as it was, which is what
 * makes {@link isLaneOnly} able to route it to the cheaper positions endpoint.
 */
export function movedPlacement(activity: ActivitySummary, delta: BulkMoveDelta): ActivityPlacement {
  const current = currentPlacement(activity);
  // `null` here means "leave the lane alone" (the one field where null is not a clear), so a row
  // that arrived without one is passed through rather than being given lane 0 by arithmetic.
  const laneIndex =
    current.laneIndex === null ? null : Math.max(0, current.laneIndex + delta.laneDelta);
  if (delta.dayDelta === 0) return { ...current, laneIndex };

  // A move writes the placement and **nothing else**, starting from where the bar is DRAWN. That is
  // `visualEffectiveStart` (`lib/bar-dates.ts`), not `visualStart ?? earlyStart` as this read until
  // 2026-09-23: an unplaced bar pushed by a placed predecessor is drawn later than its early start,
  // and the drag's delta is measured on the drawn picture, so seeding from `earlyStart` landed it
  // short of where the planner dropped it. A bar with no drawn start is not on the canvas and so
  // cannot be in a drag; its placement is left as it was.
  //
  // **The SNET branch is deleted rather than made conditional** (M-F-T3). Pinning a constraint was
  // never what a planner asked for by dragging; it was how an `EARLY` plan could be made to
  // remember a position at all, and a placement now does that directly. A constraint is a
  // commitment somebody records on purpose, and the editor is where it is recorded.
  //
  // `constraintType`/`constraintDate` still ride along in the row because the endpoint takes
  // complete placements — an omitted field there is a validation error, never a silent "leave it
  // alone" — so a bulk move now provably carries every existing constraint through UNCHANGED,
  // where before it overwrote twelve of them.
  const from = barDatesFor(activity, 'visual').start;
  return {
    ...current,
    laneIndex,
    visualStart: from ? shiftIso(from, delta.dayDelta) : current.visualStart,
  };
}

/**
 * Is this move lane-only?
 *
 * The distinction is not cosmetic: a lane move writes layout and needs **no recalculation**, so
 * routing it through the placements endpoint would recompute the whole plan for a vertical nudge.
 * The single-bar path has always made this distinction; this keeps the plural path honest about it.
 */
export function isLaneOnly(delta: BulkMoveDelta): boolean {
  return delta.dayDelta === 0 && delta.laneDelta !== 0;
}

/** Does this move change anything at all? A zero-delta drop must send nothing. */
export function isNoOp(delta: BulkMoveDelta): boolean {
  return delta.dayDelta === 0 && delta.laneDelta === 0;
}

/** Build the before/after snapshots and the version map one bulk move needs. */
export function bulkMoveSnapshots(params: {
  activities: readonly ActivitySummary[];
  delta: BulkMoveDelta;
}): {
  before: ActivityPlacement[];
  after: ActivityPlacement[];
  versions: Map<string, number>;
} {
  const before = params.activities.map(currentPlacement);
  const after = params.activities.map((a) => movedPlacement(a, params.delta));
  const versions = new Map(params.activities.map((a) => [a.id, a.version] as const));
  return { before, after, versions };
}
