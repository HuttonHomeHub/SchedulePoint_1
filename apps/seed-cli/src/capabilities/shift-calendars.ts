import type { SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan, DAY } from './builders.js';

/** Seed weekdays are 0 = Sunday … 6 = Saturday (the fixture's own numbering). */
const MON_TO_FRI = [1, 2, 3, 4, 5];

const HOUR = 60;

/** One weekday's worked periods, in the SeedSpec's Sunday-first numbering. */
function day(weekday: number, ...windows: readonly { startMinute: number; endMinute: number }[]) {
  return { weekday, windows: [...windows] };
}

/** A week that works `windows` Monday–Friday and nothing at the weekend. */
function weekdaysOnly(...windows: readonly { startMinute: number; endMinute: number }[]) {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
    day(weekday, ...(MON_TO_FRI.includes(weekday) ? windows : [])),
  );
}

/**
 * **Shift calendars** (ADR-0036 / ADR-0067 / ADR-0068): four identical 40-working-hour activities
 * on four calendars that differ only in the HOURS each day works — not in which days work.
 *
 * This is the plan the `capability-calendars` family could not be. Every calendar there has full-day
 * `[0, 1440)` windows, because until this epic no write path in the product could create anything
 * else: the API took a weekday mask, so a two-shift calendar was seeded as a 24-hour one and the
 * intraday half of ADR-0036 was proven by nothing. The rule that family states applies here in a
 * sharper form: **two calendars agreeing means the hours are not being read**, and every pair below
 * is chosen so agreement is impossible.
 *
 * The 40 hours are stated in MINUTES, so the plan is independent of any day↔minute factor. What the
 * factor changes is what those minutes are REPORTED as: the same 2,400 minutes is 5 days on the
 * eight-hour calendar, 2.5 on the sixteen-hour two-shift one, and 1.67 (rounded to 2) at 24 hours —
 * which is exactly the ADR-0068 defect, made visible rather than described.
 */
