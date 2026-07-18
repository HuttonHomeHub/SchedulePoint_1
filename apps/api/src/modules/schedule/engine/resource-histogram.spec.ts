import { describe, expect, it } from 'vitest';

import {
  computeResourceHistogram,
  RESOURCE_CURVE_PROFILES,
  resolveCurveProfile,
  type HistogramAssignmentInput,
} from './resource-histogram';
import { allMinutesWorkCalendar, fullDayWeek } from './working-time-calendar';
import { buildWorkingTimeCalendar } from './working-time-calendar';

/**
 * Unit tests for the pure resource-histogram read-model (M7 rung 5, ADR-0044 §3 / ADR-0035 §31).
 * Every expected number is derived first-principles from the built-in P6 profile constants, which
 * match the conformance fixture's `resource_curves` exactly (ADR-0034, no external oracle).
 */

/** Sum a series' bucket values (float — compare with a tolerance where fractions are involved). */
function seriesSum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * A 21-day span over a 24/7 calendar so DAY buckets line up exactly with the 21 profile intervals:
 * `2026-01-01 .. 2026-01-22` (exclusive) = 21 whole days, each 1/21 of the span. Bucket `i` then
 * carries `budgetedUnits × profile[i] / 100`.
 */
const SPAN_START = '2026-01-01';
const SPAN_FINISH = '2026-01-22';

function asg(overrides: Partial<HistogramAssignmentInput>): HistogramAssignmentInput {
  return {
    resourceId: 'R1',
    activityId: 'A1',
    budgetedUnits: 100,
    profile: null,
    start: SPAN_START,
    finish: SPAN_FINISH,
    lagMinutes: 0,
    calendar: allMinutesWorkCalendar,
    ...overrides,
  };
}

describe('built-in curve profiles', () => {
  it('every named profile sums to 100 (pre-normalisation) and UNIFORM is flat (null)', () => {
    expect(RESOURCE_CURVE_PROFILES.UNIFORM).toBeNull();
    for (const key of ['FRONT_LOADED', 'BACK_LOADED', 'BELL', 'DOUBLE_PEAK'] as const) {
      const profile = RESOURCE_CURVE_PROFILES[key]!;
      expect(profile).toHaveLength(21);
      expect(seriesSum([...profile])).toBeCloseTo(100, 9);
    }
    expect(resolveCurveProfile('FRONT_LOADED')).toBe(RESOURCE_CURVE_PROFILES.FRONT_LOADED);
  });
});

describe('curve distribution shapes over a 21-day span (DAY granularity)', () => {
  it('FRONT_LOADED lands its profile weights bucket-for-bucket and conserves units', () => {
    const result = computeResourceHistogram({
      assignments: [asg({ profile: RESOURCE_CURVE_PROFILES.FRONT_LOADED, budgetedUnits: 100 })],
      granularity: 'DAY',
    });
    expect(result.buckets).toHaveLength(21);
    const series = result.series[0]!;
    // budgetedUnits 100 ⇒ bucket i === profile[i] (each profile weight is already a % of 100).
    expect(series.values).toEqual([...RESOURCE_CURVE_PROFILES.FRONT_LOADED!]);
    expect(series.total).toBe(100);
    expect(seriesSum(series.values)).toBeCloseTo(100, 9);
    // Front-loaded: the first bucket carries strictly more than the last.
    expect(series.values[0]!).toBeGreaterThan(series.values[20]!);
  });

  it('BACK_LOADED is the mirror — the last bucket outweighs the first', () => {
    const result = computeResourceHistogram({
      assignments: [asg({ profile: RESOURCE_CURVE_PROFILES.BACK_LOADED, budgetedUnits: 100 })],
      granularity: 'DAY',
    });
    const series = result.series[0]!;
    expect(series.values).toEqual([...RESOURCE_CURVE_PROFILES.BACK_LOADED!]);
    expect(series.values[20]!).toBeGreaterThan(series.values[0]!);
  });

  it('BELL peaks mid-span (buckets rise then fall)', () => {
    const result = computeResourceHistogram({
      assignments: [asg({ profile: RESOURCE_CURVE_PROFILES.BELL, budgetedUnits: 100 })],
      granularity: 'DAY',
    });
    const series = result.series[0]!;
    expect(series.values).toEqual([...RESOURCE_CURVE_PROFILES.BELL!]);
    const peak = Math.max(...series.values);
    const peakIdx = series.values.indexOf(peak);
    expect(peakIdx).toBeGreaterThan(4);
    expect(peakIdx).toBeLessThan(16);
    expect(series.values[0]!).toBeLessThan(peak);
    expect(series.values[20]!).toBeLessThan(peak);
  });

  it('DOUBLE_PEAK has two humps and conserves units', () => {
    const result = computeResourceHistogram({
      assignments: [asg({ profile: RESOURCE_CURVE_PROFILES.DOUBLE_PEAK, budgetedUnits: 560 })],
      granularity: 'DAY',
    });
    const series = result.series[0]!;
    // 560 units × profile/100: e.g. bucket 3 = 9% ⇒ 50.4; bucket 17 = 10% ⇒ 56.
    expect(series.values[3]!).toBeCloseTo(50.4, 4);
    expect(series.values[17]!).toBeCloseTo(56, 4);
    expect(seriesSum(series.values)).toBeCloseTo(560, 4);
    expect(series.total).toBe(560);
  });
});

