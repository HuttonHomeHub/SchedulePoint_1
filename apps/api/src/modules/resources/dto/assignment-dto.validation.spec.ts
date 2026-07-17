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
