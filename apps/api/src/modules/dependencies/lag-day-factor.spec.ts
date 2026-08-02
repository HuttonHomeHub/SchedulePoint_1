import { describe, expect, it } from 'vitest';

import { lagCalendarIdFor } from './lag-day-factor';

const ENDS = {
  predecessorCalendarId: 'cal-pred',
  successorCalendarId: 'cal-succ',
  planCalendarId: 'cal-plan',
} as const;

describe('lagCalendarIdFor (ADR-0068 §4 / ADR-0037 M3)', () => {
  it('measures on whichever end the relationship names', () => {
    expect(lagCalendarIdFor({ lagCalendar: 'PREDECESSOR', ...ENDS })).toBe('cal-pred');
    expect(lagCalendarIdFor({ lagCalendar: 'SUCCESSOR', ...ENDS })).toBe('cal-succ');
    expect(lagCalendarIdFor({ lagCalendar: 'PROJECT_DEFAULT', ...ENDS })).toBe('cal-plan');
  });

  /**
   * The entire meaning of the option. Routing it through a calendar's hours-per-day would silently
   * destroy the one choice a planner makes precisely to escape working-time arithmetic.
   */
  it('never resolves a calendar for TWENTY_FOUR_HOUR — the caller pins it at 1440', () => {
    expect(lagCalendarIdFor({ lagCalendar: 'TWENTY_FOUR_HOUR', ...ENDS })).toBeNull();
  });

  it('falls back to the plan when the named end inherits', () => {
    expect(
      lagCalendarIdFor({ ...ENDS, lagCalendar: 'PREDECESSOR', predecessorCalendarId: null }),
    ).toBe('cal-plan');
  });
});