describe('UNIFORM parity — flat load, byte-identical to a flat rate', () => {
  it('spreads budgetedUnits evenly across the span regardless of bucket count', () => {
    const result = computeResourceHistogram({
      assignments: [asg({ profile: null, budgetedUnits: 210 })],
      granularity: 'DAY',
    });
    const series = result.series[0]!;
    // 210 over 21 equal days = 10 per day, flat.
    expect(series.values).toEqual(new Array(21).fill(10));
    expect(series.total).toBe(210);
  });

  it('UNIFORM matches an explicit flat 21-point profile bucket-for-bucket (curve shape is flat)', () => {
    const flat = new Array(21).fill(100 / 21);
    const uniform = computeResourceHistogram({
      assignments: [asg({ profile: null, budgetedUnits: 100 })],
      granularity: 'DAY',
    }).series[0]!;
    const explicit = computeResourceHistogram({
      assignments: [asg({ profile: flat, budgetedUnits: 100 })],
      granularity: 'DAY',
    }).series[0]!;
    // Both conserve to 100 and are flat to the storage grain (a sub-0.0001 rounding residual is folded
    // into one bucket in each, which need not be the same bucket — so compare per-element, not exactly).
    expect(seriesSum(uniform.values)).toBeCloseTo(100, 4);
    for (let i = 0; i < 21; i += 1) expect(uniform.values[i]!).toBeCloseTo(explicit.values[i]!, 3);
  });

  it('a coarser granularity still conserves units and stays flat per working-time', () => {
    const result = computeResourceHistogram({
      assignments: [asg({ profile: null, budgetedUnits: 210 })],
      granularity: 'WEEK',
    });
    const series = result.series[0]!;
    // Three 7-day buckets over the 21-day span, each 7/21 of the load = 70.
    expect(result.buckets).toHaveLength(3);
    expect(series.values).toEqual([70, 70, 70]);
  });
});

describe('units-conservation property', () => {
  it('Σ buckets === Σ budgetedUnits exactly across curves, granularities and quantities', () => {
    const profiles = [
      null,
      RESOURCE_CURVE_PROFILES.FRONT_LOADED,
      RESOURCE_CURVE_PROFILES.BACK_LOADED,
      RESOURCE_CURVE_PROFILES.BELL,
      RESOURCE_CURVE_PROFILES.DOUBLE_PEAK,
    ];
    const budgets = [1, 7, 33.3333, 1000, 2400, 999.9999];
    const grains = ['DAY', 'WEEK', 'MONTH'] as const;
    for (const profile of profiles) {
      for (const budgetedUnits of budgets) {
        for (const granularity of grains) {
          const result = computeResourceHistogram({
            assignments: [asg({ profile, budgetedUnits, finish: '2026-04-30' })],
            granularity,
          });
          const series = result.series[0]!;
          // The stored total is the expected budget; the buckets sum to it EXACTLY (residual folded).
          expect(series.total).toBe(Math.round(budgetedUnits * 10000) / 10000);
          expect(seriesSum(series.values)).toBeCloseTo(series.total, 4);
        }
      }
    }
  });
});

describe('N29 — a profile that does not sum to 100 is normalised (units conserved) and counted', () => {
  it('a doubled BELL (sums to 200) distributes the SAME shape as BELL and conserves units', () => {
    const doubled = RESOURCE_CURVE_PROFILES.BELL!.map((w) => w * 2);
    const normalised = computeResourceHistogram({
      assignments: [asg({ profile: doubled, budgetedUnits: 100 })],
      granularity: 'DAY',
    });
    const plain = computeResourceHistogram({
      assignments: [asg({ profile: RESOURCE_CURVE_PROFILES.BELL, budgetedUnits: 100 })],
      granularity: 'DAY',
    });
    // Same shape (a scalar multiple normalises away) — proves normalise-to-budget, not to 100.
    expect(normalised.series[0]!.values).toEqual(plain.series[0]!.values);
    expect(seriesSum(normalised.series[0]!.values)).toBeCloseTo(100, 4);
    expect(normalised.curveNormalisedCount).toBe(1);
    expect(plain.curveNormalisedCount).toBe(0);
  });

  it('a profile summing to 50 still distributes the full budget (normalise to budget)', () => {
    const half = [30, 20]; // sums to 50, front-weighted
    const result = computeResourceHistogram({
      assignments: [asg({ profile: half, budgetedUnits: 100 })],
      granularity: 'DAY',
    });
    expect(seriesSum(result.series[0]!.values)).toBeCloseTo(100, 4);
    expect(result.curveNormalisedCount).toBe(1);
  });

  it('UNIFORM (null profile) is never counted as normalised', () => {
    const result = computeResourceHistogram({
      assignments: [asg({ profile: null })],
      granularity: 'DAY',
    });
    expect(result.curveNormalisedCount).toBe(0);
  });
});

