import { describe, expect, it } from 'vitest';

import { snapToWorkingDay } from './snap';

/** A Mon–Fri predicate over day offsets: day 0 is a Monday, weekends (offsets 5,6 mod 7) are off. */
const mondayStartWorkweek = (dayOffset: number): boolean => {
  const weekday = ((dayOffset % 7) + 7) % 7; // 0 = Mon … 6 = Sun
  return weekday < 5;
};

describe('snapToWorkingDay', () => {
  it('is the identity on a day that is already working', () => {
    expect(snapToWorkingDay(2, mondayStartWorkweek)).toBe(2); // Wed
  });

  it('rounds a Saturday back to the earlier working day (Friday)', () => {
    // Offset 5 = Sat: Fri (4) is 1 day earlier, Mon (7) is 2 days later — nearest is Fri.
    expect(snapToWorkingDay(5, mondayStartWorkweek)).toBe(4);
  });

  it('rounds a Sunday forward to the nearer working day (Monday)', () => {
    // Offset 6 = Sun: Fri (4) is 2 earlier, Mon (7) is 1 later — nearest is Mon.
    expect(snapToWorkingDay(6, mondayStartWorkweek)).toBe(7);
  });

  it('breaks a tie toward the earlier working day', () => {
    // A single mid-week holiday: Wed(2) off, Tue(1) and Thu(3) both working, equidistant → earlier (Tue).
    const holidayWed = (d: number): boolean => d !== 2 && mondayStartWorkweek(d);
    expect(snapToWorkingDay(2, holidayWed)).toBe(1);
  });

  it('scans across a holiday exception to the nearest working day', () => {
    // Offsets 4 (Fri) and 5,6 (weekend) all off; nearest working day is Thu (3) backward.
    const longHoliday = (d: number): boolean => d !== 4 && mondayStartWorkweek(d);
    expect(snapToWorkingDay(5, longHoliday)).toBe(3);
  });

  it('falls back to the raw day when no working day lies within the horizon (never hangs)', () => {
    const neverWorking = (): boolean => false;
    expect(snapToWorkingDay(10, neverWorking, 30)).toBe(10);
  });
});
