import type { HistogramGranularity, ResourceCurveType } from '@repo/types';

import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

import type { WorkingTimeCalendar } from './working-time-calendar';

/**
 * The pure **resource-loading-histogram read-model** (M7 rung 5, ADR-0044 §3 / ADR-0035 §31). A
 * dependency-free sibling of {@link import('./float-paths').computeFloatPaths} and
 * {@link import('./earned-value').computeEarnedValue}: it consumes the already-persisted CPM dates plus
 * each active assignment's `budgetedUnits` + loading `curveType`, distributes each assignment's units
 * across its effective span per the named P6 profile, and aggregates a **units-over-time histogram per
 * resource**. It **schedules nothing** — it never enters `computeSchedule`, adds no write pass, owns no
 * persisted column, and (this rung) does NOT feed the levelling pass (`level.ts`, Q2), so the recalc
 * parity gate is structurally trivial. The function is **pure**: no I/O, no `Date.now`, no mutation of
 * its inputs.
 *
 * **Units are conserved.** For every assignment the whole `budgetedUnits` is distributed across the
 * buckets its span overlaps, so `Σ(a resource's buckets) === Σ(its assignments' budgetedUnits)` exactly
 * (rounding residual folded into the largest bucket, {@link round4}). `UNIFORM` / no curve is a **flat**
 * distribution — byte-identical to a flat-rate load, independent of the bucket count.
 */

/** Round to 4 decimal places — the `DECIMAL(18,4)` grain assignment units are stored at. */
function round4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded === 0 ? 0 : rounded; // normalise a `-0` from a tiny negative to a clean `0`
}

/** Clamp to `[lo, hi]`. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The built-in **21-point P6 loading profiles** (per-interval density weights over 21 equal working-time
 * intervals of the span). These are the EXACT profiles the conformance fixture's `resource_curves`
 * carries (`FRONT_LOADED` / `BACK_LOADED` / `BELL` / `DOUBLE_PEAK`), so the goldens are self-baselinable
 * first-principles with no external oracle (ADR-0034). Each sums to 100. `UNIFORM` has **no profile**
 * (`null`): it is a genuine flat distribution `CDF(u) = u` at any bucket count — the fixture's `LINEAR`
 * curve maps to it (a flat load, not the fixture's discretised 20-of-5 array), keeping the no-curve path
 * byte-identical to a flat-rate load.
 */
export const RESOURCE_CURVE_PROFILES: Record<ResourceCurveType, readonly number[] | null> = {
  UNIFORM: null,
  FRONT_LOADED: [9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 2, 2, 2, 1, 0],
  BACK_LOADED: [0, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9],
  BELL: [1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 9, 8, 8, 7, 6, 4, 2, 1, 1, 0.5, 0.5],
  DOUBLE_PEAK: [2, 5, 8, 9, 7, 4, 2, 1, 1, 2, 3, 2, 1, 2, 4, 7, 9, 10, 8, 5, 8],
};

/** The named-profile weights for a curve type, or `null` for the flat `UNIFORM` load. */
export function resolveCurveProfile(curveType: ResourceCurveType): readonly number[] | null {
  return RESOURCE_CURVE_PROFILES[curveType];
}

/** A profile's raw weight sum; used to normalise (units always conserved) and to detect N29. */
function profileSum(profile: readonly number[]): number {
  let total = 0;
  for (const w of profile) total += w;
  return total;
}

/** Whether a present profile does NOT sum to 100 (the N29 normalise-and-count case). */
function isNonHundredProfile(profile: readonly number[] | null | undefined): boolean {
  if (!profile || profile.length === 0) return false;
  return Math.abs(profileSum(profile) - 100) > 1e-6;
}

/**
 * A **cumulative distribution function** `CDF: [0,1] → [0,1]` for a loading curve, where `u` is the
 * normalised working-time position within the span. `null`/empty profile ⇒ the flat `CDF(u) = u`. A
 * present profile's weights are normalised by their own sum (so a profile that does not integrate to 100
 * is **normalised to conserve units**, N29) and treated as per-interval constant densities over `n`
 * equal intervals, giving a piecewise-linear CDF. `CDF(0) = 0` and `CDF(1) = 1` exactly, so distributing
 * `budgetedUnits × (CDF(uHi) − CDF(uLo))` across contiguous buckets telescopes to the full budget.
 */
function makeCdf(profile: readonly number[] | null | undefined): (u: number) => number {
  if (!profile || profile.length === 0) return (u) => clamp(u, 0, 1);
  const total = profileSum(profile);
  if (total <= 0) return (u) => clamp(u, 0, 1); // a degenerate all-zero profile ⇒ flat (defensive)
  const n = profile.length;
  // Normalised cumulative breakpoints cum[0..n]; cum[0] = 0, cum[n] = 1.
  const cum: number[] = new Array<number>(n + 1);
  cum[0] = 0;
  for (let i = 0; i < n; i += 1) cum[i + 1] = cum[i]! + profile[i]! / total;
  cum[n] = 1; // pin the top exactly (guard float drift so CDF(1) === 1)
  return (u: number): number => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    const scaled = u * n;
    const j = Math.min(Math.floor(scaled), n - 1);
    const frac = scaled - j;
    return cum[j]! + (cum[j + 1]! - cum[j]!) * frac;
  };
}

