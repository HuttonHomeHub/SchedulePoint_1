import type { ResourceHistogramSeries } from '@repo/types';

import {
  CATEGORICAL_CYCLE_LENGTH,
  categoricalCycleVars,
  type CategoricalCycleMember,
} from '@/features/tsld/render/palette';

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

/**
 * **The canvas strip's cap, lower than the dialog's — and it is a measured remedy, not a taste.**
 *
 * `apps/web/scripts/measure-strip-stack.mjs` ran the committed condition and the strip FAILED it at
 * Fit zoom: nine segments over a 104-bucket programme cost **+10.1 ms p95** against a +2.0 ms bar,
 * reproduced three times (+14.7, +14.2, +10.5). The spec's written remedy is "cap the segments,
 * then withdraw the strip stack", so this is the first of those.
 *
 * **The cliff is at nine and its mechanism is NOT understood**, which is why this leaves clearance
 * rather than sitting on the edge:
 *
 * | segments | 2 | 3 | 4 | 6 | 7 | 8 | 9 | 10 |
 * | delta p95 | 0.1 | 0.1 | 0.2 | 0.3 | 0.1 | 0.5 | **10.0** | 9.7 |
 *
 * p50 barely moves across the whole sweep (0.3 → 0.4 ms), so it is a tail, not fill-rate. Two
 * hypotheses were tested and **falsified**: sub-pixel bands (an even split fails identically) and
 * the number of distinct fill colours (nine segments with four colours still fails). The
 * arithmetic does not explain it either — nine segments is ~13 % more fills than eight, not 20×.
 *
 * Six named plus the aggregate is seven, two steps clear of that discontinuity.
 * `docs/TECH_DEBT.md` #226 carries the unknown.
 *
 * **Then Condition 2 — legibility at 72 px — cut it further, and that is the binding constraint.**
 * Cost was never what limited this; height was. On the spec's skewed profile (one dominant trade
 * halving into a tail — the shape it labels the draft's even-split arithmetic wrong for), six named
 * bands over 66 px of bar area put the fifth at 1.04 px and the aggregate at **0.52 px**: below a
 * pixel, and unidentifiable in the screenshot the condition is judged against
 * (`scripts/measure-strip-legibility.mjs`, `strip-legibility.png`). Measured, not reasoned:
 *
 * | strip cap | thinnest band in the peak column | judgement |
 * | 6 | 0.52 px | FAIL — sub-pixel |
 * | 5 | 1.05 px | FAIL — a hairline |
 * | 4 | 2.13 px | FAIL — a hairline |
 * | 3 | **4.40 px** | PASS — thin, but a band |
 *
 * **The cap is set by the worst realistic profile, and that costs something on an even one.** On an
 * even six-trade split every band is 9.43 px and all six would have been perfectly legible; three
 * of those trades are now folded into the aggregate for no visual reason. That is deliberate: a cap
 * that varies with the data would make a segment's presence a property of the plan rather than of
 * the rank, and the alternative — a constant tuned to the profile that happens to read best — is
 * the number-tuned-to-the-answer the condition exists to prevent. Recorded here rather than left
 * for somebody to rediscover as a bug.
 *
 * The DIALOG keeps {@link DEFAULT_STACK_CAP}: it is DOM and SVG, not the canvas painter, it was
 * measured separately, and it has the vertical room the strip does not. The two surfaces therefore
 * differ in HOW MANY segments they name and never in what a segment means — which is exactly the
 * divergence the spec's remedy ladder sanctions, and why `cap` was a parameter from the start.
 */
export const STRIP_STACK_CAP = 3;

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
  /**
   * The categorical ramp to index, in ramp order. Defaults to the `var()` form, which is what the
   * DOM chart wants — a `var()` follows the surface scope and re-values with the token.
   *
   * **The canvas must pass the resolved form** ({@link categoricalCycleResolved}): `fillStyle`
   * silently discards a `var()` and keeps the previous fill, so the stack paints as one block.
   * The ramp is a parameter rather than a second lookup at the call site because the `i % length`
   * rule lives here; re-indexing outside would be a second copy of it, and the drift would be
   * invisible — each renderer looks right alone, and only somebody holding the legend against the
   * diagram would ever see segment 3 painted two different colours.
   */
  cycle?: readonly CategoricalCycleMember[];
}

/** How the segments are formed: one band per resource, or one band per parent group. */
export type StackBy = 'resource' | 'group';

/**
 * **Grouping — where this beats P6 outright, and it is a re-partition rather than a new pipeline.**
 *
 * P6 stacks by adding one filter dialog per segment, which its own advocates call "really tedious"
 * for exactly the case a real programme has: dozens of trades. ADR-0053 M3 already gave resources
 * an adjacency-list `parentId` and a non-assignable `GROUP` kind, so a group here is a dropdown
 * rather than five dialogs.
 *
 * It also fixes the feature's weakest state rather than papering over it. A forty-resource
 * programme stacked by resource is eight named bands and "Other (32 resources)"; stacked by trade
 * group it is five named trades and no aggregate at all — which is the picture a planner was asking
 * for in the first place.
 *
 * Resources with no parent stand for themselves. That is deliberate and not a fallback: a
 * standalone crane is not "ungrouped", it is a thing in the plan, and burying it in an "Ungrouped"
 * bucket would hide a real resource behind a word for an absence.
 */
export function groupSeries(
  series: readonly ResourceHistogramSeries[],
  bucketCount: number,
  parentOf: (resourceId: string) => string | null,
  nameOf: (id: string) => string,
): { series: ResourceHistogramSeries[]; nameOf: (id: string) => string } {
  const byKey = new Map<string, { values: number[]; total: number }>();
  const labels = new Map<string, string>();

  for (const s of series) {
    // A resource with no parent IS its own band — see the docblock. Keying on the resource's own id
    // in that case also keeps `nameOf` working without a second lookup table.
    const key = parentOf(s.resourceId) ?? s.resourceId;
    labels.set(key, nameOf(key));
    const bucket = byKey.get(key) ?? { values: new Array<number>(bucketCount).fill(0), total: 0 };
    for (let i = 0; i < bucketCount; i += 1) bucket.values[i]! += s.values[i] ?? 0;
    bucket.total += s.total;
    byKey.set(key, bucket);
  }

  return {
    series: [...byKey].map(([resourceId, v]) => ({
      resourceId,
      values: v.values,
      total: v.total,
    })),
    nameOf: (id) => labels.get(id) ?? nameOf(id),
  };
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
  { cap = DEFAULT_STACK_CAP, resourceName, neutral, cycle: ramp }: StackSeriesOptions,
): StackedSeries {
  const cycle = ramp ?? categoricalCycleVars();
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
