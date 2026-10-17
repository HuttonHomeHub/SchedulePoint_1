/**
 * **Which calendar a link's lag is measured on, as an identity** (redundant-link-advisory M2-T2).
 *
 * The redundant-link rule may add two positive lags only when they are measured on the same calendar,
 * so it needs "same calendar" to mean exactly what the engine means by it. The engine builds a
 * calendar object per link (`toEngineEdge` in `schedule.service.ts`): `TWENTY_FOUR_HOUR` is the
 * elapsed-time calendar, `PROJECT_DEFAULT` the plan's, and `PREDECESSOR`/`SUCCESSOR` the endpoint's
 * own scheduling calendar, which **is** the plan's whenever that endpoint inherits it. This function is
 * the same decision expressed as a string, so two links share a key if and only if the engine walks
 * their lags on one calendar object. `lag-calendar-key.spec.ts` checks that equivalence against the
 * engine's own edges, so the two cannot drift apart unnoticed.
 *
 * The endpoint calendars arrive already resolved by `schedulingCalendarId` (driver, then own, then the
 * plan's), so an endpoint that inherits the plan calendar and a link on `PROJECT_DEFAULT` agree.
 */

/** The key of a plan that has no calendar row of its own: one calendar, named so it can be compared. */
export const PLAN_CALENDAR_KEY = 'PLAN';

/** The key of an elapsed (24-hour) lag. */
export const TWENTY_FOUR_HOUR_KEY = '24H';

export function lagCalendarKeyOf(
  source: string,
  predecessorCalendarId: string | undefined,
  successorCalendarId: string | undefined,
  planCalendarId: string | null,
): string {
  const plan = planCalendarId ?? PLAN_CALENDAR_KEY;
  switch (source) {
    case 'TWENTY_FOUR_HOUR':
      return TWENTY_FOUR_HOUR_KEY;
    case 'PREDECESSOR':
      return predecessorCalendarId ?? plan;
    case 'SUCCESSOR':
      return successorCalendarId ?? plan;
    default:
      return plan;
  }
}
