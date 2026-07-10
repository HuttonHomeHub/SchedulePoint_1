import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '../errors/domain-errors';

/**
 * The four levels of the Client → Project → Plan → Activity hierarchy, plus
 * `dependency` — the activity logic ties (edges). Dependencies are not a level of
 * the tree: they hang off a plan and reference two activities, so they are
 * swept into a cascade (by plan, or when an incident activity is deleted) and
 * restored **endpoint-guarded** (only when both their activities are active).
 */
export type HierarchyEntity = 'client' | 'project' | 'plan' | 'activity' | 'dependency';

/** Per-level row counts affected by a cascade operation. */
export interface CascadeCounts {
  clients: number;
  projects: number;
  plans: number;
  activities: number;
  dependencies: number;
}

export interface CascadeDeleteResult {
  /** Correlation id stamped on every row deleted together (the restore unit). */
  batchId: string;
  counts: CascadeCounts;
}

/** Machine-readable reasons carried in a {@link ConflictError}'s `details`. */
export const HIERARCHY_CONFLICT = {
  /** Tried to restore a row whose parent is still soft-deleted (restore top-down). */
  PARENT_DELETED: 'PARENT_DELETED',
  /** Restoring/writing would collide with an active sibling of the same name. */
  NAME_TAKEN: 'NAME_TAKEN',
  /** Writing would collide with an active sibling of the same code (activities). */
  CODE_TAKEN: 'CODE_TAKEN',
} as const;

/**
 * Shared soft-delete lifecycle for the Client → Project → Plan hierarchy
 * (feature: hierarchy CRUD). Deletion is **soft and cascading**: deleting a row
 * stamps it and its whole active subtree, in the caller's transaction, with one
 * `deleteBatchId` so restoring the row later restores exactly that batch (and
 * nothing deleted separately). Restore is **top-down**: a row can only be
 * restored while its parent is active (`PARENT_DELETED` otherwise), which keeps
 * the "no orphan under a deleted ancestor" invariant.
 *
 * Authorisation and org-scoping are the caller's job (services do
 * `resolveScope` + `assertCan` first); this service owns only the lifecycle
 * mechanics, always operating on the transaction handle it is given.
 */
