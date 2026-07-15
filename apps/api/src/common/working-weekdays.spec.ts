import { ALL_WEEKDAYS_MASK, STANDARD_WEEKDAYS_MASK, WEEKDAYS, WorkingWeekdays } from '@repo/types';
import { describe, expect, it } from 'vitest';

// The shared bitmask contract (@repo/types) that the API DTO validates against and
// the web weekday toggle group binds to. These tests pin its semantics.
describe('WorkingWeekdays (shared @repo/types bitmask helper)', () => {
  it('has seven named weekdays, Monday first', () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS[0]).toBe('MONDAY');
    expect(WEEKDAYS[6]).toBe('SUNDAY');
  });

  it('accepts valid masks and rejects out-of-range / non-integers', () => {
    expect(WorkingWeekdays.isValid(STANDARD_WEEKDAYS_MASK)).toBe(true);
    expect(WorkingWeekdays.isValid(ALL_WEEKDAYS_MASK)).toBe(true);
    expect(WorkingWeekdays.isValid(1)).toBe(true);
    // Empty pattern (0) is invalid — it would make addWorkingDays non-terminating.
    expect(WorkingWeekdays.isValid(0)).toBe(false);
    expect(WorkingWeekdays.isValid(128)).toBe(false);
    expect(WorkingWeekdays.isValid(-1)).toBe(false);
    expect(WorkingWeekdays.isValid(1.5)).toBe(false);
  });

  it('reads the right bits (Mon–Fri worked, Sat/Sun not)', () => {
    for (let i = 0; i < 5; i += 1)
      expect(WorkingWeekdays.has(STANDARD_WEEKDAYS_MASK, i)).toBe(true);
    expect(WorkingWeekdays.has(STANDARD_WEEKDAYS_MASK, 5)).toBe(false); // Saturday
    expect(WorkingWeekdays.has(STANDARD_WEEKDAYS_MASK, 6)).toBe(false); // Sunday
  });

  it('toggles a weekday in and out, staying within the 7-bit week', () => {
    const withSat = WorkingWeekdays.toggle(STANDARD_WEEKDAYS_MASK, 5); // add Saturday
    expect(WorkingWeekdays.has(withSat, 5)).toBe(true);
    expect(WorkingWeekdays.toggle(withSat, 5)).toBe(STANDARD_WEEKDAYS_MASK); // back off
    expect(withSat).toBeLessThanOrEqual(ALL_WEEKDAYS_MASK);
  });

  it('round-trips mask ↔ indices', () => {
    expect(WorkingWeekdays.toIndices(STANDARD_WEEKDAYS_MASK)).toEqual([0, 1, 2, 3, 4]);
    expect(WorkingWeekdays.toIndices(ALL_WEEKDAYS_MASK)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const mask of [1, STANDARD_WEEKDAYS_MASK, ALL_WEEKDAYS_MASK, 0b1010101]) {
      expect(WorkingWeekdays.fromIndices(WorkingWeekdays.toIndices(mask))).toBe(mask);
    }
  });

  it('fromIndices ignores out-of-range indices', () => {
    expect(WorkingWeekdays.fromIndices([0, 4, 7, -1, 99])).toBe(
      WorkingWeekdays.fromIndices([0, 4]),
    );
  });
});
