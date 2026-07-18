import { DECIMAL_18_4_MAX } from '@repo/types';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateResourceDto } from './create-resource.dto';
import { UpdateResourceDto } from './update-resource.dto';

/**
 * Overflow-ceiling boundary for the resource Decimal(18,4) rate fields `costPerUnit` /
 * `maxUnitsPerHour` (TECH_DEBT #40a): a value one above DECIMAL_18_4_MAX is a clean 422 rather than
 * a Decimal(18,4) overflow 500; a value AT the ceiling passes. Mirrors the ValidationPipe's whitelist.
 */
function errorsFor<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload);
  return validateSync(dto as object, { whitelist: true });
}

const DECIMAL_FIELDS = ['costPerUnit', 'maxUnitsPerHour'] as const;

describe('resource DTO @Max overflow guards (TECH_DEBT #40a)', () => {
  for (const field of DECIMAL_FIELDS) {
    it(`rejects ${field} one above DECIMAL_18_4_MAX on create`, () => {
      const errors = errorsFor(CreateResourceDto, {
        name: 'Crew',
        kind: 'LABOUR',
        [field]: DECIMAL_18_4_MAX + 1,
      });
      expect(errors.some((e) => e.property === field)).toBe(true);
    });

    it(`accepts ${field} exactly at DECIMAL_18_4_MAX on create`, () => {
      const errors = errorsFor(CreateResourceDto, {
        name: 'Crew',
        kind: 'LABOUR',
        [field]: DECIMAL_18_4_MAX,
      });
      expect(errors.some((e) => e.property === field)).toBe(false);
    });

    it(`rejects ${field} one above DECIMAL_18_4_MAX on update`, () => {
      const errors = errorsFor(UpdateResourceDto, {
        version: 1,
        [field]: DECIMAL_18_4_MAX + 1,
      });
      expect(errors.some((e) => e.property === field)).toBe(true);
    });

    it(`accepts ${field} exactly at DECIMAL_18_4_MAX on update`, () => {
      const errors = errorsFor(UpdateResourceDto, {
        version: 1,
        [field]: DECIMAL_18_4_MAX,
      });
      expect(errors.some((e) => e.property === field)).toBe(false);
    });
  }
});
