import { describe, expect, it } from 'vitest';

import { formatDurationDays, previewDerivedDuration } from './duration-triad';

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

describe('formatDurationDays', () => {
  it('shows whole days as an integer, singular for one day', () => {
    expect(formatDurationDays(2880)).toBe('2 days');
    expect(formatDurationDays(1440)).toBe('1 day');
    expect(formatDurationDays(0)).toBe('0 days');
  });

  it('shows a fractional derived duration to one decimal place', () => {
    expect(formatDurationDays(2160)).toBe('1.5 days'); // 1.5 days
    expect(formatDurationDays(720)).toBe('0.5 days'); // half a day
  });
});
