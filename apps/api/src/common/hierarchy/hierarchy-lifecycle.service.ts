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
  /** Baselines swept under the deleted plans (M7, ADR-0025). Their snapshot rows share the batch. */
  baselines: number;
  /** Activity steps swept when their owning activities are deleted (M7 rung 5, ADR-0044 §2). */
  steps: number;
  /**
   * Notes swept under the deleted plans/activities (the Notes feature, ADR-0046). Every note carries
   * a denormalised `plan_id`, so a plan/project/client delete sweeps PLAN + ACTIVITY notes in one pass
   * (no double-count); a single-activity delete sweeps that activity subtree's notes by `activity_id`.
   */
  notes: number;
  /**
   * Share links swept under the deleted plans (Stage F, ADR-0051). A `plan_share` carries its plan's
   * `plan_id` directly, so a plan/project/client delete sweeps its links in one pass by `plan_id` (the
   * Note precedent). Plan-scoped only — a single-activity delete never touches share links.
   */
  planShares: number;
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
      baselines: 0,
      steps: 0,
      notes: 0,
      planShares: 0,
    };

    // Soft-delete the active baselines (and their snapshot rows) under a set of plans
    // (M7, ADR-0025). Baselines are plan-scoped descendants — not an activity concern —
    // so only a plan/project/client delete sweeps them, never a single-activity delete.
    // Snapshot rows are stamped first (children), via their parent baseline's plan.
    const deleteBaselinesUnderPlans = async (planIds: string[]): Promise<number> => {
      if (planIds.length === 0) return 0;
      await tx.baselineActivity.updateMany({
        where: { baseline: { planId: { in: planIds } }, deletedAt: null },
        data: stamp,
      });
      return (
        await tx.baseline.updateMany({
          where: { planId: { in: planIds }, deletedAt: null },
          data: stamp,
        })
      ).count;
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

    // Soft-delete the active dependencies incident to any of a set of activities
    // (either direction) — used when an activity subtree is deleted. A single leaf
    // passes a one-element set; a WBS_SUMMARY passes its whole `parent_id` subtree
    // (the summary itself carries no logic, but its descendant tasks do).
    const deleteLinksForActivities = async (activityIds: string[]): Promise<number> => {
      if (activityIds.length === 0) return 0;
      return (
        await tx.activityDependency.updateMany({
          where: {
            deletedAt: null,
            OR: [{ predecessorId: { in: activityIds } }, { successorId: { in: activityIds } }],
          },
          data: stamp,
        })
      ).count;
    };

    // Soft-delete the active steps of the activities under a set of plans (M7 rung 5, ADR-0044 §2),
    // in the same batch — a plan/project/client delete sweeps every step of every activity it contains
    // (via the step's `activity` relation), the baseline/dependency precedent one level deeper.
    const deleteStepsUnderPlans = async (planIds: string[]): Promise<number> => {
      if (planIds.length === 0) return 0;
      return (
        await tx.activityStep.updateMany({
          where: { activity: { planId: { in: planIds } }, deletedAt: null },
          data: stamp,
        })
      ).count;
    };

    // Soft-delete the active steps of a set of activities (M7 rung 5, ADR-0044 §2) — used when an
    // activity subtree is deleted, so the checklist follows its activity under the one batch id.
    const deleteStepsForActivities = async (activityIds: string[]): Promise<number> => {
      if (activityIds.length === 0) return 0;
      return (
        await tx.activityStep.updateMany({
          where: { activityId: { in: activityIds }, deletedAt: null },
          data: stamp,
        })
      ).count;
    };

    // Soft-delete the active notes under a set of plans (the Notes feature, ADR-0046), in the same
    // batch. Every note — PLAN and ACTIVITY alike — carries the denormalised `plan_id`, so this SINGLE
    // sweep by `plan_id` catches both kinds with NO double-count (an activity note is not swept again
    // by `deleteNotesForActivities` here — that helper is only for a single-activity delete).
    const deleteNotesUnderPlans = async (planIds: string[]): Promise<number> => {
      if (planIds.length === 0) return 0;
      return (
        await tx.note.updateMany({
          where: { planId: { in: planIds }, deletedAt: null },
          data: stamp,
        })
      ).count;
    };

    // Soft-delete the active notes of a set of activities (ADR-0046) — used when an activity subtree is
    // deleted, so an activity's note thread follows it under the one batch id. Swept by `activity_id`
    // (PLAN notes have none), the step/link precedent.
    const deleteNotesForActivities = async (activityIds: string[]): Promise<number> => {
      if (activityIds.length === 0) return 0;
      return (
        await tx.note.updateMany({
          where: { activityId: { in: activityIds }, deletedAt: null },
          data: stamp,
        })
      ).count;
    };

    // Soft-delete the active share links under a set of plans (Stage F, ADR-0051), in the same batch.
    // A link is plan-scoped (its `plan_id` is the ONE plan it grants), so this single sweep by `plan_id`
    // stamps every live link of every deleted plan — the Note-under-plans precedent. Plan-scoped only:
    // there is no per-activity variant (a share link never hangs off an activity). A deleted plan's
    // links therefore stop resolving (the guard re-checks the live plan too), and a plan restore brings
    // exactly this batch's links back.
    const deletePlanSharesUnderPlans = async (planIds: string[]): Promise<number> => {
      if (planIds.length === 0) return 0;
      return (
        await tx.planShare.updateMany({
          where: { planId: { in: planIds }, deletedAt: null },
          data: stamp,
        })
      ).count;
    };

    // Resolve an activity's active `parent_id` subtree (the row itself + every
    // active descendant), breadth-first. Only a WBS_SUMMARY can be a parent
    // (service-enforced), so a leaf activity resolves to just itself in one hop.
    // The visited guard + the acyclic parent-tree invariant (ADR-0038) bound this;
    // a level that returns no new ids terminates the walk.
    const resolveActivitySubtree = async (rootId: string): Promise<string[]> => {
      const all = new Set<string>([rootId]);
      let frontier = [rootId];
      while (frontier.length > 0) {
        const children = (
          await tx.activity.findMany({
            where: { parentId: { in: frontier }, deletedAt: null },
            select: { id: true },
          })
        ).map((c) => c.id);
        frontier = children.filter((id) => !all.has(id));
        for (const id of frontier) all.add(id);
      }
      return [...all];
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
      counts.baselines = await deleteBaselinesUnderPlans(planIds);
      counts.dependencies = await deleteLinksUnderPlans(planIds);
      counts.steps = await deleteStepsUnderPlans(planIds);
      counts.notes = await deleteNotesUnderPlans(planIds);
      counts.planShares = await deletePlanSharesUnderPlans(planIds);
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
      counts.baselines = await deleteBaselinesUnderPlans(planIds);
      counts.dependencies = await deleteLinksUnderPlans(planIds);
      counts.steps = await deleteStepsUnderPlans(planIds);
      counts.notes = await deleteNotesUnderPlans(planIds);
      counts.planShares = await deletePlanSharesUnderPlans(planIds);
      counts.activities = await deleteActivitiesUnderPlans(planIds);
      counts.plans = (
        await tx.plan.updateMany({ where: { projectId: id, deletedAt: null }, data: stamp })
      ).count;
      counts.projects = (
        await tx.project.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    } else if (entity === 'plan') {
      counts.baselines = await deleteBaselinesUnderPlans([id]);
      counts.dependencies = await deleteLinksUnderPlans([id]);
      counts.steps = await deleteStepsUnderPlans([id]);
      counts.notes = await deleteNotesUnderPlans([id]);
      counts.planShares = await deletePlanSharesUnderPlans([id]);
      counts.activities = await deleteActivitiesUnderPlans([id]);
      counts.plans = (
        await tx.plan.updateMany({ where: { id, deletedAt: null }, data: stamp })
      ).count;
    } else if (entity === 'activity') {
      // Activity — soft-delete this row, its active `parent_id` subtree (a leaf is
      // just itself; a WBS_SUMMARY sweeps its descendants — ADR-0038), and every
      // link incident to any of them, all under the one batch id so a restore of
      // the root reactivates the subtree together.
      const subtreeIds = await resolveActivitySubtree(id);
      counts.dependencies = await deleteLinksForActivities(subtreeIds);
      counts.steps = await deleteStepsForActivities(subtreeIds);
      counts.notes = await deleteNotesForActivities(subtreeIds);
      counts.activities = (
        await tx.activity.updateMany({
          where: { id: { in: subtreeIds }, deletedAt: null },
          data: stamp,
        })
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
      baselines: 0,
      steps: 0,
      notes: 0,
      planShares: 0,
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
        // Restore the batch's baselines and their snapshot rows (M7, ADR-0025). The
        // batch is self-consistent — at most one baseline was active when deleted — so
        // the one-active partial unique cannot collide on restore.
        counts.baselines = (
          await tx.baseline.updateMany({ where: { deleteBatchId: batchId }, data: restore })
        ).count;
        await tx.baselineActivity.updateMany({
          where: { deleteBatchId: batchId },
          data: restore,
        });
        // Restore the batch's activity steps (M7 rung 5, ADR-0044 §2). A step belongs to exactly one
        // activity and was swept in the SAME batch as it, so — unlike a dependency — no endpoint guard
        // is needed: restoring the batch reactivates each step with its owning activity. Steps removed
        // by a bulk-replace carry their OWN (different) batch id, so they never resurrect here.
        counts.steps = (
          await tx.activityStep.updateMany({ where: { deleteBatchId: batchId }, data: restore })
        ).count;
        // Restore the batch's notes (the Notes feature, ADR-0046). A note has exactly ONE parent and
        // was swept in the SAME batch as it, so — like a step, unlike a dependency — no endpoint guard
        // is needed: restoring the batch reactivates each note with its parent, and the parent's own
        // top-down `assertParentActive` already blocks resurrecting under a still-deleted ancestor. A
        // note deleted individually (its own fresh batch) carries a different id and never resurrects here.
        counts.notes = (
          await tx.note.updateMany({ where: { deleteBatchId: batchId }, data: restore })
        ).count;
        // Restore the batch's share links (Stage F, ADR-0051). A link has exactly ONE parent (its plan)
        // and was swept in the SAME batch as it — like a note/step, unlike a dependency — so no endpoint
        // guard is needed: restoring the batch reactivates each link with its plan, and the top-down
        // `assertParentActive` already blocks resurrecting under a still-deleted ancestor. A link deleted
        // individually carries its own batch id and never resurrects here.
        counts.planShares = (
          await tx.planShare.updateMany({ where: { deleteBatchId: batchId }, data: restore })
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
  ): Promise<{
    deleteBatchId: string | null;
    parentId: string | null;
    wbsParentId?: string | null;
  }> {
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
        select: { deleteBatchId: true, planId: true, parentId: true },
      });
      if (!row) throw new NotFoundError('Activity not found.');
      // An activity restores under its plan AND (if grouped) its WBS-summary parent
      // (ADR-0038): both must be active so no active row lands under a deleted ancestor.
      return { deleteBatchId: row.deleteBatchId, parentId: row.planId, wbsParentId: row.parentId };
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
    root: { parentId: string | null; wbsParentId?: string | null },
  ): Promise<void> {
    if (entity !== 'client' && root.parentId !== null) {
      let parentActive: unknown;
      if (entity === 'project') {
        parentActive = await tx.client.findFirst({ where: { id: root.parentId, deletedAt: null } });
      } else if (entity === 'plan') {
        parentActive = await tx.project.findFirst({
          where: { id: root.parentId, deletedAt: null },
        });
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

    // An activity grouped under a WBS summary (ADR-0038) also restores only while
    // that summary is active — otherwise an individually-deleted child would come
    // back under a still-deleted parent, breaking the no-orphan invariant. (A child
    // deleted *with* its summary shares the batch and is restored together, so this
    // only bites a separately-deleted child.)
    if (entity === 'activity' && root.wbsParentId) {
      const summaryActive = await tx.activity.findFirst({
        where: { id: root.wbsParentId, deletedAt: null },
      });
      if (!summaryActive) {
        throw new ConflictError('Restore the parent first.', {
          reason: HIERARCHY_CONFLICT.PARENT_DELETED,
        });
      }
    }
  }
}
