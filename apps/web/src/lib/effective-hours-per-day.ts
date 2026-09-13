import type { ActivityType, CalendarSummary } from '@repo/types';

/**
 * Which quantity a day-length is being asked for (`docs/TECH_DEBT.md` #86).
 *
 * The same split the server makes, in the same words, because a client that framed a duration
 * differently from the API that stores it is how "5 days of duration, 2 days of float" reached a
 * planner on one row. `ownCalendarId` and `schedulingCalendarId` are the server halves.
 */
export type DayFactorFrame =
  /**
   * A quantity belonging to the activity as an object, or to the plan.
   *
   * The assignment join lag is the standing example — ADR-0071 §1 and ADR-0035 §34 frame it on the
   * activity's own calendar even for an activity scheduled on its driver's — as is any plan-level
   * setting, which has no activity at all.
   */
  | { kind: 'own' }
  /**
   * A quantity measuring the WORK: duration, remaining duration, levelling delay, relationship lag.
   *
   * `drivingResourceCalendarId` comes from the activity read and is `null` for everything that is
   * not `RESOURCE_DEPENDENT`, and for a driven activity whose driver is missing or inherits. It is
   * **required**, for the reason the server's resolver requires it: a default is how the wrong rule
   * becomes reachable by omission, which is the whole of #86.
   */
  | { kind: 'scheduling'; type: ActivityType; drivingResourceCalendarId: string | null };

/**
 * The scheduling frame for an activity the host holds, or `own` when it holds none.
 *
 * ONE derivation of "no activity means no driver to consider", so the several hosts that can be
 * mid-load do not each invent it. With nothing to frame, `own` is the honest answer rather than a
 * fallback — it is what every plan-level caller passes for the same reason.
 */
export function activityDayFactorFrame(
  activity: { type: ActivityType; drivingResourceCalendarId: string | null } | undefined,
): DayFactorFrame {
  return activity === undefined
    ? { kind: 'own' }
    : {
        kind: 'scheduling',
        type: activity.type,
        drivingResourceCalendarId: activity.drivingResourceCalendarId,
      };
}

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
 * ## The frame is not optional
 *
 * A duration measures the work and is therefore counted on the calendar the work happens on — the
 * driving resource's, for a `RESOURCE_DEPENDENT` activity (ADR-0039 §4). An assignment join lag is
 * counted on the activity's own. Those differ for exactly one shape, and before #86 every caller
 * here silently got the second answer. The caller now says which it means.
 *
 * ## Returning `undefined` is a real answer
 *
 * The list can be loading, absent (a host that composes no calendars) or failed, and the plan's own
 * calendar can be one the list does not contain. In every one of those cases the honest answer is
 * "not known yet" — never a default. After ADR-0068 there is no safe default: 24 reads a planner's
 * `1d` on an eight-hour calendar as three days of work, and 8 does the inverse on a 24-hour one.
 * Both are silent and both change dates. The caller degrades to whole working days instead, which is
 * the one unit that needs no factor.
 *
 * A driven activity whose driver is not resolvable therefore degrades the same way rather than
 * quietly reverting to its own calendar — which would be the pre-#86 answer wearing a new name.
 */
export function effectiveHoursPerDay(
  calendars: CalendarSummary[],
  {
    activityCalendarId,
    planCalendarId,
    frame,
  }: { activityCalendarId?: string; planCalendarId?: string; frame: DayFactorFrame },
): number | undefined {
  const own =
    activityCalendarId !== undefined && activityCalendarId !== ''
      ? activityCalendarId
      : planCalendarId;
  const id =
    frame.kind === 'scheduling' &&
    frame.type === 'RESOURCE_DEPENDENT' &&
    frame.drivingResourceCalendarId !== null
      ? frame.drivingResourceCalendarId
      : own;
  if (id === undefined || id === '') return undefined;
  const hours = calendars.find((calendar) => calendar.id === id)?.hoursPerDay;
  // A zero or negative factor would make every duration collapse to nothing. It cannot come from the
  // API (the column is bounded), so treating it as unresolved is a guard, not a branch anyone hits.
  return hours !== undefined && hours > 0 ? hours : undefined;
}
