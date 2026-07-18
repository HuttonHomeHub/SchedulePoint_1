import { describe, expect, it } from 'vitest';

import { computeEarnedValue, type EvActivityInput, type EvInput } from './earned-value';
import {
  absMinutesToInstant,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * Cost-accrual PV time-phasing (M7 rung 5, ADR-0044 / ADR-0035 §32). `accrualType` governs **when** an
 * activity's cost is recognised as Planned Value: `START` recognises the whole lump-sum once the data
 * date reaches the start, `END` once it reaches the finish, `UNIFORM` (the default / absent) spreads it
 * linearly — the pre-ADR-0044 math, so an absent or `UNIFORM` accrual is byte-identical. Accrual moves
 * no CPM date and touches only PV (EV and AC are unchanged). A continuous 24/7 calendar keeps the
 * time-phasing fractions exact (1 day = 1440 minutes).
 */
const continuousCalendar: WorkingTimeCalendar = {
  workingTimeBetween: (from, to) => instantToAbsMinutes(to) - instantToAbsMinutes(from),
  addWorkingTime: (from, minutes) => absMinutesToInstant(instantToAbsMinutes(from) + minutes),
};

/** A single 100,000-minor-unit task spanning 2026-01-01→2026-01-11, half schedule-complete. */
function task(overrides: Partial<EvActivityInput> = {}): EvActivityInput {
  return {
    activityId: 'A',
    type: 'TASK',
    parentId: null,
    percentCompleteType: 'DURATION',
    percentComplete: 50,
    physicalPercentComplete: null,
    budgetedExpense: 100000,
    actualExpense: 40000,
    assignments: [],
    baselineStart: '2026-01-01',
    baselineFinish: '2026-01-11',
    baselineBudgetedCost: 100000,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-11',
    ...overrides,
  };
}

function pvOf(activity: EvActivityInput, dataDate: string): number {
  const input: EvInput = {
    activities: [activity],
    dataDate,
    eacMethod: 'CPI',
    calendar: continuousCalendar,
  };
  return computeEarnedValue(input).activities[0]!.pv;
}

describe('cost accrual — PV time-phasing (ADR-0044 §32)', () => {
  // Data date 2026-01-06 is 5 of 10 days into the span — 50% elapsed.
  const DATA_DATE = '2026-01-06';

  it('UNIFORM (explicit) spreads linearly — 50% elapsed ⇒ PV = 50,000', () => {
    expect(pvOf(task({ accrualType: 'UNIFORM' }), DATA_DATE)).toBe(50000);
  });

  it('absent accrualType is byte-identical to UNIFORM (the parity default)', () => {
    expect(pvOf(task(), DATA_DATE)).toBe(pvOf(task({ accrualType: 'UNIFORM' }), DATA_DATE));
    expect(pvOf(task(), DATA_DATE)).toBe(50000);
  });

  it('START recognises the whole cost once the data date reaches the start', () => {
    // Past the start (05 Jan onward) ⇒ full 100,000, regardless of how far through the span.
    expect(pvOf(task({ accrualType: 'START' }), DATA_DATE)).toBe(100000);
    expect(pvOf(task({ accrualType: 'START' }), '2026-01-01')).toBe(100000); // on the start
    // Before the start ⇒ nothing recognised yet.
    expect(pvOf(task({ accrualType: 'START' }), '2025-12-31')).toBe(0);
  });

  it('END recognises nothing until the data date reaches the finish', () => {
    expect(pvOf(task({ accrualType: 'END' }), DATA_DATE)).toBe(0); // mid-span
    expect(pvOf(task({ accrualType: 'END' }), '2026-01-10')).toBe(0); // still before finish
    expect(pvOf(task({ accrualType: 'END' }), '2026-01-11')).toBe(100000); // on the finish
    expect(pvOf(task({ accrualType: 'END' }), '2026-01-20')).toBe(100000); // past the finish
  });

  it('accrual moves neither EV nor AC — only PV', () => {
    const base: EvInput = {
      activities: [task()],
      dataDate: DATA_DATE,
      eacMethod: 'CPI',
      calendar: continuousCalendar,
    };
    const uniform = computeEarnedValue(base).activities[0]!;
    const start = computeEarnedValue({ ...base, activities: [task({ accrualType: 'START' })] })
      .activities[0]!;
    // EV = BAC × 50% duration = 50,000 and AC = 40,000 for both; only PV differs (50k vs 100k).
    expect(start.ev).toBe(uniform.ev);
    expect(start.ac).toBe(uniform.ac);
    expect(uniform.pv).toBe(50000);
    expect(start.pv).toBe(100000);
  });

  it('a milestone is binary on its start regardless of accrual type', () => {
    const milestone = task({
      type: 'FINISH_MILESTONE',
      baselineFinish: '2026-01-01',
      earlyFinish: '2026-01-01',
      accrualType: 'END',
    });
    // The zero-span event recognises its cost at its instant (start), not deferred by END.
    expect(pvOf(milestone, DATA_DATE)).toBe(100000);
    expect(pvOf(milestone, '2025-12-31')).toBe(0);
  });
});
