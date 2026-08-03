import { describe, expect, it } from 'vitest';

import { formatDerivedDuration, previewDerivedDuration } from './duration-triad';

/**
 * The client-side duration-derivation preview (ADR-0040) — a focused mirror of the server's
 * `resolveTriad` for the one user-visible cross-resource effect (a driving assignment's units/rate
 * deriving the activity's duration). The server stays authoritative; these pin that the hint matches.
 */
describe('previewDerivedDuration', () => {
  it('derives the duration for FIXED_UNITS on a rate edit (D := U / R)', () => {
    // 240 units ÷ 5 units/working-hour = 48 working hours = 2 days (2880 min).
    expect(
      previewDerivedDuration('FIXED_UNITS', 'UNITS_PER_HOUR', {
        budgetedUnits: 240,
        unitsPerHour: 5,
      }),
    ).toEqual({ kind: 'derived', durationMinutes: 2880 });
  });

  it('derives the duration for FIXED_UNITS_TIME on a units edit (D := U / R)', () => {
    expect(
      previewDerivedDuration('FIXED_UNITS_TIME', 'UNITS', {
        budgetedUnits: 240,
        unitsPerHour: 5,
      }),
    ).toEqual({ kind: 'derived', durationMinutes: 2880 });
  });

  it('rounds a fractional working-minute result half-up to a whole minute', () => {
    // 10 units ÷ 3 units/hour = 3.3333 h = 200.0 min exactly here; use a case that rounds:
    // 1 unit ÷ 7 units/hour = 0.142857 h = 8.571 min → rounds to 9.
    expect(
      previewDerivedDuration('FIXED_UNITS', 'UNITS_PER_HOUR', {
        budgetedUnits: 1,
        unitsPerHour: 7,
      }),
    ).toEqual({ kind: 'derived', durationMinutes: 9 });
  });

  it('returns null when the (type, edited) pair holds the duration (no derivation to preview)', () => {
    // FIXED_UNITS on a UNITS edit recomputes the RATE, not the duration.
    expect(
      previewDerivedDuration('FIXED_UNITS', 'UNITS', { budgetedUnits: 240, unitsPerHour: 5 }),
    ).toBeNull();
    // The two fixed-duration types never derive the duration.
    expect(
      previewDerivedDuration('FIXED_DURATION_AND_UNITS', 'UNITS', {
        budgetedUnits: 240,
        unitsPerHour: 5,
      }),
    ).toBeNull();
    expect(
      previewDerivedDuration('FIXED_DURATION_AND_UNITS_TIME', 'UNITS_PER_HOUR', {
        budgetedUnits: 240,
        unitsPerHour: 5,
      }),
    ).toBeNull();
  });

  it('blocks a zero (or negative) rate on a units-driven derivation (the N20 mirror)', () => {
    expect(
      previewDerivedDuration('FIXED_UNITS', 'UNITS_PER_HOUR', {
        budgetedUnits: 240,
        unitsPerHour: 0,
      }),
    ).toEqual({ kind: 'blocked' });
    expect(
      previewDerivedDuration('FIXED_UNITS_TIME', 'UNITS', {
        budgetedUnits: 240,
        unitsPerHour: -1,
      }),
    ).toEqual({ kind: 'blocked' });
  });
});

describe('formatDerivedDuration', () => {
  it('measures days against the calendar it is given, not a flat 1440', () => {
    // The regression this function exists for. 480 minutes is ONE working day on an eight-hour
    // calendar and a THIRD of one on a 24-hour calendar. The previous implementation divided by a
    // flat 1440 and told an eight-hour planner their one-day derivation was "0.3 days".
    expect(formatDerivedDuration(480, 8)).toBe('1d');
    expect(formatDerivedDuration(480, 24)).toBe('8h');
  });

  it('renders whole and part days in the same d/h/m grammar the duration field uses', () => {
    expect(formatDerivedDuration(2880, 24)).toBe('2d');
    expect(formatDerivedDuration(2400, 8)).toBe('5d');
    expect(formatDerivedDuration(600, 8)).toBe('1d 2h');
    expect(formatDerivedDuration(150, 8)).toBe('2h 30m');
  });

  it('degrades to hours and minutes when the calendar has not resolved', () => {
    // Never a guessed factor: with no calendar, days cannot be stated at all, so the text says only
    // what is knowable without one.
    expect(formatDerivedDuration(480, undefined)).toBe('8h');
    expect(formatDerivedDuration(150, undefined)).toBe('2h 30m');
  });

  it('renders a zero derivation as a real value rather than blank', () => {
    expect(formatDerivedDuration(0, 8)).toBe('0d');
    expect(formatDerivedDuration(0, undefined)).toBe('0d');
  });
});
