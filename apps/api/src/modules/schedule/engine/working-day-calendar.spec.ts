import { describe, expect, it } from 'vitest';

import {
  ALL_WEEKDAYS,
  STANDARD_WEEKDAYS,
  allDaysWorkCalendar,
  buildWorkingDayCalendar,
  type CalendarException,
} from './calendar';

/** Add `n` whole days to a `YYYY-MM-DD` day (UTC), for the naive reference below. */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * A deliberately naive day-by-day reference implementation. It defines the ground
 * truth for the factory: the efficient week-math version must match it exactly
 * (the differential test below). `addWorkingDays(from, n>0)` = the n-th working day
 * strictly after `from`; `workingDaysBetween` counts working-day steps.
 */
function naiveCalendar(mask: number, exceptions: readonly CalendarException[]) {
  const byDate = new Map(exceptions.map((e) => [e.date, e.isWorking]));
  const isWorking = (date: string): boolean => {
    const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
    return byDate.get(date) ?? ((mask >> weekday) & 1) === 1;
  };
  return {
    isWorking,
    addWorkingDays(from: string, n: number): string {
      if (n === 0) return from;
      const step = n > 0 ? 1 : -1;
      let remaining = Math.abs(n);
      let d = from;
      while (remaining > 0) {
        d = addDays(d, step);
        if (isWorking(d)) remaining -= 1;
      }
      return d;
    },
    workingDaysBetween(from: string, to: string): number {
      if (to === from) return 0;
      let n = 0;
      let d = from;
      if (to > from) {
        while (d < to) {
          d = addDays(d, 1);
          if (isWorking(d)) n += 1;
        }
        return n;
      }
      while (d > to) {
        d = addDays(d, -1);
        if (isWorking(d)) n += 1;
      }
      return -n;
    },
  };
}

