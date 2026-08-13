import { describe, expect, it } from 'vitest';

import { drawnSpanPlacement, rollForwardToWorkingDay } from './snap';

/** A Mon–Fri predicate over day offsets: day 0 is a Monday, weekends (offsets 5,6 mod 7) are off. */
const mondayStartWorkweek = (dayOffset: number): boolean => {
  const weekday = ((dayOffset % 7) + 7) % 7; // 0 = Mon … 6 = Sun
  return weekday < 5;
};

describe('rollForwardToWorkingDay — the preview applies the rule the server will', () => {
  /**
   * **This replaced `snapToWorkingDay`, and the direction is the whole point.** That function
   * rounded to the NEAREST working day (earlier winning ties) behind a `Snap to grid` toggle. The
   * engine rolls FORWARD, unconditionally, on every `visualStart` (`compute.ts:335-338` →
   * `instants.ts:18-22`) — so the toggle never decided whether a placement snapped, only which way
   * the tie broke, and a Saturday drop landed Friday with it on and Monday with it off.
   *
   * Rounding to nearest would move an activity EARLIER than the planner dropped it. The server never
   * does that, so neither does the preview.
   */
  it('is the identity on a day that is already working', () => {
    expect(rollForwardToWorkingDay(2, mondayStartWorkweek)).toBe(2); // Wed
  });

  it('rolls a Saturday FORWARD to Monday, never back to Friday', () => {
    // The one case where the deleted toggle was observable: nearest said Friday (4), the server says
    // Monday (7). Friday is earlier than the planner placed it, which the server will never produce.
    expect(rollForwardToWorkingDay(5, mondayStartWorkweek)).toBe(7);
  });

  it('rolls a Sunday forward to Monday', () => {
    expect(rollForwardToWorkingDay(6, mondayStartWorkweek)).toBe(7);
  });

  it('never resolves a tie backwards', () => {
    // A single mid-week holiday with working days either side. `snapToWorkingDay` returned Tue (1);
    // forward-only returns Thu (3).
    const holidayWed = (d: number): boolean => d !== 2 && mondayStartWorkweek(d);
    expect(rollForwardToWorkingDay(2, holidayWed)).toBe(3);
  });

  it('scans across a holiday block to the next working day, not the nearest', () => {
    // Fri (4) plus the weekend all off: nearest was Thu (3) backward; forward is Mon (7).
    const longHoliday = (d: number): boolean => d !== 4 && mondayStartWorkweek(d);
    expect(rollForwardToWorkingDay(5, longHoliday)).toBe(7);
  });

  it('falls back to the raw day when no working day lies within the horizon (never hangs)', () => {
    const neverWorking = (): boolean => false;
    expect(rollForwardToWorkingDay(10, neverWorking, 30)).toBe(10);
  });

  it('agrees with `drawnSpanPlacement`, which always rolled forward', () => {
    // The two client transforms used to disagree about direction; one matched the server and one did
    // not, and the mismatch was the defect. Pinning the agreement is what stops it recurring.
    for (const day of [0, 4, 5, 6, 7, 11, 12]) {
      expect(rollForwardToWorkingDay(day, mondayStartWorkweek)).toBe(
        drawnSpanPlacement(day, day, mondayStartWorkweek).startDay,
      );
    }
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
