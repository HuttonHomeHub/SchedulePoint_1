import type { Prisma } from '@prisma/client';
import { DEFAULT_HOURS_PER_DAY_MINUTES } from '@repo/types';

import type { CalendarRepository } from '../calendars/calendar.repository';

/**
 * The day↔minute factor for values measured on one activity (ADR-0068 §4).
 *
 * Storage and the CPM engine are minutes; `durationDays` and its siblings are a convenience over
 * them, and this is the conversion. It is the **activity's effective calendar's** standard working
 * day — its own calendar if it names one, otherwise the plan's — which is the same resolution
 * ADR-0037 already uses to decide what calendar an activity schedules on, and the same one
 * ADR-0035 measures its total float in.
 *
 * `null` on both sides means "no calendar", which the engine treats as all-minutes
 * (`buildPlanCalendar`'s fallback). Its factor is the 24-hour constant, so a plan without a
 * calendar behaves exactly as it did before this column existed.
 */
export function effectiveCalendarId(
  activityCalendarId: string | null,
  planCalendarId: string | null,
): string | null {
  return activityCalendarId ?? planCalendarId;
}

/**
 * Resolve the factor for a single activity write, inside the caller's transaction.
 *
 * Costs **nothing** when the activity inherits a plan with no calendar, and one indexed primary-key
 * read otherwise. Not cached across the request: a write path resolves one activity, and a stale
 * factor here would be stored as minutes and outlive the cache.
 */
export async function resolveDayFactorMinutes(
  calendars: CalendarRepository,
  input: { activityCalendarId: string | null; planCalendarId: string | null },
  db?: Prisma.TransactionClient,
): Promise<number> {
  const id = effectiveCalendarId(input.activityCalendarId, input.planCalendarId);
  if (id === null) return DEFAULT_HOURS_PER_DAY_MINUTES;
  const factors = await calendars.findHoursPerDayMinutes([id], db);
  // An id that resolves to nothing (soft-deleted, or raced with a delete) falls back to the same
  // constant `buildPlanCalendar` falls back to, so the write and the schedule agree about it.
  return factors.get(id) ?? DEFAULT_HOURS_PER_DAY_MINUTES;
}

/**
 * An activity carrying the factor its day-denominated fields are measured in (ADR-0068).
 *
 * The factor is **resolved by the service and attached to the row**, not looked up by the response
 * mapper: a mapper has no database access, and giving each one its own lookup would be an N+1 per
 * field. Making it a required property rather than an optional one is deliberate — a service that
 * forgets to decorate is a compile error, not a response that silently reports every duration
 * against 24-hour days.
 */
export type WithDayFactor<T> = T & { dayFactorMinutes: number };

/**
 * Attach the factor to every row of a response, in **one** query per calendar set.
 *
 * `planCalendarIds` maps each row's `planId` to that plan's calendar, which the caller already has
 * (a list is scoped to one plan; an item write has just loaded it). Rows resolve their own calendar
 * first (ADR-0037), so a page mixing inherited and per-activity calendars costs the same single
 * lookup as a page that does not.
 */
export async function attachDayFactors<T extends { calendarId: string | null; planId: string }>(
  calendars: CalendarRepository,
  rows: readonly T[],
  planCalendarIds: ReadonlyMap<string, string | null>,
  db?: Prisma.TransactionClient,
): Promise<WithDayFactor<T>[]> {
  const idFor = (row: T): string | null =>
    effectiveCalendarId(row.calendarId, planCalendarIds.get(row.planId) ?? null);
  const ids = rows.map(idFor).filter((id): id is string => id !== null);
  const factors = await calendars.findHoursPerDayMinutes(ids, db);
  return rows.map((row) => {
    const id = idFor(row);
    return {
      ...row,
      dayFactorMinutes:
        id === null
          ? DEFAULT_HOURS_PER_DAY_MINUTES
          : (factors.get(id) ?? DEFAULT_HOURS_PER_DAY_MINUTES),
    };
  });
}

/**
 * A day-denominated value as stored minutes.
 *
 * Rounded because the factor may be fractional in hours (7.5h is 450 minutes exactly, but 0.3 days
 * of it is not), and storage is integer minutes. Rounding at the boundary — once, here — beats
 * letting a fraction reach a column that determines dates.
 */
export function daysToMinutes(days: number, dayFactorMinutes: number): number {
  return Math.round(days * dayFactorMinutes);
}

/**
 * Stored minutes as a day-denominated value, to the nearest whole day.
 *
 * Lossy by construction, and documented as such on every field that carries it — the exact value is
 * always available as minutes beside it. Guarded against a zero factor, which the CHECK constraint
 * makes unreachable from the database but which a hand-built test double can still produce.
 */
export function minutesToDays(minutes: number, dayFactorMinutes: number): number {
  return dayFactorMinutes <= 0
    ? Math.round(minutes / DEFAULT_HOURS_PER_DAY_MINUTES)
    : Math.round(minutes / dayFactorMinutes);
}
