import { MONEY_MINOR_UNITS_MAX } from '@repo/types';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateActivityDto } from './create-activity.dto';
import { UpdateActivityDto } from './update-activity.dto';

/**
 * Overflow-ceiling boundary for the activity money fields `budgetedExpense` / `actualExpense`
 * (integer minor-unit BIGINT, TECH_DEBT #40a): a value one above MONEY_MINOR_UNITS_MAX is a clean
 * 422 rather than a BIGINT/precision-loss 500; a value AT the ceiling passes. Mirrors the
 * ValidationPipe's whitelist.
 */
function errorsFor<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload);
  return validateSync(dto as object, { whitelist: true });
}

const MONEY_FIELDS = ['budgetedExpense', 'actualExpense'] as const;

describe('activity DTO @Max overflow guards (TECH_DEBT #40a)', () => {
  for (const field of MONEY_FIELDS) {
    it(`rejects ${field} one above MONEY_MINOR_UNITS_MAX on create`, () => {
      const errors = errorsFor(CreateActivityDto, {
        name: 'A',
        [field]: MONEY_MINOR_UNITS_MAX + 1,
      });
      expect(errors.some((e) => e.property === field)).toBe(true);
    });

    it(`accepts ${field} exactly at MONEY_MINOR_UNITS_MAX on create`, () => {
      const errors = errorsFor(CreateActivityDto, {
        name: 'A',
        [field]: MONEY_MINOR_UNITS_MAX,
      });
      expect(errors.some((e) => e.property === field)).toBe(false);
    });

    it(`rejects ${field} one above MONEY_MINOR_UNITS_MAX on update`, () => {
      const errors = errorsFor(UpdateActivityDto, {
        version: 1,
        [field]: MONEY_MINOR_UNITS_MAX + 1,
      });
      expect(errors.some((e) => e.property === field)).toBe(true);
    });

    it(`accepts ${field} exactly at MONEY_MINOR_UNITS_MAX on update`, () => {
      const errors = errorsFor(UpdateActivityDto, {
        version: 1,
        [field]: MONEY_MINOR_UNITS_MAX,
      });
      expect(errors.some((e) => e.property === field)).toBe(false);
    });
  }
});
