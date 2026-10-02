import { drawnSpanPlacement, type DrawnPlacement } from '@/features/tsld/render/snap';
import { addCalendarDays, daysBetween } from '@/features/tsld/render/working-time';

/**
 * **Pixels on the Gantt chart → the `startDay` the workspace's write path expects.**
 *
 * Two date origins meet here, and getting them confused is the whole risk M3-F1 names. The Gantt
 * draws from `chartAnchor(span)` — one padding day before the earliest activity, so x=0 is a
 * different date in every plan and moves whenever the earliest activity moves. `onTsldReposition`
 * and `onTsldResize` take **days from `plan.plannedStart`** (`use-plan-workspace-model.ts:1003`,
 * read rather than assumed). A drag that passed its chart-relative day straight through would land
 * every bar the padding offset away from where it was dropped, consistently, which is exactly the
 * kind of wrongness that looks like a rendering bug and gets chased in the painter.
 *
 * So the conversion is **one pure function, unit-tested, never written twice** — the ADR-0059 §2
 * rule ("the time axis is shared, not reimplemented") applied to the inverse direction. It derives
 * from the same `pxPerDay` and anchor the bars are drawn from, so a bar dropped where it appears
 * cannot disagree with where it is stored.
 *
 * It deliberately does **not** round to a working day. ADR-0092 D4 established that the client
 * sends the RAW dropped day and the engine rolls it forward: the previous behaviour rounded to the
 * NEAREST working day, so a Saturday drop was written back as **Friday** — earlier than the planner
 * placed it — and then the engine rolled from the client's wrong answer. The ghost previews the
 * roll; the PATCH carries the drop.
 *
 * That holds for a MOVE. A resize writes a duration alongside its start, and the duration is only
 * meaningful from a working day, so the start-edge write rolls the start forward itself, as the
 * diagram's resize does (`spanToPlacement`, ADR-0170 D2).
 */

/** The date a chart x-coordinate falls on. */
export function dateAtChartX(anchorIso: string, pxPerDay: number, x: number): string {
  // A zero or negative scale would divide to Infinity and produce a date thousands of years out.
  // It cannot come from `pxPerDayForPreset`, so this is a guard rather than a branch anyone hits.
  if (!Number.isFinite(pxPerDay) || pxPerDay <= 0) return anchorIso;
  return addCalendarDays(anchorIso, Math.floor(x / pxPerDay));
}

/**
 * The `startDay` for a drop at chart x — days from the plan's `plannedStart`, which is the origin
 * every write in `use-plan-workspace-model` counts from.
 *
 * May be negative: a planner can legitimately drag a bar to before the plan's planned start, and
 * the API decides what that means. Clamping here would silently move the drop.
 */
export function startDayAtChartX({
  anchorIso,
  plannedStartIso,
  pxPerDay,
  x,
}: {
  anchorIso: string;
  plannedStartIso: string;
  pxPerDay: number;
  x: number;
}): number {
  return daysBetween(plannedStartIso, dateAtChartX(anchorIso, pxPerDay, x));
}

/**
 * **Whole columns a pointer moved**, rounded to the nearest — the one rounding every edge gesture
 * and its live preview share, so the bar a planner sees under the pointer is the bar that is
 * written. `|| 0` folds `-0` (a small leftward drag rounds to it) into `0`, which would otherwise
 * read as "moved" to a strict-equality check.
 */
export function columnsMoved(deltaX: number, pxPerDay: number): number {
  if (!Number.isFinite(pxPerDay) || pxPerDay <= 0) return 0;
  return Math.round(deltaX / pxPerDay) || 0;
}

/**
 * **A drawn span of days → the placement the workspace writes, counted in WORKING days.**
 *
 * `durationDays` is a working-day quantity. Counting the calendar days a bar covers and writing
 * that makes the engine lay out that many *working* days, so a five-day task stretched over a
 * weekend came back two days longer than it was drawn — the defect the diagram fixed with
 * `drawnSpanPlacement` (ADR-0170 D2) and the Gantt's three "hold one end" writes (the finish-edge
 * drag and both typed date cells) still carried. This is that same function, so one question has
 * one answer in both views, and the start is rolled FORWARD to a working day as the diagram does.
 *
 * Days are counted from `plannedStart`, which is the origin the predicate is keyed to — NOT from
 * the chart anchor the bars are drawn from (see the top of this file). With no predicate (the plan
 * calendar has not loaded) the calendar span is returned, the pre-fix behaviour for that window
 * only.
 */
export function spanToPlacement({
  startDay,
  endDay,
  isWorkingDay,
}: {
  startDay: number;
  endDay: number;
  isWorkingDay: ((dayOffset: number) => boolean) | null;
}): DrawnPlacement {
  return drawnSpanPlacement(startDay, endDay, isWorkingDay);
}

/**
 * The placement for dragging a bar's **finish** edge `columns` columns, the start held.
 *
 * Clamped so the finish never passes the start: `drawnSpanPlacement` orders its two ends, so an
 * unclamped leftward drag would silently turn into a start-edge write.
 */
export function finishEdgePlacement({
  plannedStartIso,
  startIso,
  finishIso,
  columns,
  isWorkingDay,
}: {
  plannedStartIso: string;
  startIso: string;
  finishIso: string;
  columns: number;
  isWorkingDay: ((dayOffset: number) => boolean) | null;
}): DrawnPlacement {
  const startDay = daysBetween(plannedStartIso, startIso);
  const endDay = Math.max(daysBetween(plannedStartIso, finishIso) + columns, startDay);
  return spanToPlacement({ startDay, endDay, isWorkingDay });
}

/**
 * The placement for dragging a bar's **start** edge `columns` columns, the finish held.
 *
 * Clamped at the finish day (one working day minimum), the diagram's rule — the bar never inverts.
 */
export function startEdgePlacement({
  plannedStartIso,
  startIso,
  finishIso,
  columns,
  isWorkingDay,
}: {
  plannedStartIso: string;
  startIso: string;
  finishIso: string;
  columns: number;
  isWorkingDay: ((dayOffset: number) => boolean) | null;
}): DrawnPlacement {
  const endDay = daysBetween(plannedStartIso, finishIso);
  const startDay = Math.min(daysBetween(plannedStartIso, startIso) + columns, endDay);
  return spanToPlacement({ startDay, endDay, isWorkingDay });
}
