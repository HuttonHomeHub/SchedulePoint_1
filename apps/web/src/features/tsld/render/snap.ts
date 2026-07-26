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

/** What a drawn span must be created as: where the bar starts, and how long it is in working days. */
export interface DrawnPlacement {
  startDay: number;
  durationDays: number;
}

/**
 * Turn the **calendar-day span the planner drew** into the `(startDay, durationDays)` an activity
 * must be created with — the translation between what the canvas measures and what the engine means.
 *
 * These are two different units and conflating them is a visible lie. The TSLD's x-axis is
 * **calendar** time (a weekend still occupies two columns), but `durationDays` is a **working-day**
 * duration (ADR-0023/0036) — so a Friday→Tuesday drag is 5 columns wide and 3 working days long.
 * Creating it with `endDay - startDay + 1 = 5` makes the engine lay out five *working* days
 * (Fri, Mon–Thu) and the bar comes back a Wednesday and a Thursday longer than it was drawn.
 *
 * The start is snapped **forward** to the first working day at or after the press, never backward:
 * the SNET pin (or a Visual placement) can only be pushed later by a non-working start, so rounding
 * the other way would produce a bar the engine immediately moves right of where it was released.
 *
 * A task always gets at least one working day — a span drawn entirely inside a shutdown would
 * otherwise be a zero-duration task, which is a milestone, which is not what was drawn.
 *
 * With **no calendar predicate** (a plan whose calendar hasn't loaded) the raw calendar span is
 * returned unchanged — the pre-fix behaviour, so nothing changes on that path.
 */
export function drawnSpanPlacement(
  startDay: number,
  endDay: number,
  isWorkingDay: ((dayOffset: number) => boolean) | null,
  horizon: number = SNAP_HORIZON_DAYS,
): DrawnPlacement {
  const left = Math.min(startDay, endDay);
  const right = Math.max(startDay, endDay);
  if (!isWorkingDay) return { startDay: left, durationDays: right - left + 1 };
  // Forward-only scan, bounded like snapToWorkingDay so a pathological calendar can never hang.
  let first = left;
  for (let delta = 1; delta <= horizon && !isWorkingDay(first); delta += 1) first = left + delta;
  let working = 0;
  for (let day = first; day <= right; day += 1) if (isWorkingDay(day)) working += 1;
  return { startDay: first, durationDays: Math.max(1, working) };
}
