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
 * ## INVERTED on 2026-09-13, exactly as the line below used to promise
 *
 * This file was written as characterisation: every expectation pinned what the product did
 * **today**, including the wrong number, and its docblock said _"when M2 of the spec lands,
 * `expect(2400)` becomes `expect(7200)` and this docblock's framing inverts"_. M2 landed and that
 * is what happened, so a green run now means the defect is **gone** rather than present.
 *
 * The old numbers are kept beside the new ones rather than deleted, because the pair is the proof:
 * `own` still returns 8 and 2,400 — which is correct, and is what the assignment join lag is
 * deliberately measured on (ADR-0071 §1) — while `scheduling` returns 24 and 7,200. One helper, two
 * frames, and the defect was that every caller silently got the first.
 *
 * ## What it proves, and what it deliberately does not
 *
 * **Proved here, by running:** the client resolves a day's length from the activity's own calendar
 * even for a `RESOURCE_DEPENDENT` activity whose driving resource sits on a different one; and the
 * value that resolution produces is not merely rendered — `durationWriteFields` turns it into the
 * `durationMinutes` the create and edit dialogs submit. Wrong factor in, wrong quantity of work
 * stored.
 *
 * **NOT proved here, and it is the other half of the claim** (spec task M0-T1, since taken in
 * `apps/api/test/resource-dependent-day-factor.e2e-spec.ts`): that the
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

const DRIVEN = {
  kind: 'scheduling',
  type: 'RESOURCE_DEPENDENT',
  drivingResourceCalendarId: DRIVING_RESOURCE_CALENDAR,
} as const;

describe('the RESOURCE_DEPENDENT day factor now follows the rule that schedules it (#86)', () => {
  it('resolves the DRIVING RESOURCE’s calendar when asked for the scheduling frame', () => {
    // The rung that used to be unreachable. `schedule.service.ts` resolves driving-resource →
    // activity → plan, and the helper's signature could express only the last two — so the defect
    // was never a wrong branch, it was a missing one.
    const factor = effectiveHoursPerDay(CALENDARS, {
      activityCalendarId: ACTIVITY_CALENDAR,
      frame: DRIVEN,
    });

    expect(factor).toBe(24);

    // And the other frame still answers 8, which is not a leftover: the assignment join lag is
    // deliberately measured on the activity's own calendar even here (ADR-0071 §1 / ADR-0035 §34).
    // Both numbers are correct; what was wrong was having one way to ask.
    expect(
      effectiveHoursPerDay(CALENDARS, {
        activityCalendarId: ACTIVITY_CALENDAR,
        frame: { kind: 'own' },
      }),
    ).toBe(8);
    // The pinned counter-fact: the driving resource's calendar IS in the list the surface holds, so
    // the obstacle is the signature and not the data. Without this, a green run above is equally
    // consistent with "the driving calendar was never available", which is a different and much
    // larger problem.
    expect(CALENDARS.find((c) => c.id === DRIVING_RESOURCE_CALENDAR)?.hoursPerDay).toBe(24);
  });

  it('WRITES the quantity of work the planner meant — #86’s "display only" was false', () => {
    const factor = effectiveHoursPerDay(CALENDARS, {
      activityCalendarId: ACTIVITY_CALENDAR,
      frame: DRIVEN,
    });

    // `durationWriteFields` is what `ActivityCreateDialog` and `ActivityEditorDialog` both submit.
    // A planner types five days of work.
    const written = durationWriteFields('5d', factor);

    // 5 × 24 × 60. The engine spends these on the DRIVING resource's calendar at 1440/day, so the
    // bar is five days long — which is what was asked for.
    expect(written).toEqual({ durationMinutes: 7200 });

    // The number this file used to pin, kept as the counter-fact. 5 × 8 × 60 is what the activity's
    // own calendar produces, the engine spent it at 1440/day making a 1.67-day bar, and the read
    // came back `minutesToDays(2400, 480)` = 5 — self-consistent, which is exactly why nobody ever
    // reported it. A comment cannot go red, so it is asserted.
    const own = durationWriteFields(
      '5d',
      effectiveHoursPerDay(CALENDARS, {
        activityCalendarId: ACTIVITY_CALENDAR,
        frame: { kind: 'own' },
      }),
    );
    expect(own).toEqual({ durationMinutes: 2400 });
    expect(written).not.toEqual(own);
  });

  it('coincides when the two calendars agree — so a green run cannot mean the fixture stopped discriminating', () => {
    // The spec's M0-T1 step 3. Without this case, any later change that made
    // `effectiveHoursPerDay` return a constant would leave the two cases above passing for a reason
    // that has nothing to do with the defect.
    const sameLength = [calendar(ACTIVITY_CALENDAR, 24), calendar(DRIVING_RESOURCE_CALENDAR, 24)];
    const factor = effectiveHoursPerDay(sameLength, {
      activityCalendarId: ACTIVITY_CALENDAR,
      frame: DRIVEN,
    });

    expect(factor).toBe(24);
    expect(durationWriteFields('5d', factor)).toEqual({ durationMinutes: 7200 });
  });
});
