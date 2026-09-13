import type { ActivityType, Prisma } from '@prisma/client';
import { DEFAULT_HOURS_PER_DAY_MINUTES } from '@repo/types';

import type { CalendarRepository } from '../calendars/calendar.repository';

/**
 * The day↔minute factor's calendar for values measured on **the activity itself** (ADR-0068 §4).
 *
 * Storage and the CPM engine are minutes; `durationDays` and its siblings are a convenience over
 * them, and this resolves which calendar's standard working day does the conversion. Its answer is
 * the activity's own calendar if it names one, otherwise the plan's.
 *
 * **This is one of two rules, and picking the wrong one is `docs/TECH_DEBT.md` #86.** Use this for a
 * quantity that belongs to the activity as an object rather than to the work it schedules — the
 * assignment join lag is the standing example, which ADR-0071 §1 and ADR-0035 §34 deliberately frame
 * on the activity's own calendar even for a `RESOURCE_DEPENDENT` activity scheduled elsewhere. For
 * anything measuring the WORK — duration, remaining duration, levelling delay, relationship lag —
 * use {@link schedulingCalendarId}.
 *
 * `null` on both sides means "no calendar", which the engine treats as all-minutes
 * (`buildPlanCalendar`'s fallback). Its factor is the 24-hour constant, so a plan without a
 * calendar behaves exactly as it did before this column existed.
 */
export function ownCalendarId(
  activityCalendarId: string | null,
  planCalendarId: string | null,
): string | null {
  return activityCalendarId ?? planCalendarId;
}

/**
 * The day↔minute factor's calendar for values measured on **the work the activity schedules**.
 *
 * The fallback order is the one ADR-0039 §4 already uses to decide what calendar an activity
 * schedules on, and the one ADR-0035 §23 measures its total float in: **driving resource → activity
 * → plan**. A `RESOURCE_DEPENDENT` activity whose driver is missing is produced-and-flagged
 * elsewhere and falls back to its own calendar; every other type ignores the driver entirely, which
 * is what keeps a TASK with an assigned resource on its own calendar (the A5500 contrast).
 *
 * **`drivingCalendarId` is a required property with no default, deliberately.** It may be `null`,
 * but it must be passed. Defaulting it would make the wrong rule reachable by omission, which is
 * exactly how #86 arose: one implementation, twelve call sites, and no way for the compiler to ask
 * which quantity a caller meant. This is the ADR-0117 `purpose` shape applied to a resolver.
 */
export function schedulingCalendarId(input: {
  /** The activity's type. Only `RESOURCE_DEPENDENT` consults the driver (ADR-0035 §23). */
  type: ActivityType;
  /**
   * The driving resource's own calendar, or `null` — which covers BOTH "no active driving
   * assignment" and "the driver inherits". Both fall back to the activity's calendar, and the
   * difference between them is `resourceDriverMissing`, which is a separate flag on a separate
   * path: it is a fact about the plan, not about which day length a number is measured in.
   */
  drivingCalendarId: string | null;
  activityCalendarId: string | null;
  planCalendarId: string | null;
}): string | null {
  if (input.type !== 'RESOURCE_DEPENDENT') {
    return ownCalendarId(input.activityCalendarId, input.planCalendarId);
  }
  return input.drivingCalendarId ?? ownCalendarId(input.activityCalendarId, input.planCalendarId);
}

