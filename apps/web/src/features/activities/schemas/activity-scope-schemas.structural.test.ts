import { describe, expect, it } from 'vitest';

import { activityFormSchema } from './activity-schemas';
import {
  activityCostShape,
  activityGeneralShape,
  activityMeasureShape,
  activitySchedulingSchema,
  activitySchedulingShape,
} from './activity-scope-schemas';

/**
 * The gate that makes the ADR-0060 §3 schema split safe.
 *
 * Splitting one 22-field schema into four is a refactor whose worst failure mode is silent: a
 * dropped field still compiles, still renders, still saves — it just stops being validated, and
 * nothing says so. So the split is not trusted, it is *computed*: the union of the four scope
 * shapes must equal `activityFormSchema`'s keys exactly, in both directions, and no key may
 * appear twice.
 *
 * If this test fails after a field is added, the fix is to put the field in a scope — never to
 * relax the assertion.
 */

const SHAPES = {
  general: activityGeneralShape,
  scheduling: activitySchedulingShape,
  measure: activityMeasureShape,
  cost: activityCostShape,
} as const;

const scopeKeys = (scope: keyof typeof SHAPES): string[] => Object.keys(SHAPES[scope]);
const allScopeKeys = (): string[] => Object.values(SHAPES).flatMap((shape) => Object.keys(shape));

/** `activityFormSchema` is a ZodObject behind three `.refine()` calls; unwrap to reach `.shape`. */
function formSchemaKeys(): string[] {
  let current: unknown = activityFormSchema;
  while (
    current &&
    typeof current === 'object' &&
    'def' in current &&
    (current as { def: { type?: string; innerType?: unknown } }).def.type === 'custom'
  ) {
    current = (current as { def: { innerType: unknown } }).def.innerType;
  }
  const shape = (current as { shape?: Record<string, unknown> }).shape;
  if (!shape) throw new Error('could not reach activityFormSchema’s object shape');
  return Object.keys(shape);
}

describe('activity scope schemas — structural', () => {
  it('partitions activityFormSchema exactly (no field dropped, none invented)', () => {
    expect([...allScopeKeys()].sort()).toEqual([...formSchemaKeys()].sort());
  });

  it('assigns every key to exactly one scope', () => {
    const keys = allScopeKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the scopes non-empty and disjoint', () => {
    const seen = new Set<string>();
    for (const scope of Object.keys(SHAPES) as (keyof typeof SHAPES)[]) {
      const keys = scopeKeys(scope);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  // A refinement whose `path` points at a field outside its own scope would throw at runtime and
  // compile fine — the one failure mode the key-union test above cannot see.
  it('resolves every scheduling refinement path inside the scheduling shape', () => {
    const paths = ['constraintDate', 'secondaryConstraintDate', 'externalLateFinish'];
    for (const path of paths) {
      expect(Object.keys(activitySchedulingShape)).toContain(path);
    }
  });
});

describe('activity scope schemas — ported refinement cases', () => {
  const valid = {
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

  it('rejects a primary constraint type with no date', () => {
    const result = activitySchedulingSchema.safeParse({
      ...valid,
      constraintType: 'SNET',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['constraintDate']);
  });

  it('rejects a secondary constraint type with no date', () => {
    const result = activitySchedulingSchema.safeParse({
      ...valid,
      secondaryConstraintType: 'FNLT',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['secondaryConstraintDate']);
  });

  it('rejects an external late finish before the external early start (N26)', () => {
    const result = activitySchedulingSchema.safeParse({
      ...valid,
      externalEarlyStart: '2026-03-10',
      externalLateFinish: '2026-03-09',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['externalLateFinish']);
  });

  it('accepts equal external dates (the boundary is inclusive)', () => {
    expect(
      activitySchedulingSchema.safeParse({
        ...valid,
        externalEarlyStart: '2026-03-10',
        externalLateFinish: '2026-03-10',
      }).success,
    ).toBe(true);
  });

  it('accepts a constraint type paired with its date', () => {
    expect(
      activitySchedulingSchema.safeParse({
        ...valid,
        constraintType: 'SNET',
        constraintDate: '2026-03-10',
      }).success,
    ).toBe(true);
  });
});
