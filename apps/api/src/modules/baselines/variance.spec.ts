import { describe, expect, it } from 'vitest';

import {
  allDaysWorkCalendar,
  buildWorkingDayCalendar,
  STANDARD_WEEKDAYS,
} from '../schedule/engine';

import { computeVariance, type VarianceBaselineRow, type VarianceLiveRow } from './variance';

function base(overrides: Partial<VarianceBaselineRow> = {}): VarianceBaselineRow {
  return {
    sourceActivityId: 'a1',
    code: 'A1',
    name: 'Mobilise',
    baselineStart: '2026-01-05',
    baselineFinish: '2026-01-09',
    totalFloat: 0,
    ...overrides,
  };
}

function live(overrides: Partial<VarianceLiveRow> = {}): VarianceLiveRow {
  return {
    id: 'a1',
    code: 'A1',
    name: 'Mobilise',
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    totalFloat: 0,
    ...overrides,
  };
}

describe('computeVariance', () => {
  it('is zero when the live schedule matches the baseline', () => {
    const { rows, rollup } = computeVariance([base()], [live()], allDaysWorkCalendar);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      activityId: 'a1',
      inBaseline: true,
      removed: false,
      startVarianceDays: 0,
      finishVarianceDays: 0,
      floatVarianceDays: 0,
    });
    expect(rollup).toEqual({
      worstFinishSlipDays: null,
      behindCount: 0,
      addedCount: 0,
      removedCount: 0,
    });
  });

  it('signs a slip positive (behind) and a gain negative (ahead)', () => {
    const behind = computeVariance(
      [base()],
      [live({ earlyFinish: '2026-01-12', earlyStart: '2026-01-06' })],
      allDaysWorkCalendar,
    );
    expect(behind.rows[0]).toMatchObject({ startVarianceDays: 1, finishVarianceDays: 3 });
    expect(behind.rollup).toMatchObject({ worstFinishSlipDays: 3, behindCount: 1 });

    const ahead = computeVariance(
      [base()],
      [live({ earlyFinish: '2026-01-07' })],
      allDaysWorkCalendar,
    );
    expect(ahead.rows[0]?.finishVarianceDays).toBe(-2);
    expect(ahead.rollup).toMatchObject({ worstFinishSlipDays: null, behindCount: 0 });
  });

  it('measures the slip in WORKING days on the plan calendar (skips the weekend)', () => {
    // Baseline finish Fri 9 Jan 2026; live finish Mon 12 Jan. Calendar-days = 3, but only
    // 1 working day (Sat/Sun are non-working on a Mon–Fri calendar).
    const cal = buildWorkingDayCalendar(STANDARD_WEEKDAYS, []);
    const { rows } = computeVariance(
      [base({ baselineFinish: '2026-01-09' })],
      [live({ earlyFinish: '2026-01-12' })],
      cal,
    );
    expect(rows[0]?.finishVarianceDays).toBe(1);
  });

  it('subtracts float as current − baseline (positive = more float now)', () => {
    const { rows } = computeVariance(
      [base({ totalFloat: 2 })],
      [live({ totalFloat: 5 })],
      allDaysWorkCalendar,
    );
    expect(rows[0]?.floatVarianceDays).toBe(3);
  });

  it('reports an activity added after capture as inBaseline:false with null variance', () => {
    const { rows, rollup } = computeVariance(
      [],
      [live({ id: 'new', name: 'Added' })],
      allDaysWorkCalendar,
    );
    expect(rows[0]).toMatchObject({
      activityId: 'new',
      inBaseline: false,
      removed: false,
      startVarianceDays: null,
      finishVarianceDays: null,
      floatVarianceDays: null,
      baselineStart: null,
    });
    expect(rollup.addedCount).toBe(1);
  });

  it('reports a baselined activity no longer live as a removed row (current null)', () => {
    const { rows, rollup } = computeVariance(
      [base({ sourceActivityId: 'gone', name: 'Removed' })],
      [],
      allDaysWorkCalendar,
    );
    expect(rows[0]).toMatchObject({
      activityId: 'gone',
      inBaseline: true,
      removed: true,
      currentStart: null,
      currentFinish: null,
      baselineFinish: '2026-01-09',
    });
    expect(rollup.removedCount).toBe(1);
  });

  it('treats a not-yet-computed live date as not comparable (null, not zero)', () => {
    const { rows, rollup } = computeVariance(
      [base()],
      [live({ earlyFinish: null })],
      allDaysWorkCalendar,
    );
    expect(rows[0]?.finishVarianceDays).toBeNull();
    expect(rollup.behindCount).toBe(0);
  });

  it('keeps live rows in input order, with removed rows appended', () => {
    const { rows } = computeVariance(
      [base({ sourceActivityId: 'x' })],
      [live({ id: 'a' }), live({ id: 'b' })],
      allDaysWorkCalendar,
    );
    expect(rows.map((r) => r.activityId)).toEqual(['a', 'b', 'x']);
  });
});