describe('per-resource aggregation', () => {
  it('sums assignments of the same resource into one series and keeps distinct resources apart', () => {
    const result = computeResourceHistogram({
      assignments: [
        asg({ resourceId: 'R1', activityId: 'A1', profile: null, budgetedUnits: 210 }),
        asg({ resourceId: 'R1', activityId: 'A2', profile: null, budgetedUnits: 21 }),
        asg({ resourceId: 'R2', activityId: 'A3', profile: null, budgetedUnits: 42 }),
      ],
      granularity: 'DAY',
    });
    expect(result.series.map((s) => s.resourceId)).toEqual(['R1', 'R2']); // sorted
    const r1 = result.series.find((s) => s.resourceId === 'R1')!;
    // R1 total = 210 + 21 = 231; flat over 21 days = 11/day.
    expect(r1.total).toBe(231);
    expect(r1.values).toEqual(new Array(21).fill(11));
    const r2 = result.series.find((s) => s.resourceId === 'R2')!;
    expect(r2.total).toBe(42);
    expect(r2.values).toEqual(new Array(21).fill(2));
  });
});

describe('assignment lag shortens the effective span', () => {
  it('a lagged assignment loads only its lagged span (the axis starts at the lagged start)', () => {
    // Lag 10 working-days (14400 min) into the 21-day span ⇒ the effective span is the last 11 days,
    // and — being the only assignment — it anchors the axis at 2026-01-11.
    const result = computeResourceHistogram({
      assignments: [asg({ profile: null, budgetedUnits: 110, lagMinutes: 10 * 1440 })],
      granularity: 'DAY',
    });
    expect(result.buckets).toHaveLength(11);
    expect(result.buckets[0]!.start).toBe('2026-01-11');
    const series = result.series[0]!;
    expect(series.values).toEqual(new Array(11).fill(10));
    expect(seriesSum(series.values)).toBeCloseTo(110, 4);
  });

  it('with an unlagged sibling anchoring the axis, the lagged rows leave leading buckets empty', () => {
    // R2's unlagged assignment anchors the axis at Jan 1; R1's lagged one leaves the first 10 empty.
    const result = computeResourceHistogram({
      assignments: [
        asg({ resourceId: 'R2', activityId: 'A0', profile: null, budgetedUnits: 21 }),
        asg({
          resourceId: 'R1',
          activityId: 'A1',
          profile: null,
          budgetedUnits: 110,
          lagMinutes: 10 * 1440,
        }),
      ],
      granularity: 'DAY',
    });
    expect(result.buckets).toHaveLength(21);
    const r1 = result.series.find((s) => s.resourceId === 'R1')!;
    expect(r1.values.slice(0, 10)).toEqual(new Array(10).fill(0));
    expect(r1.values.slice(10)).toEqual(new Array(11).fill(10));
    expect(seriesSum(r1.values)).toBeCloseTo(110, 4);
  });
});

describe('degenerate / unschedulable span guards', () => {
  it('a zero-working-time span drops the whole budget into the start bucket (no divide-by-zero)', () => {
    const result = computeResourceHistogram({
      assignments: [
        asg({
          profile: RESOURCE_CURVE_PROFILES.BELL,
          start: '2026-01-05',
          finish: '2026-01-05',
          budgetedUnits: 80,
        }),
      ],
      granularity: 'DAY',
    });
    const series = result.series[0]!;
    expect(series.total).toBe(80);
    expect(seriesSum(series.values)).toBeCloseTo(80, 4);
    // All 80 units land in exactly one bucket (the start day).
    expect(series.values.filter((v) => v > 0)).toEqual([80]);
  });

  it('an unschedulable assignment (null dates) is excluded from the axis entirely', () => {
    const result = computeResourceHistogram({
      assignments: [asg({ resourceId: 'R1', start: null, finish: null, budgetedUnits: 99 })],
      granularity: 'DAY',
    });
    expect(result.buckets).toHaveLength(0);
    expect(result.series).toHaveLength(0);
  });

  it('empty input yields an empty histogram', () => {
    const result = computeResourceHistogram({ assignments: [], granularity: 'DAY' });
    expect(result).toEqual({
      granularity: 'DAY',
      buckets: [],
      series: [],
      curveNormalisedCount: 0,
    });
  });
});

describe('working-time (non-24/7) calendar', () => {
  it('distributes over working time only, still conserving units', () => {
    // A Monday–Friday day-shift calendar (07:00–15:00). Units follow working time, not wall time.
    const cal = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);
    const result = computeResourceHistogram({
      assignments: [
        asg({
          profile: null,
          budgetedUnits: 100,
          start: '2026-01-05',
          finish: '2026-01-19',
          calendar: cal,
        }),
      ],
      granularity: 'WEEK',
    });
    const series = result.series[0]!;
    expect(seriesSum(series.values)).toBeCloseTo(100, 4);
    // Weekend buckets contribute no extra working time; the two full working weeks split evenly.
    expect(series.total).toBe(100);
  });
});
