import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { activitySchedulingHoursPerDay } from './effective-hours-per-day';

/**
 * `docs/TECH_DEBT.md` #317 — the rule the Gantt and the activities table both read a duration by.
 *
 * **Written because nothing set a non-null `drivingResourceCalendarId` at either site.** On a null
 * driver `schedulingCalendarId` falls straight through to `ownCalendarId`, so the two frames are
 * identical by construction, and both call sites could have been swapped to `{ kind: 'own' }` with
 * every existing test green. The derivation was extracted to a name (#317) precisely so it could be
 * asserted here rather than only through a 1,300-line component.
 */

function calendar(id: string, hoursPerDay: number): CalendarSummary {
  return { id, hoursPerDay } as CalendarSummary;
}

const CREW_8H = 'cal-crew-8h';
const CRANE_24H = 'cal-crane-24h';
const PLAN_12H = 'cal-plan-12h';

const CALENDARS = [calendar(CREW_8H, 8), calendar(CRANE_24H, 24), calendar(PLAN_12H, 12)];

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    calendarId: CREW_8H,
    type: 'TASK',
    drivingResourceCalendarId: null,
    ...overrides,
  } as ActivitySummary;
}

describe('activitySchedulingHoursPerDay', () => {
  it('reads a DRIVEN activity from its driving resource’s calendar, not its own', () => {
    expect(
      activitySchedulingHoursPerDay(
        CALENDARS,
        activity({ type: 'RESOURCE_DEPENDENT', drivingResourceCalendarId: CRANE_24H }),
        PLAN_12H,
      ),
    ).toBe(24);
  });

  it('ignores a driving calendar on any other type — the A5500 contrast', () => {
    // A TASK with an assigned resource keeps its own calendar. Type-gating is what stops the driver
    // leaking into every activity that merely HAS a resource, and without this case a build reading
    // the driver unconditionally passes the one above.
    expect(
      activitySchedulingHoursPerDay(
        CALENDARS,
        activity({ type: 'TASK', drivingResourceCalendarId: CRANE_24H }),
        PLAN_12H,
      ),
    ).toBe(8);
  });

  it('falls back to the activity’s own calendar when a driven activity has no driver', () => {
    expect(
      activitySchedulingHoursPerDay(
        CALENDARS,
        activity({ type: 'RESOURCE_DEPENDENT', drivingResourceCalendarId: null }),
        PLAN_12H,
      ),
    ).toBe(8);
  });

  it('falls back to the plan when the activity inherits', () => {
    expect(activitySchedulingHoursPerDay(CALENDARS, activity({ calendarId: null }), PLAN_12H)).toBe(
      12,
    );
  });

  it('treats a null and an undefined plan calendar alike — the two callers type it differently', () => {
    // `plan.calendarId` is nullable; the table's prop is optional. Normalising here is what kept the
    // extraction behaviour-identical at both sites rather than changing one of them silently.
    const inheriting = activity({ calendarId: null });
    expect(activitySchedulingHoursPerDay(CALENDARS, inheriting, null)).toBeUndefined();
    expect(activitySchedulingHoursPerDay(CALENDARS, inheriting, undefined)).toBeUndefined();
  });

  it('returns undefined when the calendar list has not resolved', () => {
    expect(
      activitySchedulingHoursPerDay(
        [],
        activity({ type: 'RESOURCE_DEPENDENT', drivingResourceCalendarId: CRANE_24H }),
        PLAN_12H,
      ),
    ).toBeUndefined();
  });
});
