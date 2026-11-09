import { describe, expect, it } from 'vitest';

import { baselineMovementOf, flagsOf, isFlagged, orderByFlaggedFirst } from './plan-standing';

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

describe('orderByFlaggedFirst', () => {
  const row = (planId: string, flags: Record<string, number> = {}) => ({ planId, flags });

  it('promotes every flagged row ahead of every unflagged one', () => {
    const ordered = orderByFlaggedFirst([
      row('healthy-1'),
      row('flagged-1', { constraintViolated: 1 }),
      row('healthy-2'),
      row('flagged-2', { visualConflict: 3 }),
    ]);

    expect(ordered.map((r) => r.planId)).toEqual([
      'flagged-1',
      'flagged-2',
      'healthy-1',
      'healthy-2',
    ]);
  });

  it('keeps the incoming order within each group', () => {
    // The base order is the recently-changed one, and the promotion must not disturb it —
    // otherwise the reader loses recency twice over rather than getting it applied twice.
    const ordered = orderByFlaggedFirst([
      row('a'),
      row('b'),
      row('c', { loeNoSpan: 2 }),
      row('d'),
      row('e', { resourceDriverMissing: 1 }),
    ]);

    expect(ordered.map((r) => r.planId)).toEqual(['c', 'e', 'a', 'b', 'd']);
  });

  it('returns a new array and leaves the input untouched', () => {
    const input = [row('healthy'), row('flagged', { constraintViolated: 1 })];

    const ordered = orderByFlaggedFirst(input);

    expect(ordered).not.toBe(input);
    expect(input.map((r) => r.planId)).toEqual(['healthy', 'flagged']);
  });

  it('is a no-op when nothing is flagged, and when everything is', () => {
    const none = [row('a'), row('b'), row('c')];
    const all = [
      row('a', { constraintViolated: 1 }),
      row('b', { visualConflict: 1 }),
      row('c', { loeNoSpan: 1 }),
    ];

    expect(orderByFlaggedFirst(none).map((r) => r.planId)).toEqual(['a', 'b', 'c']);
    expect(orderByFlaggedFirst(all).map((r) => r.planId)).toEqual(['a', 'b', 'c']);
  });
});

describe('isFlagged', () => {
  it('reads flagsOf output, so a zeroed count is not a flag', () => {
    // `flagsOf` omits zeroes, and this predicate consumes that decision rather than restating it.
    // Composed here on purpose: a test that hand-wrote `{ constraintViolated: 0 }` would pass
    // against a predicate that had drifted away from the producer.
    const healthy = flagsOf({
      constraintViolatedCount: 0,
      loeNoSpanCount: 0,
      resourceDriverMissingCount: 0,
      visualConflictCount: 0,
    });
    const violating = flagsOf({
      constraintViolatedCount: 2,
      loeNoSpanCount: 0,
      resourceDriverMissingCount: 0,
      visualConflictCount: 0,
    });

    expect(isFlagged({ flags: healthy })).toBe(false);
    expect(isFlagged({ flags: violating })).toBe(true);
  });
});
