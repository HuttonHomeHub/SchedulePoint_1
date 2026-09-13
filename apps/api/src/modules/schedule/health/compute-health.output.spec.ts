import { describe, expect, it } from 'vitest';

import { computeHealthReport } from './compute-health';
import { activity, computeInput } from './health-fixtures';

const metric = (input: ReturnType<typeof computeInput>, id: string) =>
  computeHealthReport(input).metrics.find((m) => m.id === id)!;

/** M1-T4 — the four output metrics (6–9), reading engine-owned columns plus the data date. */
describe('metrics 6 and 7 — float, as stored whole working days', () => {
  it('44 days passes, 45 fails — a direct integer comparison, no conversion', () => {
    const at44 = computeInput({ activities: [activity({ totalFloat: 44 })] });
    const at45 = computeInput({ activities: [activity({ totalFloat: 45 })] });
    expect(metric(at44, 'HIGH_FLOAT').measured?.count).toBe(0);
    expect(metric(at45, 'HIGH_FLOAT').measured?.count).toBe(1);
  });

  it('complete activities leave the high-float denominator', () => {
    const input = computeInput({
      activities: [
        activity({
          totalFloat: 99,
          status: 'COMPLETE',
          actualStart: '2026-01-05',
          actualFinish: '2026-02-01',
        }),
        activity({ totalFloat: 10 }),
      ],
    });
    const m = metric(input, 'HIGH_FLOAT');
    expect(m.measured).toMatchObject({ count: 0, denominator: 1 });
  });

  it('negative float counts every activity below zero, complete or not', () => {
    const input = computeInput({
      activities: [activity({ totalFloat: -1 }), activity({ totalFloat: 0 })],
    });
    const m = metric(input, 'NEGATIVE_FLOAT');
    expect(m.verdict).toBe('FAIL');
    expect(m.measured).toMatchObject({ count: 1 });
  });

  it('a never-calculated plan is PLAN_NOT_SCHEDULED for both, never a vacuous pass', () => {
    const input = computeInput({
      plan: { computedAt: null } as never,
      activities: [activity({ totalFloat: null })],
    });
    expect(metric(input, 'HIGH_FLOAT').reason).toBe('PLAN_NOT_SCHEDULED');
    expect(metric(input, 'NEGATIVE_FLOAT').reason).toBe('PLAN_NOT_SCHEDULED');
  });
});

/**
 * Metric 8 judges on the factor it is HANDED, and since `docs/TECH_DEBT.md` #86 that is each
 * activity's SCHEDULING factor — the calendar the work happens on, which for a driven activity is
 * its driving resource's. This describe said "OWN day factor" until 2026-09-13, which was correct
 * when written and became wrong one layer up without anything here changing: these cases pass
 * `dayFactorMinutes` directly and so cannot see which rule produced it. The wiring is proved in
 * `test/resource-dependent-day-factor.e2e-spec.ts`, where a real driven activity goes through a
 * real health check.
 */
describe('metric 8 — high duration on the factor each activity is handed', () => {
  it('the same remaining minutes are an offender on an 8-hour calendar and not on a 24-hour one', () => {
    // 21,600 minutes = 45 eight-hour days (FAIL side of 44) = 15 twenty-four-hour days (pass).
    const eightHour = computeInput({
      activities: [activity({ durationMinutes: 21_600, dayFactorMinutes: 480 })],
    });
    const twentyFour = computeInput({
      activities: [activity({ durationMinutes: 21_600, dayFactorMinutes: 1440 })],
    });
    expect(metric(eightHour, 'HIGH_DURATION').measured?.count).toBe(1);
    expect(metric(twentyFour, 'HIGH_DURATION').measured?.count).toBe(0);
  });

  it("an in-progress activity is judged on the engine's remaining-duration rule, not its full duration", () => {
    // Full duration 45 days would fail; explicit remaining 10 days passes — the shared
    // resolveRemainingMinutes rule, reused rather than rewritten.
    const input = computeInput({
      activities: [
        activity({
          durationMinutes: 21_600,
          dayFactorMinutes: 480,
          actualStart: '2026-02-02',
          status: 'IN_PROGRESS',
          remainingDurationMinutes: 4_800,
        }),
      ],
    });
    expect(metric(input, 'HIGH_DURATION').measured?.count).toBe(0);
  });

  it('with nothing incomplete the metric is NO_INCOMPLETE_ACTIVITIES', () => {
    const input = computeInput({
      activities: [
        activity({ status: 'COMPLETE', actualStart: '2026-01-05', actualFinish: '2026-02-01' }),
      ],
    });
    expect(metric(input, 'HIGH_DURATION').reason).toBe('NO_INCOMPLETE_ACTIVITIES');
  });
});

describe('metric 9 — invalid dates, two halves with different causes', () => {
  it('separates forecast-before-data-date from actual-after-data-date', () => {
    const input = computeInput({
      activities: [
        activity({ earlyStart: '2026-02-27' }),
        activity({ actualStart: '2026-03-05', status: 'IN_PROGRESS' }),
      ],
    });
    const m = metric(input, 'INVALID_DATES');
    expect(m.verdict).toBe('FAIL');
    expect(m.detail).toMatchObject({
      forecastBeforeDataDate: 1,
      actualAfterDataDate: 1,
      forecastAssessed: true,
    });
  });

  it('a never-calculated plan still judges its actuals, with the forecast half stated un-assessed', () => {
    const input = computeInput({
      plan: { computedAt: null } as never,
      activities: [
        activity({ earlyStart: null, actualStart: '2026-03-05', status: 'IN_PROGRESS' }),
      ],
    });
    const m = metric(input, 'INVALID_DATES');
    expect(m.verdict).toBe('FAIL');
    expect(m.detail).toMatchObject({ forecastBeforeDataDate: null, forecastAssessed: false });
  });
});
