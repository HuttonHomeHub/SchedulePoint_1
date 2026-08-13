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
 * **`snapToWorkingDay` was deleted (workspace-chrome M2), and so was the control that drove it.**
 *
 * It rounded a dropped day to the **nearest** working day, earlier side winning ties, behind a
 * `Snap to grid` toggle. The product owner reported seeing no difference with it on or off and was
 * right to: the CPM engine already snaps, **unconditionally and server-side**. The ADR-0033
 * effective-Visual pass wraps every `visualStart` in `rollForwardToWorking`
 * (`apps/api/src/modules/schedule/engine/compute.ts:335-338`), which returns the first working
 * minute at or after the instant on the activity's own calendar
 * (`.../engine/instants.ts:18-22`).
 *
 * So the toggle never decided *whether* a placement snapped — only the **direction of the
 * tie-break**, and only on a drop onto a non-working column: a Saturday landed **Friday** with it on
 * and **Monday** with it off. Making it automatic would not have added snapping; it would have made
 * the client's *nearest* rule permanent, so a Saturday drop moved an activity **earlier than the
 * planner placed it**, which is worse than the server's forward roll and contrary to what dropping a
 * bar implies.
 *
 * {@link drawnSpanPlacement} — the create/resize path — always rolled **forward** and cites the
 * engine's reason in its own docblock. One client transform agreed with the server and one did not;
 * the disagreement was the defect. The remaining rule is: **an optimistic preview applies the rule
 * the server will apply, or it is a lie with a short half-life.**
 */

/**
 * **The engine's rule, applied client-side to the optimistic preview only.** The first working day
 * at or **after** `dayOffset` — never earlier.
 *
 * This is `rollForwardToWorking` (`apps/api/src/modules/schedule/engine/instants.ts:18-22`) at day
 * granularity: the ADR-0033 effective-Visual pass rolls every `visualStart` forward before it
 * schedules, so a bar dropped on a Saturday is *always* going to come back on Monday. Showing the
 * planner Saturday until the recalculation lands is a preview that is knowingly wrong.
 *
 * **The result of this must never be persisted.** The predicate available here is the *plan*
 * calendar at *day* granularity; the engine rolls on the *activity's own* calendar (ADR-0037) at
 * *minute* granularity (ADR-0036), so the two can legitimately disagree — a per-activity calendar
 * with a Saturday shift is a working day the client's predicate says is not. The PATCH sends the raw
 * dropped day and lets the server decide; this only decides what to paint meanwhile.
 *
 * Bounded like {@link drawnSpanPlacement}, so a pathological calendar cannot hang the drag.
 */
export function rollForwardToWorkingDay(
  dayOffset: number,
  isWorkingDay: (dayOffset: number) => boolean,
  horizon: number = SNAP_HORIZON_DAYS,
): number {
  for (let delta = 0; delta <= horizon; delta += 1) {
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
