import type { ResourceHistogramBucket, ResourceHistogramSeries } from '@repo/types';

import { daysBetween, screenXOfDay, type Size, type Viewport } from './render-model';

/**
 * The pure, renderer-agnostic **resource-strip geometry** (Stage E, ADR-0049). It projects the
 * already-shipped demand read-model (`ResourceHistogramSeries` over a shared bucket axis) onto the
 * SAME time axis the TSLD scene and ruler use — a bucket `[start, end)` (ISO) → day offsets about the
 * data date → screen x via the SAME {@link screenXOfDay}/{@link daysBetween} — so the demand bars can
 * never drift from the diagram columns they sit under (the whole product ask). It has **no** canvas,
 * DOM, or React dependency and does **no** schedule arithmetic: it only positions the read-model's
 * buckets, exactly as `render-model.ts` positions the engine's activity dates. The Canvas 2D strip
 * painter (`paint.ts`) draws from this; it is exhaustively unit-tested.
 *
 * Two properties are load-bearing:
 * - **Axis co-alignment.** A bucket's left edge is `screenXOfDay(daysBetween(dataDate, bucket.start))`
 *   — the very expression the scene/ruler use — so a WEEK bucket spans exactly 7 day-columns and a
 *   MONTH bucket ~30. Alignment is definitional, not approximated.
 * - **Viewport-independent vertical scale.** Bars fit the selected resource's **whole-series** peak
 *   ({@link seriesMax}), not the visible-buckets peak, so they do not rescale while panning (ADR-0049 §6).
 */

/** A projected demand bar in strip-canvas-local coordinates: `x`/`w` on the shared time axis, `h`
 * scaled to the whole-series max, `value` the exact bucket units (for the tooltip/table cross-check).
 * The painter derives the top `y` from the band height (`y = height - h`), so bars grow up from the
 * band's baseline. */
export interface StripBar {
  x: number;
  w: number;
  h: number;
  value: number;
}

/** A bucket's `[start, end)` pre-projected to signed day offsets about the data date — the snapshot
 * the DOM host publishes so the per-frame painter never re-parses ISO dates (ADR-0049 §4). */
export interface BucketDays {
  start: number;
  end: number;
}

/** The strip band's vertical geometry the projector scales bars against. `height` is the band's CSS
 * px height; `max` is the viewport-independent {@link seriesMax} the bars fit under. */
export interface StripBandGeom {
  height: number;
  max: number;
}

/** The immutable snapshot the DOM `ResourceStripPanel` publishes into `TsldCanvas` (ADR-0049 §4): the
 * selected resource's series, its bucket axis **pre-projected to day offsets**, the data date (day 0),
 * and the whole-series max. The strip palette is re-resolved on the canvas side (on the shared theme
 * bump), not carried here, so this stays pure data. `null` ⇒ the strip draws nothing (empty/loading). */
export interface ResourceStripSnapshot {
  series: ResourceHistogramSeries;
  /** `dayOffsets[i]` is `buckets[i]` projected about `dataDate`; index-aligned to `series.values`. */
  dayOffsets: BucketDays[];
  dataDate: string;
  max: number;
  /** The selected resource's display name (used for the max-tick label / a11y), when resolvable. */
  resourceName?: string;
}

/** Vertical inset (px) reserved above the bars for the axis line + max tick, so a full-height bar
 * never paints over the top border. Bars scale against `height - STRIP_BAR_TOP_PAD`. */
export const STRIP_BAR_TOP_PAD = 6;

/**
 * The whole-series max the vertical scale fits (ADR-0049 §6) — the peak over **all** buckets, not just
 * the visible ones, so bars keep a stable height while panning/zooming. `0` for an empty series (the
 * painter then draws no bars). Never negative (`values` are `>= 0`).
 */
export function seriesMax(series: ResourceHistogramSeries | null | undefined): number {
  if (!series || series.values.length === 0) return 0;
  let max = 0;
  for (const v of series.values) if (v > max) max = v;
  return max;
}

/** Pre-project a bucket axis (`[start, end)` ISO) to signed day offsets about the data date, once, so
 * the per-frame painter reuses them (the same `daysBetween` the scene uses — never a re-derived axis). */
export function projectBucketDays(
  buckets: readonly ResourceHistogramBucket[],
  dataDate: string,
): BucketDays[] {
  return buckets.map((b) => ({
    start: daysBetween(dataDate, b.start),
    end: daysBetween(dataDate, b.end),
  }));
}

/**
 * Project the demand bars from **pre-projected** day offsets — the per-frame path the painter calls
 * from the snapshot. A bucket `i` draws at `x1 = screenXOfDay(dayOffsets[i].start)` …
 * `x2 = screenXOfDay(dayOffsets[i].end)` (the shared affine, so it lands under the same columns as the
 * scene), height `= (value / max) · (band.height - TOP_PAD)`, and is **culled** when its `[x1, x2)`
 * span falls entirely off the surface. Returns nothing for an empty series or a non-positive max.
 */
export function bucketBarsFromDays(
  values: readonly number[],
  dayOffsets: readonly BucketDays[],
  view: Viewport,
  size: Size,
  band: StripBandGeom,
): StripBar[] {
  const bars: StripBar[] = [];
  if (band.max <= 0) return bars;
  const barArea = Math.max(0, band.height - STRIP_BAR_TOP_PAD);
  const count = Math.min(values.length, dayOffsets.length);
  for (let i = 0; i < count; i += 1) {
    const offsets = dayOffsets[i]!;
    const x1 = screenXOfDay(offsets.start, view);
    const x2 = screenXOfDay(offsets.end, view);
    // Cull buckets whose span is entirely off the surface (mirrors the scene's viewport cull).
    if (x2 <= 0 || x1 >= size.width) continue;
    const value = values[i] ?? 0;
    const h = (value / band.max) * barArea;
    bars.push({ x: x1, w: Math.max(1, x2 - x1), h, value });
  }
  return bars;
}

/**
 * Project the demand bars for a resource series onto the strip band (the pure entry the tests target).
 * Reuses the SAME `screenXOfDay`/`daysBetween` as the scene and ruler (verbatim), so a bucket's left
 * edge equals the scene's `screenXOfDay(daysBetween(dataDate, bucket.start))` for the same viewport —
 * the co-alignment guarantee. Delegates to {@link bucketBarsFromDays} after pre-projecting the axis.
 */
export function bucketRects(
  series: ResourceHistogramSeries,
  buckets: readonly ResourceHistogramBucket[],
  dataDate: string,
  view: Viewport,
  size: Size,
  band: StripBandGeom,
): StripBar[] {
  return bucketBarsFromDays(series.values, projectBucketDays(buckets, dataDate), view, size, band);
}
