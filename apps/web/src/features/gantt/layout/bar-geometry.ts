import type { ActivitySummary } from '@repo/types';

import { daysBetween, isMilestone } from '@/features/tsld/render/render-model';
import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';

/**
 * How a row's bar is drawn. All values are pixels in the bar region's own coordinate space, where
 * x = 0 is `anchorIso` — the chart's left edge. The region scrolls horizontally; the caller
 * translates, so nothing here needs to know the scroll offset.
 */
export interface BarGeometry {
  /** Left edge of the activity bar. */
  x: number;
  /** Width of the activity bar. Never below {@link MIN_BAR_WIDTH_PX} for a non-milestone. */
  width: number;
  /** A zero-duration milestone renders as a diamond centred on `x`, not a bar. */
  milestone: boolean;
  /** 0–1 of the bar filled to show progress. */
  progress: number;
  /**
   * Width of the total-float tail trailing the bar, or 0. Negative float produces **no tail**:
   * there is no slack to draw, and a tail would read as the opposite of what it means.
   */
  floatWidth: number;
}

/**
 * The smallest a bar may be drawn.
 *
 * A one-day activity at year zoom is a fraction of a pixel wide. Rounding it away would make a
 * real activity invisible on the chart while its row still occupies space in the grid — a row
 * with no bar reads as "not scheduled", which is a different and wrong statement. Clamping keeps
 * every scheduled activity visible at every zoom; the cost is that adjacent short bars merge
 * visually when zoomed far out, which the date columns disambiguate.
 */
export const MIN_BAR_WIDTH_PX = 2;

/**
 * Geometry for one activity.
 *
 * Returns null when the activity has no computed dates — the plan has not been calculated, or this
 * activity was added since. The caller renders its "not calculated" row treatment rather than a
 * bar at an arbitrary date; a bar drawn at epoch zero is a lie with a rectangle around it.
 *
 * Dates are **inclusive** per ADR-0023 (a one-day activity starts and finishes the same day), so
 * the span is `finish - start + 1` days.
 */
export function barGeometry(
  activity: ActivitySummary,
  anchorIso: string,
  pxPerDay: number,
  source: BarDateSource = 'early',
): BarGeometry | null {
  // `source` reads the SAME resolver the canvas uses (`lib/bar-dates.ts`). This destructured
  // `activity.earlyStart` unconditionally until 2026-08-17, so a VISUAL plan's Gantt drew every
  // hand-placed bar from the wrong columns while the diagram drew it from the right ones — each
  // view internally consistent, the disagreement visible only to someone opening both
  // (`docs/TECH_DEBT.md` #135). Defaulted to `early` so every existing caller and test is
  // unchanged; the workspace passes the real source.
  const { start: barStart, finish: barFinish } = barDatesFor(activity, source);
  if (barStart === null || barFinish === null) return null;

  const startOffset = daysBetween(anchorIso, barStart);
  const x = startOffset * pxPerDay;

  if (isMilestone(activity.type)) {
    return { x, width: 0, milestone: true, progress: 0, floatWidth: 0 };
  }

  const spanDays = daysBetween(barStart, barFinish) + 1;
  const width = Math.max(spanDays * pxPerDay, MIN_BAR_WIDTH_PX);

  // Total float is measured in the activity's own calendar (ADR-0037) and stored in whole days;
  // the tail is drawn on the same calendar-day axis as the bar, which is an approximation the
  // TSLD's float tails already make (ADR-0054) — consistent between the two views by construction.
  const floatDays = activity.totalFloat ?? 0;
  const floatWidth = floatDays > 0 ? floatDays * pxPerDay : 0;

  return {
    x,
    width,
    milestone: false,
    progress: clamp01(activity.percentComplete / 100),
    floatWidth,
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Total width of the chart for a date span, in pixels, with a day of padding each side so the
 * first and last bars do not sit flush against the edges.
 */
export function chartWidth(span: { start: string; finish: string }, pxPerDay: number): number {
  return (daysBetween(span.start, span.finish) + 1 + CHART_PADDING_DAYS * 2) * pxPerDay;
}

/** Days of breathing room either side of the data. */
export const CHART_PADDING_DAYS = 1;

/**
 * The scale that fits a whole date span into `chartWidthPx` — the inverse of {@link chartWidth}.
 *
 * This is what **paper** wants. On screen the scale comes from the zoom preset (ADR-0056) and the
 * user pans to see the rest; a printed page cannot be panned, so a printed programme that showed a
 * window of the plan would be a document that quietly omits work. Fitting the span means the sheet
 * holds the whole thing, at whatever scale that takes.
 *
 * Returns 0 for a non-positive width, so a caller measuring nothing draws nothing rather than
 * dividing into infinity.
 */
export function fitPxPerDay(span: { start: string; finish: string }, chartWidthPx: number): number {
  if (chartWidthPx <= 0) return 0;
  const days = daysBetween(span.start, span.finish) + 1 + CHART_PADDING_DAYS * 2;
  return days > 0 ? chartWidthPx / days : 0;
}

/** The chart's x = 0 date: one padding day before the earliest activity. */
export function chartAnchor(span: { start: string }): string {
  const ms = Date.parse(`${span.start}T00:00:00Z`) - CHART_PADDING_DAYS * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Where the baseline ghost bar sits for a row, or null when there is nothing to compare.
 *
 * The ghost is drawn from the ACTIVE baseline's snapshot dates (ADR-0025), which are already
 * computed and exposed — this reads them, it does not re-derive a comparison. Null covers the
 * three honest "no comparison" cases: no baseline captured, an activity added since the baseline
 * was taken, or a baselined activity with no snapshot dates.
 */
export function baselineGeometry(
  row: { inBaseline: boolean; baselineStart: string | null; baselineFinish: string | null },
  anchorIso: string,
  pxPerDay: number,
): { x: number; width: number } | null {
  if (!row.inBaseline || row.baselineStart === null || row.baselineFinish === null) return null;
  const x = daysBetween(anchorIso, row.baselineStart) * pxPerDay;
  // Inclusive, exactly like the live bar (ADR-0023) — a ghost a day short of the bar it is
  // compared against would read as drift that does not exist.
  const spanDays = daysBetween(row.baselineStart, row.baselineFinish) + 1;
  return { x, width: Math.max(spanDays * pxPerDay, MIN_BAR_WIDTH_PX) };
}

/**
 * Where a plain inclusive date span sits on the chart — the geometry behind the derived
 * **Unassigned** bucket's bracket (WBS improvements M3), which has a span but no activity.
 *
 * Inclusive like every other bar (ADR-0023), and floored at `MIN_BAR_WIDTH_PX` so a one-day
 * bucket is still visible at a coarse zoom.
 */
export function spanGeometry(
  span: { start: string | null; finish: string | null },
  anchorIso: string,
  pxPerDay: number,
): { x: number; width: number } | null {
  if (span.start === null || span.finish === null) return null;
  const x = daysBetween(anchorIso, span.start) * pxPerDay;
  const spanDays = daysBetween(span.start, span.finish) + 1;
  return { x, width: Math.max(spanDays * pxPerDay, MIN_BAR_WIDTH_PX) };
}