/** One active assignment's histogram inputs (M7 rung 5, ADR-0044 §3). */
export interface HistogramAssignmentInput {
  /** The loaded resource; a resource's assignments aggregate into one series. */
  resourceId: string;
  /** The owning activity (carried for diagnostics / degenerate-span placement). */
  activityId: string;
  /** Budgeted quantity of work to distribute across the span (exact, `>= 0`). */
  budgetedUnits: number;
  /**
   * The resolved loading-curve profile weights (any length; normalised by their own sum). `null`/omitted
   * = `UNIFORM` = a flat load. In production the service resolves `curveType` via
   * {@link resolveCurveProfile}; the conformance adapter passes the fixture's `resource_curves` points.
   */
  profile?: readonly number[] | null;
  /** The owning activity's early start (`YYYY-MM-DD`); null = unschedulable ⇒ excluded from the axis. */
  start: string | null;
  /** The owning activity's early finish (`YYYY-MM-DD`); null = unschedulable ⇒ excluded from the axis. */
  finish: string | null;
  /** The assignment's lag in working minutes (`>= 0`); the effective span starts this far into the activity. */
  lagMinutes: number;
  /** The activity's own working-time calendar (ADR-0037) — the frame the span + buckets are measured on. */
  calendar: WorkingTimeCalendar;
}

/** The full input to {@link computeResourceHistogram}. */
export interface HistogramInput {
  assignments: readonly HistogramAssignmentInput[];
  /** Time-bucket granularity for the shared axis (`DAY` | `WEEK` | `MONTH`). */
  granularity: HistogramGranularity;
}

/** One time bucket on the shared axis: `[start, end)` as `YYYY-MM-DD` (end = the next bucket's start). */
export interface HistogramBucket {
  start: string;
  end: string;
}

/** One resource's units-over-time series, aligned index-for-index to {@link ResourceHistogramResult.buckets}. */
export interface HistogramSeries {
  resourceId: string;
  values: number[];
  total: number;
}

/** The plan's resource loading histogram (M7 rung 5, ADR-0044 §3). */
export interface ResourceHistogramResult {
  granularity: HistogramGranularity;
  buckets: HistogramBucket[];
  series: HistogramSeries[];
  /** Assignments whose curve profile did not sum to 100 and were normalised to conserve units (N29). */
  curveNormalisedCount: number;
}

/**
 * Defensive cap on the number of buckets the shared axis can hold — a `DAY`-granular histogram over a
 * pathologically long span (e.g. a mis-entered century) would otherwise allocate unbounded memory. The
 * service maps a breach to a `422` asking for a coarser granularity.
 */
export const MAX_HISTOGRAM_BUCKETS = 4000;

/** Thrown when the requested granularity would produce more than {@link MAX_HISTOGRAM_BUCKETS} buckets. */
export class HistogramTooManyBucketsError extends Error {
  constructor(readonly bucketCount: number) {
    super(
      `Resource histogram would have ${bucketCount} buckets (max ${MAX_HISTOGRAM_BUCKETS}); use a coarser granularity.`,
    );
    this.name = 'HistogramTooManyBucketsError';
  }
}

/** Advance a `YYYY-MM-DD` date by the granularity's period, in UTC. */
function advance(date: string, granularity: HistogramGranularity): string {
  const d = parseCalendarDate(date);
  if (granularity === 'MONTH') {
    return formatCalendarDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  }
  const days = granularity === 'WEEK' ? 7 : 1;
  return formatCalendarDate(new Date(d.getTime() + days * 86_400_000));
}

/** Align a `YYYY-MM-DD` down to the start of its bucket for the granularity (MONTH → the 1st). */
function alignDown(date: string, granularity: HistogramGranularity): string {
  if (granularity === 'MONTH') {
    const d = parseCalendarDate(date);
    return formatCalendarDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  }
  // DAY/WEEK anchor on the range start itself (a 7-day period from the earliest date; documented).
  return date;
}

/** The date part (`YYYY-MM-DD`) of an instant that may carry a `THH:MM` suffix. */
function dateOf(instant: string): string {
  return instant.slice(0, 10);
}

/**
 * Build the plan's resource loading histogram (ADR-0044 §3). Pure: reads `input`, returns a fresh
 * result. Each schedulable assignment (both CPM dates present) is distributed across its **effective
 * span** — `[start + lag, finish)` measured on the activity's own calendar (ADR-0037) — per its curve,
 * conserving units; assignments with no dates are skipped (they are not on the schedule). A **degenerate
 * span** (zero or negative working time after the lag) drops the whole budget into the single bucket
 * that contains the effective start — never a divide-by-zero. Series are emitted sorted by `resourceId`.
 *
 * @throws {HistogramTooManyBucketsError} if the granularity would exceed {@link MAX_HISTOGRAM_BUCKETS}.
 */
