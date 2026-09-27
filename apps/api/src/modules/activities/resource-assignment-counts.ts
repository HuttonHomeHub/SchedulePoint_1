import type { Prisma, PrismaClient } from '@prisma/client';
import { isZeroDurationTask } from '@repo/types';

import { liveAssignmentWhere } from './live-assignment';

/**
 * A response row decorated with its live resource-assignment count (ADR-0162 decision 6, spec D8).
 *
 * `null` has exactly one meaning: **not counted for this row type**. Only a zero-duration task is
 * counted, because the one reader of the fact is the Make milestone gate, which applies to nothing
 * else (FC-9's remedy, rung 1 — see {@link loadResourceAssignmentCounts}).
 */
export type WithAssignmentCount<T> = T & { resourceAssignmentCount: number | null };

type CountableRow = { id: string; organizationId: string; type: string; durationMinutes: number };

/**
 * **The live resource assignments of a page's zero-duration tasks, in one grouped query** (spec D8,
 * FC-9, remedy rung 1).
 *
 * Every activity response carries `resourceAssignmentCount`, because the two surfaces that gate
 * **Make milestone…** on it cannot call a hook per row: the activities table's row loop and the
 * Gantt row menu, which resolves its context at click time. So the count rides on the rows, the way
 * `drivingResourceCalendarId` does.
 *
 * **Counted only for zero-duration tasks, and skipped entirely when a page holds none.** FC-9 (a)
 * failed for the all-rows version on a single-tenant 2,000-activity plan: over a table that small the
 * planner seq-scans `resource_assignments` for a 100-id list, where the FK index is chosen on the
 * diluted estate (`docs/specs/zero-duration-task/m0-measurement.md`, "M4-T1"). The spec's remedy
 * ladder names this rung: ask the question of the rows that need the answer, the
 * `loadDrivingCalendarMapForRows` pattern (`driving-calendars.ts`). Every other row gets `null`.
 *
 * **One query per call, never one per row** (FC-9 (d)): a `groupBy` over the counted ids, scoped by
 * {@link liveAssignmentWhere} so "live" means the same thing here as in the health report and the
 * staff diagnostics (FC-10). A response spans one organisation in practice; rows from more than one
 * would issue one query per organisation, since the predicate is organisation-scoped.
 *
 * The map holds an entry for every COUNTED row (0 included) and none for any other row, so
 * {@link attachAssignmentCounts} can tell "counted, none" from "not counted".
 */
export async function loadResourceAssignmentCounts(
  db: PrismaClient | Prisma.TransactionClient,
  rows: readonly CountableRow[],
): Promise<ReadonlyMap<string, number>> {
  const idsByOrg = new Map<string, string[]>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!isZeroDurationTask(row.type, row.durationMinutes)) continue;
    counts.set(row.id, 0);
    const ids = idsByOrg.get(row.organizationId);
    if (ids) ids.push(row.id);
    else idsByOrg.set(row.organizationId, [row.id]);
  }
  for (const [organizationId, ids] of idsByOrg) {
    const groups = await db.resourceAssignment.groupBy({
      by: ['activityId'],
      where: { activityId: { in: ids }, ...liveAssignmentWhere(organizationId) },
      _count: { _all: true },
    });
    for (const group of groups) counts.set(group.activityId, group._count._all);
  }
  return counts;
}

/** Attach {@link loadResourceAssignmentCounts}'s answer: a counted row's count, `null` otherwise. */
export function attachAssignmentCounts<T extends { id: string }>(
  rows: readonly T[],
  counts: ReadonlyMap<string, number>,
): WithAssignmentCount<T>[] {
  return rows.map((row) => ({ ...row, resourceAssignmentCount: counts.get(row.id) ?? null }));
}
