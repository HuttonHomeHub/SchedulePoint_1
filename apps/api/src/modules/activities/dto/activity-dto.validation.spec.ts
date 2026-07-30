import { MONEY_MINOR_UNITS_MAX } from '@repo/types';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateActivityDto } from './create-activity.dto';
import { UpdateActivityDto } from './update-activity.dto';
import { UpdateParentsDto } from './update-parents.dto';

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

/**
 * `UpdateParentsDto` shape guards. The batch is all-or-nothing and structural, so a malformed row
 * must be a clean 422 at the boundary rather than something the service has to reason about.
 */
describe('UpdateParentsDto', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: '019f0000-0000-7000-8000-000000000001',
    parentId: '019f0000-0000-7000-8000-000000000002',
    version: 1,
    ...over,
  });

  it('accepts a well-formed batch', () => {
    expect(errorsFor(UpdateParentsDto, { parents: [row()] })).toHaveLength(0);
  });

  it('accepts a null parentId (clear to top level)', () => {
    expect(errorsFor(UpdateParentsDto, { parents: [row({ parentId: null })] })).toHaveLength(0);
  });

  it('rejects an empty batch', () => {
    expect(errorsFor(UpdateParentsDto, { parents: [] })).not.toHaveLength(0);
  });

  it('rejects a batch above the 2,000-row cap', () => {
    const parents = Array.from({ length: 2001 }, () => row());
    expect(errorsFor(UpdateParentsDto, { parents })).not.toHaveLength(0);
  });

  it('rejects a non-UUID id and a non-UUID parentId', () => {
    expect(errorsFor(UpdateParentsDto, { parents: [row({ id: 'nope' })] })).not.toHaveLength(0);
    expect(errorsFor(UpdateParentsDto, { parents: [row({ parentId: 'nope' })] })).not.toHaveLength(
      0,
    );
  });

  it('rejects a version below 1', () => {
    expect(errorsFor(UpdateParentsDto, { parents: [row({ version: 0 })] })).not.toHaveLength(0);
  });
});