export function shiftCalendarsPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-shift-calendars',
    name: 'Shift calendars: the same forty hours on four working days',
    description:
      'S8, S2SHIFT, S12 and S24 are the same 40 working hours on calendars whose DAYS are ' +
      'identical and whose HOURS are not. S8 (08:00–16:00) finishes on the fifth working day; ' +
      'S2SHIFT (06:00–14:00 and 14:00–22:00, sixteen hours) finishes on the third; S12 ' +
      '(07:00–19:00) finishes on the fourth; S24 finishes on the second. S_SPLIT works a lunch ' +
      'break out of the middle of the day and finishes strictly later than S8 for the same hours. ' +
      'S_HALFFRI proves a WEEK can be asymmetric: its Friday is four hours, so a fortnight of work ' +
      'lands later than the same work on S8. Every calendar reports the same 2400 minutes as a ' +
      'DIFFERENT number of days (ADR-0068): 5, 2.5, 3.33 and 1.67 respectively. S_NIGHT works ' +
      '20:00–06:00 as two windows on two days and finishes on a MORNING, not an evening. ' +
      'S_WINDOW_ONLY has no working week at all: it can only be scheduled inside the three dated ' +
      'turnaround days, so it finishes on 14 March and not on the 4th.',
    defaultCalendarKey: 'SC8',
    calendars: [
      // The reference: an ordinary eight-hour day. Its hours-per-day is DERIVED, which is what an
      // omitted field means and what nearly every real calendar should do.
      calendar('SC8', 'Shift: eight-hour day', [], {
        days: weekdaysOnly({ startMinute: 8 * HOUR, endMinute: 16 * HOUR }),
      }),
      // TWO windows on one day — the single shape the weekday mask could not express at all, and
      // the reason this epic exists.
      calendar('SC2SHIFT', 'Shift: two shifts a day', [], {
        days: weekdaysOnly(
          { startMinute: 6 * HOUR, endMinute: 14 * HOUR },
          { startMinute: 14 * HOUR, endMinute: 22 * HOUR },
        ),
      }),
      calendar('SC12', 'Shift: twelve-hour day', [], {
        days: weekdaysOnly({ startMinute: 7 * HOUR, endMinute: 19 * HOUR }),
      }),
      calendar('SC24', 'Shift: round the clock', [], {
        days: weekdaysOnly({ startMinute: 0, endMinute: DAY }),
      }),
      // A gap INSIDE the day. The engine must skip the unworked middle, so the same 40 hours end
      // later in wall-clock terms than SC8's contiguous eight — a split shift is not a long shift.
      calendar('SC_SPLIT', 'Shift: split day with a long break', [], {
        days: weekdaysOnly(
          { startMinute: 7 * HOUR, endMinute: 11 * HOUR },
          { startMinute: 15 * HOUR, endMinute: 19 * HOUR },
        ),
      }),
      // An ASYMMETRIC week: one weekday works different hours from the others. A per-day pattern is
      // the only thing that can say this, and it is the commonest real construction calendar there
      // is — the early Friday finish.
      calendar('SC_HALFFRI', 'Shift: eight-hour week with a four-hour Friday', [], {
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          if (weekday === 5) return day(weekday, { startMinute: 8 * HOUR, endMinute: 12 * HOUR });
          if (MON_TO_FRI.includes(weekday)) {
            return day(weekday, { startMinute: 8 * HOUR, endMinute: 16 * HOUR });
          }
          return day(weekday);
        }),
      }),
      // A NIGHT shift: 20:00 to 06:00 is stored as TWO windows on TWO adjacent days, because
      // minutes are measured from local midnight and 1440 is 24:00, never a wrap (ADR-0036 §3).
      // Sunday night's second half lands on Monday morning, which is the wrap the model does have.
      calendar('SC_NIGHT', 'Shift: nights, 20:00 to 06:00', [], {
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          const startsTonight = MON_TO_FRI.includes(weekday);
          // Monday–Friday start a night; Tuesday–Saturday finish the one before.
          const finishesThisMorning = [2, 3, 4, 5, 6].includes(weekday);
          return day(
            weekday,
            ...(finishesThisMorning ? [{ startMinute: 0, endMinute: 6 * HOUR }] : []),
            ...(startsTonight ? [{ startMinute: 20 * HOUR, endMinute: DAY }] : []),
          );
        }),
      }),
      // NO base week at all: every working minute comes from dated exception windows. This is the
      // turnaround/shutdown shape, and until this epic the API refused to store it.
      calendar('SC_WINDOW_ONLY', 'Shift: turnaround, no working week', [], {
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => day(weekday)),
        exceptions: [
          {
            date: '2026-03-07',
            windows: [{ startMinute: 0, endMinute: DAY }],
            label: 'Turnaround',
          },
          {
            date: '2026-03-08',
            windows: [{ startMinute: 0, endMinute: DAY }],
            label: 'Turnaround',
          },
          {
            date: '2026-03-14',
            windows: [{ startMinute: 0, endMinute: DAY }],
            label: 'Turnaround',
          },
        ],
      }),
      // The factor stated EXPLICITLY and deliberately at odds with the week (ADR-0068 §6): the days
      // work eight hours, but "a day" on this calendar means seven and a half. A calendar whose
      // stated day differs from its worked day is ordinary in P6, and the two must not be conflated.
      calendar('SC_STATED', 'Shift: eight-hour day counted as seven and a half', [], {
        hoursPerDay: 7.5,
        days: weekdaysOnly({ startMinute: 8 * HOUR, endMinute: 16 * HOUR }),
      }),
    ],
    activities: [
      activity('S8', {
        name: 'Forty hours on an eight-hour day',
        calendarKey: 'SC8',
        durationMinutes: 40 * HOUR,
        testTags: [],
      }),
      activity('S2SHIFT', {
        name: 'Forty hours on a two-shift day',
        calendarKey: 'SC2SHIFT',
        durationMinutes: 40 * HOUR,
        testTags: ['cal_split_shift'],
      }),
      activity('S12', {
        name: 'Forty hours on a twelve-hour day',
        calendarKey: 'SC12',
        durationMinutes: 40 * HOUR,
        testTags: [],
      }),
      activity('S24', {
        name: 'Forty hours round the clock',
        calendarKey: 'SC24',
        durationMinutes: 40 * HOUR,
        testTags: [],
      }),
      activity('S_SPLIT', {
        name: 'Forty hours across a split day',
        calendarKey: 'SC_SPLIT',
        durationMinutes: 40 * HOUR,
        testTags: ['cal_forces_split'],
      }),
      // Two weeks, so the short Friday has compounded twice — one occurrence can be read as noise.
      activity('S_HALFFRI', {
        name: 'Seventy-six hours on a week with a short Friday',
        calendarKey: 'SC_HALFFRI',
        durationMinutes: 76 * HOUR,
        testTags: ['cal_asymmetric_week'],
      }),
      activity('S_NIGHT', {
        name: 'Forty hours of nights',
        calendarKey: 'SC_NIGHT',
        durationMinutes: 40 * HOUR,
        testTags: ['cal_night_crosses_midnight'],
      }),
      // Two working days' worth on a calendar with no working week: it can only be scheduled by the
      // dated windows, so a walker that falls back to "every day works" finishes far too early.
      activity('S_WINDOW_ONLY', {
        name: 'Two days inside a turnaround window',
        calendarKey: 'SC_WINDOW_ONLY',
        durationMinutes: 2 * DAY,
        testTags: ['cal_window_only', 'cal_empty_base_week'],
      }),
      activity('S_STATED', {
        name: 'Forty hours where a day is stated as seven and a half',
        calendarKey: 'SC_STATED',
        durationMinutes: 40 * HOUR,
        testTags: [],
      }),
    ],
  });
}
