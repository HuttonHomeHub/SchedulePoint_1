import { Prisma } from '@prisma/client';

/**
 * The fixed advisory-lock namespace for plan-scoped schedule writes. Any operation
 * that must serialise per plan — a dependency create's cycle check (ADR-0021) and
 * a CPM recalculation's read-then-write (ADR-0022) — takes the lock under THIS
 * namespace so they contend on the same key. Changing it in one place only would
 * silently break that mutual exclusion, so both call sites go through this helper.
 */
const PLAN_LOCK_NAMESPACE = 'dependency-plan';

/**
 * Take a transaction-scoped Postgres advisory lock keyed by the plan. Concurrent
 * writers in the SAME plan are serialised; different plans (and orgs) hash to
 * different keys and never contend. The lock auto-releases when the transaction
 * ends. Must be called inside a `$transaction` (the `xact` variant) — passing the
 * base client would take a session lock that never releases.
 *
 * A `hashtext` collision between two distinct plan ids would only cause harmless
 * false contention (the two serialise unnecessarily) — never cross-plan
 * corruption — so the small key space is acceptable here.
 */
export async function acquirePlanWriteLock(
  db: Prisma.TransactionClient,
  planId: string,
): Promise<void> {
  // Two-int form: a fixed namespace hash + the plan-id hash (both int4 via hashtext).
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PLAN_LOCK_NAMESPACE}), hashtext(${planId}))`;
}
