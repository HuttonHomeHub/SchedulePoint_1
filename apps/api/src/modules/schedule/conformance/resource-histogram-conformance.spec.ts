import { loadFixture } from '@repo/engine-conformance';
import { describe, expect, it } from 'vitest';

import {
  computeResourceHistogram,
  RESOURCE_CURVE_PROFILES,
  type HistogramAssignmentInput,
} from '../engine';

import {
  buildHistogramInputFromFixture,
  fixtureAssignment,
  fixtureCurvePoints,
  mapFixtureCurve,
} from './resource-histogram-adapter';

/**
 * The **F3 conformance slice** (ADR-0044 §3 / ADR-0035 §31): proves `computeResourceHistogram` against
 * the real P6-class fixture's `resource_curves` + `assignments.curve`. The histogram is a **pure
 * read-model** — it never enters `computeSchedule`, owns no engine column, and does NOT feed the
 * levelling pass this rung (Q2) — so, like the EV3 suite, this file calls the read-model directly rather
 * than routing through the CPM scenario harness. The CPM engine, its golden suite, and `level.ts` are
 * completely untouched.
 *
 * **Self-baselined, no external oracle (ADR-0034 §3):** every expected number is hand-derived from the
 * fixture's own 21-point profile arrays, which the structural gate below proves byte-equal to the
 * built-in `RESOURCE_CURVE_PROFILES` constants.
 *
 * The fixture carries no computed CPM dates, so — exactly as the EV3 goldens supply a synthetic baseline
 * window — each golden distributes over a **known 21-day span on a 24/7 calendar** (`2026-01-01 ..
 * 2026-01-22`) with DAY granularity, so the 21 buckets line up one-for-one with the 21 profile intervals
 * and bucket `i` carries `budgetedUnits × profile[i] / 100`.
 */
