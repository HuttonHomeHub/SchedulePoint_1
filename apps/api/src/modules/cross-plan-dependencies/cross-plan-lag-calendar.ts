import type { ActivityType, LagCalendarSource, Prisma } from '@prisma/client';
import { DEFAULT_HOURS_PER_DAY_MINUTES } from '@repo/types';

import { schedulingCalendarId } from '../activities/day-factor';
import { loadDrivingCalendarMapForRows } from '../activities/driving-calendars';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { WithLagDayFactor } from '../dependencies/lag-day-factor';
import type { PlanRepository } from '../plans/plan.repository';

/**
 * **The one cross-plan lag-calendar rule** (#385, spec D5 and CQ-2).
 *
 * A cross-plan link joins two plans, so "the plan calendar" names two calendars, and the in-plan
 * `lagCalendarIdFor` (`dependencies/lag-day-factor.ts`) cannot express that: its context carries one
 * `planCalendarId`. This function carries **each endpoint's own plan calendar**, and is the only
 * place a cross-plan lag's calendar is decided. The write path (`lagDays` → working minutes), the
 * read path (working minutes → `lagDays`) and the derivation (the port the lag is walked on) all call
 * it, and the migration's SQL (`20260926120000_cross_plan_lag_working_minutes`) is the same rule in
 * the other language; `cross-plan-lag-migration.e2e-spec.ts` compares the two row by row (B2).
 *
 * - `TWENTY_FOUR_HOUR`: no calendar. The lag is elapsed time and its factor is pinned at 1440.
 * - `PROJECT_DEFAULT`: **the successor activity's plan's calendar**, in both directions (CQ-2). The
 *   successor plan is the link's home: it holds the link, guards it with its pen, and is the plan
 *   whose schedule the link bounds. "The plan being recalculated" would walk the forward bound on one
 *   calendar and the backward bound on the other, so the two ends of one link would disagree about
 *   its lag.
 * - `PREDECESSOR` / `SUCCESSOR`: that endpoint's scheduling calendar, by `schedulingCalendarId`
 *   (driving resource → the activity's own → **its own plan's**), which is called rather than
 *   restated. The inherit sentinel means "my plan", and there are two plans (the ADR-0139 lesson).
 *
 * `planCalendarId` is always the calendar of the plan the **endpoint activity** belongs to, read
 * through the activity's own `plan_id`, never through the link's denormalised
 * `predecessor_plan_id` / `successor_plan_id` (database-architect B5). A caller that fills it from
 * the link's columns has built a second source for a calendar, which is the thing B5 refuses.
 */
export interface CrossPlanEndpointCalendarFacts {
  /** The endpoint's type. Only `RESOURCE_DEPENDENT` consults the driver (`schedulingCalendarId`). */
  type: ActivityType;
  /** The endpoint activity's own calendar, or `null` when it inherits its plan's. */
  calendarId: string | null;
  /**
   * Its driving resource's calendar, or `null`. **Required, may be null** (the
   * `schedulingCalendarId` rule): passing it is how a caller says it looked.
   */
  drivingCalendarId: string | null;
  /** The calendar of the plan this endpoint activity belongs to (its own `plan_id`, B5). */
  planCalendarId: string | null;
}

/** What one cross-plan link's lag calendar is decided from. */
export interface CrossPlanLagCalendarContext {
  lagCalendar: LagCalendarSource;
  predecessor: CrossPlanEndpointCalendarFacts;
  successor: CrossPlanEndpointCalendarFacts;
}

/** The scheduling calendar of one endpoint, inheriting from **its own** plan. */
function endpointCalendarId(facts: CrossPlanEndpointCalendarFacts): string | null {
  return schedulingCalendarId({
    type: facts.type,
    drivingCalendarId: facts.drivingCalendarId,
    activityCalendarId: facts.calendarId,
    planCalendarId: facts.planCalendarId,
  });
}

/**
 * The calendar a cross-plan link's lag is measured on, or `null` for "no calendar" (either
 * `TWENTY_FOUR_HOUR`, or a plan with no calendar at all). Both nulls mean 1440 minutes a day and an
 * all-minutes port, which is why one `null` can carry them.
 */
export function crossPlanLagCalendarId(context: CrossPlanLagCalendarContext): string | null {
  switch (context.lagCalendar) {
    case 'TWENTY_FOUR_HOUR':
      return null;
    case 'PROJECT_DEFAULT':
      return context.successor.planCalendarId;
    case 'PREDECESSOR':
      return endpointCalendarId(context.predecessor);
    case 'SUCCESSOR':
      return endpointCalendarId(context.successor);
  }
}

