import type { Prisma } from '@prisma/client';
import { RESOURCE_ERROR, RESOURCE_TREE_MAX_DEPTH } from '@repo/types';

import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';

import type { ResourceRepository } from './resource.repository';

/** Where a resource is about to be nested. `selfId` is null on create (there is no subtree yet). */
export interface ResourceParentParams {
  parentId: string;
  organizationId: string;
  /** The resource being re-parented, or `null` when creating a brand-new one. */
  selfId: string | null;
}

/**
 * Resolve the ACTIVE subtree rooted at `rootId` — the row itself plus every active descendant —
 * breadth-first, one query per LEVEL (ADR-0053 §3). Mirrors `HierarchyLifecycleService`'s
 * `resolveActivitySubtree` (the ADR-0038 precedent) rather than a recursive CTE, so every read
 * still goes through the repository's centralised soft-delete + org filter — a `$queryRaw` CTE
 * would bypass exactly the anti-IDOR guardrail the house rule exists to protect.
 *
 * The `visited` set plus the acyclicity invariant bound the walk; a level that yields no new ids
 * terminates it. Only a `GROUP` may be a parent, so a leaf resolves to just itself in one hop.
 *
 * MUST run inside the caller's transaction, AFTER `acquireResourceTreeWriteLock`, whenever the
 * result is used to write: otherwise a concurrent reparent can move a row into the branch between
 * this walk and the write, leaving an active child under a soft-deleted parent.
 */
export async function resolveActiveSubtreeIds(
  db: Prisma.TransactionClient,
  resources: ResourceRepository,
  rootId: string,
  organizationId: string,
): Promise<string[]> {
  const all = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await resources.findActiveChildIdsOf(frontier, organizationId, db);
    frontier = children.filter((id) => !all.has(id));
    for (const id of frontier) all.add(id);
  }
  return [...all];
}

/**
 * The HEIGHT of the active subtree rooted at `rootId`, in nodes: a leaf is 1, a group with one
 * level of children is 2. Needed because a depth cap measured from the ancestors ALONE is
 * unsound: a planner could move a 6-deep branch under a 6-deep parent and land at 12. The
 * resulting maximum depth is `depth(newParent) + height(movedSubtree)`, and that is what
 * {@link assertValidResourceParent} caps.
 */
async function activeSubtreeHeight(
  db: Prisma.TransactionClient,
  resources: ResourceRepository,
  rootId: string,
  organizationId: string,
): Promise<number> {
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  let height = 1;
  // Bounded by the depth cap: a tree that already violates it would loop at most once more, and
  // the acyclicity invariant guarantees termination regardless.
  while (frontier.length > 0) {
    const children = await resources.findActiveChildIdsOf(frontier, organizationId, db);
    frontier = children.filter((id) => !seen.has(id));
    for (const id of frontier) seen.add(id);
    if (frontier.length > 0) height += 1;
  }
  return height;
}

/**
 * THE resource-tree parent invariant, in one place (ADR-0053 §3). A `parentId` is usable iff the
 * parent is an ACTIVE resource in the same organisation, of kind `GROUP`, is neither the resource
 * itself nor one of its descendants, and nesting there keeps the tree within
 * {@link RESOURCE_TREE_MAX_DEPTH}.
 *
 * The DB owns only what a single row can prove (`ck_resources_parent_not_self`); everything else
 * needs the PARENT row, so it lives here — the identical split ADR-0038 makes for the WBS
 * parent-type rule. The walk is ITERATIVE and repository-backed rather than a recursive CTE: the
 * depth is hard-capped at 10, so it is at most ten single-row lookups, and staying on the
 * repository keeps the soft-delete + org filter centralised.
 *
 * MUST run inside the caller's transaction, AFTER `acquireResourceTreeWriteLock(organizationId)`.
 * The lock is org-scoped rather than per-resource because acyclicity is a property of the WHOLE
 * tree: two concurrent MIRROR reparents ("A under B", "B under A") take different per-resource
 * keys, never contend, and each walks a tree without the other's uncommitted write — so both
 * walks legitimately see no cycle and the two commits jointly form one.
 *
 * Failure modes are split so the tree never becomes a cross-tenant existence oracle: a foreign /
 * soft-deleted / unknown parent id is indistinguishable from missing (**404**), while an in-org
 * parent that is semantically unusable is a **422**, and a would-be cycle is a **409**.
 */