export function computeResourceHistogram(input: HistogramInput): ResourceHistogramResult {
  const { granularity } = input;

  // Resolve each assignment's effective span once; keep only the schedulable ones on the axis.
  interface Prepared {
    resourceId: string;
    budgetedUnits: number;
    cdf: (u: number) => number;
    normalised: boolean;
    effStart: string;
    effFinish: string;
    span: number; // working minutes; <= 0 = degenerate
    startDate: string; // date part of effStart (for range + degenerate placement)
    finishDate: string;
    calendar: WorkingTimeCalendar;
  }
  const prepared: Prepared[] = [];
  for (const a of input.assignments) {
    if (a.start === null || a.finish === null) continue; // unschedulable ⇒ off the axis
    const effStart = a.lagMinutes > 0 ? a.calendar.addWorkingTime(a.start, a.lagMinutes) : a.start;
    const effFinish = a.finish;
    const span = a.calendar.workingTimeBetween(effStart, effFinish);
    prepared.push({
      resourceId: a.resourceId,
      budgetedUnits: a.budgetedUnits,
      cdf: makeCdf(a.profile),
      normalised: isNonHundredProfile(a.profile),
      effStart,
      effFinish,
      span,
      startDate: dateOf(effStart),
      finishDate: dateOf(effFinish),
      calendar: a.calendar,
    });
  }

  if (prepared.length === 0) {
    return { granularity, buckets: [], series: [], curveNormalisedCount: 0 };
  }

  // The shared axis spans the earliest effective start … latest finish across all schedulable rows.
  let rangeStart = prepared[0]!.startDate;
  let rangeEnd = prepared[0]!.finishDate;
  for (const p of prepared) {
    if (p.startDate < rangeStart) rangeStart = p.startDate;
    if (p.finishDate > rangeEnd) rangeEnd = p.finishDate;
  }

  // Build the buckets (aligned down for MONTH). Always emit at least one bucket so a zero-span plan
  // (rangeStart === rangeEnd) still has a home for its degenerate placements.
  const buckets: HistogramBucket[] = [];
  let cursor = alignDown(rangeStart, granularity);
  do {
    const next = advance(cursor, granularity);
    buckets.push({ start: cursor, end: next });
    if (buckets.length > MAX_HISTOGRAM_BUCKETS)
      throw new HistogramTooManyBucketsError(buckets.length);
    cursor = next;
  } while (cursor < rangeEnd);

  // Index a date to its bucket (used for degenerate-span placement); buckets are contiguous + ordered.
  const bucketIndexOf = (date: string): number => {
    // Clamp into range; linear-ish but buckets are few relative to assignments in practice.
    if (date <= buckets[0]!.start) return 0;
    for (let i = 0; i < buckets.length; i += 1) {
      if (date >= buckets[i]!.start && date < buckets[i]!.end) return i;
    }
    return buckets.length - 1;
  };

  // Accumulate raw (unrounded) per-resource, per-bucket contributions + the expected resource totals.
  const rawByResource = new Map<string, number[]>();
  const expectedByResource = new Map<string, number>();
  let curveNormalisedCount = 0;

  for (const p of prepared) {
    if (p.normalised) curveNormalisedCount += 1;
    let raw = rawByResource.get(p.resourceId);
    if (!raw) {
      raw = new Array<number>(buckets.length).fill(0);
      rawByResource.set(p.resourceId, raw);
    }
    expectedByResource.set(
      p.resourceId,
      (expectedByResource.get(p.resourceId) ?? 0) + p.budgetedUnits,
    );

    if (p.span <= 0) {
      // Degenerate span: the whole budget lands in the bucket containing the effective start.
      raw[bucketIndexOf(p.startDate)]! += p.budgetedUnits;
      continue;
    }

    const posOf = (date: string): number => {
      const wt = p.calendar.workingTimeBetween(p.effStart, date);
      if (wt <= 0) return 0;
      if (wt >= p.span) return 1;
      return wt / p.span;
    };
    for (let i = 0; i < buckets.length; i += 1) {
      const uLo = posOf(buckets[i]!.start);
      const uHi = posOf(buckets[i]!.end);
      if (uHi <= uLo) continue;
      raw[i]! += p.budgetedUnits * (p.cdf(uHi) - p.cdf(uLo));
    }
  }

  // Round each bucket to the storage grain and fold the residual into the largest bucket so every
  // resource's Σ buckets equals its Σ budgetedUnits EXACTLY (units conserved, N29-safe).
  const series: HistogramSeries[] = [];
  for (const [resourceId, raw] of rawByResource) {
    const expected = round4(expectedByResource.get(resourceId) ?? 0);
    const values = raw.map(round4);
    let sum = 0;
    let largestIdx = 0;
    for (let i = 0; i < values.length; i += 1) {
      sum += values[i]!;
      if (raw[i]! > raw[largestIdx]!) largestIdx = i;
    }
    const residual = round4(expected - sum);
    if (residual !== 0 && values.length > 0) {
      values[largestIdx] = round4(values[largestIdx]! + residual);
    }
    series.push({ resourceId, values, total: expected });
  }
  series.sort((a, b) => (a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0));

  return { granularity, buckets, series, curveNormalisedCount };
}
