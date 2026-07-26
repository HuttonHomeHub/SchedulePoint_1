import { describe, expect, it } from 'vitest';

import { drawnSpanPlacement, snapToWorkingDay } from './snap';

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

describe('drawnSpanPlacement (drawn calendar span → created working-day duration)', () => {
  it('counts working days, not columns, across a weekend', () => {
    // Fri(4) → Tue(8) is 5 columns on the canvas but Fri, Mon, Tue = 3 working days. Creating it
    // as 5 made the engine lay out five WORKING days, so the bar came back two days too long.
    expect(drawnSpanPlacement(4, 8, mondayStartWorkweek)).toEqual({ startDay: 4, durationDays: 3 });
  });

  it('is the plain inclusive count when the span holds no non-working day', () => {
    expect(drawnSpanPlacement(0, 2, mondayStartWorkweek)).toEqual({ startDay: 0, durationDays: 3 });
  });

  it('snaps the start FORWARD off a non-working day, never backward', () => {
    // Sat(5) → Wed(9): the engine can only push an SNET later, so rounding back to Friday would
    // produce a bar it immediately moves right of where it was released. Start Mon(7); Mon–Wed = 3.
    expect(drawnSpanPlacement(5, 9, mondayStartWorkweek)).toEqual({ startDay: 7, durationDays: 3 });
  });

  it('gives a task at least one working day when the whole span is non-working', () => {
    // Sat→Sun: zero working days would create a zero-duration task, which is a milestone — not
    // what was drawn. Start snaps to the Monday and the task is one day long.
    expect(drawnSpanPlacement(5, 6, mondayStartWorkweek)).toEqual({ startDay: 7, durationDays: 1 });
  });

  it('normalises a right-to-left drag', () => {
    expect(drawnSpanPlacement(8, 4, mondayStartWorkweek)).toEqual({ startDay: 4, durationDays: 3 });
  });

  it('returns the raw calendar span with no calendar predicate (the pre-fix path)', () => {
    expect(drawnSpanPlacement(4, 8, null)).toEqual({ startDay: 4, durationDays: 5 });
  });

  it('never hangs on a calendar with no working day at all', () => {
    expect(drawnSpanPlacement(10, 12, () => false, 30)).toEqual({ startDay: 40, durationDays: 1 });
  });
});
