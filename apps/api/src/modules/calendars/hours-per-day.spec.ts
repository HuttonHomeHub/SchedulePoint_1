import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WorkingWeekdays } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { resolveHoursPerDayMinutes } from './hours-per-day';

const EIGHT_TO_FIVE = [0, 1, 2, 3, 4].map((weekday) => ({
  weekday,
  startMinute: 480,
  endMinute: 1020,
}));

describe('resolveHoursPerDayMinutes (ADR-0068)', () => {
  it('is the 24-hour constant for a create that names no pattern', () => {
    expect(resolveHoursPerDayMinutes({})).toBe(1440);
  });

  it('keeps a weekday mask at 24 hours — a mask IS full days, which is today’s behaviour', () => {
    expect(resolveHoursPerDayMinutes({ workingWeekdays: 0b0011111 })).toBe(1440);
    expect(resolveHoursPerDayMinutes({ shifts: WorkingWeekdays.toFullDayShifts(0b0011111) })).toBe(
      1440,
    );
  });

  it('derives the working day from an authored 08:00–17:00 week', () => {
    expect(resolveHoursPerDayMinutes({ shifts: EIGHT_TO_FIVE })).toBe(540);
  });

  it('sums a split shift into one day rather than counting it twice', () => {
    expect(
      resolveHoursPerDayMinutes({
        shifts: [
          { weekday: 0, startMinute: 480, endMinute: 720 },
          { weekday: 0, startMinute: 780, endMinute: 1020 },
        ],
      }),
    ).toBe(480);
  });

  it('takes the modal day, not the mean — a half-day Friday does not shrink the week', () => {
    expect(
      resolveHoursPerDayMinutes({
        shifts: [
          ...[0, 1, 2, 3].map((weekday) => ({ weekday, startMinute: 480, endMinute: 1020 })),
          { weekday: 4, startMinute: 480, endMinute: 780 },
        ],
      }),
    ).toBe(540);
  });

  it('breaks a tie toward the longer day, deterministically', () => {
    expect(
      resolveHoursPerDayMinutes({
        shifts: [
          { weekday: 0, startMinute: 480, endMinute: 1020 },
          { weekday: 1, startMinute: 480, endMinute: 1020 },
          { weekday: 2, startMinute: 480, endMinute: 900 },
          { weekday: 3, startMinute: 480, endMinute: 900 },
        ],
      }),
    ).toBe(540);
  });

  /** The case that kills the read-time-derivation design: `durationDays × 0` zeroes the activity. */
  it('never derives zero for a window-only calendar', () => {
    expect(resolveHoursPerDayMinutes({ shifts: [] })).toBe(1440);
    expect(resolveHoursPerDayMinutes({ workingWeekdays: 0 })).toBe(1440);
  });

  it('lets an explicit value win over the pattern, and takes a fractional one exactly', () => {
    expect(resolveHoursPerDayMinutes({ hoursPerDay: 8, shifts: EIGHT_TO_FIVE })).toBe(480);
    expect(resolveHoursPerDayMinutes({ hoursPerDay: 7.5 })).toBe(450);
  });

  /** A rename must not move the calendar's durations — the update path's whole reason for `current`. */
  it('keeps the stored value when the write touches neither the pattern nor the factor', () => {
    expect(resolveHoursPerDayMinutes({ current: 540 })).toBe(540);
  });

  it('re-derives from the NEW week when a pattern edit supplies no explicit value', () => {
    expect(resolveHoursPerDayMinutes({ shifts: EIGHT_TO_FIVE, current: 1440 })).toBe(540);
  });
});

/**
 * The structural half of ADR-0068 §1: `hours_per_day_minutes` is `NOT NULL DEFAULT 1440` and is
 * **never** derived on read, which is only safe while every seam that writes a weekly pattern
 * co-writes the factor. A seam that stores shifts without calling `resolveHoursPerDayMinutes`
 * silently gives that calendar the 2.67x trap the decision exists to close — and would look
 * entirely correct in review, which is why this is a test and not a paragraph.
 */
describe('the day-factor co-write seam set', () => {
  const service = readFileSync(join(__dirname, 'calendars.service.ts'), 'utf8');

  it('resolves the factor on both calendar write paths', () => {
    expect(service.match(/resolveHoursPerDayMinutes\(/g) ?? []).toHaveLength(2);
  });

  it('is the only module that decides the factor', () => {
    const repository = readFileSync(join(__dirname, 'calendar.repository.ts'), 'utf8');
    // The repository stores what it is given. If it ever computes a default of its own there are
    // two answers to one question, and they will differ on the calendar nobody looks at twice.
    expect(repository).not.toContain('deriveHoursPerDayMinutes');
    expect(repository).not.toContain('resolveHoursPerDayMinutes');
  });
});
