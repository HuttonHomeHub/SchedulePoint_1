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
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
    client: model(),
    project: model(),
    plan: model(),
    activity: model(),
    activityDependency: model(),
    activityStep: model(),
    baseline: model(),
    baselineActivity: model(),
    baselineAssignment: model(),
    baselineDependency: model(),
    note: model(),
    planShare: model(),
    calendar: model(),
    calendarException: model(),
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
        planShares: 0,
        calendars: 0,
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

    it('takes every plan lock, then the row locks, before its first write (#492)', async () => {
      tx.project.findMany.mockResolvedValue([{ id: 'p1' }]);
      tx.plan.findMany.mockResolvedValue([{ id: 'pl2' }, { id: 'pl1' }, { id: 'pl2' }]);

      await service.cascadeSoftDelete(asTx(), 'client', 'c1', ACTOR);

      // Two distinct plans in one sorted advisory-lock statement, then one plan-wide row lock. The
      // client's own root lock is the first raw read (see the root-lock test below).
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.$executeRaw.mock.calls[0]?.[2]).toEqual(['pl1', 'pl2']);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
      const rowLock = tx.$queryRaw.mock.invocationCallOrder[1] ?? Infinity;
      const firstWrite = Math.min(
        ...[tx.baselineActivity, tx.activityDependency, tx.activity, tx.plan].map(
          (m) => m.updateMany.mock.invocationCallOrder[0] ?? Infinity,
        ),
      );
      expect(Math.max(...tx.$executeRaw.mock.invocationCallOrder)).toBeLessThan(rowLock);
      expect(rowLock).toBeLessThan(firstWrite);
    });

    it.each(['client', 'project'] as const)(
      'locks the %s row FOR NO KEY UPDATE before it reads the subtree (ADR-0200 D3, #520)',
      async (entity) => {
        tx.project.findMany.mockResolvedValue([{ id: 'p1' }]);
        tx.plan.findMany.mockResolvedValue([{ id: 'pl1' }]);

        await service.cascadeSoftDelete(asTx(), entity, 'r1', ACTOR);

        const [strings, ...values] = tx.$queryRaw.mock.calls[0] as unknown as [string[], string];
        const sql = strings.join('?');
        // The lock mode is what conflicts with a restore's FOR SHARE; the predicate is the
        // ADR-0172 stance (a deleted root locks nothing, so a repeated delete stays a no-op).
        expect(sql).toContain('FOR NO KEY UPDATE');
        expect(sql).toContain('deleted_at IS NULL');
        expect(sql).toContain(entity === 'client' ? 'FROM clients' : 'FROM projects');
        expect(values).toEqual(['r1']);
        // …and it is taken before anything is read, so the subtree the delete sweeps is the one a
        // restore holding the share lock has already finished writing.
        const lock = tx.$queryRaw.mock.invocationCallOrder[0] ?? Infinity;
        const firstRead = Math.min(
          ...[tx.project.findMany, tx.plan.findMany].map(
            (m) => m.mock.invocationCallOrder[0] ?? Infinity,
          ),
        );
        expect(lock).toBeLessThan(firstRead);
      },
    );

    it('takes no root lock for a plan or an activity delete', async () => {
      await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);
      // The only raw read is the plan-wide activity row lock.
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(String((tx.$queryRaw.mock.calls[0] as unknown as [string[]])[0].join('?'))).toContain(
        'FROM activities',
      );
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
        planShares: 0,
        calendars: 0,
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
        planShares: 0,
        calendars: 0,
      });
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { planId: { in: ['pl1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    // ADR-0053 §2: a project's PROJECT-scoped calendars (and their exceptions) go with it, in
    // the SAME batch as its plans and activities, so a restore brings the whole project back
    // intact and no active calendar is left under a soft-deleted project.
    it('sweeps a project’s PROJECT-scoped calendars and their exceptions into the same batch', async () => {
      tx.plan.findMany.mockResolvedValue([{ id: 'pl1' }]);
      tx.calendar.findMany.mockResolvedValue([{ id: 'cal1' }, { id: 'cal2' }]);
      tx.calendar.updateMany.mockResolvedValue({ count: 2 });
      tx.project.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cascadeSoftDelete(asTx(), 'project', 'p1', ACTOR);

      expect(result.counts.calendars).toBe(2);
      // The predicate is `project_id = :id` — NULL for every ORG calendar, so a shared-library
      // calendar can never be swept by a project delete.
      expect(tx.calendar.findMany).toHaveBeenCalledWith({
        where: { projectId: { in: ['p1'] }, deletedAt: null },
        select: { id: true },
      });
      // Children (exceptions) before parents, all under the one batch id.
      expect(tx.calendarException.updateMany).toHaveBeenCalledWith({
        where: { calendarId: { in: ['cal1', 'cal2'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
      expect(tx.calendar.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['cal1', 'cal2'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId }),
      });
    });

    it('touches no calendar table when a project owns no project calendars', async () => {
      tx.plan.findMany.mockResolvedValue([{ id: 'pl1' }]);
      tx.calendar.findMany.mockResolvedValue([]);

      const result = await service.cascadeSoftDelete(asTx(), 'project', 'p1', ACTOR);

      expect(result.counts.calendars).toBe(0);
      expect(tx.calendar.updateMany).not.toHaveBeenCalled();
      expect(tx.calendarException.updateMany).not.toHaveBeenCalled();
    });

    it('sweeps the project calendars of every project under a deleted client', async () => {
      tx.project.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      tx.plan.findMany.mockResolvedValue([]);
      tx.calendar.findMany.mockResolvedValue([{ id: 'cal1' }]);
      tx.calendar.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cascadeSoftDelete(asTx(), 'client', 'c1', ACTOR);

      expect(result.counts.calendars).toBe(1);
      expect(tx.calendar.findMany).toHaveBeenCalledWith({
        where: { projectId: { in: ['p1', 'p2'] }, deletedAt: null },
        select: { id: true },
      });
    });

    it('never sweeps calendars for a plan or activity delete (they are project-scoped)', async () => {
      await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);
      await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      expect(tx.calendar.findMany).not.toHaveBeenCalled();
      expect(tx.calendar.updateMany).not.toHaveBeenCalled();
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
        planShares: 0,
        calendars: 0,
      });
    });

    describe('the activity branch’s expected root version (#500)', () => {
      it('compares the root from the ordered lock’s rows, before the first write', async () => {
        tx.$queryRaw.mockResolvedValue([
          { id: 'a1', version: 4 },
          { id: 'c1', version: 9 },
        ]);
        await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR, undefined, undefined, 4);
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          tx.activity.updateMany.mock.invocationCallOrder[0] ?? Infinity,
        );
      });

      it('answers 409 STALE_VERSION and writes nothing when the root moved', async () => {
        tx.$queryRaw.mockResolvedValue([{ id: 'a1', version: 5 }]);
        await expect(
          service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR, undefined, undefined, 4),
        ).rejects.toMatchObject({ details: { reason: 'STALE_VERSION' } });
        expect(tx.activity.updateMany).not.toHaveBeenCalled();
        expect(tx.activityDependency.updateMany).not.toHaveBeenCalled();
      });

      it('answers 404 when the ordered lock found no root row', async () => {
        tx.$queryRaw.mockResolvedValue([{ id: 'c1', version: 1 }]);
        await expect(
          service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR, undefined, undefined, 1),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(tx.activity.updateMany).not.toHaveBeenCalled();
      });

      it('checks nothing when no version is passed, as every other caller does', async () => {
        tx.$queryRaw.mockResolvedValue([]);
        await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
        expect(tx.activity.updateMany).toHaveBeenCalledTimes(1);
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
        planShares: 0,
        calendars: 0,
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
      // …including the frozen logic (the revision-snapshot extension). Left out of the batch its
      // rows would stay active under a deleted parent and never be restored with it, because
      // restore is keyed on `delete_batch_id`.
      expect(tx.baselineDependency.updateMany).toHaveBeenCalledWith({
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
      expect(tx.baselineDependency.updateMany).not.toHaveBeenCalled();
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

    it("sweeps a plan's share links into the batch by plan_id (Stage F, ADR-0051)", async () => {
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
      tx.planShare.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.cascadeSoftDelete(asTx(), 'plan', 'pl1', ACTOR);
      expect(result.counts.planShares).toBe(3);
      expect(tx.planShare.updateMany).toHaveBeenCalledWith({
        where: { planId: { in: ['pl1'] }, deletedAt: null },
        data: expect.objectContaining({ deleteBatchId: result.batchId, updatedBy: ACTOR }),
      });
    });

    it('does NOT sweep share links on a single-activity delete (they are plan-scoped)', async () => {
      tx.activity.findMany.mockResolvedValue([]); // leaf subtree = { a1 }
      tx.activity.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.cascadeSoftDelete(asTx(), 'activity', 'a1', ACTOR);
      expect(result.counts.planShares).toBe(0);
      expect(tx.planShare.updateMany).not.toHaveBeenCalled();
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
    // A restore normally reactivates its own root; the cases that matter override this.
    beforeEach(() => {
      tx.project.updateMany.mockResolvedValue({ count: 1 });
      tx.plan.updateMany.mockResolvedValue({ count: 1 });
    });

    it('answers not found when a legacy row with no batch id is removed before its update', async () => {
      // The no-batch path updates by id, which raises P2025 instead of counting zero.
      tx.plan.findFirst.mockResolvedValue({ deleteBatchId: null, projectId: 'pr1' });
      tx.project.findFirst.mockResolvedValue({ id: 'pr1', clientId: 'c1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'pr1' }]); // ancestors active (locked FOR SHARE)
      tx.plan.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: '6' }),
      );

      await expect(service.restoreBatch(asTx(), 'plan', 'x', ACTOR)).rejects.toThrow(NotFoundError);
    });

    it.each(['client', 'project', 'plan'] as const)(
      'answers 404 when the %s root was removed between the read and the update',
      async (entity) => {
        // The retention expiry claimed and deleted the root after `loadDeletedRoot` read it, so every
        // update matches nothing. Answering 200 would tell a planner their work was back (US-2).
        tx.client.findFirst.mockResolvedValue({ deleteBatchId: 'batch-x', id: 'c0' });
        tx.project.findFirst.mockResolvedValue({ deleteBatchId: 'batch-x', clientId: 'c0' });
        tx.$queryRaw.mockResolvedValue([{ id: 'x' }]);
        tx.plan.findFirst.mockResolvedValue({ deleteBatchId: 'batch-x', projectId: 'pr0' });
        tx.client.updateMany.mockResolvedValue({ count: 0 });
        tx.project.updateMany.mockResolvedValue({ count: 0 });
        tx.plan.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.restoreBatch(asTx(), entity, 'x', ACTOR)).rejects.toThrow(
          NotFoundError,
        );
        // …and nothing below the root was touched.
        expect(tx.activity.updateMany).not.toHaveBeenCalled();
      },
    );

    it('restores only batch links whose BOTH endpoints are active (endpoint-guarded)', async () => {
      tx.plan.findFirst.mockResolvedValue({ deleteBatchId: 'batch-p', projectId: 'pr1' });
      tx.project.findFirst.mockResolvedValue({ id: 'pr1', clientId: 'c1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'pr1' }]); // ancestors active (locked FOR SHARE)
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
      tx.$queryRaw.mockResolvedValue([{ id: 'c1' }]); // parent client active (locked FOR SHARE)
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
        planShares: 0,
        calendars: 0,
      });
      expect(tx.activity.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-9' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
    });

    it("restores a plan's baselines and their snapshot rows with the batch", async () => {
      tx.plan.findFirst.mockResolvedValue({ deleteBatchId: 'batch-b', projectId: 'pr1' });
      tx.project.findFirst.mockResolvedValue({ id: 'pr1', clientId: 'c1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'pr1' }]); // ancestors active (locked FOR SHARE)
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
      // …and the frozen logic, which was swept in the same batch (the revision-snapshot
      // extension). A snapshot edge has exactly one parent, so no endpoint guard applies.
      expect(tx.baselineDependency.updateMany).toHaveBeenCalledWith({
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
      tx.project.findFirst.mockResolvedValue({ id: 'pr1', clientId: 'c1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'pr1' }]); // ancestors active (locked FOR SHARE)
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

    it("restores the batch's share links with their plan (Stage F, ADR-0051)", async () => {
      tx.plan.findFirst.mockResolvedValue({ deleteBatchId: 'batch-p', projectId: 'pr1' });
      tx.project.findFirst.mockResolvedValue({ id: 'pr1', clientId: 'c1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'pr1' }]); // ancestors active (locked FOR SHARE)
      tx.planShare.updateMany.mockResolvedValue({ count: 2 });

      const counts = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR);

      expect(counts.planShares).toBe(2);
      // Links come back purely by their batch id — no endpoint guard (a link has exactly one parent,
      // swept in the same batch), like a note/step and unlike a dependency.
      expect(tx.planShare.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-p' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
    });

    it("restores the batch's project calendars and their exceptions (ADR-0053 §2)", async () => {
      tx.project.findFirst.mockResolvedValue({ deleteBatchId: 'batch-pr', clientId: 'c1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'c1' }]); // parent client active (locked FOR SHARE)
      tx.calendar.updateMany.mockResolvedValue({ count: 3 });

      const counts = await service.restoreBatch(asTx(), 'project', 'pr1', ACTOR);

      expect(counts.calendars).toBe(3);
      // Calendars come back purely by their batch id — no endpoint guard (a calendar has exactly
      // one parent, swept in the same batch), like a note/step and unlike a dependency.
      expect(tx.calendar.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-pr' },
        data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
      });
      expect(tx.calendarException.updateMany).toHaveBeenCalledWith({
        where: { deleteBatchId: 'batch-pr' },
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
      tx.$queryRaw.mockResolvedValue([]); // parent client is deleted: the locking read matches nothing

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

    describe('ancestor locks (ADR-0200 D3, #520)', () => {
      /** The raw statements, as SQL text with the bound ids alongside. */
      const rawReads = () =>
        tx.$queryRaw.mock.calls.map((call) => {
          const [strings, ...values] = call as unknown as [string[], ...unknown[]];
          return { sql: strings.join('?'), values };
        });

      it('locks a plan restore’s client, then its project, FOR SHARE — top-down', async () => {
        tx.plan.findFirst.mockResolvedValue({
          deleteBatchId: 'batch-p',
          organizationId: 'org-1',
          projectId: 'pr1',
          calendarId: null,
        });
        tx.project.findFirst.mockResolvedValue({ clientId: 'c1' });
        tx.$queryRaw.mockResolvedValue([{ id: 'x' }]);

        await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR);

        const reads = rawReads();
        expect(reads.map((r) => r.sql.includes('FOR SHARE'))).toEqual([true, true]);
        expect(reads[0]?.sql).toContain('FROM clients');
        expect(reads[0]?.values).toEqual(['c1']);
        expect(reads[1]?.sql).toContain('FROM projects');
        expect(reads[1]?.values).toEqual(['pr1']);
        // Both state the soft-delete stance, so a deleted ancestor locks and reports nothing.
        expect(reads.every((r) => r.sql.includes('deleted_at IS NULL'))).toBe(true);
      });

      it('locks a project restore’s client FOR SHARE', async () => {
        tx.project.findFirst.mockResolvedValue({
          deleteBatchId: 'batch-9',
          organizationId: 'org-1',
          clientId: 'c1',
        });
        tx.$queryRaw.mockResolvedValue([{ id: 'c1' }]);

        await service.restoreBatch(asTx(), 'project', 'p1', ACTOR);

        const reads = rawReads();
        expect(reads).toHaveLength(1);
        expect(reads[0]?.sql).toContain('FOR SHARE');
        expect(reads[0]?.sql).toContain('FROM clients');
      });

      it('stops at a deleted client without locking the project, and refuses PARENT_DELETED', async () => {
        tx.plan.findFirst.mockResolvedValue({
          deleteBatchId: 'batch-p',
          organizationId: 'org-1',
          projectId: 'pr1',
          calendarId: null,
        });
        tx.project.findFirst.mockResolvedValue({ clientId: 'c1' });
        tx.$queryRaw.mockResolvedValue([]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect((error as ConflictError).details).toEqual({
          reason: HIERARCHY_CONFLICT.PARENT_DELETED,
        });
        expect(rawReads()).toHaveLength(1);
        expect(tx.plan.updateMany).not.toHaveBeenCalled();
      });

      it('refuses a plan whose project row is gone, without a raw read', async () => {
        tx.plan.findFirst.mockResolvedValue({
          deleteBatchId: 'batch-p',
          organizationId: 'org-1',
          projectId: 'pr1',
          calendarId: null,
        });
        tx.project.findFirst.mockResolvedValue(null);

        await expect(service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR)).rejects.toBeInstanceOf(
          ConflictError,
        );
        expect(rawReads()).toHaveLength(0);
      });
    });

    describe('a calendar that now belongs to another project (ADR-0200 D5)', () => {
      const root = {
        deleteBatchId: 'batch-p',
        organizationId: 'org-1',
        projectId: 'pr1',
        calendarId: null,
      };
      const projectCalendar = (id: string, projectId: string, over: object = {}) => ({
        id,
        name: `Calendar ${id}`,
        deletedAt: null,
        deleteBatchId: null,
        scope: 'PROJECT',
        projectId,
        ...over,
      });

      /**
       * A plan root in batch-p. `tier` is what the grouped tier read finds for the batch's plans
       * (`{ calendarId, projectId }`), `activityPlans` the plans the batch's activities sit in.
       */
      const aPlan = (opts: {
        tier?: { calendarId: string; projectId: string }[];
        activities?: { calendarId: string; planId: string }[];
        activityPlans?: { id: string; projectId: string }[];
      }) => {
        tx.plan.findFirst.mockResolvedValueOnce(root);
        tx.project.findFirst.mockResolvedValue({ clientId: 'c1' });
        tx.$queryRaw.mockResolvedValue([{ id: 'x' }]);
        tx.plan.findMany.mockImplementation(
          (args: { where: { id?: unknown }; select: { projectId?: boolean } }) => {
            if (args.where.id) return Promise.resolve(opts.activityPlans ?? []);
            const tier = opts.tier ?? [];
            return Promise.resolve(
              args.select.projectId ? tier : tier.map(({ calendarId }) => ({ calendarId })),
            );
          },
        );
        tx.activity.findMany.mockImplementation((args: { select: { planId?: boolean } }) =>
          Promise.resolve(
            args.select.planId
              ? (opts.activities ?? [])
              : (opts.activities ?? []).map(({ calendarId }) => ({ calendarId })),
          ),
        );
      };

      it('refuses a plan of one project whose calendar is now scoped to another, before any write', async () => {
        aPlan({ tier: [{ calendarId: 'cal-1', projectId: 'pr1' }] });
        tx.calendar.findMany.mockResolvedValue([projectCalendar('cal-1', 'pr-other')]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).details).toEqual({
          reason: 'CALENDAR_OTHER_PROJECT',
          calendar: { id: 'cal-1', name: 'Calendar cal-1', deleteBatchId: null },
          projectId: 'pr-other',
        });
        expect(tx.plan.updateMany).not.toHaveBeenCalled();
      });

      it('reads the batch once for all of its calendars, however many there are', async () => {
        aPlan({
          tier: [
            { calendarId: 'cal-1', projectId: 'pr1' },
            { calendarId: 'cal-2', projectId: 'pr1' },
          ],
        });
        tx.calendar.findMany.mockResolvedValue([
          projectCalendar('cal-1', 'pr1'),
          projectCalendar('cal-2', 'pr1'),
        ]);

        await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR);

        const tierReads = tx.plan.findMany.mock.calls.filter(
          (call) => (call[0] as { select: { projectId?: boolean } }).select.projectId,
        );
        expect(tierReads).toHaveLength(1);
        expect(tierReads[0]?.[0]).toMatchObject({
          where: { deleteBatchId: 'batch-p', calendarId: { in: ['cal-1', 'cal-2'] } },
        });
      });

      it('allows a project calendar used only inside its own project', async () => {
        aPlan({ tier: [{ calendarId: 'cal-1', projectId: 'pr1' }] });
        tx.calendar.findMany.mockResolvedValue([projectCalendar('cal-1', 'pr1')]);

        await expect(service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR)).resolves.toBeDefined();
      });

      it('places an activity by its plan', async () => {
        aPlan({
          activities: [{ calendarId: 'cal-1', planId: 'pl9' }],
          activityPlans: [{ id: 'pl9', projectId: 'pr1' }],
        });
        tx.calendar.findMany.mockResolvedValue([projectCalendar('cal-1', 'pr-other')]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect((error as ConflictError).details).toMatchObject({
          reason: 'CALENDAR_OTHER_PROJECT',
        });
      });

      it('reports a deleted calendar before a wrong-scope one', async () => {
        aPlan({
          tier: [
            { calendarId: 'cal-1', projectId: 'pr1' },
            { calendarId: 'cal-2', projectId: 'pr1' },
          ],
        });
        tx.calendar.findMany.mockResolvedValue([
          projectCalendar('cal-1', 'pr-other'),
          projectCalendar('cal-2', 'pr1', { deletedAt: new Date(), deleteBatchId: 'cal-batch' }),
        ]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect((error as ConflictError).details).toMatchObject({
          reason: 'CALENDAR_DELETED',
          calendar: { id: 'cal-2' },
        });
      });

      it('looks at no plan for an ORG calendar, or for a project calendar swept in the same batch', async () => {
        aPlan({
          tier: [
            { calendarId: 'cal-1', projectId: 'pr-x' },
            { calendarId: 'cal-2', projectId: 'pr-x' },
          ],
        });
        tx.calendar.findMany.mockResolvedValue([
          { ...projectCalendar('cal-1', 'pr1'), scope: 'ORG', projectId: null },
          projectCalendar('cal-2', 'pr-other', { deletedAt: new Date(), deleteBatchId: 'batch-p' }),
        ]);

        await expect(service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR)).resolves.toBeDefined();
        // Neither is a candidate, so the grouped tier read is never made.
        expect(
          tx.plan.findMany.mock.calls.filter(
            (call) => (call[0] as { select: { projectId?: boolean } }).select.projectId,
          ),
        ).toHaveLength(0);
      });

      describe('a calendar deleted on its own before its project (ADR-0200 D6)', () => {
        const projectRoot = {
          deleteBatchId: 'batch-pr',
          organizationId: 'org-1',
          clientId: 'c1',
        };
        const stranded = (over: object = {}) =>
          projectCalendar('cal-1', 'pr1', {
            deletedAt: new Date('2026-01-01T00:00:00Z'),
            deleteBatchId: 'cal-batch',
            ...over,
          });
        const aProject = () => {
          tx.project.findFirst.mockResolvedValue(projectRoot);
          tx.project.findMany.mockResolvedValue([{ id: 'pr1' }]);
          tx.$queryRaw.mockResolvedValue([{ id: 'c1' }]);
          tx.plan.findMany.mockImplementation(
            (args: { select: { projectId?: boolean; id?: boolean } }) =>
              Promise.resolve(
                args.select.id
                  ? [{ id: 'pl1' }]
                  : args.select.projectId
                    ? [{ calendarId: 'cal-1', projectId: 'pr1' }]
                    : [{ calendarId: 'cal-1' }],
              ),
          );
        };

        it('restores it with the project, and its exceptions, instead of refusing', async () => {
          aProject();
          tx.calendar.findMany.mockResolvedValue([stranded()]);
          tx.calendar.findFirst.mockResolvedValue(null);
          tx.calendar.updateMany.mockResolvedValue({ count: 1 });

          const counts = await service.restoreBatch(asTx(), 'project', 'pr1', ACTOR);

          expect(tx.calendar.updateMany).toHaveBeenCalledWith({
            where: {
              id: 'cal-1',
              organizationId: 'org-1',
              deleteBatchId: 'cal-batch',
              deletedAt: { not: null },
            },
            data: {
              deletedAt: null,
              deleteBatchId: null,
              updatedBy: ACTOR,
              version: { increment: 1 },
            },
          });
          expect(tx.calendarException.updateMany).toHaveBeenCalledWith({
            where: { calendarId: 'cal-1', organizationId: 'org-1', deleteBatchId: 'cal-batch' },
            data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
          });
          expect(counts.calendars).toBe(2);
          // The plans that use it are stamped "edited since calculated", as a calendar restore does.
          expect(tx.$executeRaw.mock.calls.map((call) => call[2])).toContainEqual(['pl1']);
        });

        it('refuses NAME_TAKEN, before any write, when the project already has that name', async () => {
          aProject();
          tx.calendar.findMany.mockResolvedValue([stranded()]);
          tx.calendar.findFirst.mockResolvedValue({ id: 'cal-live', archivedAt: null });

          const error = await service.restoreBatch(asTx(), 'project', 'pr1', ACTOR).catch((e) => e);

          expect((error as ConflictError).details).toMatchObject({
            reason: HIERARCHY_CONFLICT.NAME_TAKEN,
            conflicts: [
              { field: 'name', value: 'Calendar cal-1', id: 'cal-live', archived: false },
            ],
          });
          expect(tx.project.updateMany).not.toHaveBeenCalled();
        });

        it('still refuses when the calendar belongs to a project this batch does not restore', async () => {
          aProject();
          tx.calendar.findMany.mockResolvedValue([stranded({ projectId: 'pr-elsewhere' })]);

          const error = await service.restoreBatch(asTx(), 'project', 'pr1', ACTOR).catch((e) => e);

          expect((error as ConflictError).details).toMatchObject({
            reason: 'CALENDAR_DELETED',
            calendar: { id: 'cal-1' },
          });
        });

        it('still refuses a plan restore, whose project is already active', async () => {
          aProject();
          tx.plan.findFirst.mockResolvedValue({
            deleteBatchId: 'batch-p',
            organizationId: 'org-1',
            projectId: 'pr1',
            calendarId: null,
          });
          tx.calendar.findMany.mockResolvedValue([stranded()]);

          const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

          expect((error as ConflictError).details).toMatchObject({ reason: 'CALENDAR_DELETED' });
        });
      });

      it('does not tier-check a root that carries no batch id', async () => {
        tx.plan.findFirst.mockResolvedValue({ ...root, deleteBatchId: null, calendarId: 'cal-1' });
        tx.project.findFirst.mockResolvedValue({ clientId: 'c1' });
        tx.$queryRaw.mockResolvedValue([{ id: 'x' }]);
        tx.calendar.findMany.mockResolvedValue([projectCalendar('cal-1', 'pr-other')]);

        await expect(service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR)).resolves.toBeDefined();
      });
    });

    describe('the deleted-calendar guard (ADR-0200)', () => {
      const deletedCalendar = (id: string, deleteBatchId: string | null = 'cal-batch') => ({
        id,
        name: `Calendar ${id}`,
        deletedAt: new Date('2026-01-01T00:00:00Z'),
        deleteBatchId,
      });

      /** A deleted plan in batch `batch-p` whose active parent project is in place. */
      const aDeletedPlan = (calendarId: string | null = null) => {
        tx.plan.findFirst.mockResolvedValue({
          deleteBatchId: 'batch-p',
          organizationId: 'org-1',
          projectId: 'pr1',
          calendarId,
        });
        tx.project.findFirst.mockResolvedValue({ id: 'pr1', clientId: 'c1' });
        tx.$queryRaw.mockResolvedValue([{ id: 'pr1' }]); // ancestors active (locked FOR SHARE)
      };

      const writes = () =>
        [tx.client, tx.project, tx.plan, tx.activity, tx.calendar].map(
          (m) => m.updateMany.mock.calls.length,
        );

      it('refuses a plan whose calendar was deleted separately, before writing anything', async () => {
        aDeletedPlan();
        tx.plan.findMany.mockResolvedValue([{ calendarId: 'cal-1' }]);
        tx.calendar.findMany.mockResolvedValue([deletedCalendar('cal-1')]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).details).toEqual({
          reason: 'CALENDAR_DELETED',
          calendar: { id: 'cal-1', name: 'Calendar cal-1', deleteBatchId: 'cal-batch' },
        });
        expect(writes()).toEqual([0, 0, 0, 0, 0]);
      });

      it('names the lowest id when several calendars are deleted', async () => {
        aDeletedPlan();
        tx.plan.findMany.mockResolvedValue([{ calendarId: 'cal-9' }]);
        tx.activity.findMany.mockResolvedValue([{ calendarId: 'cal-2' }, { calendarId: 'cal-9' }]);
        tx.calendar.findMany.mockResolvedValue([
          deletedCalendar('cal-9'),
          deletedCalendar('cal-2'),
        ]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect((error as ConflictError).details).toMatchObject({ calendar: { id: 'cal-2' } });
      });

      it('allows a calendar that is deleted in the same batch (it comes back with the batch)', async () => {
        aDeletedPlan();
        tx.plan.findMany.mockResolvedValue([{ calendarId: 'cal-1' }]);
        tx.calendar.findMany.mockResolvedValue([deletedCalendar('cal-1', 'batch-p')]);

        await expect(service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR)).resolves.toBeDefined();
        expect(tx.calendar.updateMany).toHaveBeenCalledWith({
          where: { deleteBatchId: 'batch-p' },
          data: { deletedAt: null, deleteBatchId: null, updatedBy: ACTOR },
        });
      });

      it('allows an active (or archived) calendar', async () => {
        aDeletedPlan();
        tx.plan.findMany.mockResolvedValue([{ calendarId: 'cal-1' }]);
        tx.calendar.findMany.mockResolvedValue([{ ...deletedCalendar('cal-1'), deletedAt: null }]);

        await expect(service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR)).resolves.toBeDefined();
      });

      it('treats a calendar row that is gone as deleted, with no name', async () => {
        aDeletedPlan();
        tx.activity.findMany.mockResolvedValue([{ calendarId: 'cal-1' }]);
        tx.calendar.findMany.mockResolvedValue([]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect((error as ConflictError).details).toEqual({
          reason: 'CALENDAR_DELETED',
          calendar: { id: 'cal-1', name: null, deleteBatchId: null },
        });
      });

      it('reports a deleted parent before a deleted calendar', async () => {
        aDeletedPlan();
        tx.project.findFirst.mockResolvedValue(null);
        tx.plan.findMany.mockResolvedValue([{ calendarId: 'cal-1' }]);
        tx.calendar.findMany.mockResolvedValue([deletedCalendar('cal-1')]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect((error as ConflictError).details).toEqual({
          reason: HIERARCHY_CONFLICT.PARENT_DELETED,
        });
      });

      it('locks the calendars in ascending id order, before the calendar read and any write', async () => {
        aDeletedPlan();
        tx.plan.findMany.mockResolvedValue([{ calendarId: 'cal-b' }]);
        tx.activity.findMany.mockResolvedValue([{ calendarId: 'cal-a' }, { calendarId: 'cal-b' }]);
        tx.calendar.findMany.mockResolvedValue([]);

        await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch(() => undefined);

        // One advisory-lock statement per distinct calendar, the id as the last template value.
        const locked = tx.$executeRaw.mock.calls.map((call) => call[call.length - 1]);
        expect(locked).toEqual(['cal-a', 'cal-b']);
        const lastLock = Math.max(...tx.$executeRaw.mock.invocationCallOrder);
        expect(lastLock).toBeLessThan(tx.calendar.findMany.mock.invocationCallOrder[0] ?? Infinity);
        // …and the parent is read after the locks, so the order is calendar then ancestors.
        expect(lastLock).toBeLessThan(tx.project.findFirst.mock.invocationCallOrder[0] ?? Infinity);
      });

      it('takes no lock and reads no calendar when nothing in the batch uses one', async () => {
        aDeletedPlan();

        await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR);

        expect(tx.$executeRaw).not.toHaveBeenCalled();
        expect(tx.calendar.findMany).not.toHaveBeenCalled();
      });

      it('reads the batch rows scoped to the organisation', async () => {
        aDeletedPlan();

        await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR);

        expect(tx.activity.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              deleteBatchId: 'batch-p',
              organizationId: 'org-1',
              calendarId: { not: null },
            },
          }),
        );
      });

      it('guards a legacy root with no batch id by its own calendar', async () => {
        tx.plan.findFirst.mockResolvedValue({
          deleteBatchId: null,
          organizationId: 'org-1',
          projectId: 'pr1',
          calendarId: 'cal-1',
        });
        tx.project.findFirst.mockResolvedValue({ id: 'pr1', clientId: 'c1' });
        tx.$queryRaw.mockResolvedValue([{ id: 'pr1' }]); // ancestors active (locked FOR SHARE)
        tx.calendar.findMany.mockResolvedValue([deletedCalendar('cal-1')]);

        const error = await service.restoreBatch(asTx(), 'plan', 'pl1', ACTOR).catch((e) => e);

        expect(error).toBeInstanceOf(ConflictError);
        expect(tx.plan.update).not.toHaveBeenCalled();
      });

      it.each(['client', 'project', 'activity'] as const)(
        'guards a %s restore through the same path',
        async (entity) => {
          const root = { deleteBatchId: 'batch-x', organizationId: 'org-1' };
          tx.client.findFirst.mockResolvedValue({ ...root, id: 'c1' });
          tx.project.findFirst.mockResolvedValue({ ...root, clientId: 'c1', id: 'pr1' });
          tx.$queryRaw.mockResolvedValue([{ id: 'x' }]);
          tx.plan.findFirst.mockResolvedValue({ id: 'pl1' });
          tx.activity.findFirst.mockResolvedValue({
            ...root,
            planId: 'pl1',
            parentId: null,
            calendarId: null,
          });
          tx.activity.findMany.mockResolvedValue([{ calendarId: 'cal-1' }]);
          tx.calendar.findMany.mockResolvedValue([deletedCalendar('cal-1')]);

          const error = await service.restoreBatch(asTx(), entity, 'x', ACTOR).catch((e) => e);

          expect((error as ConflictError).details).toMatchObject({ reason: 'CALENDAR_DELETED' });
          expect(writes()).toEqual([0, 0, 0, 0, 0]);
        },
      );
    });
  });
});
