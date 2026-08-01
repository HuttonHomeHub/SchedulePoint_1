import type { CalendarSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { effectiveHoursPerDay } from './effective-hours-per-day';

function calendar(id: string, hoursPerDay: number): CalendarSummary {
  return {
    id,
    name: id,
    description: null,
    workingWeekdays: 0b0011111,
    shifts: [],
    hoursPerDay,
    hoursPerDayMinutes: Math.round(hoursPerDay * 60),
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const CALENDARS = [calendar('eight', 8), calendar('full', 24), calendar('half-friday', 7.5)];

describe('effectiveHoursPerDay', () => {
  it('uses the activity’s own calendar when it has one', () => {
    expect(
      effectiveHoursPerDay(CALENDARS, { activityCalendarId: 'full', planCalendarId: 'eight' }),
    ).toBe(24);
  });

  it('falls back to the plan’s calendar — which is what “inherit” means', () => {
    // '' is the picker's empty option. Both spellings of "no override" resolve the same way.
    expect(
      effectiveHoursPerDay(CALENDARS, { activityCalendarId: '', planCalendarId: 'eight' }),
    ).toBe(8);
    expect(effectiveHoursPerDay(CALENDARS, { planCalendarId: 'half-friday' })).toBe(7.5);
  });

  it('is undefined — never a default — when the list has not resolved', () => {
    // The whole point of ADR-0070 §2: guessing 24 here reads a planner's "1d" on an eight-hour
    // calendar as three days of work, silently, and changes dates.
    expect(effectiveHoursPerDay([], { planCalendarId: 'eight' })).toBeUndefined();
  });

  it('is undefined when the bound calendar is not in the list', () => {
    expect(effectiveHoursPerDay(CALENDARS, { activityCalendarId: 'gone' })).toBeUndefined();
  });

  it('is undefined when neither the activity nor the plan names a calendar', () => {
    expect(effectiveHoursPerDay(CALENDARS, {})).toBeUndefined();
    expect(
      effectiveHoursPerDay(CALENDARS, { activityCalendarId: '', planCalendarId: '' }),
    ).toBeUndefined();
  });

  it('refuses a non-positive factor rather than collapsing every duration to nothing', () => {
    expect(
      effectiveHoursPerDay([calendar('broken', 0)], { planCalendarId: 'broken' }),
    ).toBeUndefined();
  });
});