// 2026-01-01 is a Thursday; 2026-01-03/04 are Sat/Sun.
describe('buildWorkingDayCalendar — Monday–Friday', () => {
  const cal = buildWorkingDayCalendar(STANDARD_WEEKDAYS, []);

  it('skips the weekend when adding working days', () => {
    // Thu 1 Jan + 1 wd = Fri 2 Jan; + 2 wd = Mon 5 Jan (skips Sat/Sun).
    expect(cal.addWorkingDays('2026-01-01', 1)).toBe('2026-01-02');
    expect(cal.addWorkingDays('2026-01-01', 2)).toBe('2026-01-05');
    expect(cal.addWorkingDays('2026-01-01', 5)).toBe('2026-01-08'); // + one full working week - ish
  });

  it('returns the day itself for offset 0, even on a weekend', () => {
    expect(cal.addWorkingDays('2026-01-03', 0)).toBe('2026-01-03'); // Saturday, as given
    expect(cal.addWorkingDays('2026-01-03', 1)).toBe('2026-01-05'); // next working day = Monday
  });

  it('counts working days between two dates (weekends excluded)', () => {
    // Thu 1 → Mon 5: working days = Fri, Mon = 2.
    expect(cal.workingDaysBetween('2026-01-01', '2026-01-05')).toBe(2);
    expect(cal.workingDaysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(cal.workingDaysBetween('2026-01-05', '2026-01-01')).toBe(-2);
  });

  it('walks backward across a weekend', () => {
    // Mon 5 Jan − 1 wd = Fri 2 Jan (skips the weekend).
    expect(cal.addWorkingDays('2026-01-05', -1)).toBe('2026-01-02');
    expect(cal.addWorkingDays('2026-01-05', -2)).toBe('2026-01-01');
  });
});

describe('buildWorkingDayCalendar — exceptions', () => {
  it('a holiday inside a span pushes the finish out by one working day', () => {
    // Without a holiday: Thu 1 Jan + 3 wd = Tue 6 Jan (Fri, Mon, Tue).
    const plain = buildWorkingDayCalendar(STANDARD_WEEKDAYS, []);
    expect(plain.addWorkingDays('2026-01-01', 3)).toBe('2026-01-06');
    // Make Mon 5 Jan a holiday → the 3rd working day slides to Wed 7 Jan.
    const withHoliday = buildWorkingDayCalendar(STANDARD_WEEKDAYS, [
      { date: '2026-01-05', isWorking: false },
    ]);
    expect(withHoliday.addWorkingDays('2026-01-01', 3)).toBe('2026-01-07');
    expect(withHoliday.workingDaysBetween('2026-01-01', '2026-01-07')).toBe(3);
  });

  it('a working exception (worked Saturday) pulls the finish in', () => {
    // Make Sat 3 Jan a working day → Thu 1 + 2 wd = Sat 3 (instead of Mon 5).
    const cal = buildWorkingDayCalendar(STANDARD_WEEKDAYS, [
      { date: '2026-01-03', isWorking: true },
    ]);
    expect(cal.addWorkingDays('2026-01-01', 2)).toBe('2026-01-03');
    expect(cal.workingDaysBetween('2026-01-01', '2026-01-05')).toBe(3); // Fri, Sat, Mon
  });

  it('accepts unsorted exceptions (sorts defensively)', () => {
    const cal = buildWorkingDayCalendar(STANDARD_WEEKDAYS, [
      { date: '2026-03-01', isWorking: false },
      { date: '2026-01-05', isWorking: false },
      { date: '2026-02-01', isWorking: true },
    ]);
    expect(cal.addWorkingDays('2026-01-01', 3)).toBe('2026-01-07'); // 5 Jan holiday still applies
  });
});

describe('buildWorkingDayCalendar — equivalence & guards', () => {
  it('with all weekdays and no exceptions, matches the all-days-work calendar', () => {
    const cal = buildWorkingDayCalendar(ALL_WEEKDAYS, []);
    for (const [from, n] of [
      ['2026-01-01', 0],
      ['2026-01-01', 10],
      ['2026-06-15', 40],
      ['2026-06-15', -30],
    ] as const) {
      expect(cal.addWorkingDays(from, n)).toBe(allDaysWorkCalendar.addWorkingDays(from, n));
    }
    expect(cal.workingDaysBetween('2026-01-01', '2026-12-31')).toBe(
      allDaysWorkCalendar.workingDaysBetween('2026-01-01', '2026-12-31'),
    );
  });

  it('a 7-day calendar with holidays behaves like all-days minus the holidays', () => {
    const cal = buildWorkingDayCalendar(ALL_WEEKDAYS, [
      { date: '2026-01-05', isWorking: false },
      { date: '2026-01-06', isWorking: false },
    ]);
    // Jan 1 + 5 wd would be Jan 6 all-days, but 5th & 6th are holidays → Jan 8.
    expect(cal.addWorkingDays('2026-01-01', 5)).toBe('2026-01-08');
  });

  it('throws on an empty weekday pattern (would never terminate)', () => {
    expect(() => buildWorkingDayCalendar(0, [])).toThrow(/at least one working weekday/);
  });
});

describe('buildWorkingDayCalendar — invariants (property + differential)', () => {
  const cal = buildWorkingDayCalendar(STANDARD_WEEKDAYS, [
    { date: '2026-01-05', isWorking: false }, // holiday on a weekday
    { date: '2026-01-17', isWorking: true }, // worked Saturday
    { date: '2026-02-16', isWorking: false },
    { date: '2026-12-25', isWorking: false },
  ]);

  it('is its own inverse: workingDaysBetween(from, addWorkingDays(from, n)) === n', () => {
    for (const from of ['2026-01-01', '2026-01-17', '2026-06-30', '2026-12-24']) {
      for (const n of [-40, -7, -1, 0, 1, 5, 23, 260]) {
        expect(cal.workingDaysBetween(from, cal.addWorkingDays(from, n))).toBe(n);
      }
    }
  });

  it('matches the naive day-by-day reference across ±400 days (differential)', () => {
    const exceptions = [
      { date: '2026-01-05', isWorking: false },
      { date: '2026-01-17', isWorking: true },
      { date: '2026-02-16', isWorking: false },
      { date: '2026-12-25', isWorking: false },
    ];
    const naive = naiveCalendar(STANDARD_WEEKDAYS, exceptions);
    const origin = '2026-01-01';
    // Deterministic sweep of from-dates (every 13 days) and offsets.
    for (let d = -400; d <= 400; d += 13) {
      const from = addDays(origin, d);
      for (const n of [-60, -13, -1, 0, 1, 8, 45, 200]) {
        expect(cal.addWorkingDays(from, n)).toBe(naive.addWorkingDays(from, n));
      }
      for (const delta of [-90, -1, 0, 30, 210]) {
        const to = addDays(from, delta);
        expect(cal.workingDaysBetween(from, to)).toBe(naive.workingDaysBetween(from, to));
      }
    }
  });
});