/**
 * Resolve the factor for a quantity measured on the activity ITSELF, inside the caller's transaction.
 *
 * The {@link ownCalendarId} half of the pair. Use it for the plan-level factor (pass
 * `activityCalendarId: null`), for a baseline's frozen factor (ADR-0068 §5), and for the assignment
 * join lag (ADR-0071 §1) — never for a duration. For the work an activity schedules, use
 * {@link resolveSchedulingDayFactorMinutes}.
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
  const id = ownCalendarId(input.activityCalendarId, input.planCalendarId);
  if (id === null) return DEFAULT_HOURS_PER_DAY_MINUTES;
  const factors = await calendars.findHoursPerDayMinutes([id], db);
  // An id that resolves to nothing (soft-deleted, or raced with a delete) falls back to the same
  // constant `buildPlanCalendar` falls back to, so the write and the schedule agree about it.
  return factors.get(id) ?? DEFAULT_HOURS_PER_DAY_MINUTES;
}

/**
 * Resolve the factor for a quantity measured on the WORK an activity schedules.
 *
 * The {@link schedulingCalendarId} half of the pair, and the one a duration write must use
 * (`docs/TECH_DEBT.md` #86): storing `durationDays: 5` against the activity's own 24-hour calendar
 * when it is driven by a crane on an eight-hour one stores 7,200 minutes where the planner meant
 * 2,400 — a real, dates-moving difference, written silently.
 *
 * `drivingCalendarId` is required with no default, for the reason given on {@link schedulingCalendarId}.
 */
export async function resolveSchedulingDayFactorMinutes(
  calendars: CalendarRepository,
  input: {
    type: ActivityType;
    drivingCalendarId: string | null;
    activityCalendarId: string | null;
    planCalendarId: string | null;
  },
  db?: Prisma.TransactionClient,
): Promise<number> {
  const id = schedulingCalendarId(input);
  if (id === null) return DEFAULT_HOURS_PER_DAY_MINUTES;
  const factors = await calendars.findHoursPerDayMinutes([id], db);
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
export type WithDayFactor<T> = T & {
  dayFactorMinutes: number;
  /**
   * The driving resource's calendar this row's factor came from, or `null` when it did not.
   *
   * Carried out of {@link attachDayFactors} rather than re-derived by the mapper, for the reason
   * `dayFactorMinutes` is: the decoration already has it, and a second lookup is an N+1 per field.
   */
  drivingResourceCalendarId: string | null;
};

/**
 * Attach the factor to every row of a response, in **one** query per calendar set.
 *
 * `planCalendarIds` maps each row's `planId` to that plan's calendar, which the caller already has
 * (a list is scoped to one plan; an item write has just loaded it). Rows resolve their **scheduling**
 * calendar (driving resource → own → plan), so a page mixing inherited, per-activity and
 * driver-resolved calendars costs the same single lookup as a page that does not.
 *
 * **It resolves the SCHEDULING rule, and that is `docs/TECH_DEBT.md` #86's fix.** Every field this
 * decorates — `durationDays`, `remainingDurationDays`, `levelingDelayDays` — measures the WORK an
 * activity schedules, so it must be measured on the calendar the work happens on. Reporting a
 * driven activity's duration against its own calendar is how "5 days of duration, 2 days of float"
 * reached a planner on one row: two numbers on one screen, derived on two different day lengths.
 *
 * `drivingCalendarByActivity` is a **required** argument. An empty map is the correct and common
 * value — it says no row here defers to a driver — and passing it is how a caller states that it
 * looked. There is no default, because a default is how the wrong rule became reachable by omission.
 */
export async function attachDayFactors<
  T extends { id: string; calendarId: string | null; planId: string; type: ActivityType },
>(
  calendars: CalendarRepository,
  rows: readonly T[],
  planCalendarIds: ReadonlyMap<string, string | null>,
  drivingCalendarByActivity: ReadonlyMap<string, string | null>,
  db?: Prisma.TransactionClient,
): Promise<WithDayFactor<T>[]> {
  const idFor = (row: T): string | null =>
    schedulingCalendarId({
      type: row.type,
      drivingCalendarId: drivingCalendarByActivity.get(row.id) ?? null,
      activityCalendarId: row.calendarId,
      planCalendarId: planCalendarIds.get(row.planId) ?? null,
    });
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
      drivingResourceCalendarId:
        row.type === 'RESOURCE_DEPENDENT' ? (drivingCalendarByActivity.get(row.id) ?? null) : null,
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
