import type { SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan, DAY, link } from './builders.js';

const MON_TO_FRI = [1, 2, 3, 4, 5];
const MON_TO_SAT = [1, 2, 3, 4, 5, 6];
const MON_TO_THU = [1, 2, 3, 4];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * **Calendars** (ADR-0066 M2): the same five-day activity placed on four different working weeks,
 * so the only reason the bars differ is the calendar. Per-activity calendars are ADR-0037's whole
 * point and this is the smallest picture that shows them working.
 *
 * Every calendar here has full-day `[0, 1440)` windows **by choice**, so the only variable is which
 * days work. The intraday half of ADR-0036 — split shifts, nights crossing midnight, asymmetric
 * weeks — is `capability-shift-calendars`, a sibling plan whose calendars work identical DAYS and
 * different HOURS. (This docblock previously said those shapes "can be authored by nothing", which
 * was true when it was written and stopped being true in api-v0.34.0.)
 */
export function calendarsPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-calendars',
    name: 'Calendars: the same work on four working weeks',
    description:
      'K5, K6, K4 and K24 are identical five-day activities differing only in their calendar. K5 ' +
      'spans a weekend and finishes a week later; K24 ignores weekends entirely and finishes on ' +
      'the fifth calendar day. K_HOL crosses a dated holiday and stretches by exactly one day; ' +
      'K_SHUT crosses a two-week shutdown. K_SAT works a Saturday its own week does not.',
    defaultCalendarKey: 'CAL5',
    calendars: [
      calendar('CAL5', 'Five-day week', MON_TO_FRI),
      calendar('CAL6', 'Six-day week', MON_TO_SAT),
      calendar('CAL4', 'Four-day week', MON_TO_THU),
      // A seven-day, full-day calendar IS the 24-hour calendar under the day-granular write path:
      // no day is ever non-working, so a duration in days equals a duration in calendar days. That
      // is what makes `elapsed_duration` reachable at all here.
      calendar('CAL24', 'Twenty-four hour', EVERY_DAY),
      calendar('CAL_HOL', 'Five-day week with holidays', MON_TO_FRI, {
        exceptions: [
          { date: '2026-03-09', windows: [], label: 'Site holiday' },
          { date: '2026-04-03', windows: [], label: 'Good Friday' },
        ],
      }),
      // A shutdown is a long unbroken non-working block, which is a different shape from scattered
      // single days: it is where an off-by-one in a calendar walker compounds instead of cancelling.
      calendar('CAL_SHUT', 'Five-day week with a shutdown', MON_TO_FRI, {
        exceptions: shutdown('2026-03-16', '2026-03-27'),
      }),
      // The opposite direction: a POSITIVE exception makes a normally non-working day work. Without
      // one, an exception list only ever subtracts and the sign is never tested.
      calendar('CAL_POS', 'Five-day week working one Saturday', MON_TO_FRI, {
        exceptions: [
          { date: '2026-03-21', windows: [{ startMinute: 0, endMinute: DAY }], label: 'Catch-up' },
        ],
      }),
    ],
    activities: [
      activity('K5', {
        name: 'Five days on a five-day week',
        calendarKey: 'CAL5',
        testTags: ['cal_5day', 'cal_no_holidays'],
      }),
      activity('K6', {
        name: 'Five days on a six-day week',
        calendarKey: 'CAL6',
        testTags: ['cal_6day'],
      }),
      activity('K4', {
        name: 'Five days on a four-day week',
        calendarKey: 'CAL4',
        testTags: ['cal_4day_week'],
      }),
      activity('K24', {
        name: 'Five days on a 24-hour calendar',
        calendarKey: 'CAL24',
        testTags: ['cal_24h', 'elapsed_duration'],
      }),
      activity('K_HOL', {
        name: 'Five days across a holiday',
        calendarKey: 'CAL_HOL',
        testTags: ['cal_holidays'],
      }),
      activity('K_SHUT', {
        name: 'Ten days across a shutdown',
        calendarKey: 'CAL_SHUT',
        durationMinutes: 10 * DAY,
        testTags: ['cal_shutdown', 'cal_long_nonwork_block'],
      }),
      activity('K_POS', {
        name: 'Five days including a worked Saturday',
        calendarKey: 'CAL_POS',
        testTags: ['cal_positive_exception'],
      }),
      // Inherits the plan calendar rather than naming one. The inherit path has to stay identical
      // to naming the same calendar explicitly, and this is the row that says so.
      activity('K_INHERIT', { name: 'Five days, calendar inherited' }),
    ],
    dependencies: [link('K5', 'K_INHERIT')],
  });
}

/** Every date from `from` to `to` inclusive, as non-working exceptions. */
function shutdown(from: string, to: string): SeedSpec['calendars'][number]['exceptions'] {
  const dates: SeedSpec['calendars'][number]['exceptions'] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= end; at += 86_400_000) {
    dates.push({
      date: new Date(at).toISOString().slice(0, 10),
      windows: [],
      label: 'Plant shutdown',
    });
  }
  return dates;
}
