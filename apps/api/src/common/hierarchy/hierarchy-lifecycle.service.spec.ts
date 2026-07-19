import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError } from '../errors/domain-errors';

import { HIERARCHY_CONFLICT, HierarchyLifecycleService } from './hierarchy-lifecycle.service';

const ACTOR = 'user-1';

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6' });
}

/** A minimal Prisma.TransactionClient stub with the delegate methods used. */
function makeTx() {
  const model = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  });
  return {
    client: model(),
    project: model(),
    plan: model(),
    activity: model(),
    activityDependency: model(),
    activityStep: model(),
    baseline: model(),
    baselineActivity: model(),
    note: model(),
  };
}

describe('HierarchyLifecycleService', () => {
  let service: HierarchyLifecycleService;
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    service = new HierarchyLifecycleService();
    tx = makeTx();
  });

  const asTx = () => tx as unknown as Prisma.TransactionClient;

  describe('cascadeSoftDelete', () => {
    it('deletes a client with its projects, plans AND activities under one batch', async () => {
      tx.project.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      tx.plan.findMany.mockResolvedValue([{ id: 'pl1' }, { id: 'pl2' }, { id: 'pl3' }]);
      tx.activity.updateMany.mockResolvedValue({ count: 7 });
      tx.plan.updateMany.mockResolvedValue({ count: 3 });
      tx.project.updateMany.mockResolvedValue({ count: 2 });
      tx.client.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cascadeSoftDelete(asTx(), 'client', 'c1', ACTOR);

      expect(result.counts).toEqual({
        clients: 1,
        projects: 2,
        plans: 3,
        activities: 7,
        dependencies: 0,
        baselines: 0,
        steps: 0,
        notes: 0,
      });
      // Activities deleted are those under the client's active plans.
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { planId: { in: ['pl1', 'pl2', 'pl3'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId, updatedBy: ACTOR }),
      });
      // Those plans are deleted by id (resolved from the active projects).
      expect(tx.plan.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['pl1', 'pl2', 'pl3'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      // The root update is guarded by deletedAt: null (idempotent under a race).
      expect(tx.client.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it('skips the plan/activity sweep when a client has no active projects', async () => {
      tx.project.findMany.mockResolvedValue([]);
      tx.client.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cascadeSoftDelete(asTx(), 'client', 'c1', ACTOR);
      expect(tx.plan.findMany).not.toHaveBeenCalled();
      expect(tx.plan.updateMany).not.toHaveBeenCalled();
      expect(tx.activity.updateMany).not.toHaveBeenCalled();
      expect(result.counts).toEqual({
        clients: 1,
        projects: 0,
        plans: 0,
        activities: 0,
        dependencies: 0,
        baselines: 0,
        steps: 0,
        notes: 0,
      });
    });

    it('deletes a project with its plans and their activities', async () => {
      tx.plan.findMany.mockResolvedValue([{ id: 'pl1' }]);
      tx.activity.updateMany.mockResolvedValue({ count: 4 });
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      tx.project.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cascadeSoftDelete(asTx(), 'project', 'p1', ACTOR);

      expect(result.counts).toEqual({
        clients: 0,
        projects: 1,
        plans: 1,
        activities: 4,
        dependencies: 0,
        baselines: 0,
        steps: 0,
        notes: 0,
      });
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { planId: { in: ['pl1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it('deletes a plan with its activities (the plan is not a leaf anymore)', async () => {
      tx.activity.updateMany.mockResolvedValue({ count: 5 });
      tx.plan.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);

      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { planId: { in: ['pl1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      expect(tx.plan.updateMany).toHaveBeenCalledWith({
        where: { id: 'pl1', deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      expect(result.counts).toEqual({
        clients: 0,
        projects: 0,
        plans: 1,
        activities: 5,
        dependencies: 0,
        baselines: 0,
        steps: 0,
        notes: 0,
      });
    });

    it('deletes an activity alone as a leaf (no descendants)', async () => {
      // A leaf has no `parent_id` children, so the subtree resolves to just itself.
      tx.activity.findMany.mockResolvedValue([]);
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      // The subtree walk queries children by parent_id, then finds none.
      expect(tx.activity.findMany).toHaveBeenCalledWith({
        where: { parentId: { in: ['a1'] }, deletedAt: null },
        select: { id: true },
      });
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      expect(result.counts).toEqual({
        clients: 0,
        projects: 0,
        plans: 0,
        activities: 1,
        dependencies: 0,
        baselines: 0,
        steps: 0,
        notes: 0,
      });
    });

    it("also soft-deletes an activity's incident links (both directions) in its batch", async () => {
      tx.activity.findMany.mockResolvedValue([]);
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      tx.activityDependency.updateMany.mockResolvedValue({ count: 2 });
      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      expect(result.counts.dependencies).toBe(2);
      expect(tx.activityDependency.updateMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [{ predecessorId: { in: ['a1'] } }, { successorId: { in: ['a1'] } }],
        },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it('cascades a WBS summary to its whole parent_id subtree in one batch (ADR-0038)', async () => {
      // W1 (summary) parents A1 + A2; A1 in turn parents A1a — a two-level subtree.
      // The BFS resolves { W1 } → children { A1, A2 } → children of those { A1a } → none.
      tx.activity.findMany
        .mockResolvedValueOnce([{ id: 'A1' }, { id: 'A2' }])
        .mockResolvedValueOnce([{ id: 'A1a' }])
        .mockResolvedValueOnce([]);
      tx.activity.updateMany.mockResolvedValue({ count: 4 });
      tx.activityDependency.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'W1', ACTOR);

      // Every activity in the subtree is stamped with the one batch id.
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['W1', 'A1', 'A2', 'A1a'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      // Links incident to ANY subtree member (the summary carries none, its descendants do).
      expect(tx.activityDependency.updateMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [
            { predecessorId: { in: ['W1', 'A1', 'A2', 'A1a'] } },
            { successorId: { in: ['W1', 'A1', 'A2', 'A1a'] } },
          ],
        },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      expect(result.counts.activities).toBe(4);
      expect(result.counts.dependencies).toBe(3);
    });

    it("sweeps a plan's contained links into the batch when the plan is deleted", async () => {
      tx.activity.updateMany.mockResolvedValue({ count: 5 });
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      tx.activityDependency.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);
      expect(result.counts.dependencies).toBe(3);
      expect(tx.activityDependency.updateMany).toHaveBeenCalledWith({
        where: { planId: { in: ['pl1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it("sweeps a plan's baselines and their snapshot rows into the batch", async () => {
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      tx.baseline.updateMany.mockResolvedValue({ count: 2 });
      const result = await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);
      expect(result.counts.baselines).toBe(2);
      // Snapshot rows are stamped via their parent baseline's plan, in the same batch.
      expect(tx.baselineActivity.updateMany).toHaveBeenCalledWith({
        where: { baseline: { planId: { in: ['pl1'] } }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      expect(tx.baseline.updateMany).toHaveBeenCalledWith({
        where: { planId: { in: ['pl1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it('does NOT sweep baselines when a single activity is deleted', async () => {
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      expect(result.counts.baselines).toBe(0);
      expect(tx.baseline.updateMany).not.toHaveBeenCalled();
      expect(tx.baselineActivity.updateMany).not.toHaveBeenCalled();
    });

    it("sweeps a deleted activity subtree's steps into its batch (M7 rung 5, ADR-0044 §2)", async () => {
      tx.activity.findMany.mockResolvedValue([]); // leaf subtree = { a1 }
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      tx.activityStep.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      expect(result.counts.steps).toBe(3);
      // Steps are stamped by their owning activity ids, in the same batch as the activity.
      expect(tx.activityStep.updateMany).toHaveBeenCalledWith({
        where: { activityId: { in: ['a1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId, updatedBy: ACTOR }),
      });
    });

    it("sweeps a plan's activities' steps into the batch when the plan is deleted", async () => {
      tx.activity.updateMany.mockResolvedValue({ count: 5 });
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      tx.activityStep.updateMany.mockResolvedValue({ count: 8 });
      const result = await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);
      expect(result.counts.steps).toBe(8);
      // Steps are reached through their `activity` relation's plan (one level deeper than activities).
      expect(tx.activityStep.updateMany).toHaveBeenCalledWith({
        where: { activity: { planId: { in: ['pl1'] } }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it("sweeps a plan's notes (PLAN + ACTIVITY) into the batch via one plan_id sweep (ADR-0046)", async () => {
      tx.activity.updateMany.mockResolvedValue({ count: 5 });
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      tx.note.updateMany.mockResolvedValue({ count: 9 });
      const result = await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);
      expect(result.counts.notes).toBe(9);
      // Every note (PLAN and ACTIVITY) carries the denormalised plan_id, so ONE sweep by plan_id
      // catches both kinds in the batch — no per-activity sweep, no double-count.
      expect(tx.note.updateMany).toHaveBeenCalledWith({
        where: { planId: { in: ['pl1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId, updatedBy: ACTOR }),
      });
    });

    it("sweeps a deleted activity subtree's notes into its batch by activity_id (ADR-0046)", async () => {
      tx.activity.findMany.mockResolvedValue([]); // leaf subtree = { a1 }
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      tx.note.updateMany.mockResolvedValue({ count: 4 });
      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      expect(result.counts.notes).toBe(4);
      // A single-activity delete sweeps that subtree's notes by activity_id (PLAN notes have none).
      expect(tx.note.updateMany).toHaveBeenCalledWith({
        where: { activityId: { in: ['a1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it('deletes a dependency alone as a leaf (its own batch)', async () => {
      tx.activityDependency.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cascadeSoftDelete(asTx(), 'dependency', 'd1', ACTOR);
      expect(result.counts.dependencies).toBe(1);
      expect(tx.activityDependency.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });
  });

  describe('restoreBatch', () => {
    it('restores only batch links whose BOTH endpoints are active (endpoint-guarded)', async () => {
      tx.plan.findFirst.mockResolvedValue({ deleteBatchId: 'batch-p', projectId: 'pr1' });
      tx.project.findFirst.mockResolvedValue({ id: 'pr1' }); // parent project active
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      tx.activity.updateMany.mockResolvedValue({ count: 3 });
      // Two links in the batch; d2's successor a3 was deleted separately (not active).
      tx.activityDependency.findMany.mockResolvedValue([
        { id: 'd1', predecessorId: 'a1', successorId: 'a2' },
        { id: 'd2', predecessorId: 'a1', successorId: 'a3' },
      ]);
      tx.activity.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      tx.activityDependency.updateMany.mockResolvedValue({ count: 1 });

      const counts = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR);

      expect(counts.dependencies).toBe(1);
      // Only the fully-active link d1 is reactivated; d2 stays soft-deleted.
      expect(tx.activityDependency.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['d1'] } },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
    });

    it('restores the whole batch (incl. activities) when the parent is active', async () => {
      tx.project.findFirst.mockResolvedValue({ deleteBatchId: 'batch-9', clientId: 'c1' });
      tx.client.findFirst.mockResolvedValue({ id: 'c1' }); // parent client active
      tx.project.updateMany.mockResolvedValue({ count: 1 });
      tx.plan.updateMany.mockResolvedValue({ count: 4 });
      tx.activity.updateMany.mockResolvedValue({ count: 9 });

      const counts = await service.restoreBatch(asTx(), 'project', 'p1', ACTOR);

      expect(counts).toEqual({
        clients: 0,
        projects: 1,
        plans: 4,
        activities: 9,
        dependencies: 0,
        baselines: 0,
        steps: 0,
        notes: 0,
      });
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-9' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
    });

    it("restores a plan's baselines and their snapshot rows with the batch", async () => {
      tx.plan.findFirst.mockResolvedValue({ deleteBatchId: 'batch-b', projectId: 'pr1' });
      tx.project.findFirst.mockResolvedValue({ id: 'pr1' }); // parent project active
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      tx.baseline.updateMany.mockResolvedValue({ count: 2 });

      const counts = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR);

      expect(counts.baselines).toBe(2);
      expect(tx.baseline.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-b' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
      expect(tx.baselineActivity.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-b' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
    });

    it('restores an activity whose parent plan is active', async () => {
      tx.activity.findFirst.mockResolvedValue({ deleteBatchId: 'batch-a', planId: 'pl1' });
      tx.plan.findFirst.mockResolvedValue({ id: 'pl1' }); // parent plan active
      tx.activity.updateMany.mockResolvedValue({ count: 1 });

      const counts = await service.restoreBatch(asTx(), 'activity', 'a1', ACTOR);

      expect(counts.activities).toBe(1);
      expect(tx.plan.findFirst).toHaveBeenCalledWith({
        where: { id: 'pl1', deletedAt: null },
      });
    });

    it("restores the batch's activity steps with their activity (M7 rung 5, ADR-0044 §2)", async () => {
      tx.activity.findFirst.mockResolvedValue({ deleteBatchId: 'batch-a', planId: 'pl1' });
      tx.plan.findFirst.mockResolvedValue({ id: 'pl1' }); // parent plan active
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      tx.activityStep.updateMany.mockResolvedValue({ count: 3 });

      const counts = await service.restoreBatch(asTx(), 'activity', 'a1', ACTOR);

      expect(counts.steps).toBe(3);
      // Steps come back purely by their batch id — no endpoint guard (a step belongs to exactly one
      // activity, swept in the same batch), unlike a dependency.
      expect(tx.activityStep.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-a' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
    });

    it("restores the batch's notes with their parent (ADR-0046)", async () => {
      tx.plan.findFirst.mockResolvedValue({ deleteBatchId: 'batch-p', projectId: 'pr1' });
      tx.project.findFirst.mockResolvedValue({ id: 'pr1' }); // parent project active
      tx.note.updateMany.mockResolvedValue({ count: 6 });

      const counts = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR);

      expect(counts.notes).toBe(6);
      // Notes come back purely by their batch id — no endpoint guard (a note has exactly one parent,
      // swept in the same batch), like a step and unlike a dependency.
      expect(tx.note.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-p' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
    });

    it('rejects restoring an activity whose plan is still deleted (PARENT_DELETED)', async () => {
      tx.activity.findFirst.mockResolvedValue({ deleteBatchId: 'batch-a', planId: 'pl1' });
      tx.plan.findFirst.mockResolvedValue(null); // parent plan deleted

      const error = await service.restoreBatch(asTx(), 'activity', 'a1', ACTOR).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({
        reason: HIERARCHY_CONFLICT.PARENT_DELETED,
      });
      expect(tx.activity.updateMany).not.toHaveBeenCalled();
    });

    it('restores an activity whose plan AND WBS-summary parent are both active', async () => {
      // loadDeletedRoot reads the row (with its WBS parentId); then the plan check and the
      // summary check both run — the summary findFirst is the SECOND activity.findFirst call.
      tx.activity.findFirst
        .mockResolvedValueOnce({ deleteBatchId: 'batch-a', planId: 'pl1', parentId: 'W1' })
        .mockResolvedValueOnce({ id: 'W1' }); // summary parent active
      tx.plan.findFirst.mockResolvedValue({ id: 'pl1' });
      tx.activity.updateMany.mockResolvedValue({ count: 1 });

      const counts = await service.restoreBatch(asTx(), 'activity', 'a1', ACTOR);

      expect(counts.activities).toBe(1);
      expect(tx.activity.findFirst).toHaveBeenLastCalledWith({
        where: { id: 'W1', deletedAt: null },
      });
    });

    it('rejects restoring a child whose WBS-summary parent is still deleted (PARENT_DELETED)', async () => {
      tx.activity.findFirst
        .mockResolvedValueOnce({ deleteBatchId: 'batch-a', planId: 'pl1', parentId: 'W1' })
        .mockResolvedValueOnce(null); // summary parent still deleted
      tx.plan.findFirst.mockResolvedValue({ id: 'pl1' }); // plan is active…

      const error = await service.restoreBatch(asTx(), 'activity', 'a1', ACTOR).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({
        reason: HIERARCHY_CONFLICT.PARENT_DELETED,
      });
      expect(tx.activity.updateMany).not.toHaveBeenCalled();
    });

    it('rejects restore when the parent is still deleted (PARENT_DELETED)', async () => {
      tx.project.findFirst.mockResolvedValue({ deleteBatchId: 'batch-9', clientId: 'c1' });
      tx.client.findFirst.mockResolvedValue(null); // parent client is deleted

      const error = await service.restoreBatch(asTx(), 'project', 'p1', ACTOR).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({
        reason: HIERARCHY_CONFLICT.PARENT_DELETED,
      });
      expect(tx.project.updateMany).not.toHaveBeenCalled();
    });

    it('maps a name collision on restore to NAME_TAKEN', async () => {
      tx.client.findFirst.mockResolvedValue({ deleteBatchId: 'batch-1' }); // deleted root client
      tx.client.updateMany.mockRejectedValue(uniqueViolation());

      const error = await service.restoreBatch(asTx(), 'client', 'c1', ACTOR).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ reason: HIERARCHY_CONFLICT.NAME_TAKEN });
    });

    it('404s when the row is missing or not deleted', async () => {
      tx.plan.findFirst.mockResolvedValue(null);
      await expect(service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      tx.activity.findFirst.mockResolvedValue(null);
      await expect(service.restoreBatch(asTx(), 'activity', 'a1', ACTOR)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
