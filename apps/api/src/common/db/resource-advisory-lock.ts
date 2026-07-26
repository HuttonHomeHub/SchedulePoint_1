import { Prisma } from '@prisma/client';

/**
 * The fixed advisory-lock namespace for resource-assignment writes. Two operations
 * must serialise on a resource to keep the RESOURCE_IN_USE guard honest (ADR-0039
 * invariant (c)): **deleting** a resource (which checks no active assignment uses it)
 * and **assigning** that resource to an activity. Both take the lock under THIS
 * namespace so they contend on the same key; a single transaction alone does NOT
 * close the window under READ COMMITTED (a concurrent assign committed after the
 * delete's count but before its write is invisible to the count), so both call sites
 * go through this helper.
 */
const RESOURCE_LOCK_NAMESPACE = 'resource-assign';

/**
 * Take a transaction-scoped Postgres advisory lock keyed by the resource. The
 * resource delete-in-use guard and an activity's resource assignment serialise on
 * this key, so a resource can never be soft-deleted in the window between another
 * request's "no active assignment uses it" check and its write (leaving an active
 * assignment dangling to a deleted resource), and vice versa. Different resources
 * hash to different keys and never contend. Auto-releases at transaction end. Must
 * be called inside a `$transaction` (the `xact` variant).
 *
 * A `hashtext` collision between two distinct resource ids only causes harmless
 * false contention (they serialise unnecessarily) — never cross-resource
 * corruption — so the small key space is acceptable.
 */
export async function acquireResourceWriteLock(
  db: Prisma.TransactionClient,
  resourceId: string,
): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${RESOURCE_LOCK_NAMESPACE}), hashtext(${resourceId}))`;
}

/**
 * Take the same per-resource lock for MANY resources in **one** round trip — the GROUP-delete
 * path, whose subtree is bounded only by the org's resource pool (`RESOURCE_TREE_MAX_DEPTH` caps
 * depth, nothing caps a group's fan-out). Looping {@link acquireResourceWriteLock} there costs one
 * network round trip per descendant *while the org-wide resource-tree lock is held*, which
 * measured at ~830 ms for a 2,000-row subtree on loopback alone (≈13 ms batched) — an order of
 * magnitude past the `docs/PERFORMANCE.md` p95 budget, and every millisecond of it blocks every
 * other tree write in the tenant.
 *
 * Locks are acquired in **ascending id order** — the inner `ORDER BY` sorts the rows before the
 * target list evaluates `pg_advisory_xact_lock` per row, so the fixed total order the caller
 * relies on to avoid deadlocks is preserved by the database, not just by the caller's `sort()`.
 * A no-op on an empty list (never emit a statement for nothing).
 */
export async function acquireResourceWriteLocks(
  db: Prisma.TransactionClient,
  resourceIds: readonly string[],
): Promise<void> {
  if (resourceIds.length === 0) return;
  await db.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${RESOURCE_LOCK_NAMESPACE}), hashtext(id))
    FROM (SELECT unnest(${[...resourceIds]}::text[]) AS id ORDER BY 1) AS ordered`;
}
