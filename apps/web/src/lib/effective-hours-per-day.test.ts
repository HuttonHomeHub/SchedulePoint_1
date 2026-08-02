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

/**
 * The read-out's rollback contract (ADR-0070 M4).
 *
 * These run **flag-off**, which is this file's default and the state a rollback restores. Both
 * read-outs must print exactly what they printed before the epic — the stored day count — even when
 * a factor is available, because with the flag off there is no sub-day path to take. Asserted here
 * rather than in the sub-day suites, which mock the flag on and structurally cannot see this.
 */
describe('read-outs, flag-off', () => {
  it('formatDurationRead prints the stored day count regardless of the factor', async () => {
    const { formatDurationRead } = await import('@/features/activities/model/duration-field');
    expect(formatDurationRead({ durationDays: 5, durationMinutes: 2400 }, 8)).toBe('5 d');
    // The sub-day case too: flag-off it reads back as the rounded day, which is the pre-epic
    // behaviour and the thing M4 fixes only on the flag-on path.
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 240 }, 8)).toBe('0 d');
  });

  it('formatLag prints the day count regardless of the factor', async () => {
    const { formatLag } = await import('@/features/dependencies/schemas/dependency-schemas');
    expect(formatLag({ lagDays: 3, lagMinutes: 1440 }, 8)).toBe('+3d');
    expect(formatLag({ lagDays: 0, lagMinutes: 240 }, 8)).toBe('0d');
  });
});
