import { describe, expect, it } from 'vitest';

import { formatCalendarDate, isCalendarDate, parseCalendarDate } from './calendar-date';

describe('calendar-date', () => {
  describe('isCalendarDate', () => {
    it('accepts a real calendar day in YYYY-MM-DD form', () => {
      expect(isCalendarDate('2026-05-01')).toBe(true);
      expect(isCalendarDate('2024-02-29')).toBe(true); // leap day
    });

    it('rejects the wrong shape', () => {
      for (const bad of [
        '2026-5-1',
        '2026/05/01',
        '01-05-2026',
        '2026-05-01T00:00:00Z',
        '',
        'nope',
      ]) {
        expect(isCalendarDate(bad)).toBe(false);
      }
    });

    it('rejects impossible dates that a naive Date would roll over', () => {
      expect(isCalendarDate('2026-02-30')).toBe(false);
      expect(isCalendarDate('2026-13-01')).toBe(false);
      expect(isCalendarDate('2025-02-29')).toBe(false); // not a leap year
    });

    it('rejects non-strings', () => {
      expect(isCalendarDate(20260501)).toBe(false);
      expect(isCalendarDate(null)).toBe(false);
      expect(isCalendarDate(undefined)).toBe(false);
    });
  });

  it('parses to a UTC-midnight Date and round-trips through format', () => {
    const date = parseCalendarDate('2026-05-01');
    expect(date.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(formatCalendarDate(date)).toBe('2026-05-01');
  });
});