describe('F3 conformance — resource loading curves against the real P6 fixture (ADR-0044 §3 / ADR-0035 §31)', () => {
  const fixture = loadFixture();
  const SPAN = { start: '2026-01-01', finish: '2026-01-22' };

  /**
   * First-principles: distribute `bu` across the 21 intervals by a 21-point profile (sums to 100),
   * rounded to the read-model's 4-dp storage grain (matching `round4`, `-0` normalised to `0`).
   */
  function expectedFromProfile(bu: number, points: readonly number[]): number[] {
    return points.map((p) => {
      const v = Math.round(((bu * p) / 100) * 10000) / 10000;
      return v === 0 ? 0 : v;
    });
  }

  it('(structural gate) the built-in profile constants are byte-equal to the fixture resource_curves', () => {
    expect(RESOURCE_CURVE_PROFILES.FRONT_LOADED).toEqual(
      fixtureCurvePoints(fixture, 'FRONT_LOADED'),
    );
    expect(RESOURCE_CURVE_PROFILES.BACK_LOADED).toEqual(fixtureCurvePoints(fixture, 'BACK_LOADED'));
    expect(RESOURCE_CURVE_PROFILES.BELL).toEqual(fixtureCurvePoints(fixture, 'BELL'));
    expect(RESOURCE_CURVE_PROFILES.DOUBLE_PEAK).toEqual(fixtureCurvePoints(fixture, 'DOUBLE_PEAK'));
    // The fixture's LINEAR maps to our UNIFORM (flat), NOT its discretised twenty-of-5 array.
    expect(mapFixtureCurve('LINEAR')).toBe('UNIFORM');
    expect(RESOURCE_CURVE_PROFILES.UNIFORM).toBeNull();
  });

  it('(golden — FRONT_LOADED) AS0026 (A7100, LAB-PIPE, 2400 u) distributes front-weighted and conserves units', () => {
    const asg = fixtureAssignment(fixture, 'AS0026'); // res_curve_front_loaded
    const result = computeResourceHistogram({
      assignments: [buildHistogramInputFromFixture(fixture, asg, SPAN)],
      granularity: 'DAY',
    });
    const series = result.series[0]!;
    // 2400 × FRONT_LOADED/100 = [216,216,192,192,168,168,144,144,120,120,120,96,96,96,72,72,48,48,48,24,0].
    expect(series.values).toEqual(expectedFromProfile(2400, RESOURCE_CURVE_PROFILES.FRONT_LOADED!));
    expect(series.values[0]).toBe(216);
    expect(series.values[20]).toBe(0);
    expect(series.values.reduce((a, b) => a + b, 0)).toBeCloseTo(2400, 4);
    expect(series.total).toBe(2400);
  });

  it('(golden — BACK_LOADED) AS0042 (A11100, LAB-COMM, 640 u) distributes back-weighted and conserves units', () => {
    const asg = fixtureAssignment(fixture, 'AS0042'); // res_curve_back_loaded
    const series = computeResourceHistogram({
      assignments: [buildHistogramInputFromFixture(fixture, asg, SPAN)],
      granularity: 'DAY',
    }).series[0]!;
    // 640 × BACK_LOADED/100: first bucket 0 (0%), last two 57.6 each (9%).
    expect(series.values).toEqual(expectedFromProfile(640, RESOURCE_CURVE_PROFILES.BACK_LOADED!));
    expect(series.values[0]).toBe(0);
    expect(series.values[20]).toBeCloseTo(57.6, 4);
    expect(series.values.reduce((a, b) => a + b, 0)).toBeCloseTo(640, 4);
  });

  it('(golden — BELL) AS0015 (A5100, LAB-STEEL, 1200 u) peaks mid-span and conserves units', () => {
    const asg = fixtureAssignment(fixture, 'AS0015'); // res_curve_bell
    const series = computeResourceHistogram({
      assignments: [buildHistogramInputFromFixture(fixture, asg, SPAN)],
      granularity: 'DAY',
    }).series[0]!;
    // 1200 × BELL/100: peak 9% ⇒ 108 at buckets 9 & 10; ends 1% ⇒ 12 / 0.5% ⇒ 6.
    expect(series.values).toEqual(expectedFromProfile(1200, RESOURCE_CURVE_PROFILES.BELL!));
    expect(series.values[9]).toBe(108);
    expect(series.values[10]).toBe(108);
    expect(series.values[20]).toBe(6);
    expect(series.values.reduce((a, b) => a + b, 0)).toBeCloseTo(1200, 4);
  });

  it('(golden — DOUBLE_PEAK) AS0043 (A11200, LAB-COMM, 560 u) has two humps and conserves units', () => {
    const asg = fixtureAssignment(fixture, 'AS0043'); // res_curve_double_peak
    const series = computeResourceHistogram({
      assignments: [buildHistogramInputFromFixture(fixture, asg, SPAN)],
      granularity: 'DAY',
    }).series[0]!;
    // 560 × DOUBLE_PEAK/100: two peaks — bucket 3 (9% ⇒ 50.4) and bucket 17 (10% ⇒ 56).
    expect(series.values).toEqual(expectedFromProfile(560, RESOURCE_CURVE_PROFILES.DOUBLE_PEAK!));
    expect(series.values[3]).toBeCloseTo(50.4, 4);
    expect(series.values[17]).toBe(56);
    expect(series.values.reduce((a, b) => a + b, 0)).toBeCloseTo(560, 4);
    expect(result0Normalised(fixture)).toBe(0); // fixture curves all sum to 100 ⇒ never normalised
  });

  it('(differential — flip the curve) UNIFORM ≠ FRONT_LOADED for the same assignment (resultsDiffer, ADR-0034 §2)', () => {
    const asg = fixtureAssignment(fixture, 'AS0026');
    const frontLoaded = computeResourceHistogram({
      assignments: [buildHistogramInputFromFixture(fixture, asg, SPAN)],
      granularity: 'DAY',
    }).series[0]!;
    // Flip to a flat UNIFORM load (curve absent) — the byte-identical no-curve path.
    const uniform = computeResourceHistogram({
      assignments: [{ ...buildHistogramInputFromFixture(fixture, asg, SPAN), profile: null }],
      granularity: 'DAY',
    }).series[0]!;
    // Both conserve the same 2400 units, but the SHAPE must differ (the resultsDiffer proof).
    expect(uniform.total).toBe(frontLoaded.total);
    expect(JSON.stringify(uniform.values)).not.toBe(JSON.stringify(frontLoaded.values));
    // UNIFORM is genuinely flat (every bucket equal to the storage grain, bar a sub-0.0001 residual);
    // FRONT_LOADED front-weights (a large early-vs-late spread).
    const uniformSpread = Math.max(...uniform.values) - Math.min(...uniform.values);
    expect(uniformSpread).toBeLessThan(0.001);
    expect(frontLoaded.values[0]).toBeGreaterThan(frontLoaded.values[20]!);
    expect(frontLoaded.values[0]! - frontLoaded.values[20]!).toBeGreaterThan(100);
  });

  it('(N29) a fixture-shaped profile that does not sum to 100 is normalised to conserve units and counted', () => {
    // Synthesise a hostile curve by doubling BELL's points (sums to 200, not 100) — the read-model must
    // normalise it to the budget (units still conserved) and flag it once (ADR-0035 §31, N29).
    const bellDoubled = RESOURCE_CURVE_PROFILES.BELL!.map((p) => p * 2);
    const asg = fixtureAssignment(fixture, 'AS0015');
    const input: HistogramAssignmentInput = {
      ...buildHistogramInputFromFixture(fixture, asg, SPAN),
      profile: bellDoubled,
    };
    const result = computeResourceHistogram({ assignments: [input], granularity: 'DAY' });
    const series = result.series[0]!;
    expect(result.curveNormalisedCount).toBe(1);
    // Same shape as the plain BELL golden (a scalar multiple normalises away) and still Σ = 1200.
    expect(series.values).toEqual(expectedFromProfile(1200, RESOURCE_CURVE_PROFILES.BELL!));
    expect(series.values.reduce((a, b) => a + b, 0)).toBeCloseTo(1200, 4);
  });

  it('(lag) AS0027 (A7100, LAB-WELD, BELL, 24h assignment lag) starts its distribution after the lag', () => {
    // The fixture's res_assignment_lag case: welders join 24 working-hours (a full day on a 24/7 span)
    // after the activity starts, so nothing loads in the first bucket.
    const asg = fixtureAssignment(fixture, 'AS0027');
    expect(asg.assignment_lag_h).toBe(24);
    const series = computeResourceHistogram({
      assignments: [buildHistogramInputFromFixture(fixture, asg, SPAN)],
      granularity: 'DAY',
    }).series[0]!;
    // The axis anchors at the lagged start (2026-01-02); units still conserve to 1104.
    expect(series.values.reduce((a, b) => a + b, 0)).toBeCloseTo(1104, 4);
    expect(series.total).toBe(1104);
  });
});

/** Every fixture `resource_curves` profile sums to 100, so distributing any never normalises (N29). */
function result0Normalised(fixture: ReturnType<typeof loadFixture>): number {
  let count = 0;
  for (const asg of fixture.assignments) {
    if (asg.curve === 'LINEAR') continue;
    const result = computeResourceHistogram({
      assignments: [
        buildHistogramInputFromFixture(fixture, asg, { start: '2026-01-01', finish: '2026-01-22' }),
      ],
      granularity: 'DAY',
    });
    count += result.curveNormalisedCount;
  }
  return count;
}
