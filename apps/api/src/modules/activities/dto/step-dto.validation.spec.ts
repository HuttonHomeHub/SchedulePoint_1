import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ActivityStepInputDto, ReplaceStepsDto } from './replace-steps.dto';

/**
 * Boundary validation for the activity-steps bulk-replace DTO (M7 rung 5, ADR-0044 §2). The load-bearing
 * case is **N28** — a step `percentComplete` outside 0–100 is a clean 422 boundary reject
 * (`STEP_PERCENT_OUT_OF_RANGE`, the global ValidationPipe status), mirroring the ADR-0042 physical-% N23
 * reject; the DB CHECK `ck_activity_steps_percent_complete_range` is the backstop. `weight` carries the
 * `>= 0` boundary (N-weight), and `name` is bounded 1–200. Mirrors `assignment-dto.validation.spec.ts`.
 */
function errorsFor<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload);
  return validateSync(dto as object, { whitelist: true });
}

describe('activity-step DTO validation (ADR-0044 §2 N28)', () => {
  const validStep = { name: 'Drive piles', weight: 35, percentComplete: 70 };

  it('accepts a well-formed step', () => {
    expect(errorsFor(ActivityStepInputDto, validStep)).toHaveLength(0);
  });

  it('N28 — rejects a percentComplete above 100', () => {
    const errors = errorsFor(ActivityStepInputDto, { ...validStep, percentComplete: 150 });
    expect(errors.some((e) => e.property === 'percentComplete')).toBe(true);
  });

  it('N28 — rejects a negative percentComplete', () => {
    const errors = errorsFor(ActivityStepInputDto, { ...validStep, percentComplete: -1 });
    expect(errors.some((e) => e.property === 'percentComplete')).toBe(true);
  });

  it('rejects a non-integer percentComplete', () => {
    const errors = errorsFor(ActivityStepInputDto, { ...validStep, percentComplete: 42.5 });
    expect(errors.some((e) => e.property === 'percentComplete')).toBe(true);
  });

  it('rejects a negative weight', () => {
    const errors = errorsFor(ActivityStepInputDto, { ...validStep, weight: -0.5 });
    expect(errors.some((e) => e.property === 'weight')).toBe(true);
  });

  it('rejects more than 4 fractional digits on weight (Decimal(18,4) storage)', () => {
    const errors = errorsFor(ActivityStepInputDto, { ...validStep, weight: 1.23456 });
    expect(errors.some((e) => e.property === 'weight')).toBe(true);
  });

  it('rejects an empty name and an over-long name', () => {
    expect(
      errorsFor(ActivityStepInputDto, { ...validStep, name: '' }).some(
        (e) => e.property === 'name',
      ),
    ).toBe(true);
    expect(
      errorsFor(ActivityStepInputDto, { ...validStep, name: 'x'.repeat(201) }).some(
        (e) => e.property === 'name',
      ),
    ).toBe(true);
  });

  it('accepts an empty steps list (clears the checklist) with a valid version', () => {
    expect(errorsFor(ReplaceStepsDto, { version: 1, steps: [] })).toHaveLength(0);
  });

  it('N28 — a bad nested step surfaces through the bulk-replace body', () => {
    const errors = errorsFor(ReplaceStepsDto, {
      version: 1,
      steps: [validStep, { name: 'Bad', weight: 1, percentComplete: 101 }],
    });
    expect(errors.some((e) => e.property === 'steps')).toBe(true);
  });

  it('requires a positive version', () => {
    const errors = errorsFor(ReplaceStepsDto, { version: 0, steps: [] });
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });
});
