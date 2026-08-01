import type { CalendarSummary } from '@repo/types';

/**
 * How many working hours a *day* is worth for the activity currently being edited (ADR-0070 §3).
 *
 * ## Why the form resolves this, and not the server
 *
 * The API already tells us what the **saved** row was measured on (`dayFactorMinutes`, behind
 * `durationDays`). That is the wrong answer for a form: a planner can change an activity's calendar
 * and its duration in the same edit, and only the client knows the pending selection. Reading the
 * saved factor would give a duration field that disagrees with the calendar picker directly above
 * it — visibly during the edit, and then permanently in the saved value.
 *
 * So this reads the form's own `calendarId` (`''`/undefined meaning "inherit", which is what the
 * picker's empty option says) against the route-composed calendar list the pickers already draw
 * from. One derivation, one list, no second source.
 *
 * ## Returning `undefined` is a real answer
 *
 * The list can be loading, absent (a host that composes no calendars) or failed, and the plan's own
 * calendar can be one the list does not contain. In every one of those cases the honest answer is
 * "not known yet" — never a default. After ADR-0068 there is no safe default: 24 reads a planner's
 * `1d` on an eight-hour calendar as three days of work, and 8 does the inverse on a 24-hour one.
 * Both are silent and both change dates. The caller degrades to whole working days instead, which is
 * the one unit that needs no factor.
 */
export function effectiveHoursPerDay(
  calendars: CalendarSummary[],
  { activityCalendarId, planCalendarId }: { activityCalendarId?: string; planCalendarId?: string },
): number | undefined {
  const id =
    activityCalendarId !== undefined && activityCalendarId !== ''
      ? activityCalendarId
      : planCalendarId;
  if (id === undefined || id === '') return undefined;
  const hours = calendars.find((calendar) => calendar.id === id)?.hoursPerDay;
  // A zero or negative factor would make every duration collapse to nothing. It cannot come from the
  // API (the column is bounded), so treating it as unresolved is a guard, not a branch anyone hits.
  return hours !== undefined && hours > 0 ? hours : undefined;
}
