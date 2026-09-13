import type { CalendarSummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

/**
 * The flag pinned **OFF**. It became the default on 2026-08-02, so relying on the ambient value
 * would silently turn this file's rollback assertions into flag-on ones — which is precisely the
 * day they stop meaning anything. A rollback contract has to name the state it is contracting for.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SUB_DAY_DURATIONS_ENABLED: false,
}));

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
      effectiveHoursPerDay(CALENDARS, {
        activityCalendarId: 'full',
        planCalendarId: 'eight',
        frame: { kind: 'own' },
      }),
    ).toBe(24);
  });

  it('falls back to the plan’s calendar — which is what “inherit” means', () => {
    // '' is the picker's empty option. Both spellings of "no override" resolve the same way.
    expect(
      effectiveHoursPerDay(CALENDARS, {
        activityCalendarId: '',
        planCalendarId: 'eight',
        frame: { kind: 'own' },
      }),
    ).toBe(8);
    expect(
      effectiveHoursPerDay(CALENDARS, { planCalendarId: 'half-friday', frame: { kind: 'own' } }),
    ).toBe(7.5);
  });

  it('is undefined — never a default — when the list has not resolved', () => {
    // The whole point of ADR-0070 §2: guessing 24 here reads a planner's "1d" on an eight-hour
    // calendar as three days of work, silently, and changes dates.
    expect(
      effectiveHoursPerDay([], { planCalendarId: 'eight', frame: { kind: 'own' } }),
    ).toBeUndefined();
  });

  it('is undefined when the bound calendar is not in the list', () => {
    expect(
      effectiveHoursPerDay(CALENDARS, { activityCalendarId: 'gone', frame: { kind: 'own' } }),
    ).toBeUndefined();
  });

  it('is undefined when neither the activity nor the plan names a calendar', () => {
    expect(effectiveHoursPerDay(CALENDARS, { frame: { kind: 'own' } })).toBeUndefined();
    expect(
      effectiveHoursPerDay(CALENDARS, {
        activityCalendarId: '',
        planCalendarId: '',
        frame: { kind: 'own' },
      }),
    ).toBeUndefined();
  });

  it('refuses a non-positive factor rather than collapsing every duration to nothing', () => {
    expect(
      effectiveHoursPerDay([calendar('broken', 0)], {
        planCalendarId: 'broken',
        frame: { kind: 'own' },
      }),
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

  /**
   * `docs/TECH_DEBT.md` #86. The frame is the whole reason this helper takes one: every assertion
   * above passes `own`, which is what every caller silently got before the split — so these are the
   * cases that could not be written at all until the second rung existed.
   */
  describe('the scheduling frame', () => {
    const CRANE = [calendar('crew', 8), calendar('crane', 24)];

    it('reads a driven activity’s driving resource calendar, not its own', () => {
      expect(
        effectiveHoursPerDay(CRANE, {
          activityCalendarId: 'crew',
          frame: {
            kind: 'scheduling',
            type: 'RESOURCE_DEPENDENT',
            drivingResourceCalendarId: 'crane',
          },
        }),
      ).toBe(24);
    });

    it('ignores a driving calendar on any other type — the A5500 contrast', () => {
      expect(
        effectiveHoursPerDay(CRANE, {
          activityCalendarId: 'crew',
          frame: { kind: 'scheduling', type: 'TASK', drivingResourceCalendarId: 'crane' },
        }),
      ).toBe(8);
    });

    it('falls back to the activity’s own calendar when the driver is missing or inherits', () => {
      expect(
        effectiveHoursPerDay(CRANE, {
          activityCalendarId: 'crew',
          frame: {
            kind: 'scheduling',
            type: 'RESOURCE_DEPENDENT',
            drivingResourceCalendarId: null,
          },
        }),
      ).toBe(8);
    });

    it('degrades rather than reverting when the driving calendar is not in the list', () => {
      // The pre-#86 answer wearing a new name would be 8 here. `undefined` is the honest one: the
      // caller drops to whole working days, which is the one unit that needs no factor.
      expect(
        effectiveHoursPerDay([calendar('crew', 8)], {
          activityCalendarId: 'crew',
          frame: {
            kind: 'scheduling',
            type: 'RESOURCE_DEPENDENT',
            drivingResourceCalendarId: 'crane',
          },
        }),
      ).toBeUndefined();
    });
  });
});
