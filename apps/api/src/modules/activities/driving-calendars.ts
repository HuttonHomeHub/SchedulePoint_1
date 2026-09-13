import type { ActivityType, Prisma, PrismaClient } from '@prisma/client';

/**
 * The calendar each `RESOURCE_DEPENDENT` activity's **driving resource** works to, keyed by activity.
 *
 * One implementation, deliberately. The schedule graph has needed this since ADR-0039 §4 and now the
 * day↔minute factor needs it too (`docs/TECH_DEBT.md` #86) — and a second copy is the ADR-0065
 * `routeOrthogonal` trap: two readers of the same rule drift, and the drift is invisible, because
 * each looks right alone and only somebody comparing a duration against a schedule would ever see
 * one is a version behind.
 *
 * A value of `null` means the driver exists and inherits; **absence** means no active driving
 * assignment, which the schedule reads as `resourceDriverMissing` (§23 produce-and-flag). The two
 * are different facts and are kept distinguishable: callers that only need a calendar collapse them,
 * callers that need the flag do not.
 *
 * The DB partial-unique `uq_resource_assignments_activity_driving` guarantees at most one row per
 * activity, so the result is a map rather than a grouping.
 */
export async function loadDrivingResourceCalendarRows(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  planId: string,
): Promise<Array<{ activityId: string; resourceCalendarId: string | null }>> {
  const rows = await db.resourceAssignment.findMany({
    where: {
      organizationId,
      isDriving: true,
      deletedAt: null,
      activity: { planId, deletedAt: null, type: 'RESOURCE_DEPENDENT' },
      resource: { deletedAt: null },
    },
    select: { activityId: true, resource: { select: { calendarId: true } } },
  });
  return rows.map((r) => ({ activityId: r.activityId, resourceCalendarId: r.resource.calendarId }));
}

/**
 * {@link loadDrivingResourceCalendarRows} as a map, and **skipped entirely** when the caller already
 * knows the plan holds no `RESOURCE_DEPENDENT` activity.
 *
 * The skip is not an optimisation detail; it is what makes the no-resource path cost **exactly zero**
 * rather than one cheap indexed query. `docs/TECH_DEBT.md` #86's M0-T4 committed a falsification
 * condition of "0 ms on a plan with no `RESOURCE_DEPENDENT` row" and could not measure it on this
 * hardware; a structural skip answers it without a stopwatch, which is the stronger answer anyway.
 */
export async function loadDrivingCalendarMap(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  planId: string,
  hasDrivenActivity: boolean,
): Promise<ReadonlyMap<string, string | null>> {
  if (!hasDrivenActivity) return new Map();
  const rows = await loadDrivingResourceCalendarRows(db, organizationId, planId);
  return new Map(rows.map((r) => [r.activityId, r.resourceCalendarId]));
}

/** {@link loadDrivingResourceCalendarRows} as a map. One place builds it, so one shape exists. */
export function toDrivingCalendarMap(
  rows: readonly { activityId: string; resourceCalendarId: string | null }[],
): ReadonlyMap<string, string | null> {
  return new Map(rows.map((r) => [r.activityId, r.resourceCalendarId]));
}

/**
 * {@link loadDrivingCalendarMap} for an arbitrary set of activity rows.
 *
 * Asks the question of the ROWS rather than of the plan: a page with no `RESOURCE_DEPENDENT` row
 * issues no query at all, and a page that spans plans (the activity reads are plan-scoped today, but
 * the type does not promise it) loads one per distinct plan that actually needs one.
 *
 * Returns an empty map for an empty input, which is the honest answer and not a special case.
 */
export async function loadDrivingCalendarMapForRows(
  db: PrismaClient | Prisma.TransactionClient,
  rows: readonly { organizationId: string; planId: string; type: ActivityType }[],
): Promise<ReadonlyMap<string, string | null>> {
  const scopes = new Map<string, { organizationId: string; planId: string }>();
  for (const row of rows) {
    if (row.type !== 'RESOURCE_DEPENDENT') continue;
    scopes.set([row.organizationId, row.planId].join(' '), {
      organizationId: row.organizationId,
      planId: row.planId,
    });
  }
  if (scopes.size === 0) return new Map();
  const merged = new Map<string, string | null>();
  for (const scope of scopes.values()) {
    for (const r of await loadDrivingResourceCalendarRows(db, scope.organizationId, scope.planId)) {
      merged.set(r.activityId, r.resourceCalendarId);
    }
  }
  return merged;
}
