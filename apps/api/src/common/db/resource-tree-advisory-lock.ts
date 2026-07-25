import { Prisma } from '@prisma/client';

/**
 * The fixed advisory-lock namespace for RESOURCE-TREE structure writes (ADR-0053 §3).
 * Deliberately distinct from the `resource-assign` namespace: that lock is keyed by a
 * single resource and serialises the RESOURCE_IN_USE guard against an assign, whereas
 * this one is keyed by the ORGANISATION and serialises anything that changes the SHAPE
 * of the org's resource tree.
 */
const RESOURCE_TREE_LOCK_NAMESPACE = 'resource-tree';

/**
 * Take a transaction-scoped Postgres advisory lock keyed by the ORGANISATION, held by every
 * write that changes a resource's `parent_id` (or its `kind` to/from `GROUP`).
 *
 * WHY ORG-SCOPED, not per-resource. Acyclicity is a property of the whole tree, and the
 * ancestor walk that proves it reads rows the walker does not lock. Two concurrent MIRROR
 * reparents — "put A under B" and "put B under A" — each walk a tree in which the other's
 * write has not yet committed, so each walk legitimately sees no cycle, and the two commits
 * together form one. Per-resource locks cannot close that window: the two transactions take
 * DIFFERENT keys (A and B) and never contend. Locking the org makes every tree-shape change
 * serial, so the second transaction's walk runs against the first's committed tree and
 * rejects with `RESOURCE_PARENT_CYCLE`. This is the ADR-0038 per-plan-lock analogue — the
 * WBS tree's scope is the plan, the resource tree's scope is the organisation.
 *
 * The cost is deliberately bounded: only PARENT-CHANGING writes take it. Creating a leaf,
 * renaming, editing a rate, deleting a childless resource and every read stay on today's
 * per-resource lock (or no lock at all), so the hot paths are untouched by this serialisation.
 *
 * Auto-releases at transaction end. Must be called inside a `$transaction` (the `xact`
 * variant). A `hashtext` collision between two organisation ids only causes harmless false
 * contention — two tenants' tree writes serialise unnecessarily — never cross-tenant
 * corruption, since every query inside still filters by `organization_id`.
 */
export async function acquireResourceTreeWriteLock(
  db: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${RESOURCE_TREE_LOCK_NAMESPACE}), hashtext(${organizationId}))`;
}
