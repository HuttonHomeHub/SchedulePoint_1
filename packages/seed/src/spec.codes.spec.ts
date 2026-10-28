import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SEED_PLAN_OPTIONS,
  seedCodesSchema,
  seedSpecSchema,
  type SeedSpec,
} from './spec.js';

const activity = {
  key: 'A1',
  code: 'A1',
  name: 'A1',
  type: 'TASK',
  durationMinutes: 1440,
  calendarKey: null,
  parentKey: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  scheduleAsLateAsPossible: false,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  externalEarlyStart: null,
  externalLateFinish: null,
  levelingPriority: null,
  accrualType: 'UNIFORM',
  budgetedExpense: null,
  actualExpense: null,
  steps: [],
  progress: null,
  visualStart: null,
  testTags: [],
};

const codes = {
  types: [{ key: 'area', name: 'Area', values: [{ key: 'gf', shortCode: 'GF' }] }],
};

function spec(overrides: Record<string, unknown>): unknown {
  return {
    seedName: 'codes-unit',
    tier: 'capability',
    plan: {
      name: 'Codes',
      description: null,
      dataDate: '2026-01-05',
      defaultCalendarKey: null,
      currencyCode: null,
      options: DEFAULT_SEED_PLAN_OPTIONS,
    },
    calendars: [],
    resources: [],
    activities: [],
    dependencies: [],
    assignments: [],
    unplaceable: [],
    ...overrides,
  } satisfies Partial<SeedSpec>;
}

describe('a spec that carries activity codes', () => {
  it('accepts an activity naming a value the spec defines, and one naming none', () => {
    const parsed = seedSpecSchema.safeParse(
      spec({
        codes,
        activities: [
          { ...activity, codes: { area: 'gf' } },
          { ...activity, key: 'A2' },
        ],
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('refuses a value key the spec does not define, so a typo is not a silent omission', () => {
    const parsed = seedSpecSchema.safeParse(
      spec({ codes, activities: [{ ...activity, codes: { area: 'nope' } }] }),
    );
    expect(parsed.success).toBe(false);
  });

  it('refuses a type key the spec does not define, and codes with no code types at all', () => {
    expect(
      seedSpecSchema.safeParse(
        spec({ codes, activities: [{ ...activity, codes: { trade: 'gf' } }] }),
      ).success,
    ).toBe(false);
    expect(
      seedSpecSchema.safeParse(spec({ activities: [{ ...activity, codes: { area: 'gf' } }] }))
        .success,
    ).toBe(false);
  });

  it('refuses a duplicate type key and a duplicate value key within a type', () => {
    const duplicateType = { types: [...codes.types, ...codes.types] };
    expect(seedSpecSchema.safeParse(spec({ codes: duplicateType })).success).toBe(false);
    const value = { key: 'gf', shortCode: 'GF' };
    const duplicateValue = { types: [{ key: 'area', name: 'Area', values: [value, value] }] };
    expect(seedSpecSchema.safeParse(spec({ codes: duplicateValue })).success).toBe(false);
  });

  it('bounds a name and a short code as the API does', () => {
    const overlong = (length: number) => 'x'.repeat(length);
    const typeNamed = (name: string) => ({ types: [{ key: 'a', name, values: [] }] });
    expect(seedCodesSchema.safeParse(typeNamed(overlong(80))).success).toBe(true);
    expect(seedCodesSchema.safeParse(typeNamed(overlong(81))).success).toBe(false);
    const valued = (shortCode: string) => ({
      types: [{ key: 'a', name: 'A', values: [{ key: 'v', shortCode }] }],
    });
    expect(seedCodesSchema.safeParse(valued(overlong(81))).success).toBe(false);
  });
});
