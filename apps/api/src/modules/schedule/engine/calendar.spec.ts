import { describe, expect, it } from 'vitest';

import { allDaysWorkCalendar } from './calendar';

describe('allDaysWorkCalendar', () => {
  describe('addWorkingDays', () => {
    it('maps a working-day offset 1:1 onto calendar days', () => {
      expect(allDaysWorkCalendar.addWorkingDays('2026-01-01', 0)).toBe('2026-01-01');
      expect(allDaysWorkCalendar.addWorkingDays('2026-01-01', 5)).toBe('2026-01-06');
    });

    it('walks backward for a negative offset', () => {
      expect(allDaysWorkCalendar.addWorkingDays('2026-01-06', -5)).toBe('2026-01-01');
    });

    it('crosses month and year boundaries', () => {
      expect(allDaysWorkCalendar.addWorkingDays('2026-01-31', 1)).toBe('2026-02-01');
      expect(allDaysWorkCalendar.addWorkingDays('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('honours the leap day (2028 is a leap year)', () => {
      expect(allDaysWorkCalendar.addWorkingDays('2028-02-28', 1)).toBe('2028-02-29');
      expect(allDaysWorkCalendar.addWorkingDays('2027-02-28', 1)).toBe('2027-03-01');
    });
  });

  describe('workingDaysBetween', () => {
    it('is the signed calendar-day gap', () => {
      expect(allDaysWorkCalendar.workingDaysBetween('2026-01-01', '2026-01-06')).toBe(5);
      expect(allDaysWorkCalendar.workingDaysBetween('2026-01-06', '2026-01-01')).toBe(-5);
      expect(allDaysWorkCalendar.workingDaysBetween('2026-01-01', '2026-01-01')).toBe(0);
    });

    it('is the inverse of addWorkingDays', () => {
      const from = '2026-03-10';
      const to = '2026-04-02';
      const offset = allDaysWorkCalendar.workingDaysBetween(from, to);
      expect(allDaysWorkCalendar.addWorkingDays(from, offset)).toBe(to);
    });
  });
});
