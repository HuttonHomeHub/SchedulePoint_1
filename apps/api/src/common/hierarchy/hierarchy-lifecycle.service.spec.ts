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
  return { client: model(), project: model(), plan: model() };
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
    it('deletes a client with its active projects and their plans, under one batch', async () => {
      tx.project.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      tx.plan.updateMany.mockResolvedValue({ count: 3 });
      tx.project.updateMany.mockResolvedValue({ count: 2 });
      tx.client.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cascadeSoftDelete(asTx(), 'client', 'c1', ACTOR);

      expect(result.counts).toEqual({ clients: 1, projects: 2, plans: 3 });
      // Plans deleted are only those under the client's *active* projects.
      expect(tx.plan.updateMany).toHaveBeenCalledWith({
        where: { projectId: { in: ['p1', 'p2'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId, updatedBy: ACTOR }),
      });
      expect(tx.project.updateMany).toHaveBeenCalledWith({
        where: { clientId: 'c1', deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      // The root update is guarded by deletedAt: null (idempotent under a race).
      expect(tx.client.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it('skips the plan sweep when a client has no active projects', async () => {
      tx.project.findMany.mockResolvedValue([]);
      tx.client.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cascadeSoftDelete(asTx(), 'client', 'c1', ACTOR);
      expect(tx.plan.updateMany).not.toHaveBeenCalled();
      expect(result.counts).toEqual({ clients: 1, projects: 0, plans: 0 });
    });

    it('deletes a plan alone (no descendants)', async () => {
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);
      expect(tx.plan.updateMany).toHaveBeenCalledWith({
        where: { id: 'pl1', deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      expect(result.counts).toEqual({ clients: 0, projects: 0, plans: 1 });
    });
  });

  describe('restoreBatch', () => {
    it('restores the whole batch when the parent is active', async () => {
      tx.project.findFirst.mockResolvedValue({ deleteBatchId: 'batch-9', clientId: 'c1' });
      tx.client.findFirst.mockResolvedValue({ id: 'c1' }); // parent client active
      tx.project.updateMany.mockResolvedValue({ count: 1 });
      tx.plan.updateMany.mockResolvedValue({ count: 4 });

      const counts = await service.restoreBatch(asTx(), 'project', 'p1', ACTOR);

      expect(counts).toEqual({ clients: 0, projects: 1, plans: 4 });
      expect(tx.project.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-9' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
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
    });
  });
});
