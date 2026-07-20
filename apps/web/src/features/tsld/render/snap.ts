/**
 * The pure **snap-to-working-day** rounding behind the TSLD *Snap to grid* authoring aid (spec
 * `docs/specs/canvas-nav/`, behind `VITE_CANVAS_NAV`). It rounds a dropped day offset to the nearest
 * **working** day using the plan's existing working-day predicate (`makeWorkingDayPredicate` /
 * `isWorkingDay` in `render/time-scale.ts`) — so a hand-placed Visual-mode bar lands on a clean
 * working-day boundary instead of a weekend/holiday. Pure and O(1)-amortised per drop (a bounded scan);
 * no canvas/DOM/React. `TsldPanel` applies it to the dropped day BEFORE the existing `setVisualStart`
 * PATCH, so the PATCH contract, undo record and auto-recalc are all unchanged.
 */

/** The default outward scan horizon (days each side) before falling back to the raw day — one year, so
 * even a long holiday exception resolves, but a pathological all-non-working calendar can never hang. */
export const SNAP_HORIZON_DAYS = 366;

/**
 * Round `dayOffset` to the nearest working day per `isWorkingDay` (a day-offset predicate). An already-
 * working day is returned unchanged. Otherwise scan outward a day at a time; a **tie** (equal distance
 * each side) rounds to the **earlier** day (the earlier side is tested first). If no working day lies
 * within `horizon`, fall back to the raw `dayOffset` (never hang). Pure.
 */
export function snapToWorkingDay(
  dayOffset: number,
  isWorkingDay: (dayOffset: number) => boolean,
  horizon: number = SNAP_HORIZON_DAYS,
): number {
  if (isWorkingDay(dayOffset)) return dayOffset;
  for (let delta = 1; delta <= horizon; delta += 1) {
    // Earlier side first, so an exact tie rounds down (to the earlier working day).
    if (isWorkingDay(dayOffset - delta)) return dayOffset - delta;
    if (isWorkingDay(dayOffset + delta)) return dayOffset + delta;
  }
  return dayOffset;
}
