import type { ActivitySummary } from '@repo/types';

import type { ActivityPlacement } from '@/features/undo-redo';

/**
 * Turning a plural drag into the rows the batch endpoint takes
 * (`docs/specs/canvas-multi-select/` M4-T2).
 *
 * Pure, and **mode-aware in one place**. The single-bar drag already branches on the plan's
 * scheduling mode (ADR-0033): in EARLY a move pins an `SNET` constraint, in VISUAL it writes
 * `visualStart`. Doing that branch again, inline, for the bulk path is how the two come to disagree
 * — and the disagreement would be invisible, because each looks right on its own and only a planner
 * who moved one bar and then twelve would ever see that the twelve were pinned differently.
 */

/** Which field a move writes, from the plan's scheduling mode. */
export type BulkMoveMode = 'early' | 'visual';

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
export function movedPlacement(
  activity: ActivitySummary,
  delta: BulkMoveDelta,
  mode: BulkMoveMode,
): ActivityPlacement {
  const current = currentPlacement(activity);
  // `null` here means "leave the lane alone" (the one field where null is not a clear), so a row
  // that arrived without one is passed through rather than being given lane 0 by arithmetic.
  const laneIndex =
    current.laneIndex === null ? null : Math.max(0, current.laneIndex + delta.laneDelta);
  if (delta.dayDelta === 0) return { ...current, laneIndex };

  if (mode === 'visual') {
    // The bar a planner sees in Visual mode is drawn from `visualStart` when it is set and from the
    // computed early start when it is not — so a first drag has to seed it from where the bar is,
    // not from a null.
    const from = current.visualStart ?? activity.earlyStart;
    return {
      ...current,
      laneIndex,
      visualStart: from ? shiftIso(from, delta.dayDelta) : current.visualStart,
    };
  }

  // EARLY: the move pins a Start-No-Earlier-Than at the dropped day, exactly as the single-bar drag
  // does. At twelve bars this stops being a side effect and becomes a plan-shaping decision, which
  // is why the bar states it BEFORE the drag rather than reporting it afterwards.
  const from =
    current.constraintType === 'SNET' && current.constraintDate
      ? current.constraintDate
      : activity.earlyStart;
  if (!from) return { ...current, laneIndex };
  return {
    ...current,
    laneIndex,
    constraintType: 'SNET',
    constraintDate: shiftIso(from, delta.dayDelta),
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
  mode: BulkMoveMode;
}): {
  before: ActivityPlacement[];
  after: ActivityPlacement[];
  versions: Map<string, number>;
} {
  const before = params.activities.map(currentPlacement);
  const after = params.activities.map((a) => movedPlacement(a, params.delta, params.mode));
  const versions = new Map(params.activities.map((a) => [a.id, a.version] as const));
  return { before, after, versions };
}
