import type { CalendarSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { effectiveHoursPerDay } from './effective-hours-per-day';

import { durationWriteFields } from '@/features/activities/model/duration-field';

/**
 * **M0 of `docs/specs/resource-dependent-day-factor/` — the write-path half, executed.**
 *
 * `docs/TECH_DEBT.md` #86 said for a year that this defect is display-only: _"Both are display and
 * neither writes a wrong value — the API stores minutes, and the engine reschedules on the correct
 * calendar regardless."_ That sentence is why the row stayed a low priority. It is false, and this
 * file is the executable form of why.
 *
 * ## This is CHARACTERISATION, not desired behaviour
 *
 * Every expectation below pins what the product does **today**, including the wrong number. When M2
 * of the spec lands, `expect(2400)` becomes `expect(7200)` and this docblock's framing inverts.
 * A reader who finds this file green has learnt that the defect is still present, not that it is
 * fixed — which is the opposite of what a green test usually means, so it is said here rather than
 * left to be inferred.
 *
 * ## What it proves, and what it deliberately does not
 *
 * **Proved here, by running:** the client resolves a day's length from the activity's own calendar
 * even for a `RESOURCE_DEPENDENT` activity whose driving resource sits on a different one; and the
 * value that resolution produces is not merely rendered — `durationWriteFields` turns it into the
 * `durationMinutes` the create and edit dialogs submit. Wrong factor in, wrong quantity of work
 * stored.
 *
 * **NOT proved here, and it is the other half of the claim** (spec task M0-T1, still owed): that the
 * engine then spends those minutes at the driving resource's 1440/day, making the bar 1.67 days
 * long rather than 5. That needs a real database and a recalculate, because it is a fact about
 * `schedule.service.ts:1277-1287` resolving the driving calendar and `resolveDayFactors` converting
 * on it — neither of which this tier can reach. Establishing it by reading is what the register did
 * for a year, and reading is what got the severity wrong.
 *
 * ## The flag is deliberately NOT pinned, and that is the opposite of its sibling's choice
 *
 * `effective-hours-per-day.test.ts` mocks `SUB_DAY_DURATIONS_ENABLED` to `false`, because it is
 * asserting a rollback contract and a contract has to name the state it contracts for. This file
 * wants the reverse: the ambient value, which has been **on** since 2026-08-02 and is therefore what
 * every shipped bundle does. Pinning it off here would take `durationWriteFields` down its degraded
 * whole-days branch — where the factor is provably unused — and the file would then characterise a
 * path on which the defect cannot occur, while looking like it had proved something.
 *
 * ## The fixture is the spec's §0.2 shape
 *
 * An eight-hour activity calendar and a twenty-four-hour driving resource: the pairing a planner
 * actually meets when a crew works days and a crane is booked round the clock.
 */
const ACTIVITY_CALENDAR = 'cal-crew-8h';
const DRIVING_RESOURCE_CALENDAR = 'cal-crane-24h';

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

const CALENDARS = [calendar(ACTIVITY_CALENDAR, 8), calendar(DRIVING_RESOURCE_CALENDAR, 24)];

describe('the RESOURCE_DEPENDENT day factor diverges from the rule that schedules it (#86)', () => {
  it('resolves the ACTIVITY’s calendar, with no way to express the driving resource’s', () => {
    // The helper's whole parameter list. There is no third argument, and that is the defect in one
    // line: `schedule.service.ts:1277-1287` resolves driving-resource → activity → plan, and this
    // signature can express only the last two, so the first rung is unreachable rather than wrong.
    const factor = effectiveHoursPerDay(CALENDARS, {
      activityCalendarId: ACTIVITY_CALENDAR,
    });

    expect(factor).toBe(8);
    // The pinned counter-fact: the driving resource's calendar IS in the list the surface holds, so
    // the obstacle is the signature and not the data. Without this, a green run above is equally
    // consistent with "the driving calendar was never available", which is a different and much
    // larger problem.
    expect(CALENDARS.find((c) => c.id === DRIVING_RESOURCE_CALENDAR)?.hoursPerDay).toBe(24);
  });

  it('WRITES the wrong quantity of work — #86’s "display only" is false', () => {
    const factor = effectiveHoursPerDay(CALENDARS, {
      activityCalendarId: ACTIVITY_CALENDAR,
    });

    // `durationWriteFields` is what `ActivityCreateDialog` and `ActivityEditorDialog` both submit.
    // A planner types five days of work.
    const written = durationWriteFields('5d', factor);

    // 5 × 8 × 60. The engine will spend these on the DRIVING resource's calendar at 1440/day, i.e.
    // 1.67 days — and the read comes back `minutesToDays(2400, 480)` = 5, so the field and the table
    // both say `5d`. A schedule-affecting write with a fully self-consistent read-back, which is
    // exactly why this has never been reported.
    expect(written).toEqual({ durationMinutes: 2400 });

    // What the same five days would be if the factor came from the calendar the activity is
    // actually scheduled on. Asserted rather than left in a comment, because this is the number M2
    // has to produce and a comment cannot go red.
    const scheduling = durationWriteFields('5d', 24);
    expect(scheduling).toEqual({ durationMinutes: 7200 });
    expect(written).not.toEqual(scheduling);
  });

  it('coincides when the two calendars agree — so a green run cannot mean the fixture stopped discriminating', () => {
    // The spec's M0-T1 step 3. Without this case, any later change that made
    // `effectiveHoursPerDay` return a constant would leave the two cases above passing for a reason
    // that has nothing to do with the defect.
    const sameLength = [calendar(ACTIVITY_CALENDAR, 24), calendar(DRIVING_RESOURCE_CALENDAR, 24)];
    const factor = effectiveHoursPerDay(sameLength, {
      activityCalendarId: ACTIVITY_CALENDAR,
    });

    expect(factor).toBe(24);
    expect(durationWriteFields('5d', factor)).toEqual({ durationMinutes: 7200 });
  });
});
