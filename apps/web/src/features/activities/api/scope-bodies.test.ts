import { describe, expect, it } from 'vitest';

import { costBody, generalBody, measureBody, schedulingBody } from './scope-bodies';

/**
 * The key-set assertions are the point of this file. A builder that leaks a key belonging to
 * another scope would let a save carry a field the user could not see or write — which is exactly
 * how a per-scope editor turns into a capability regression. Asserting values alone would not
 * catch it, so every builder's **exact** key set is pinned.
 */

const general = {
  name: 'Pour slab',
  code: 'A100',
  type: 'TASK' as const,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME' as const,
  durationDays: 5,
  parentId: '',
  description: '',
};

const scheduling = {
  calendarId: '',
  constraintType: '' as const,
  constraintDate: '',
  secondaryConstraintType: '' as const,
  secondaryConstraintDate: '',
  scheduleAsLateAsPossible: false,
  expectedFinish: '',
  externalEarlyStart: '',
  externalLateFinish: '',
};

const cost = {
  budgetedExpense: undefined,
  actualExpense: undefined,
  accrualType: 'UNIFORM' as const,
};
const measure = { percentCompleteType: 'DURATION' as const, physicalPercentComplete: undefined };

describe('scope bodies — exact key sets', () => {
  it('generalBody sends only General keys', () => {
    expect(Object.keys(generalBody(general)).sort()).toEqual(
      ['code', 'description', 'durationDays', 'durationType', 'name', 'parentId', 'type'].sort(),
    );
  });

  it('schedulingBody sends only Scheduling keys', () => {
    expect(Object.keys(schedulingBody(scheduling)).sort()).toEqual(
      [
        'calendarId',
        'constraintDate',
        'constraintType',
        'expectedFinish',
        'externalEarlyStart',
        'externalLateFinish',
        'levelingPriority',
        'scheduleAsLateAsPossible',
        'secondaryConstraintDate',
        'secondaryConstraintType',
      ].sort(),
    );
  });

  it('costBody sends only Cost keys', () => {
    expect(Object.keys(costBody(cost)).sort()).toEqual(
      ['accrualType', 'actualExpense', 'budgetedExpense'].sort(),
    );
  });

  it('measureBody sends only the two measure keys', () => {
    expect(Object.keys(measureBody(measure)).sort()).toEqual(
      ['percentCompleteType', 'physicalPercentComplete'].sort(),
    );
  });

  it('never lets one scope reach another’s fields', () => {
    const sets = [
      Object.keys(generalBody(general)),
      Object.keys(schedulingBody(scheduling)),
      Object.keys(costBody(cost)),
      Object.keys(measureBody(measure)),
    ];
    const all = sets.flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('scope bodies — ported value mappings', () => {
  it('blanks become null, not empty strings', () => {
    const body = generalBody({ ...general, code: '', description: '', parentId: '' });
    expect(body.code).toBeNull();
    expect(body.description).toBeNull();
    expect(body.parentId).toBeNull();
  });

  it('forces duration 0 for a duration-derived type', () => {
    expect(generalBody({ ...general, type: 'START_MILESTONE', durationDays: 9 }).durationDays).toBe(
      0,
    );
    expect(generalBody({ ...general, type: 'WBS_SUMMARY', durationDays: 9 }).durationDays).toBe(0);
    expect(generalBody({ ...general, type: 'LEVEL_OF_EFFORT', durationDays: 9 }).durationDays).toBe(
      0,
    );
  });

  it('keeps an entered duration for a task', () => {
    expect(generalBody({ ...general, durationDays: 7 }).durationDays).toBe(7);
  });

  it('clears both sides of a constraint together', () => {
    const body = schedulingBody({
      ...scheduling,
      constraintType: '',
      constraintDate: '2026-03-10',
    });
    expect(body.constraintType).toBeNull();
    expect(body.constraintDate).toBeNull();
  });

  it('sends a paired constraint through unchanged', () => {
    const body = schedulingBody({
      ...scheduling,
      constraintType: 'SNET',
      constraintDate: '2026-03-10',
    });
    expect(body.constraintType).toBe('SNET');
    expect(body.constraintDate).toBe('2026-03-10');
  });

  it('maps an absent levelling priority to null rather than dropping it', () => {
    expect(schedulingBody(scheduling).levelingPriority).toBeNull();
    expect(schedulingBody({ ...scheduling, levelingPriority: 0 }).levelingPriority).toBe(0);
  });

  it('converts money from major to minor units', () => {
    const body = costBody({ ...cost, budgetedExpense: 1234.56, actualExpense: 0 });
    expect(body.budgetedExpense).toBe(123456);
    expect(body.actualExpense).toBe(0);
  });

  it('maps unset money to null', () => {
    const body = costBody(cost);
    expect(body.budgetedExpense).toBeNull();
    expect(body.actualExpense).toBeNull();
  });

  it('maps an unset physical percent to null, and keeps a zero', () => {
    expect(measureBody(measure).physicalPercentComplete).toBeNull();
    expect(measureBody({ ...measure, physicalPercentComplete: 0 }).physicalPercentComplete).toBe(0);
  });
});
