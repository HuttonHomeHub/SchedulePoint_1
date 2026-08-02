import { describe, expect, it, vi } from 'vitest';

/**
 * The Duration column's read-out with `VITE_SUB_DAY_DURATIONS` **on** (ADR-0070 M4).
 *
 * The defect it closes: a four-hour lift typed into the M1 field read back as `0 d`, which is what
 * the table also prints for a milestone — so the one screen that lists a plan's work showed a real
 * activity as having none.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SUB_DAY_DURATIONS_ENABLED: true,
}));

const { formatDurationRead } = await import('./duration-field');

/** An eight-hour working day — so a day is 480 minutes and not 1440 (ADR-0068). */
const EIGHT = 8;

describe('formatDurationRead', () => {
  it('renders the exact value when the duration is not a whole number of days', () => {
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 240 }, EIGHT)).toBe('4h');
    expect(formatDurationRead({ durationDays: 2, durationMinutes: 1200 }, EIGHT)).toBe('2d 4h');
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 90 }, EIGHT)).toBe('1h 30m');
  });

  it('keeps the shape a whole-day duration has always had', () => {
    expect(formatDurationRead({ durationDays: 5, durationMinutes: 2400 }, EIGHT)).toBe('5 d');
    expect(formatDurationRead({ durationDays: 1, durationMinutes: 480 }, EIGHT)).toBe('1 d');
  });

  it('reads the day on the ACTIVITY’s own calendar', () => {
    // 480 minutes is one day at eight hours and a third of one at twenty-four. The same stored
    // number, two correct answers — which is why the factor is never defaulted. (`durationDays` is
    // what the SERVER computed, so a row measured on a 24-hour calendar carries 0 here.)
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 480 }, 24)).toBe('8h');
  });

  it('falls back to the stored day count with no factor', () => {
    // The degraded path and the flag-off path are the same output, deliberately.
    expect(formatDurationRead({ durationDays: 5, durationMinutes: 2400 }, undefined)).toBe('5 d');
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 240 }, undefined)).toBe('0 d');
  });
});
