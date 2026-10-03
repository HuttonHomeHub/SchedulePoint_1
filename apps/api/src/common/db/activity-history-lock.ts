import { Prisma } from '@prisma/client';

/**
 * **The history lock** (ADR-0174 D4, data-model §4.1): the transaction advisory lock that makes
 * "read the latest entry, then merge into it" safe.
 *
 * ## Why not the activity row lock
 *
 * An activity `UPDATE` holds that row until commit, which would serialise two recorders — but a link
 * write, an assignment write with no duration change and a knock-on write never update the activity
 * row. Two of those on one activity would read the same latest entry and the second would silently
 * overwrite the first's item. And a `SELECT … FOR NO KEY UPDATE` on the endpoint rows is a **new
 * multi-row row-locker** that can deadlock against the two existing ones that row-lock many
 * activities in no defined order: the recalculation write and `updatePlacements`.
 *
 * ## The protocol
 *
 * One statement takes, in this order:
 *
 *  1. each distinct **plan** in **shared** mode, ascending plan id;
 *  2. each recorded **activity** in **exclusive** mode, ascending activity id.
 *
 * Two single-object recorders therefore contend only if they share an activity, while a batch
 * (second milestone: the plan lock in **exclusive** mode, no activity locks, so it costs one
 * lock-table slot however many rows it has) excludes every single recorder in its plan.
 *
 * ## Why it cannot deadlock
 *
 * It is the **last lock a transaction takes**: afterwards the transaction writes only history rows
 * and the audit row and commits, and those take `FOR KEY SHARE` on the activity and organisation
 * rows, which is compatible with the `FOR NO KEY UPDATE` every activity `UPDATE` takes (both unique
 * indexes on `activities` are partial). And there is **one acquisition per transaction**, so history
 * locks are always taken in one total order. A transaction waiting on a non-history lock therefore
 * holds no history lock, and no cycle can form. The recorder enforces the second rule.
 *
 * The two levels hash different strings (`plan:` / `activity:`), so a collision can never make one
 * level contend with the other; a collision within a level is only harmless false contention.
 */
const HISTORY_LOCK_NAMESPACE = 'activity-history';

export async function acquireActivityHistoryLocks(
  db: Prisma.TransactionClient,
  scope: { planIds: readonly string[]; activityIds: readonly string[] },
): Promise<void> {
  const planIds = [...new Set(scope.planIds)];
  const activityIds = [...new Set(scope.activityIds)];
  if (planIds.length === 0 && activityIds.length === 0) return;
  // Ordered by (level, id) in the derived table, so the database — not just the caller's sort —
  // evaluates the lock calls in the fixed order the protocol relies on.
  await db.$executeRaw`
    SELECT CASE WHEN lvl = 0
        THEN pg_advisory_xact_lock_shared(hashtext(${HISTORY_LOCK_NAMESPACE}), hashtext('plan:' || id))
        ELSE pg_advisory_xact_lock(hashtext(${HISTORY_LOCK_NAMESPACE}), hashtext('activity:' || id))
      END
    FROM (
      SELECT 0 AS lvl, p AS id FROM unnest(${planIds}::text[]) AS p
      UNION ALL
      SELECT 1 AS lvl, a AS id FROM unnest(${activityIds}::text[]) AS a
      ORDER BY 1, 2
    ) AS ordered`;
}
