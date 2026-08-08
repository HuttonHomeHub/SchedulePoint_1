import { MONEY_MINOR_UNITS_MAX } from '@repo/types';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { BulkDeleteActivitiesDto } from './bulk-delete-activities.dto';
import { CreateActivityDto } from './create-activity.dto';
import { UpdateActivityDto } from './update-activity.dto';
import { UpdateParentsDto } from './update-parents.dto';
import { UpdatePlacementsDto } from './update-placements.dto';

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

/**
 * The batch **placement** DTO (`docs/specs/canvas-multi-select/` M1-T1).
 *
 * The assertion this file exists for is the one the docblock on `ActivityPlacementDto` argues:
 * every field is **required but nullable**, so an omitted field is a validation error and never a
 * silent clear. `@IsOptional()` would pass all of these and quietly unpin forty activities from one
 * forgotten key, which is why each field gets its own omission case rather than one representative.
 */
describe('UpdatePlacementsDto (M1-T1)', () => {
  const UUID = '11111111-1111-4111-8111-111111111111';
  const row = (over: Record<string, unknown> = {}) => ({
    id: UUID,
    version: 1,
    constraintType: null,
    constraintDate: null,
    visualStart: null,
    laneIndex: null,
    ...over,
  });

  it('accepts a complete all-null row (nothing pinned, lane unchanged)', () => {
    expect(errorsFor(UpdatePlacementsDto, { placements: [row()] })).toHaveLength(0);
  });

  it('accepts a paired constraint, a visualStart and a lane', () => {
    const errors = errorsFor(UpdatePlacementsDto, {
      placements: [
        row({
          constraintType: 'SNET',
          constraintDate: '2026-04-13',
          visualStart: '2026-04-14',
          laneIndex: 6,
        }),
      ],
    });
    expect(errors).toHaveLength(0);
  });

  for (const field of ['constraintType', 'constraintDate', 'visualStart', 'laneIndex'] as const) {
    it(`rejects an omitted ${field} rather than reading it as a clear`, () => {
      const incomplete = row();
      delete (incomplete as Record<string, unknown>)[field];
      expect(errorsFor(UpdatePlacementsDto, { placements: [incomplete] })).not.toHaveLength(0);
    });
  }

  it('rejects a constraint type without its date, and a date without its type', () => {
    expect(
      errorsFor(UpdatePlacementsDto, { placements: [row({ constraintType: 'SNET' })] }),
    ).not.toHaveLength(0);
    expect(
      errorsFor(UpdatePlacementsDto, { placements: [row({ constraintDate: '2026-04-13' })] }),
    ).not.toHaveLength(0);
  });

  it('rejects a malformed date, a negative lane, and a lane above the ceiling', () => {
    expect(
      errorsFor(UpdatePlacementsDto, { placements: [row({ visualStart: '13/04/2026' })] }),
    ).not.toHaveLength(0);
    expect(
      errorsFor(UpdatePlacementsDto, { placements: [row({ laneIndex: -1 })] }),
    ).not.toHaveLength(0);
    expect(
      errorsFor(UpdatePlacementsDto, { placements: [row({ laneIndex: 10001 })] }),
    ).not.toHaveLength(0);
  });

  it('rejects an empty batch and one above the 2,000-row cap', () => {
    expect(errorsFor(UpdatePlacementsDto, { placements: [] })).not.toHaveLength(0);
    const placements = Array.from({ length: 2001 }, () => row());
    expect(errorsFor(UpdatePlacementsDto, { placements })).not.toHaveLength(0);
  });

  it('rejects a non-UUID id and a version below 1', () => {
    expect(errorsFor(UpdatePlacementsDto, { placements: [row({ id: 'nope' })] })).not.toHaveLength(
      0,
    );
    expect(errorsFor(UpdatePlacementsDto, { placements: [row({ version: 0 })] })).not.toHaveLength(
      0,
    );
  });
});

/** The bulk-delete DTO: rows, not parallel arrays — a length mismatch would fail silently. */
describe('BulkDeleteActivitiesDto (M1-T5)', () => {
  const UUID = '11111111-1111-4111-8111-111111111111';
  const ref = (over: Record<string, unknown> = {}) => ({ id: UUID, version: 1, ...over });

  it('accepts a well-formed batch', () => {
    expect(errorsFor(BulkDeleteActivitiesDto, { activities: [ref()] })).toHaveLength(0);
  });

  it('rejects an empty batch, an over-cap batch, a bad id and a version below 1', () => {
    expect(errorsFor(BulkDeleteActivitiesDto, { activities: [] })).not.toHaveLength(0);
    expect(
      errorsFor(BulkDeleteActivitiesDto, {
        activities: Array.from({ length: 2001 }, () => ref()),
      }),
    ).not.toHaveLength(0);
    expect(
      errorsFor(BulkDeleteActivitiesDto, { activities: [ref({ id: 'nope' })] }),
    ).not.toHaveLength(0);
    expect(
      errorsFor(BulkDeleteActivitiesDto, { activities: [ref({ version: 0 })] }),
    ).not.toHaveLength(0);
  });
});
