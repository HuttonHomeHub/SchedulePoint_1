import type { CalendarSummary, LagCalendarSource } from '@repo/types';

import { effectiveHoursPerDay } from '@/lib/effective-hours-per-day';

/**
 * A day is 24 elapsed hours when the lag is measured on the 24-hour calendar (ADR-0070 §5).
 *
 * This is the **one** factor in the app that is pinned rather than resolved, and it is pinned
 * because `TWENTY_FOUR_HOUR` means *elapsed time* — a seven-day concrete cure is seven calendar
 * days, not seven working days. Routing it through some calendar's `hoursPerDay` would silently
 * destroy the only option a planner picks precisely to escape working-time arithmetic, which is
 * exactly the trap ADR-0070 exists to prevent — so it is stated here, and pinned by a test.
 */
export const ELAPSED_HOURS_PER_DAY = 24;

/** The endpoint calendars a lag's factor can depend on, as the form currently knows them. */
export interface LagFactorContext {
  /** The route-composed calendar library — the same list the pickers draw from. */
  calendars: CalendarSummary[];
  /** The plan's calendar, which every `''`/absent activity binding inherits. */
  planCalendarId?: string;
  /**
   * The predecessor activity's own calendar. `null`/`''` means it inherits the plan's; `undefined`
   * means the host cannot name it, which is not the same thing and does not fall back.
   */
  predecessorCalendarId?: string | null | undefined;
  /** The successor activity's own calendar — same three-valued reading as the predecessor's. */
  successorCalendarId?: string | null | undefined;
}

/**
 * How many hours a *day* is worth for a relationship's lag, given the calendar the form has
 * currently selected for it.
 *
 * This mirrors the server's `lagCalendarIdFor` case for case, deliberately: the API converts a
 * submitted `lagDays` on exactly this rule (ADR-0068 §4), so a client that guessed differently would
 * write a value the field then read back as something else.
 *
 * `undefined` means "not known yet" and is a real answer, never a default — the calendar list can be
 * loading, absent or missing the bound row, and after ADR-0068 there is no safe fallback factor. The
 * caller degrades the field to whole working days, which need none.
 */
export function lagHoursPerDay(
  lagCalendar: LagCalendarSource,
  context: LagFactorContext,
): number | undefined {
  const { calendars, planCalendarId } = context;
  switch (lagCalendar) {
    case 'TWENTY_FOUR_HOUR':
      return ELAPSED_HOURS_PER_DAY;
    case 'PROJECT_DEFAULT':
      return effectiveHoursPerDay(calendars, { ...(planCalendarId ? { planCalendarId } : {}) });
    case 'PREDECESSOR':
      return endpointHoursPerDay(context, context.predecessorCalendarId);
    case 'SUCCESSOR':
      return endpointHoursPerDay(context, context.successorCalendarId);
  }
}

function endpointHoursPerDay(
  { calendars, planCalendarId }: LagFactorContext,
  endpointCalendarId: string | null | undefined,
): number | undefined {
  // An endpoint the host cannot name is not the same as one bound to nothing: the first means we do
  // not know, the second means it inherits the plan's. Only the second may fall back.
  if (endpointCalendarId === undefined) return undefined;
  return effectiveHoursPerDay(calendars, {
    ...(endpointCalendarId ? { activityCalendarId: endpointCalendarId } : {}),
    ...(planCalendarId ? { planCalendarId } : {}),
  });
}
