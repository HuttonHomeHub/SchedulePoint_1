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
 * The fixed advisory-lock namespace for ORG-scoped cross-plan schedule writes. A cross-plan
 * dependency create (inter-project M2, ADR-0045 §3) must serialise per ORGANISATION so two
 * concurrent creates of mirror edges (A→B and B→A across the org's plans) cannot each pass the
 * plan-level cycle walk and both persist. This is a DISTINCT namespace from {@link PLAN_LOCK_NAMESPACE}
 * so a cross-plan create never collides with — nor blocks — a same-key plan write lock: the two-int
 * advisory key's first slot (the namespace hash) differs, so even an org id and a plan id that hashed
 * to the same second slot take different locks.
 */
const CROSS_PLAN_ORG_LOCK_NAMESPACE = 'cross-plan-org';

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

/**
 * Take a transaction-scoped Postgres advisory lock keyed by the ORGANISATION, serialising
 * cross-plan dependency creates within one org (ADR-0045 §3) so a concurrent mirror insert cannot
 * race the plan-level cycle walk. Uses {@link CROSS_PLAN_ORG_LOCK_NAMESPACE} — a distinct key
 * namespace from the plan write lock — so it never contends with a per-plan write. Must be called
 * inside a `$transaction` (the `xact` variant); the lock auto-releases when the transaction ends.
 *
 * A `hashtext` collision between two distinct org ids would only cause harmless false contention
 * (two orgs' cross-plan creates serialise unnecessarily) — never corruption — so the small key
 * space is acceptable, exactly as for the plan lock.
 */
export async function acquireOrgCrossPlanLock(
  db: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CROSS_PLAN_ORG_LOCK_NAMESPACE}), hashtext(${organizationId}))`;
}