export async function assertValidResourceParent(
  db: Prisma.TransactionClient,
  resources: ResourceRepository,
  params: ResourceParentParams,
): Promise<void> {
  const { parentId, organizationId, selfId } = params;

  // The trivial one-node cycle, short-circuited before any query (ck_resources_parent_not_self is
  // the DB backstop). Reported as a cycle, not a shape error, because that is what it is.
  if (selfId !== null && parentId === selfId) {
    throw new ConflictError(RESOURCE_ERROR.RESOURCE_PARENT_CYCLE, {
      reason: 'RESOURCE_PARENT_CYCLE',
      parentId,
    });
  }

  const parent = await resources.findActiveByIdInOrg(parentId, organizationId, db);
  // Cross-org, soft-deleted and unknown all read the same: 404, leaking nothing.
  if (!parent) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
  // Defence in depth. `findActiveByIdInOrg` already filters by org, so this branch is unreachable
  // over HTTP — it exists so that a future caller passing a differently-scoped repository (or a
  // refactor that loosens that filter) fails closed here instead of silently nesting across
  // tenants. Covered by a unit test against a stubbed repository.
  if (parent.organizationId !== organizationId) {
    throw new ValidationError(RESOURCE_ERROR.RESOURCE_PARENT_WRONG_SCOPE, {
      reason: 'RESOURCE_PARENT_WRONG_SCOPE',
      parentId,
    });
  }
  // Only a GROUP may contain resources — the whole point of the kind (ADR-0053 §3). A CHECK
  // cannot read the parent row, so this is the service's job (ADR-0038's PARENT_NOT_SUMMARY).
  if (parent.kind !== 'GROUP') {
    throw new ValidationError(RESOURCE_ERROR.RESOURCE_PARENT_NOT_GROUP, {
      reason: 'RESOURCE_PARENT_NOT_GROUP',
      parentId,
    });
  }

  // Walk UP from the proposed parent: reaching `selfId` means the parent sits inside self's own
  // subtree, so the move would make the tree cyclic. The same walk counts the parent's depth
  // (1 = top level), which the cap below needs. Bounded by the acyclicity invariant, and belt-and-
  // braces by a visited set so a pre-existing cycle (only reachable by direct DB tampering) cannot
  // hang the request.
  const seen = new Set<string>([parent.id]);
  let parentDepth = 1;
  let ancestorId: string | null = parent.parentId;
  while (ancestorId !== null) {
    if (ancestorId === selfId) {
      throw new ConflictError(RESOURCE_ERROR.RESOURCE_PARENT_CYCLE, {
        reason: 'RESOURCE_PARENT_CYCLE',
        parentId,
      });
    }
    if (seen.has(ancestorId)) break;
    seen.add(ancestorId);
    parentDepth += 1;
    const ancestor = await resources.findActiveByIdInOrg(ancestorId, organizationId, db);
    ancestorId = ancestor?.parentId ?? null;
  }

  // Depth is measured as the NEW PARENT'S depth plus the height of the subtree being moved, so a
  // deep branch cannot be slipped under a deep parent to exceed the cap. On create there is no
  // subtree yet, so the height is 1.
  const movedHeight =
    selfId === null ? 1 : await activeSubtreeHeight(db, resources, selfId, organizationId);
  if (parentDepth + movedHeight > RESOURCE_TREE_MAX_DEPTH) {
    throw new ValidationError(RESOURCE_ERROR.RESOURCE_TREE_TOO_DEEP, {
      reason: 'RESOURCE_TREE_TOO_DEEP',
      parentId,
      maxDepth: RESOURCE_TREE_MAX_DEPTH,
      resultingDepth: parentDepth + movedHeight,
    });
  }
}
