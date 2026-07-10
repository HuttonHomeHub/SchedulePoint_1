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
      });
    });

    it('deletes an activity alone as a leaf (no descendants)', async () => {
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { id: 'a1', deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      expect(result.counts).toEqual({
        clients: 0,
        projects: 0,
        plans: 0,
        activities: 1,
        dependencies: 0,
      });
    });

    it("also soft-deletes an activity's incident links (both directions) in its batch", async () => {
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      tx.activityDependency.updateMany.mockResolvedValue({ count: 2 });
      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      expect(result.counts.dependencies).toBe(2);
      expect(tx.activityDependency.updateMany).toHaveBeenCalledWith({
        where: { deletedAt: null, OR: [{ predecessorId: 'a1' }, { successorId: 'a1' }] },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
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

      expect(counts).toEqual({ clients: 0, projects: 1, plans: 4, activities: 9, dependencies: 0 });
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-9' },
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
