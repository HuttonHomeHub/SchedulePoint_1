import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '../errors/domain-errors';

/** The four levels of the Client → Project → Plan → Activity hierarchy. */
export type HierarchyEntity = 'client' | 'project' | 'plan' | 'activity';

/** Per-level row counts affected by a cascade operation. */
export interface CascadeCounts {
  clients: number;
  projects: number;
  plans: number;
  activities: number;
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
    const counts: CascadeCounts = { clients: 0, projects: 0, plans: 0, activities: 0 };

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
      counts.activities = await deleteActivitiesUnderPlans(planIds);
      counts.plans = (
        await tx.plan.updateMany({ where: { projectId: id, deletedAt: null }, data: stamp })
      ).count;
      counts.projects = (
        await tx.project.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    } else if (entity === 'plan') {
      counts.activities = await deleteActivitiesUnderPlans([id]);
      counts.plans = (
        await tx.plan.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    } else {
      // Activity is a leaf — soft-delete just this row.
      counts.activities = (
        await tx.activity.updateMany({ where: { id, deletedAt: null }, data: stamp })
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
    const counts: CascadeCounts = { clients: 0, projects: 0, plans: 0, activities: 0 };

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
        } else {
          await tx.activity.update({ where: { id }, data: restore });
          counts.activities = 1;
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
    const row = await tx.activity.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { deleteBatchId: true, planId: true },
    });
    if (!row) throw new NotFoundError('Activity not found.');
    return { deleteBatchId: row.deleteBatchId, parentId: row.planId };
  }

  /** A client's parent is its org (always active here); a project/plan/activity's
   * is its client/project/plan — which must be active to restore under it. */
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
      parentActive = await tx.plan.findFirst({ where: { id: root.parentId, deletedAt: null } });
    }
    if (!parentActive) {
      throw new ConflictError('Restore the parent first.', {
        reason: HIERARCHY_CONFLICT.PARENT_DELETED,
      });
    }
  }
}
