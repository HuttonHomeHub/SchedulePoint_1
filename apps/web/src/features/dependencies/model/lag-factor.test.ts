import type { CalendarSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { ELAPSED_HOURS_PER_DAY, lagHoursPerDay } from './lag-factor';

/**
 * Which calendar a lag's day↔minute factor comes from (ADR-0070 §5).
 *
 * This mirrors the API's `lagCalendarIdFor` case for case, so these cases are the client half of a
 * shared contract rather than a local convention: if the two disagree, a submitted `lagDays` is
 * converted on one calendar and read back on another, and the field silently shows a different lag
 * from the one that was saved.
 */

function calendar(id: string, hoursPerDay: number): CalendarSummary {
  return { id, hoursPerDay } as CalendarSummary;
}

const CALENDARS = [calendar('plan', 8), calendar('pred', 10), calendar('succ', 6)];

describe('lagHoursPerDay', () => {
  it('pins TWENTY_FOUR_HOUR at 24 elapsed hours, whatever any calendar says', () => {
    // The whole meaning of the option, and the trap ADR-0070 exists to prevent: a seven-day concrete
    // cure is seven CALENDAR days. Routing it through the plan's eight-hour day would make it five.
    expect(
      lagHoursPerDay('TWENTY_FOUR_HOUR', { calendars: CALENDARS, planCalendarId: 'plan' }),
    ).toBe(ELAPSED_HOURS_PER_DAY);
    expect(ELAPSED_HOURS_PER_DAY).toBe(24);
  });

  it('resolves TWENTY_FOUR_HOUR with no calendar list at all', () => {
    // It needs none — which is why the one option a planner picks to escape working-time arithmetic
    // is also the one that never degrades.
    expect(lagHoursPerDay('TWENTY_FOUR_HOUR', { calendars: [] })).toBe(24);
  });

  it('reads PROJECT_DEFAULT from the plan calendar', () => {
    expect(
      lagHoursPerDay('PROJECT_DEFAULT', { calendars: CALENDARS, planCalendarId: 'plan' }),
    ).toBe(8);
  });

  it('reads PREDECESSOR and SUCCESSOR from their own endpoint', () => {
    const context = {
      calendars: CALENDARS,
      planCalendarId: 'plan',
      predecessorCalendarId: 'pred',
      successorCalendarId: 'succ',
    };
    expect(lagHoursPerDay('PREDECESSOR', context)).toBe(10);
    expect(lagHoursPerDay('SUCCESSOR', context)).toBe(6);
  });

  it('falls back to the plan for an endpoint that INHERITS, but not for one we cannot name', () => {
    // `null` means the activity inherits the plan's calendar — a real, resolvable answer.
    expect(
      lagHoursPerDay('PREDECESSOR', {
        calendars: CALENDARS,
        planCalendarId: 'plan',
        predecessorCalendarId: null,
      }),
    ).toBe(8);
    // `undefined` means the host did not tell us. Guessing the plan's would be a wrong lag whenever
    // the endpoint has a calendar of its own, which is exactly when this option is chosen.
    expect(
      lagHoursPerDay('PREDECESSOR', { calendars: CALENDARS, planCalendarId: 'plan' }),
    ).toBeUndefined();
  });

  it('returns undefined when the calendar list has not resolved', () => {
    expect(
      lagHoursPerDay('PROJECT_DEFAULT', { calendars: [], planCalendarId: 'plan' }),
    ).toBeUndefined();
    expect(lagHoursPerDay('PROJECT_DEFAULT', { calendars: CALENDARS })).toBeUndefined();
  });
});
