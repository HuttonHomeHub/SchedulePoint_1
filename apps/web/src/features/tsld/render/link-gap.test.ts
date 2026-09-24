import { describe, expect, it } from 'vitest';

import { edgeGapDays } from './geometry';
import { formatLinkGap, linkGap, workingDaysBetween } from './link-gap';

/**
 * **The gap a link waits, in the unit the rest of the canvas speaks** (NetPoint grammar M3-T2, spec
 * §4.2 G6, CQ-5: working days on the plan calendar, spoken in the same unit).
 *
 * Day 0 is a Monday: days 5 and 6 of each week are the weekend.
 */
const weekdays = (d: number): boolean => ((d % 7) + 7) % 7 < 5;

describe('linkGap', () => {
  it('reproduces edgeGapDays exactly for every type when there is no calendar', () => {
    for (const type of ['FS', 'SS', 'FF', 'SF'] as const) {
      for (const lagDays of [0, 2]) {
        const args = {
          type,
          predStartDay: 0,
          predFinishDay: 4,
          succStartDay: 12,
          succFinishDay: 16,
          lagDays,
        };
        expect(linkGap(args, null), `${type} lag ${lagDays}`).toEqual({
          days: edgeGapDays(args),
          unit: 'calendar',
        });
      }
    }
  });

  it('counts working days on the plan calendar: an FS gap over a weekend', () => {
    // Pred Mon–Fri (0–4); succ starts the Wednesday after (9). Calendar gap 4 (Sat, Sun, Mon, Tue);
    // working gap 2 (Mon, Tue).
    const args = {
      type: 'FS' as const,
      predStartDay: 0,
      predFinishDay: 4,
      succStartDay: 9,
      succFinishDay: 11,
      lagDays: 0,
    };
    expect(edgeGapDays(args)).toBe(4);
    expect(linkGap(args, weekdays)).toEqual({ days: 2, unit: 'working' });
  });

  it('walks a lag in working days before the waiting starts (SS with a 2-day lag)', () => {
    // SS from Monday (0) with a 2 working-day lag: the successor may start Wednesday (2); it starts
    // the next Monday (7): Wed, Thu, Fri waiting = 3 working days.
    const args = {
      type: 'SS' as const,
      predStartDay: 0,
      predFinishDay: 4,
      succStartDay: 7,
      succFinishDay: 9,
      lagDays: 2,
    };
    expect(linkGap(args, weekdays)).toEqual({ days: 3, unit: 'working' });
  });

  it('measures FF and SF to the successor’s finish edge', () => {
    const ff = {
      type: 'FF' as const,
      predStartDay: 0,
      predFinishDay: 2,
      succStartDay: 0,
      succFinishDay: 8,
      lagDays: 0,
    };
    // Pred finishes Wed (2); succ finishes the next Tue (8): Thu, Fri, Mon, Tue = 4 working days.
    expect(linkGap(ff, weekdays)).toEqual({ days: 4, unit: 'working' });
    const sf = { ...ff, type: 'SF' as const };
    // SF from pred start Mon (0): succ finish may be Mon; it finishes Tue (8): 7 working days
    // counted from day 0 to day 8 inclusive of the finish day's right edge (days 0–4, 7, 8).
    expect(linkGap(sf, weekdays)).toEqual({ days: 7, unit: 'working' });
  });

  it('gives a driving tie no gap, and a lead a non-positive one (no label)', () => {
    const driving = {
      type: 'FS' as const,
      predStartDay: 0,
      predFinishDay: 4,
      succStartDay: 7, // the next working day after Friday
      succFinishDay: 9,
      lagDays: 0,
    };
    expect(linkGap(driving, weekdays).days).toBe(0);
    const lead = { ...driving, succStartDay: 3 };
    expect(linkGap(lead, weekdays).days).toBeLessThanOrEqual(0);
  });
});

describe('workingDaysBetween', () => {
  it('counts working days in [from, to) and is memoised per calendar', () => {
    let calls = 0;
    const counted = (d: number): boolean => {
      calls += 1;
      return weekdays(d);
    };
    expect(workingDaysBetween(counted, 0, 14)).toBe(10);
    const after = calls;
    expect(workingDaysBetween(counted, 0, 14)).toBe(10);
    // The second read of an unchanged pair walks nothing (FC-G7's "no re-walk" limb).
    expect(calls).toBe(after);
  });
});

describe('formatLinkGap', () => {
  it('prints working days as the canvas’s own `d`, and says so when it falls back to calendar days', () => {
    expect(formatLinkGap({ days: 3, unit: 'working' })).toBe('3d');
    expect(formatLinkGap({ days: 12, unit: 'calendar' })).toBe('12 cal d');
  });
});
