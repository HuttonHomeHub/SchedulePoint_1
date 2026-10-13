import { Prisma } from '@prisma/client';

/**
 * Lock the named activity rows in **id order**, before a multi-row `UPDATE activities` writes them
 * (`docs/TECH_DEBT.md` #440).
 *
 * ## Why this exists
 *
 * Two writers update many activities in one statement and do not exclude each other:
 * `updatePlacements`/`updateLanePositions` (they take the pen, not the plan advisory lock, so a
 * drag is never queued behind the engine's compute window) and the recalculation's `writeResults`
 * (which holds the plan lock). In `UPDATE … FROM unnest(…)` the order rows are locked follows the
 * join plan Postgres chooses, not the order the subquery is written in, so two overlapping batches
 * can each hold a row the other wants and Postgres aborts one with `40P01`. Sorting the `unnest`
 * does not fix that: a hash join locks in heap-scan order whatever it was fed.
 *
 * `SELECT … ORDER BY id … FOR NO KEY UPDATE` does: the PostgreSQL `SELECT` documentation ("The
 * Locking Clause") says rows are locked in the order they are returned, so with `ORDER BY` every
 * party acquires in one total order and no cycle can form. The repository already relies on the same
 * move for plan rows (`markScheduleInputsChanged`) and advisory keys (`resource-advisory-lock.ts`).
 * `NO KEY UPDATE` is the mode the `UPDATE` takes anyway, so the statement that follows re-acquires
 * what is already held.
 *
 * **The ids go in as `IN (SELECT … unnest(…))`, not `= ANY(array)`, and that was measured rather
 * than chosen on taste.** With `= ANY($1::uuid[])` over 2,000 ids, a recalculation that raced a
 * placement batch spent a median 3.2 s in this statement (CPU, no lock wait) against 0.4 s with the
 * `unnest` form, on the same plan and data (`docs/specs/correctness-sweep/m2-measurement.md`). The
 * statement is fast when nothing races it (8 to 17 ms either way), so the cause is something the
 * concurrent case adds; it was not isolated, and the record says so.
 *
 * The scope predicates repeat the `UPDATE`'s own (plan, organisation, not deleted), so a stale or
 * foreign id locks nothing. Must run inside the writer's transaction.
 */
export async function lockActivityRowsInIdOrder(
  db: Prisma.TransactionClient,
  organizationId: string,
  planId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.$queryRaw`
    SELECT 1
    FROM activities
    WHERE id IN (SELECT u FROM unnest(${[...ids]}::uuid[]) AS u)
      AND plan_id = ${planId}::uuid
      AND organization_id = ${organizationId}::uuid
      AND deleted_at IS NULL
    ORDER BY id
    FOR NO KEY UPDATE
  `;
}

/**
 * Lock every active activity of the given plans in id order, before a cascade soft-deletes them
 * (`docs/TECH_DEBT.md` #492). The cascade is one `updateMany` per plan set, and `updateMany` locks
 * rows in scan order; a placement batch or a recalculation locking the same rows in id order could
 * then hold what the delete wants while wanting what it holds. Locking here first, in the same id
 * order as {@link lockActivityRowsInIdOrder}, puts the delete in that one total order.
 *
 * Plan-wide rather than by id list because the cascade knows the plans, not the rows, and the
 * delete must wait for any row of those plans. Same `IN (SELECT … unnest(…))` form as above.
 */
export async function lockPlanActivityRowsInIdOrder(
  db: Prisma.TransactionClient,
  planIds: readonly string[],
): Promise<void> {
  if (planIds.length === 0) return;
  await db.$queryRaw`
    SELECT 1
    FROM activities
    WHERE plan_id IN (SELECT u FROM unnest(${[...planIds]}::uuid[]) AS u)
      AND deleted_at IS NULL
    ORDER BY id
    FOR NO KEY UPDATE
  `;
}

/**
 * Lock the named active activities in id order, without a plan or organisation scope. The cascade
 * resolves its ids from rows it has already read inside the caller's transaction (and the caller has
 * scoped them), so there is nothing further to narrow by; a stale id locks nothing.
 */
export async function lockActivityIdsInIdOrder(
  db: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.$queryRaw`
    SELECT 1
    FROM activities
    WHERE id IN (SELECT u FROM unnest(${[...ids]}::uuid[]) AS u)
      AND deleted_at IS NULL
    ORDER BY id
    FOR NO KEY UPDATE
  `;
}
