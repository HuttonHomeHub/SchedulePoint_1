import { Prisma } from '@prisma/client';

/**
 * Row locks on the two ancestors a restore must find still active, and on the root a delete is
 * about to sweep (`docs/TECH_DEBT.md` #520, ADR-0200 D3).
 *
 * ## The defect these close
 *
 * A restore reads its parent and then writes on the strength of what it read; a client or project
 * delete sweeps its subtree and then stamps itself. With neither locked they interleave: the
 * restore sees an active parent, the delete misses the not-yet-restored child, and the child ends
 * ACTIVE under a deleted ancestor. Optimistic `version` cannot catch it, because the two write
 * different rows.
 *
 * ## The two halves, and why they conflict only with each other
 *
 * - A restore takes each ancestor `FOR SHARE`, **top-down** (client, then project). Shared locks do
 *   not conflict with each other, so two restores under one parent never queue behind one another.
 * - A client or project delete takes its own root row `FOR NO KEY UPDATE` **before it reads its
 *   subtree**. That is the lock an ordinary `UPDATE` takes, so it conflicts with `FOR SHARE` but
 *   not with the `FOR KEY SHARE` a child insert's foreign-key check takes, and creating a plan under
 *   a project is not held up by it.
 *
 * Under READ COMMITTED (the default; no `isolationLevel` is set on these transactions) either order
 * ends consistently. Restore first: the delete waits, then its later reads — new statements — see
 * the restored child and sweep it. Delete first: the restore's locking read waits, then PostgreSQL
 * re-evaluates `deleted_at IS NULL` against the committed row, matches nothing, and the restore is
 * refused `PARENT_DELETED`. `hierarchy-expiry.claim.ts` relies on the same re-evaluation.
 *
 * Locking only the immediate parent would not be enough for a plan: a client delete reads its
 * project and plan ids as a snapshot and takes the project rows only when it stamps them, so a plan
 * restore that locked just its project would never meet the client's lock.
 *
 * A restore must never take a plan advisory lock before its ancestor `FOR SHARE`. A project delete
 * holds the project row `FOR NO KEY UPDATE` and then takes the plan locks its cascade needs; a plan
 * restore that held a plan lock and then asked for the project row would wait on the delete while
 * the delete waits on that plan lock, and the two deadlock. Ancestors first, plan locks after.
 *
 * Every statement states `deleted_at IS NULL` (ADR-0172): "the ancestor is active" is the question,
 * and a deleted row must lock nothing and report nothing.
 */

/** Lock the client `FOR SHARE` if it is active. False means it is deleted (or gone). */
export async function lockActiveClientForShare(
  db: Prisma.TransactionClient,
  clientId: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM clients
    WHERE id = ${clientId}::uuid
      AND deleted_at IS NULL
    FOR SHARE
  `;
  return rows.length > 0;
}

/** Lock the project `FOR SHARE` if it is active. False means it is deleted (or gone). */
export async function lockActiveProjectForShare(
  db: Prisma.TransactionClient,
  projectId: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM projects
    WHERE id = ${projectId}::uuid
      AND deleted_at IS NULL
    FOR SHARE
  `;
  return rows.length > 0;
}

/**
 * Lock a project's whole ancestry `FOR SHARE`, top-down, and say whether every level is active.
 * The client is taken first so that it is the same order every restore uses; stopping at the first
 * deleted level is safe because that is already the answer.
 */
export async function lockActiveProjectChainForShare(
  db: Prisma.TransactionClient,
  chain: { clientId: string; projectId: string },
): Promise<boolean> {
  if (!(await lockActiveClientForShare(db, chain.clientId))) return false;
  return lockActiveProjectForShare(db, chain.projectId);
}

/**
 * Lock an active client row `FOR NO KEY UPDATE` before its delete cascade reads its subtree. A row
 * that is already deleted matches nothing, so a repeated delete stays the idempotent no-op its
 * `updateMany` guards already make it.
 */
export async function lockClientRowForDelete(
  db: Prisma.TransactionClient,
  clientId: string,
): Promise<void> {
  await db.$queryRaw`
    SELECT id
    FROM clients
    WHERE id = ${clientId}::uuid
      AND deleted_at IS NULL
    FOR NO KEY UPDATE
  `;
}

/** Lock an active project row `FOR NO KEY UPDATE` before its delete cascade reads its subtree. */
export async function lockProjectRowForDelete(
  db: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  await db.$queryRaw`
    SELECT id
    FROM projects
    WHERE id = ${projectId}::uuid
      AND deleted_at IS NULL
    FOR NO KEY UPDATE
  `;
}
