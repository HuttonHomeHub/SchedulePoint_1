import type { ResourceHistogramSeries } from '@repo/types';

import { CATEGORICAL_CYCLE_LENGTH, categoricalCycleVars } from '@/features/tsld/render/palette';

/**
 * **The stacked-histogram derivation — ONE implementation, two renderers.**
 *
 * The dialog's SVG chart, the canvas strip's painter and the accessible table all read this. A
 * second implementation would drift, and the drift would be invisible: each renderer looks correct
 * on its own, and only somebody holding the strip against the dialog would ever see the same plan
 * stacked two different ways. That is ADR-0065's `routeOrthogonal` argument and ADR-0063's shared
 * bucket derivation, applied one feature along.
 *
 * It is pure and takes values, never queries — so it is testable without a browser, a database or a
 * mocked fetch, and the renderers stay free to differ in everything except the numbers.
 */

/** How many resources get their own colour before the rest are aggregated. */
export const DEFAULT_STACK_CAP = 8;

/** One band of the stack: a resource, or the aggregate that stands for the rest. */
export interface StackSegment {
  /** The resource's id, or `null` for the aggregate — which is not a resource and has no id. */
  resourceId: string | null;
  /** Display label: the resource's name, or `Other (N resources)`. */
  label: string;
  /** `var(--chart-N)` for a ranked resource; the neutral token for the aggregate. */
  fill: string;
  /** The ink that clears 4.5:1 on `fill`, for any label drawn inside the band. */
  ink: string;
  /** Units per bucket, index-aligned to the shared bucket axis. */
  values: number[];
  /** Σ values — for a resource this is its own total; for the aggregate, the sum of those it stands for. */
  total: number;
  /** How many resources this segment stands for: 1 for a resource, N for the aggregate. */
  resourceCount: number;
}

export interface StackedSeries {
  /** Segments in draw order, biggest first, the aggregate always last. */
  segments: StackSegment[];
  /** Σ of every segment in bucket i — index-aligned. The stack's height. */
  bucketTotals: number[];
  /** The tallest bucket total; `0` when there is nothing to draw. */
  peak: number;
  /** True when an aggregate segment is present. */
  aggregated: boolean;
}

export interface StackSeriesOptions {
  /** Resources shown individually before aggregation. Clamped to the palette's length. */
  cap?: number;
  /** Resolve a resource's display name. */
  resourceName: (id: string) => string;
  /** The neutral fill and ink for the aggregate, resolved by whichever renderer paints it. */
  neutral: { fill: string; ink: string };
}

/**
 * Rank the series, cap them, aggregate the remainder, and compute the per-bucket totals.
 *
 * **Ranking is by whole-series total, descending, with `resourceId` as the tie-break** — a stable
 * order that does not depend on the granularity a reader happens to be looking at, because each
 * series' `total` is invariant across granularities. The tie-break is what stops two equal-total
 * resources swapping colours between renders for no reason a reader could see.
 *
 * **The aggregate ranks by total too, not per bucket.** A resource just outside the cap can
 * therefore be taller than a shown one in some single bucket, and that is invisible on the chart —
 * the table, which never aggregates, still carries it. Recorded here so nobody "fixes" it into
 * per-bucket ranking, which would make a segment's colour change from bucket to bucket.
 */
export function stackSeries(
  series: readonly ResourceHistogramSeries[],
  bucketCount: number,
  { cap = DEFAULT_STACK_CAP, resourceName, neutral }: StackSeriesOptions,
): StackedSeries {
  const cycle = categoricalCycleVars();
  // A cap above the palette's length would give two visible bands the same colour, which is the one
  // failure rank-assignment structurally cannot have. Clamp rather than trust the caller.
  const effectiveCap = Math.max(1, Math.min(cap, CATEGORICAL_CYCLE_LENGTH));

  const ranked = [...series].sort(
    (a, b) => b.total - a.total || a.resourceId.localeCompare(b.resourceId),
  );

  const shown = ranked.slice(0, effectiveCap);
  const rest = ranked.slice(effectiveCap);

  const segments: StackSegment[] = shown.map((s, i) => ({
    resourceId: s.resourceId,
    label: resourceName(s.resourceId),
    fill: cycle[i % cycle.length]!.fill,
    ink: cycle[i % cycle.length]!.ink,
    values: [...s.values],
    total: s.total,
    resourceCount: 1,
  }));

  if (rest.length > 0) {
    const values = new Array<number>(bucketCount).fill(0);
    let total = 0;
    for (const s of rest) {
      for (let i = 0; i < bucketCount; i += 1) values[i]! += s.values[i] ?? 0;
      total += s.total;
    }
    segments.push({
      resourceId: null,
      label: `Other (${String(rest.length)} resource${rest.length === 1 ? '' : 's'})`,
      fill: neutral.fill,
      ink: neutral.ink,
      values,
      total,
      resourceCount: rest.length,
    });
  }

  // **Summed in DRAW ORDER, once, and shared.** A renderer stacking bands computes a running offset
  // in the same order; deriving the total any other way (say, summing the raw input) can differ in
  // the last bits under IEEE addition, and the visible symptom is a top band that overshoots or
  // falls short of the axis by a hair at some zooms and not others.
  const bucketTotals = new Array<number>(bucketCount).fill(0);
  for (const seg of segments) {
    for (let i = 0; i < bucketCount; i += 1) bucketTotals[i]! += seg.values[i] ?? 0;
  }

  return {
    segments,
    bucketTotals,
    peak: bucketTotals.length > 0 ? Math.max(0, ...bucketTotals) : 0,
    aggregated: rest.length > 0,
  };
}

/**
 * The running offsets a renderer stacks from: `offsets[b][s]` is where segment `s` starts in bucket
 * `b`, and `offsets[b][s] + segments[s].values[b]` is where it ends.
 *
 * Exported so the SVG and the canvas painter cannot each compute their own — the same reason the
 * totals above are shared.
 */
export function stackOffsets(stacked: StackedSeries, bucketCount: number): number[][] {
  const offsets: number[][] = [];
  for (let b = 0; b < bucketCount; b += 1) {
    const column: number[] = [];
    let running = 0;
    for (const seg of stacked.segments) {
      column.push(running);
      running += seg.values[b] ?? 0;
    }
    offsets.push(column);
  }
  return offsets;
}
