import type { LagCalendarSource, Prisma } from '@prisma/client';
import { DEFAULT_HOURS_PER_DAY_MINUTES } from '@repo/types';

import { effectiveCalendarId } from '../activities/day-factor';
import type { CalendarRepository } from '../calendars/calendar.repository';

/** What a lag's day↔minute conversion needs: which end it measures on, and those ends' calendars. */
export interface LagCalendarContext {
  lagCalendar: LagCalendarSource;
  predecessorCalendarId: string | null;
  successorCalendarId: string | null;
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
      return effectiveCalendarId(context.predecessorCalendarId, context.planCalendarId);
    case 'SUCCESSOR':
      return effectiveCalendarId(context.successorCalendarId, context.planCalendarId);
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

/** Attach the factor to a page of dependencies, in one calendar lookup for the whole page. */
export async function attachLagDayFactors<
  T extends {
    lagCalendar: LagCalendarSource;
    predecessor: { calendarId: string | null };
    successor: { calendarId: string | null };
  },
>(
  calendars: CalendarRepository,
  rows: readonly T[],
  planCalendarId: string | null,
  db?: Prisma.TransactionClient,
): Promise<WithLagDayFactor<T>[]> {
  const idFor = (row: T): string | null =>
    lagCalendarIdFor({
      lagCalendar: row.lagCalendar,
      predecessorCalendarId: row.predecessor.calendarId,
      successorCalendarId: row.successor.calendarId,
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
