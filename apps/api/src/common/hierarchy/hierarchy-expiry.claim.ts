import type { Prisma } from '@prisma/client';

import type { ExpiryRoot } from './hierarchy-expiry.candidates';

/**
 * **The claim: re-assert, inside the deleting transaction, that the root is still what the scan
 * saw** — deleted, still past the cutoff, and in the same deletion batch.
 *
 * The sweep selects its candidates first and deletes each in its own transaction later (seconds to
 * tens of seconds on a large run). A planner who restores a root in that gap must win: without this
 * step the restored, live work was permanently deleted by id, with a `hierarchy.expired` row
 * claiming it had expired (`docs/specs/recycle-bin-clear-out/feature-spec.md` §1, item 2).
 *
 * **It is an `updateMany` that writes back the value it matched on**, so its only effects are the
 * count and the row lock (and Prisma's `@updatedAt` bumps `updated_at`, which nothing reads: the row
 * is deleted in the same transaction, or the transaction does nothing). The lock is the point: a restore of the same root waits behind it, then
 * finds the row gone and answers 404; a restore that got there first has already changed
 * `deleted_at`, so Postgres re-evaluates this predicate after the wait (READ COMMITTED) and counts
 * 0. Either order, one side wins and the other does nothing. Raw `SELECT … FOR UPDATE` was rejected
 * because raw SQL is banned in this directory (`hierarchy-expiry.structural.spec.ts`).
 *
 * Kept out of `hierarchy-expiry.runner.ts` on purpose: that file's gate forbids the batch key, since
 * a batch-keyed DELETE is the bug ownership scope exists to avoid. This one never deletes by it.
 *
 * @returns whether the root was claimed; when `false`, the caller must delete nothing.
 */
export async function claimExpiredRoot(
  tx: Prisma.TransactionClient,
  root: Pick<ExpiryRoot, 'kind' | 'id' | 'deleteBatchId'>,
  cutoff: Date,
): Promise<boolean> {
  const where = {
    id: root.id,
    deletedAt: { lt: cutoff },
    deleteBatchId: root.deleteBatchId,
  };
  const data = { deleteBatchId: root.deleteBatchId };
  const result =
    root.kind === 'client'
      ? await tx.client.updateMany({ where, data })
      : root.kind === 'project'
        ? await tx.project.updateMany({ where, data })
        : await tx.plan.updateMany({ where, data });
  return result.count === 1;
}
