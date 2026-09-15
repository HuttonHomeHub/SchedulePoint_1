import { describe, expect, it } from 'vitest';

import { baselineMovementOf, flagsOf } from './plan-standing';

/** A calculated, baselined, unmoved plan. Each case overrides the one field it is about. */
function row(over: Partial<Parameters<typeof baselineMovementOf>[0]> = {}) {
  return {
    activityCount: 3,
    projectFinish: '2026-02-20',
    baselineFinish: '2026-02-20',
    baselineName: 'Contract award',
    baselineHoursPerDayMinutes: 1440,
    ...over,
  };
}

describe('baselineMovementOf', () => {
  it('reports a later finish as MOVED, carrying the baseline it moved against', () => {
    const movement = baselineMovementOf(row({ projectFinish: '2026-03-20' }));

    expect(movement).toEqual({
      kind: 'MOVED',
      workingDays: 28,
      baselineFinish: '2026-02-20',
      baselineName: 'Contract award',
    });
  });

  it('signs an earlier finish negative rather than reporting its magnitude', () => {
    // A plan that has come IN is news too, and `Math.abs` here would report it as a slip. The
    // direction lives in the number; the word that renders it is the client's.
    const movement = baselineMovementOf(row({ projectFinish: '2026-02-06' }));

    expect(movement).toMatchObject({ kind: 'MOVED', workingDays: -14 });
  });

  it('reports UNCHANGED with the baseline, not as a MOVED of zero', () => {
    expect(baselineMovementOf(row())).toEqual({
      kind: 'UNCHANGED',
      baselineFinish: '2026-02-20',
      baselineName: 'Contract award',
    });
  });

  /**
   * The four reasons, each verified to be DISTINGUISHABLE from the others.
   *
   * The defect this guards is not a missing reason but a collapsed one: `?? 0` turns "no baseline"
   * into "unchanged" and tells a planner their unbaselined programme is exactly on a plan they
   * never captured (ADR-0126's rule). The union having no numeric member is what makes that a
   * compile error; these pin the ladder.
   */
  it.each([
    ['PLAN_EMPTY', { activityCount: 0 }],
    ['PLAN_NOT_SCHEDULED', { projectFinish: null }],
    ['NO_BASELINE', { baselineName: null, baselineFinish: null }],
    ['BASELINE_HAS_NO_FINISH', { baselineFinish: null }],
  ] as const)('reports %s, and never a number', (reason, over) => {
    const movement = baselineMovementOf(row(over));

    expect(movement).toEqual({ kind: 'NOT_ASSESSABLE', reason });
    expect(movement).not.toHaveProperty('workingDays');
  });

  it('reports the FIRST thing that needs doing, not the last thing that failed', () => {
    // An empty plan is also unscheduled and also unbaselined — all three are true at once. The
    // ladder's order is what makes the row say "add some activities" rather than "capture a
    // baseline" to somebody who has no work to baseline. Asserted as a property of the ladder
    // rather than of one case, because the order is the decision.
    expect(
      baselineMovementOf({
        activityCount: 0,
        projectFinish: null,
        baselineFinish: null,
        baselineName: null,
        baselineHoursPerDayMinutes: null,
      }),
    ).toEqual({ kind: 'NOT_ASSESSABLE', reason: 'PLAN_EMPTY' });
  });

  it('measures in the injected frame, not in calendar days', () => {
    // The shipped caller injects a working-time walk on the plan's calendar with the baseline's
    // frozen factor. Pinned with an eight-hour, five-day frame: a fixture whose frame agrees with
    // calendar days passes identically against the defect and against the fix (ADR-0139's trap).
    const eightHourWeek = (from: string, to: string): number => {
      const days = Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
      );
      return Math.round((days * 5) / 7);
    };

    expect(
      baselineMovementOf({ ...row({ projectFinish: '2026-03-20' }) }, eightHourWeek),
    ).toMatchObject({ kind: 'MOVED', workingDays: 20 });
  });
});

describe('flagsOf', () => {
  it('omits every zero rather than printing a row of noughts', () => {
    expect(
      flagsOf({
        constraintViolatedCount: 2,
        loeNoSpanCount: 0,
        resourceDriverMissingCount: 0,
        visualConflictCount: 1,
      }),
    ).toEqual({ constraintViolated: 2, visualConflict: 1 });
  });

  it('is empty when there is nothing to report, not a record of zeroes', () => {
    expect(
      flagsOf({
        constraintViolatedCount: 0,
        loeNoSpanCount: 0,
        resourceDriverMissingCount: 0,
        visualConflictCount: 0,
      }),
    ).toEqual({});
  });
});
