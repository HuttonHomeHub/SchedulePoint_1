import type { CalendarSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { ELAPSED_HOURS_PER_DAY, type LagEndpoint, lagHoursPerDay } from './lag-factor';

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

const CALENDARS = [
  calendar('plan', 8),
  calendar('pred', 10),
  calendar('succ', 6),
  calendar('crane', 24),
];

/** A plain TASK end — the shape every assertion below was written against. */
function end(calendarId: string | null): LagEndpoint {
  return { calendarId, type: 'TASK', drivingResourceCalendarId: null };
}

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
      predecessor: end('pred'),
      successor: end('succ'),
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
        predecessor: end(null),
      }),
    ).toBe(8);
    // `undefined` means the host did not tell us. Guessing the plan's would be a wrong lag whenever
    // the endpoint has a calendar of its own, which is exactly when this option is chosen.
    expect(
      lagHoursPerDay('PREDECESSOR', { calendars: CALENDARS, planCalendarId: 'plan' }),
    ).toBeUndefined();
  });

  /**
   * `docs/TECH_DEBT.md` #86. A lag measures the work at the end it names, and a RESOURCE_DEPENDENT
   * end does that work on its driving resource's calendar (ADR-0039 §4) — so the lag converts there
   * too. This mirrors the API's `lagCalendarIdFor`, which is the whole point: a client that framed
   * it differently would submit a `lagDays` the server converted on another calendar.
   */
  it('reads a DRIVEN endpoint from its driving resource calendar, not its own', () => {
    expect(
      lagHoursPerDay('PREDECESSOR', {
        calendars: CALENDARS,
        planCalendarId: 'plan',
        predecessor: {
          calendarId: 'pred',
          type: 'RESOURCE_DEPENDENT',
          drivingResourceCalendarId: 'crane',
        },
      }),
    ).toBe(24);
  });

  it('ignores a driving calendar on any other type — the A5500 contrast', () => {
    // A TASK with an assigned resource keeps its own calendar. Type-gating is what stops the driver
    // leaking into every activity that merely HAS a resource.
    expect(
      lagHoursPerDay('PREDECESSOR', {
        calendars: CALENDARS,
        planCalendarId: 'plan',
        predecessor: { calendarId: 'pred', type: 'TASK', drivingResourceCalendarId: 'crane' },
      }),
    ).toBe(10);
  });

  it('falls back to a driven endpoint’s own calendar when the driver is missing or inherits', () => {
    // Absence and null collapse here deliberately: the difference between them is
    // `resourceDriverMissing`, which is a flag on a different path, not a day length.
    expect(
      lagHoursPerDay('PREDECESSOR', {
        calendars: CALENDARS,
        planCalendarId: 'plan',
        predecessor: {
          calendarId: 'pred',
          type: 'RESOURCE_DEPENDENT',
          drivingResourceCalendarId: null,
        },
      }),
    ).toBe(10);
  });

  it('returns undefined when the calendar list has not resolved', () => {
    expect(
      lagHoursPerDay('PROJECT_DEFAULT', { calendars: [], planCalendarId: 'plan' }),
    ).toBeUndefined();
    expect(lagHoursPerDay('PROJECT_DEFAULT', { calendars: CALENDARS })).toBeUndefined();
  });
});
