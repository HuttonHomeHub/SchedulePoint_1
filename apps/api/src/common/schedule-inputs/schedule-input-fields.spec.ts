import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_FIELD_CLASS,
  ASSIGNMENT_FIELD_CLASS,
  changedInputs,
} from './schedule-input-fields';

describe('changedInputs', () => {
  const before = {
    durationMinutes: 1440,
    laneIndex: 2,
    name: 'Pour slab',
    constraintDate: new Date('2026-03-01T00:00:00Z'),
    constraintType: null,
  };

  it('is false for a NOT_INPUT field however much it moves', () => {
    expect(changedInputs(ACTIVITY_FIELD_CLASS, before, { laneIndex: 9, name: 'Renamed' })).toBe(
      false,
    );
  });

  it('is true when an INPUT field takes a different value', () => {
    expect(changedInputs(ACTIVITY_FIELD_CLASS, before, { durationMinutes: 2880 })).toBe(true);
  });

  it('is true when one changed INPUT sits beside a field that did not change', () => {
    expect(
      changedInputs(ACTIVITY_FIELD_CLASS, before, {
        durationMinutes: 1440,
        constraintType: 'SNET',
      }),
    ).toBe(true);
  });

  it('is false for an INPUT field resent with the value the row already holds', () => {
    expect(changedInputs(ACTIVITY_FIELD_CLASS, before, { durationMinutes: 1440 })).toBe(false);
  });

  it('leaves a field the patch does not name (undefined) untouched', () => {
    expect(changedInputs(ACTIVITY_FIELD_CLASS, before, { durationMinutes: undefined })).toBe(false);
  });

  it('compares a Date by instant, not by reference', () => {
    expect(
      changedInputs(ACTIVITY_FIELD_CLASS, before, {
        constraintDate: new Date('2026-03-01T00:00:00Z'),
      }),
    ).toBe(false);
    expect(
      changedInputs(ACTIVITY_FIELD_CLASS, before, {
        constraintDate: new Date('2026-03-02T00:00:00Z'),
      }),
    ).toBe(true);
  });

  it('treats null as a value, so clearing a set field is a change and re-clearing is not', () => {
    expect(changedInputs(ACTIVITY_FIELD_CLASS, before, { constraintDate: null })).toBe(true);
    expect(changedInputs(ACTIVITY_FIELD_CLASS, before, { constraintType: null })).toBe(false);
  });

  it('treats a stored null and a missing property alike', () => {
    expect(changedInputs(ACTIVITY_FIELD_CLASS, {}, { constraintType: null })).toBe(false);
  });

  it('compares a Decimal by value against a number', () => {
    const row = { unitsPerHour: new Prisma.Decimal('2.5000'), curveType: 'UNIFORM' };
    expect(changedInputs(ASSIGNMENT_FIELD_CLASS, row, { unitsPerHour: 2.5 })).toBe(false);
    expect(changedInputs(ASSIGNMENT_FIELD_CLASS, row, { unitsPerHour: 3 })).toBe(true);
    expect(changedInputs(ASSIGNMENT_FIELD_CLASS, row, { unitsPerHour: null })).toBe(true);
    expect(changedInputs(ASSIGNMENT_FIELD_CLASS, row, { curveType: 'FRONT_LOADED' })).toBe(false);
  });
});
