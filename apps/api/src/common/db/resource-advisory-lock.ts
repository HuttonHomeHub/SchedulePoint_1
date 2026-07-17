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
