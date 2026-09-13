import type { ActivityType, CalendarSummary, LagCalendarSource } from '@repo/types';

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

/**
 * One end of a relationship, as much as the form knows about it.
 *
 * It is **one object rather than three loose fields** because a lag measures the work at the end it
 * names, and which calendar that work happens on is type-gated (`docs/TECH_DEBT.md` #86): a
 * `RESOURCE_DEPENDENT` endpoint defers to its driving resource. Naming the calendar without the type
 * would let a host supply half a frame and silently get the pre-#86 answer, which is the shape this
 * split exists to make unreachable.
 */
export interface LagEndpoint {
  /** The activity's own calendar. `null`/`''` means it inherits the plan's. */
  calendarId?: string | null;
  type: ActivityType;
  /** From the activity read; `null` for anything not driven, or a driver that is missing/inherits. */
  drivingResourceCalendarId: string | null;
}

/**
 * Build a {@link LagEndpoint} from an activity the host already holds, or `undefined` when it holds
 * none. ONE derivation, so three call sites cannot each decide which fields a frame needs.
 */
export function lagEndpoint(
  activity:
    | { calendarId: string | null; type: ActivityType; drivingResourceCalendarId: string | null }
    | undefined,
): LagEndpoint | undefined {
  if (activity === undefined) return undefined;
  return {
    calendarId: activity.calendarId,
    type: activity.type,
    drivingResourceCalendarId: activity.drivingResourceCalendarId,
  };
}

/** The endpoint calendars a lag's factor can depend on, as the form currently knows them. */
export interface LagFactorContext {
  /** The route-composed calendar library — the same list the pickers draw from. */
  calendars: CalendarSummary[];
  /** The plan's calendar, which every `''`/absent activity binding inherits. */
  planCalendarId?: string;
  /**
   * The predecessor end. `undefined` means the host cannot name it, which is not the same as an end
   * bound to nothing and does not fall back.
   */
  predecessor?: LagEndpoint | undefined;
  /** The successor end — same reading as the predecessor's. */
  successor?: LagEndpoint | undefined;
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
      // The plan's own calendar by definition — there is no endpoint here, so no driver (#86).
      return effectiveHoursPerDay(calendars, {
        ...(planCalendarId ? { planCalendarId } : {}),
        frame: { kind: 'own' },
      });
    case 'PREDECESSOR':
      return endpointHoursPerDay(context, context.predecessor);
    case 'SUCCESSOR':
      return endpointHoursPerDay(context, context.successor);
  }
}

function endpointHoursPerDay(
  { calendars, planCalendarId }: LagFactorContext,
  endpoint: LagEndpoint | undefined,
): number | undefined {
  // An endpoint the host cannot name is not the same as one bound to nothing: the first means we do
  // not know, the second means it inherits the plan's. Only the second may fall back.
  if (endpoint === undefined) return undefined;
  // The SCHEDULING frame: a lag measures the work at this end, and a driven end does that work on
  // its driving resource's calendar (ADR-0039 §4). This mirrors the server's `lagCalendarIdFor`
  // case for case, which is the whole reason the two cannot disagree about a submitted `lagDays`.
  return effectiveHoursPerDay(calendars, {
    ...(endpoint.calendarId ? { activityCalendarId: endpoint.calendarId } : {}),
    ...(planCalendarId ? { planCalendarId } : {}),
    frame: {
      kind: 'scheduling',
      type: endpoint.type,
      drivingResourceCalendarId: endpoint.drivingResourceCalendarId,
    },
  });
}