@Injectable()
export class HierarchyLifecycleService {
  /**
   * Soft-delete `entity` #id and its active descendants under one batch id.
   * The caller must have verified the row exists, is active, and is in scope.
   */
  async cascadeSoftDelete(
    tx: Prisma.TransactionClient,
    entity: HierarchyEntity,
    id: string,
    actorId: string,
  ): Promise<CascadeDeleteResult> {
    const batchId = randomUUID();
    const stamp = { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId };
    const counts: CascadeCounts = {
      clients: 0,
      projects: 0,
      plans: 0,
      activities: 0,
      dependencies: 0,
    };

    // Soft-delete the active activities under a set of plans, in one updateMany.
    const deleteActivitiesUnderPlans = async (planIds: string[]): Promise<number> => {
      if (planIds.length === 0) return 0;
      return (
        await tx.activity.updateMany({
          where: { planId: { in: planIds }, deletedAt: null },
          data: stamp,
        })
      ).count;
    };

    // Soft-delete the active dependencies contained in a set of plans (links are
    // plan-scoped, so `plan_id IN planIds` catches every link incident to any of
    // those plans' activities), in the same batch.
    const deleteLinksUnderPlans = async (planIds: string[]): Promise<number> => {
      if (planIds.length === 0) return 0;
      return (
        await tx.activityDependency.updateMany({
          where: { planId: { in: planIds }, deletedAt: null },
          data: stamp,
        })
      ).count;
    };

    // Soft-delete the active dependencies incident to a single activity (either
    // direction) — used when an activity leaf is deleted on its own.
    const deleteLinksForActivity = async (activityId: string): Promise<number> =>
      (
        await tx.activityDependency.updateMany({
          where: {
            deletedAt: null,
            OR: [{ predecessorId: activityId }, { successorId: activityId }],
          },
          data: stamp,
        })
      ).count;

    // Root updates use updateMany with a `deletedAt: null` guard (not `update`)
    // so the whole cascade is idempotent: a concurrent delete of the same row
    // re-stamps nothing (its updateMany matches 0 already-deleted rows), which
    // prevents a split batch under a delete/delete race (security review §3).
    // Children are stamped before parents (activities → plans → projects → client),
    // all with the same batch id, so a restore of the root reactivates the subtree.
    if (entity === 'client') {
      // Resolve the active subtree top-down BEFORE deleting it: the client's active
      // projects, then the active plans under them, then those plans' activities —
      // active-only so separately-deleted subtrees (their own batch) are untouched.
      const projectIds = (
        await tx.project.findMany({
          where: { clientId: id, deletedAt: null },
          select: { id: true },
        })
      ).map((p) => p.id);
      const planIds =
        projectIds.length > 0
          ? (
              await tx.plan.findMany({
                where: { projectId: { in: projectIds }, deletedAt: null },
                select: { id: true },
              })
            ).map((p) => p.id)
          : [];
      counts.dependencies = await deleteLinksUnderPlans(planIds);
      counts.activities = await deleteActivitiesUnderPlans(planIds);
      if (planIds.length > 0) {
        counts.plans = (
          await tx.plan.updateMany({ where: { id: { in: planIds }, deletedAt: null }, data: stamp })
        ).count;
      }
      counts.projects = (
        await tx.project.updateMany({ where: { clientId: id, deletedAt: null }, data: stamp })
      ).count;
      counts.clients = (
        await tx.client.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    } else if (entity === 'project') {
      const planIds = (
        await tx.plan.findMany({ where: { projectId: id, deletedAt: null }, select: { id: true } })
      ).map((p) => p.id);
      counts.dependencies = await deleteLinksUnderPlans(planIds);
      counts.activities = await deleteActivitiesUnderPlans(planIds);
      counts.plans = (
        await tx.plan.updateMany({ where: { projectId: id, deletedAt: null }, data: stamp })
      ).count;
      counts.projects = (
        await tx.project.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    } else if (entity === 'plan') {
      counts.dependencies = await deleteLinksUnderPlans([id]);
      counts.activities = await deleteActivitiesUnderPlans([id]);
      counts.plans = (
        await tx.plan.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    } else if (entity === 'activity') {
      // Activity leaf — soft-delete this row and its incident links (either direction).
      counts.dependencies = await deleteLinksForActivity(id);
      counts.activities = (
        await tx.activity.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    } else {
      // Dependency leaf — a directly-deleted link, its own fresh batch.
      counts.dependencies = (
        await tx.activityDependency.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    }

    return { batchId, counts };
  }

  /**
   * Restore `entity` #id and everything soft-deleted with it (same batch).
   * Throws {@link NotFoundError} if the row is missing or not deleted,
   * `PARENT_DELETED` if its parent is still deleted, or `NAME_TAKEN` if
   * reactivating would collide with an active sibling.
   */
  async restoreBatch(
    tx: Prisma.TransactionClient,
    entity: HierarchyEntity,
    id: string,
    actorId: string,
  ): Promise<CascadeCounts> {
    const root = await this.loadDeletedRoot(tx, entity, id);
    await this.assertParentActive(tx, entity, root);

    // Every soft-deleted row carries a batch id; fall back to the row itself for
    // defensiveness. Restore across all four tables so a client's batch (which
    // spans projects/plans/activities) is reactivated in one shot.
    const batchId = root.deleteBatchId ?? undefined;
    const restore = { deletedAt: null, deleteBatchId: null, updatedBy: actorId };
    const counts: CascadeCounts = {
      clients: 0,
      projects: 0,
      plans: 0,
      activities: 0,
      dependencies: 0,
    };

    try {
      if (batchId) {
        counts.clients = (
          await tx.client.updateMany({ where: { deleteBatchId: batchId }, data: restore })
        ).count;
        counts.projects = (
          await tx.project.updateMany({ where: { deleteBatchId: batchId }, data: restore })
        ).count;
        counts.plans = (
          await tx.plan.updateMany({ where: { deleteBatchId: batchId }, data: restore })
        ).count;
        counts.activities = (
          await tx.activity.updateMany({ where: { deleteBatchId: batchId }, data: restore })
        ).count;
        // Restore the batch's links AFTER their activities, and only where BOTH
        // endpoints are now active — a link whose other end was deleted separately
        // stays soft-deleted (endpoint-guarded; see ADR-0021 / DECISIONS.md).
        counts.dependencies = await this.restoreLinksInBatch(tx, batchId, restore);
      } else {
        // Defensive: a soft-deleted row should always carry a batch id.
        if (entity === 'client') {
          await tx.client.update({ where: { id }, data: restore });
          counts.clients = 1;
        } else if (entity === 'project') {
          await tx.project.update({ where: { id }, data: restore });
          counts.projects = 1;
        } else if (entity === 'plan') {
          await tx.plan.update({ where: { id }, data: restore });
          counts.plans = 1;
        } else if (entity === 'activity') {
          await tx.activity.update({ where: { id }, data: restore });
          counts.activities = 1;
        } else {
          await tx.activityDependency.update({ where: { id }, data: restore });
          counts.dependencies = 1;
        }
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('A sibling with this name already exists.', {
          reason: HIERARCHY_CONFLICT.NAME_TAKEN,
        });
      }
      throw error;
    }

    return counts;
  }

  /**
   * Reactivate the dependencies stamped with `batchId`, but only where BOTH
   * endpoint activities are currently active. Links whose other end was deleted
   * in a different batch (a single-activity delete) stay soft-deleted — the
   * endpoint-guard that keeps a restore from resurrecting a dangling edge. Plan-
   * level batches are self-consistent (all endpoints are in the same batch), so
   * only a single-activity restore can leave a link behind.
   */
  private async restoreLinksInBatch(
    tx: Prisma.TransactionClient,
    batchId: string,
    restore: { deletedAt: null; deleteBatchId: null; updatedBy: string },
  ): Promise<number> {
    const links = await tx.activityDependency.findMany({
      where: { deleteBatchId: batchId },
      select: { id: true, predecessorId: true, successorId: true },
    });
    if (links.length === 0) return 0;

    const endpointIds = [...new Set(links.flatMap((l) => [l.predecessorId, l.successorId]))];
    const active = new Set(
      (
        await tx.activity.findMany({
          where: { id: { in: endpointIds }, deletedAt: null },
          select: { id: true },
        })
      ).map((a) => a.id),
    );
    const restorable = links
      .filter((l) => active.has(l.predecessorId) && active.has(l.successorId))
      .map((l) => l.id);
    if (restorable.length === 0) return 0;

    return (
      await tx.activityDependency.updateMany({ where: { id: { in: restorable } }, data: restore })
    ).count;
  }

  private async loadDeletedRoot(
    tx: Prisma.TransactionClient,
    entity: HierarchyEntity,
    id: string,
  ): Promise<{ deleteBatchId: string | null; parentId: string | null }> {
    if (entity === 'client') {
      const row = await tx.client.findFirst({
        where: { id, deletedAt: { not: null } },
        select: { deleteBatchId: true },
      });
      if (!row) throw new NotFoundError('Client not found.');
      return { deleteBatchId: row.deleteBatchId, parentId: null };
    }
    if (entity === 'project') {
      const row = await tx.project.findFirst({
        where: { id, deletedAt: { not: null } },
        select: { deleteBatchId: true, clientId: true },
      });
      if (!row) throw new NotFoundError('Project not found.');
      return { deleteBatchId: row.deleteBatchId, parentId: row.clientId };
    }
    if (entity === 'plan') {
      const row = await tx.plan.findFirst({
        where: { id, deletedAt: { not: null } },
        select: { deleteBatchId: true, projectId: true },
      });
      if (!row) throw new NotFoundError('Plan not found.');
      return { deleteBatchId: row.deleteBatchId, parentId: row.projectId };
    }
    if (entity === 'activity') {
      const row = await tx.activity.findFirst({
        where: { id, deletedAt: { not: null } },
        select: { deleteBatchId: true, planId: true },
      });
      if (!row) throw new NotFoundError('Activity not found.');
      return { deleteBatchId: row.deleteBatchId, parentId: row.planId };
    }
    // Dependency — its parent for the restore guard is its plan (this slice has no
    // standalone dependency-restore endpoint; links come back with their batch).
    const row = await tx.activityDependency.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { deleteBatchId: true, planId: true },
    });
    if (!row) throw new NotFoundError('Dependency not found.');
    return { deleteBatchId: row.deleteBatchId, parentId: row.planId };
  }

  /** A client's parent is its org (always active here); a project/plan/activity/
   * dependency's is its client/project/plan/plan — which must be active to restore
   * under it. */
  private async assertParentActive(
    tx: Prisma.TransactionClient,
    entity: HierarchyEntity,
    root: { parentId: string | null },
  ): Promise<void> {
    if (entity === 'client' || root.parentId === null) return;
    let parentActive: unknown;
    if (entity === 'project') {
      parentActive = await tx.client.findFirst({ where: { id: root.parentId, deletedAt: null } });
    } else if (entity === 'plan') {
      parentActive = await tx.project.findFirst({ where: { id: root.parentId, deletedAt: null } });
    } else {
      // activity or dependency — the parent is the plan.
      parentActive = await tx.plan.findFirst({ where: { id: root.parentId, deletedAt: null } });
    }
    if (!parentActive) {
      throw new ConflictError('Restore the parent first.', {
        reason: HIERARCHY_CONFLICT.PARENT_DELETED,
      });
    }
  }
}
