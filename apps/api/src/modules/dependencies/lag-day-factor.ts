import type { ActivityType, LagCalendarSource, Prisma } from '@prisma/client';
import { DEFAULT_HOURS_PER_DAY_MINUTES } from '@repo/types';

import { schedulingCalendarId } from '../activities/day-factor';
import type { CalendarRepository } from '../calendars/calendar.repository';

/**
 * What a lag's day↔minute conversion needs: which end it measures on, and what that end schedules on.
 *
 * An endpoint contributes **three** facts, not one, because the calendar an activity schedules on is
 * type-gated (`schedulingCalendarId`, `docs/TECH_DEBT.md` #86): a `RESOURCE_DEPENDENT` activity
 * defers to its driving resource and every other type does not. The driving calendar is a **required**
 * property that may be `null` — passing it is how a caller says it looked, and omitting it is exactly
 * the silent wrong answer this split exists to make unreachable.
 */
export interface LagCalendarContext {
  lagCalendar: LagCalendarSource;
  predecessorType: ActivityType;
  predecessorCalendarId: string | null;
  predecessorDrivingCalendarId: string | null;
  successorType: ActivityType;
  successorCalendarId: string | null;
  successorDrivingCalendarId: string | null;
  planCalendarId: string | null;
}

/**
 * The calendar a relationship's lag is measured on (ADR-0037 M3).
 *
 * `TWENTY_FOUR_HOUR` returns `null` and is handled by the caller as a **hard-pinned 1440** — that
 * is the entire meaning of the label, and routing it through a calendar's hours-per-day would
 * silently destroy the one option a planner picks precisely to escape working-time arithmetic.
 */
export function lagCalendarIdFor(context: LagCalendarContext): string | null {
  switch (context.lagCalendar) {
    case 'PREDECESSOR':
      return schedulingCalendarId({
        type: context.predecessorType,
        drivingCalendarId: context.predecessorDrivingCalendarId,
        activityCalendarId: context.predecessorCalendarId,
        planCalendarId: context.planCalendarId,
      });
    case 'SUCCESSOR':
      return schedulingCalendarId({
        type: context.successorType,
        drivingCalendarId: context.successorDrivingCalendarId,
        activityCalendarId: context.successorCalendarId,
        planCalendarId: context.planCalendarId,
      });
    case 'PROJECT_DEFAULT':
      return context.planCalendarId;
    case 'TWENTY_FOUR_HOUR':
      return null;
  }
}

/**
 * The day↔minute factor for one relationship's lag (ADR-0068 §4).
 *
 * Note that this varies **per dependency row**, not per plan: `lagCalendar` is a column, so one
 * page of a plan's logic can legitimately need several different factors.
 */
export async function resolveLagDayFactorMinutes(
  calendars: CalendarRepository,
  context: LagCalendarContext,
  db?: Prisma.TransactionClient,
): Promise<number> {
  const id = lagCalendarIdFor(context);
  if (id === null) return DEFAULT_HOURS_PER_DAY_MINUTES;
  const factors = await calendars.findHoursPerDayMinutes([id], db);
  return factors.get(id) ?? DEFAULT_HOURS_PER_DAY_MINUTES;
}

/** A dependency row carrying the factor its `lagDays` is measured in. */
export type WithLagDayFactor<T> = T & { lagDayFactorMinutes: number };

/**
 * Attach the factor to a page of dependencies, in one calendar lookup for the whole page.
 *
 * `drivingCalendarByActivity` maps an activity id to its driving resource's calendar, for the
 * `RESOURCE_DEPENDENT` activities in the plan (`loadDrivingResourceCalendars`). An **empty map is a
 * valid and meaningful argument** — it says the plan has no driven activity — which is why the read
 * that produces it is skipped entirely when a plan contains no `RESOURCE_DEPENDENT` row, making the
 * no-resource path cost exactly zero rather than nearly zero (`docs/TECH_DEBT.md` #86, M0-T4's
 * second limb, answered structurally rather than by timing).
 */
export async function attachLagDayFactors<
  T extends {
    lagCalendar: LagCalendarSource;
    predecessorId: string;
    successorId: string;
    predecessor: { calendarId: string | null; type: ActivityType };
    successor: { calendarId: string | null; type: ActivityType };
  },
>(
  calendars: CalendarRepository,
  rows: readonly T[],
  planCalendarId: string | null,
  drivingCalendarByActivity: ReadonlyMap<string, string | null>,
  db?: Prisma.TransactionClient,
): Promise<WithLagDayFactor<T>[]> {
  const idFor = (row: T): string | null =>
    lagCalendarIdFor({
      lagCalendar: row.lagCalendar,
      predecessorType: row.predecessor.type,
      predecessorCalendarId: row.predecessor.calendarId,
      predecessorDrivingCalendarId: drivingCalendarByActivity.get(row.predecessorId) ?? null,
      successorType: row.successor.type,
      successorCalendarId: row.successor.calendarId,
      successorDrivingCalendarId: drivingCalendarByActivity.get(row.successorId) ?? null,
      planCalendarId,
    });
  const factors = await calendars.findHoursPerDayMinutes(
    rows.map(idFor).filter((id): id is string => id !== null),
    db,
  );
  return rows.map((row) => {
    const id = idFor(row);
    return {
      ...row,
      lagDayFactorMinutes:
        id === null
          ? DEFAULT_HOURS_PER_DAY_MINUTES
          : (factors.get(id) ?? DEFAULT_HOURS_PER_DAY_MINUTES),
    };
  });
}
