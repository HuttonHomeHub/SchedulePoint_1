import { MINUTES_PER_CALENDAR_DAY, type CalendarShift } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { formatWindowList, hasIntradayDetail, maxWindowsPerDay } from './shift-summary';

const shift = (weekday: number, startMinute: number, endMinute: number): CalendarShift => ({
  weekday,
  startMinute,
  endMinute,
});

/** A whole worked day — the only shape the 7-bit weekday mask can express. */
const wholeDay = (weekday: number): CalendarShift => shift(weekday, 0, MINUTES_PER_CALENDAR_DAY);

describe('hasIntradayDetail', () => {
  it('is false for a week of whole days — the mask says all of it', () => {
    expect(hasIntradayDetail([])).toBe(false);
    expect(hasIntradayDetail([0, 1, 2, 3, 4].map(wholeDay))).toBe(false);
  });

  it('is true when any day works partial hours', () => {
    expect(hasIntradayDetail([wholeDay(0), shift(1, 480, 960)])).toBe(true);
  });

  it('is true when any day works more than one window', () => {
    // Two full-day windows on one day: each is individually mask-expressible, the pair is not.
    expect(hasIntradayDetail([wholeDay(0), wholeDay(0)])).toBe(true);
  });
});

describe('formatWindowList', () => {
  it('returns empty for no windows, so the caller says what nothing means', () => {
    expect(formatWindowList([])).toBe('');
  });

  it('names a whole day rather than printing 00:00–24:00', () => {
    expect(formatWindowList([{ startMinute: 0, endMinute: MINUTES_PER_CALENDAR_DAY }])).toBe(
      'All day',
    );
  });

  it('prints real hours, comma-separated', () => {
    expect(
      formatWindowList([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 780, endMinute: 1020 },
      ]),
    ).toBe('08:00–12:00, 13:00–17:00');
  });

  it('prints a day-ending window as 24:00, never 00:00', () => {
    expect(formatWindowList([{ startMinute: 1200, endMinute: MINUTES_PER_CALENDAR_DAY }])).toBe(
      '20:00–24:00',
    );
  });

  it('does not shorten a full day spelled as two windows', () => {
    expect(
      formatWindowList([
        { startMinute: 0, endMinute: 720 },
        { startMinute: 720, endMinute: MINUTES_PER_CALENDAR_DAY },
      ]),
    ).toBe('00:00–12:00, 12:00–24:00');
  });
});

describe('maxWindowsPerDay', () => {
  it('is 0 for an empty week rather than -Infinity', () => {
    expect(maxWindowsPerDay([])).toBe(0);
  });

  it('counts the BUSIEST day, not the total', () => {
    expect(
      maxWindowsPerDay([
        shift(0, 360, 840),
        shift(0, 840, 1320),
        shift(1, 480, 960),
        shift(2, 480, 960),
      ]),
    ).toBe(2);
  });
});
