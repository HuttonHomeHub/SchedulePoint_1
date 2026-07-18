import { describe, expect, it } from 'vitest';

import {
  computeEarnedValue,
  rollupPhysicalPercent,
  type EvActivityInput,
  type EvInput,
} from './earned-value';
import {
  absMinutesToInstant,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * Weighted activity steps → physical %-complete (M7 rung 5, ADR-0044 §33). The `rollupPhysicalPercent`
 * resolver is the single source of truth shared by the EV read-model and the activity API: steps win
 * over the manual field when present with a positive total weight (the weighted mean `Σwp/Σw`); with no
 * steps or all-zero weights (N27) the manual field stands — the byte-identical no-steps path. Steps feed
 * the `PHYSICAL` Earned-Value measure only; they move no CPM date.
 */
const continuousCalendar: WorkingTimeCalendar = {
  workingTimeBetween: (from, to) => instantToAbsMinutes(to) - instantToAbsMinutes(from),
  addWorkingTime: (from, minutes) => absMinutesToInstant(instantToAbsMinutes(from) + minutes),
};

describe('rollupPhysicalPercent (ADR-0044 §33)', () => {
  it('no steps ⇒ the manual value (or 0 when unset) — the parity path', () => {
    expect(rollupPhysicalPercent(undefined, 42)).toBe(42);
    expect(rollupPhysicalPercent([], 42)).toBe(42);
    expect(rollupPhysicalPercent(undefined, null)).toBe(0);
  });

  it('steps present ⇒ the weight-weighted mean, winning over the manual field', () => {
    // (1·20 + 1·50) / 2 = 35; the manual 90 is ignored because steps are present.
    expect(
      rollupPhysicalPercent(
        [
          { weight: 1, percentComplete: 20 },
          { weight: 1, percentComplete: 50 },
        ],
        90,
      ),
    ).toBe(35);
    // Weighting shifts the mean: (3·100 + 1·0) / 4 = 75.
    expect(
      rollupPhysicalPercent(
        [
          { weight: 3, percentComplete: 100 },
          { weight: 1, percentComplete: 0 },
        ],
        null,
      ),
    ).toBe(75);
  });

  it('N27 — all weights zero ⇒ fall back to the manual field, never divide-by-zero', () => {
    expect(
      rollupPhysicalPercent(
        [
          { weight: 0, percentComplete: 80 },
          { weight: 0, percentComplete: 100 },
        ],
        25,
      ),
    ).toBe(25);
    expect(rollupPhysicalPercent([{ weight: 0, percentComplete: 80 }], null)).toBe(0);
  });

  it('clamps out-of-range step percents into [0, 100]', () => {
    expect(rollupPhysicalPercent([{ weight: 1, percentComplete: 150 }], null)).toBe(100);
    expect(rollupPhysicalPercent([{ weight: 1, percentComplete: -10 }], null)).toBe(0);
  });
});

function physicalActivity(overrides: Partial<EvActivityInput> = {}): EvActivityInput {
  return {
    activityId: 'A',
    type: 'TASK',
    parentId: null,
    percentCompleteType: 'PHYSICAL',
    percentComplete: 0,
    physicalPercentComplete: 90, // deliberately ≠ the steps mean, to prove steps win
    budgetedExpense: 100000,
    actualExpense: 0,
    assignments: [],
    baselineStart: null,
    baselineFinish: null,
    baselineBudgetedCost: null,
    earlyStart: null,
    earlyFinish: null,
    ...overrides,
  };
}

describe('EV integration — step-sourced PHYSICAL %', () => {
  const run = (activity: EvActivityInput) => {
    const input: EvInput = {
      activities: [activity],
      dataDate: '2026-01-06',
      eacMethod: 'CPI',
      calendar: continuousCalendar,
    };
    return computeEarnedValue(input).activities[0]!;
  };

  it('steps drive the earned value; the manual field is ignored when steps exist', () => {
    // Steps mean 35% ⇒ EV = 100000 × 35% = 35000, NOT the manual 90% (which would be 90000).
    const withSteps = run(
      physicalActivity({
        steps: [
          { weight: 1, percentComplete: 20 },
          { weight: 1, percentComplete: 50 },
        ],
      }),
    );
    expect(withSteps.performancePercent).toBe(35);
    expect(withSteps.ev).toBe(35000);
  });

  it('no steps ⇒ the manual physical % stands (byte-identical to the pre-ADR-0044 path)', () => {
    const manual = run(physicalActivity());
    expect(manual.performancePercent).toBe(90);
    expect(manual.ev).toBe(90000);
  });
});
