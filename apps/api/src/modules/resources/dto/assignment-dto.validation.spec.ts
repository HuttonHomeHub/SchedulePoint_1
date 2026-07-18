import { DECIMAL_18_4_MAX, MONEY_MINOR_UNITS_MAX } from '@repo/types';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateAssignmentDto } from './create-assignment.dto';
import { UpdateAssignmentDto } from './update-assignment.dto';

/**
 * Boundary validation for the M7 rung 4 (ADR-0040) assignment DTO fields: `unitsPerHour` (N19,
 * a non-negative exact numeric) and `editedField` (only UNITS / UNITS_PER_HOUR — a DURATION edit is
 * an activity write, rejected here as a clean 400/422). Mirrors the ValidationPipe's whitelist.
 */
const RESOURCE_ID = '00000000-0000-0000-0000-0000000000re';

function errorsFor<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload);
  return validateSync(dto as object, { whitelist: true });
}

describe('assignment DTO validation (ADR-0040 N19 / editedField)', () => {
  it('rejects a negative unitsPerHour (N19) on create', () => {
    const errors = errorsFor(CreateAssignmentDto, { resourceId: RESOURCE_ID, unitsPerHour: -1 });
    expect(errors.some((e) => e.property === 'unitsPerHour')).toBe(true);
  });

  it('rejects a negative unitsPerHour (N19) on update', () => {
    const errors = errorsFor(UpdateAssignmentDto, { version: 1, unitsPerHour: -0.5 });
    expect(errors.some((e) => e.property === 'unitsPerHour')).toBe(true);
  });

  it('accepts a non-negative unitsPerHour and a valid editedField', () => {
    const errors = errorsFor(UpdateAssignmentDto, {
      version: 1,
      unitsPerHour: 12.5,
      editedField: 'UNITS_PER_HOUR',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid curveType and rejects an unknown one (ADR-0044 §3 / ADR-0035 §31)', () => {
    const ok = errorsFor(UpdateAssignmentDto, { version: 1, curveType: 'BELL' });
    expect(ok.some((e) => e.property === 'curveType')).toBe(false);
    const bad = errorsFor(CreateAssignmentDto, { resourceId: RESOURCE_ID, curveType: 'S_CURVE' });
    expect(bad.some((e) => e.property === 'curveType')).toBe(true);
    const badUpdate = errorsFor(UpdateAssignmentDto, { version: 1, curveType: 'wobbly' });
    expect(badUpdate.some((e) => e.property === 'curveType')).toBe(true);
  });

  it('rejects editedField = DURATION (a duration edit is an activity write, not an assignment one)', () => {
    const errors = errorsFor(UpdateAssignmentDto, { version: 1, editedField: 'DURATION' });
    expect(errors.some((e) => e.property === 'editedField')).toBe(true);
  });

  it('rejects more than 4 fractional digits on unitsPerHour (Decimal(18,4) storage)', () => {
    const errors = errorsFor(CreateAssignmentDto, {
      resourceId: RESOURCE_ID,
      unitsPerHour: 1.23456,
    });
    expect(errors.some((e) => e.property === 'unitsPerHour')).toBe(true);
  });
});

/**
 * Overflow-ceiling boundary for the money (`budgetedCost`/`actualCost`, integer minor-unit BIGINT)
 * and Decimal(18,4) units/rate (`budgetedUnits`/`unitsPerHour`/`actualUnits`) fields (TECH_DEBT
 * #40a): a value one above the ceiling is a clean 422 rather than a BIGINT/Decimal overflow 500; a
 * value AT the ceiling passes.
 */
describe('assignment DTO @Max overflow guards (TECH_DEBT #40a)', () => {
  const DECIMAL_FIELDS = ['budgetedUnits', 'unitsPerHour', 'actualUnits'] as const;
  const MONEY_FIELDS = ['budgetedCost', 'actualCost'] as const;

  for (const field of DECIMAL_FIELDS) {
    it(`rejects ${field} one above DECIMAL_18_4_MAX on create`, () => {
      const errors = errorsFor(CreateAssignmentDto, {
        resourceId: RESOURCE_ID,
        [field]: DECIMAL_18_4_MAX + 1,
      });
      expect(errors.some((e) => e.property === field)).toBe(true);
    });

    it(`accepts ${field} exactly at DECIMAL_18_4_MAX on create`, () => {
      const errors = errorsFor(CreateAssignmentDto, {
        resourceId: RESOURCE_ID,
        [field]: DECIMAL_18_4_MAX,
      });
      expect(errors.some((e) => e.property === field)).toBe(false);
    });

    it(`rejects ${field} one above DECIMAL_18_4_MAX on update`, () => {
      const errors = errorsFor(UpdateAssignmentDto, { version: 1, [field]: DECIMAL_18_4_MAX + 1 });
      expect(errors.some((e) => e.property === field)).toBe(true);
    });
  }

  for (const field of MONEY_FIELDS) {
    it(`rejects ${field} one above MONEY_MINOR_UNITS_MAX on create`, () => {
      const errors = errorsFor(CreateAssignmentDto, {
        resourceId: RESOURCE_ID,
        [field]: MONEY_MINOR_UNITS_MAX + 1,
      });
      expect(errors.some((e) => e.property === field)).toBe(true);
    });

    it(`accepts ${field} exactly at MONEY_MINOR_UNITS_MAX on create`, () => {
      const errors = errorsFor(CreateAssignmentDto, {
        resourceId: RESOURCE_ID,
        [field]: MONEY_MINOR_UNITS_MAX,
      });
      expect(errors.some((e) => e.property === field)).toBe(false);
    });

    it(`rejects ${field} one above MONEY_MINOR_UNITS_MAX on update`, () => {
      const errors = errorsFor(UpdateAssignmentDto, {
        version: 1,
        [field]: MONEY_MINOR_UNITS_MAX + 1,
      });
      expect(errors.some((e) => e.property === field)).toBe(true);
    });
  }
});