/**
 * The day↔minute factor of a cross-plan link's lag (ADR-0068 §4, applied across plans): the
 * resolved calendar's `hoursPerDayMinutes`, or {@link DEFAULT_HOURS_PER_DAY_MINUTES} (1440) when
 * there is no calendar or the id does not resolve. `hoursPerDayById` is the page's one
 * `findHoursPerDayMinutes` answer, which does not filter by `deleted_at` (E30), matching the
 * migration's calendar join.
 */
export function crossPlanLagDayFactorMinutes(
  context: CrossPlanLagCalendarContext,
  hoursPerDayById: ReadonlyMap<string, number>,
): number {
  const id = crossPlanLagCalendarId(context);
  if (id === null) return DEFAULT_HOURS_PER_DAY_MINUTES;
  return hoursPerDayById.get(id) ?? DEFAULT_HOURS_PER_DAY_MINUTES;
}

/** A cross-plan link as the read path loads it: its lag calendar and both endpoints' calendar facts. */
export interface CrossPlanLagRow {
  /** The link's own organisation (a link is same-organisation by construction, ADR-0045 §6). */
  organizationId: string;
  lagCalendar: LagCalendarSource;
  predecessorId: string;
  successorId: string;
  predecessor: { type: ActivityType; calendarId: string | null; planId: string };
  successor: { type: ActivityType; calendarId: string | null; planId: string };
}

/** Where a page's factors are read from: three batched lookups, never one per row. */
export interface CrossPlanLagFactorSources {
  db: Prisma.TransactionClient;
  plans: Pick<PlanRepository, 'findCalendarIds'>;
  calendars: Pick<CalendarRepository, 'findHoursPerDayMinutes'>;
}

/**
 * Attach each link's lag factor to a page of cross-plan links (#385 M2-T3b, api-reviewer A1).
 *
 * The in-plan `attachLagDayFactors` takes one plan calendar for the whole page because its rows share
 * a plan. A cross-plan page does not: every link spans two plans, and the activity list holds both
 * directions. So the page costs, at most:
 *
 * 1. one `findCalendarIds` for the page's distinct endpoint plans (read through each endpoint
 *    activity's `planId`, B5);
 * 2. `loadDrivingCalendarMapForRows` over the endpoints, which issues **no** query when no endpoint
 *    is `RESOURCE_DEPENDENT` and one per distinct (organisation, plan) otherwise. The organisation is
 *    the link's own: an endpoint select carries none;
 * 3. one `findHoursPerDayMinutes` for the page's distinct resolved calendar ids.
 *
 * None of those grows with the page's length, which `cross-plan-dependencies.service.spec.ts` pins
 * with a counting stub (spec FC-6, its CRUD limb). An empty page issues nothing.
 *
 * The migration test (`cross-plan-lag-migration.e2e-spec.ts`) calls this on the seeded links, so
 * the differential it runs against the SQL covers this assembly and not only the pure rule.
 */
export async function attachCrossPlanLagDayFactors<T extends CrossPlanLagRow>(
  sources: CrossPlanLagFactorSources,
  rows: readonly T[],
): Promise<WithLagDayFactor<T>[]> {
  if (rows.length === 0) return [];
  const planIds = new Set<string>();
  for (const row of rows) {
    planIds.add(row.predecessor.planId);
    planIds.add(row.successor.planId);
  }
  const planCalendar = new Map(
    (await sources.plans.findCalendarIds([...planIds], sources.db)).map((p) => [
      p.id,
      p.calendarId,
    ]),
  );
  const driving = await loadDrivingCalendarMapForRows(
    sources.db,
    rows.flatMap((row) => [
      {
        organizationId: row.organizationId,
        planId: row.predecessor.planId,
        type: row.predecessor.type,
      },
      {
        organizationId: row.organizationId,
        planId: row.successor.planId,
        type: row.successor.type,
      },
    ]),
  );
  const contexts = rows.map((row): CrossPlanLagCalendarContext => ({
    lagCalendar: row.lagCalendar,
    predecessor: {
      type: row.predecessor.type,
      calendarId: row.predecessor.calendarId,
      drivingCalendarId: driving.get(row.predecessorId) ?? null,
      planCalendarId: planCalendar.get(row.predecessor.planId) ?? null,
    },
    successor: {
      type: row.successor.type,
      calendarId: row.successor.calendarId,
      drivingCalendarId: driving.get(row.successorId) ?? null,
      planCalendarId: planCalendar.get(row.successor.planId) ?? null,
    },
  }));
  const factors = await sources.calendars.findHoursPerDayMinutes(
    contexts.map(crossPlanLagCalendarId).filter((id): id is string => id !== null),
    sources.db,
  );
  return rows.map((row, i) => ({
    ...row,
    lagDayFactorMinutes: crossPlanLagDayFactorMinutes(contexts[i]!, factors),
  }));
}
