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
 * A duration in whole days for a bar whose right edge is dragged to chart x.
 *
 * Inclusive (ADR-0023): a bar from the 1st to the 5th is five days, so the arithmetic is
 * `finish - start + 1`. Floored at 1, because a task with a zero duration is a milestone and
 * changing an activity's TYPE is not something a drag should be able to do by accident.
 */
export function durationDaysForFinishAtX({
  startIso,
  anchorIso,
  pxPerDay,
  x,
}: {
  startIso: string;
  anchorIso: string;
  pxPerDay: number;
  x: number;
}): number {
  const finish = dateAtChartX(anchorIso, pxPerDay, x);
  return Math.max(1, daysBetween(startIso, finish) + 1);
}
