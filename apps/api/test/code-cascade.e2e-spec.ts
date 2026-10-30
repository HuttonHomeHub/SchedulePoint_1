import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { permissionsForRole } from '../src/common/auth/org-permissions';
import { Principal } from '../src/common/auth/principal';
import { acquirePlanWriteLock } from '../src/common/db/plan-advisory-lock';
import { NotFoundError } from '../src/common/errors/domain-errors';
import { HierarchyLifecycleService } from '../src/common/hierarchy/hierarchy-lifecycle.service';
import { ActivityCodesService } from '../src/modules/activities/activity-codes.service';
import { CodeTypesService } from '../src/modules/codes/code-types.service';
import { CodeValuesService } from '../src/modules/codes/code-values.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * A plan's code types and values travel with its delete batch (p6-activity-codes database-design
 * §8.2, plan M2-T5): a plan, project or client delete stamps them beside the swimlanes, and the
 * restore brings back exactly that batch and nothing deleted earlier under its own.
 *
 * The second half is the race the stamp has to survive: a codes write that meets a plan delete in
 * flight must be refused, not left as a live row under a deleted plan. Driven below HTTP, like
 * `activity-create-plan-lock-race.e2e-spec.ts`, because two Supertest requests do not overlap (#70):
 * a test-owned transaction plays the delete, holds the plan lock and runs the REAL cascade before it
 * commits, while the write is started against the held lock.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const HOLD_MS = 1_000;
const EARLIER_BATCH = '00000000-0000-7000-8000-000000000001';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(!hasDatabase)('Code types and values in the delete cascade (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let orgId: string;
  let clientId: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(Token);
  });

  afterAll(async () => {
    // Leave no code row behind: a sibling spec whose reset deletes plans directly would meet the
    // RESTRICT foreign keys.
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
  });

  const base = '/api/v1/organizations/acme';

  beforeEach(async () => {
    await clearDomainData(prisma);
    agent = request.agent(app.getHttpServer());
    const signUp = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    userId = (signUp.body as { user: { id: string } }).user.id;
    const org = await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    orgId = org.body.data.id as string;
    const client = await agent.post(`${base}/clients`).send({ name: 'Client' }).expect(201);
    clientId = client.body.data.id as string;
    const project = await agent
      .post(`${base}/clients/${clientId}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    projectId = project.body.data.id as string;
  });

  async function makePlan(name: string): Promise<string> {
    const plan = await agent
      .post(`${base}/projects/${projectId}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  interface Coded {
    planId: string;
    live: { typeId: string; valueIds: string[] };
    earlierValueId: string;
    earlierType: { typeId: string; valueId: string };
    activityId: string;
  }

  /**
   * A coded plan through the public routes: a live type with two live values, one value deleted on its
   * own before anything else, and a type deleted on its own (with its value) before anything else. An
   * activity carries the live value and, by direct write, the deleted one's sibling type is left bare.
   */
  async function codedPlan(name: string): Promise<Coded> {
    const planId = await makePlan(name);
    const codes = `${base}/plans/${planId}`;
    const area = (await agent.post(`${codes}/code-types`).send({ name: 'Area' }).expect(201)).body
      .data as { id: string };
    const trade = (await agent.post(`${codes}/code-types`).send({ name: 'Trade' }).expect(201)).body
      .data as { id: string };
    const value = async (typeId: string, shortCode: string) =>
      (await agent.post(`${codes}/code-types/${typeId}/values`).send({ shortCode }).expect(201))
        .body.data as { id: string };
    const l1 = await value(area.id, 'L1');
    const l2 = await value(area.id, 'L2');
    const l3 = await value(area.id, 'L3');
    const t1 = await value(trade.id, 'T1');
    await agent.delete(`${codes}/code-values/${l3.id}`).expect(204);
    await agent.delete(`${codes}/code-types/${trade.id}`).expect(204);
    const activity = await prisma.activity.create({
      data: { organizationId: orgId, planId, name: 'Excavate', durationMinutes: 1440 },
      select: { id: true },
    });
    await prisma.codeValueAssignment.create({
      data: {
        organizationId: orgId,
        planId,
        activityId: activity.id,
        codeTypeId: area.id,
        codeValueId: l1.id,
      },
    });
    return {
      planId,
      live: { typeId: area.id, valueIds: [l1.id, l2.id] },
      earlierValueId: l3.id,
      earlierType: { typeId: trade.id, valueId: t1.id },
      activityId: activity.id,
    };
  }

  const typeRow = (id: string) => prisma.codeType.findUniqueOrThrow({ where: { id } });
  const valueRow = (id: string) => prisma.codeValue.findUniqueOrThrow({ where: { id } });

  /** What a delete of the plan or an ancestor did to one coded plan, against the batch it stamped. */
  async function expectStamped(c: Coded, batchId: string): Promise<void> {
    const type = await typeRow(c.live.typeId);
    expect(type.deletedAt).not.toBeNull();
    expect(type.deleteBatchId).toBe(batchId);
    for (const id of c.live.valueIds) {
      const row = await valueRow(id);
      expect(row.deletedAt).not.toBeNull();
      expect(row.deleteBatchId).toBe(batchId);
    }
    // Deleted on their own earlier: each keeps its own batch, so the restore cannot revive them.
    const earlierValue = await valueRow(c.earlierValueId);
    expect(earlierValue.deleteBatchId).not.toBe(batchId);
    expect(earlierValue.deleteBatchId).not.toBeNull();
    expect((await typeRow(c.earlierType.typeId)).deleteBatchId).not.toBe(batchId);
    expect((await valueRow(c.earlierType.valueId)).deleteBatchId).not.toBe(batchId);
    // An assignment is a join row: nothing rewrote it.
    expect(await prisma.codeValueAssignment.count({ where: { planId: c.planId } })).toBe(1);
  }

  async function expectRestored(c: Coded): Promise<void> {
    const type = await typeRow(c.live.typeId);
    expect(type.deletedAt).toBeNull();
    expect(type.deleteBatchId).toBeNull();
    for (const id of c.live.valueIds) {
      const row = await valueRow(id);
      expect(row.deletedAt).toBeNull();
      expect(row.deleteBatchId).toBeNull();
    }
    // Batch semantics: what was deleted before stays deleted.
    expect((await valueRow(c.earlierValueId)).deletedAt).not.toBeNull();
    expect((await typeRow(c.earlierType.typeId)).deletedAt).not.toBeNull();
    expect((await valueRow(c.earlierType.valueId)).deletedAt).not.toBeNull();
    expect(await prisma.codeValueAssignment.count({ where: { planId: c.planId } })).toBe(1);
  }

  const batchOf = async (planId: string) =>
    (await prisma.plan.findUniqueOrThrow({ where: { id: planId } })).deleteBatchId as string;

  it('stamps a plan’s types and values into its delete batch and restores exactly that batch', async () => {
    const c = await codedPlan('Plan A');
    await agent.delete(`${base}/plans/${c.planId}`).expect(204);
    await expectStamped(c, await batchOf(c.planId));

    await agent.post(`${base}/plans/${c.planId}/restore`).expect(200);
    await expectRestored(c);
  });

  it('carries every coded plan of a project through its delete and restore', async () => {
    const a = await codedPlan('Plan A');
    const b = await codedPlan('Plan B');
    await agent.delete(`${base}/projects/${projectId}`).expect(204);
    const batch = (await prisma.project.findUniqueOrThrow({ where: { id: projectId } }))
      .deleteBatchId as string;
    await expectStamped(a, batch);
    await expectStamped(b, batch);

    await agent.post(`${base}/projects/${projectId}/restore`).expect(200);
    await expectRestored(a);
    await expectRestored(b);
  });

  it('carries every coded plan of a client through its delete and restore', async () => {
    const a = await codedPlan('Plan A');
    const b = await codedPlan('Plan B');
    await agent.delete(`${base}/clients/${clientId}`).expect(204);
    const batch = (await prisma.client.findUniqueOrThrow({ where: { id: clientId } }))
      .deleteBatchId as string;
    await expectStamped(a, batch);
    await expectStamped(b, batch);

    await agent.post(`${base}/clients/${clientId}/restore`).expect(200);
    await expectRestored(a);
    await expectRestored(b);
  });

  it('keeps a plan’s swimlane source type pointing at the type through delete and restore', async () => {
    const c = await codedPlan('Plan A');
    // Through the real switch (M4-T2): the one activity carries a live value of the type, so 1 value is in use.
    const held = await agent.get(`${base}/plans/${c.planId}`).expect(200);
    await agent
      .patch(`${base}/plans/${c.planId}`)
      .send({
        swimlaneSource: 'ACTIVITY_CODE',
        swimlaneCodeTypeId: c.live.typeId,
        version: held.body.data.version,
      })
      .expect(200);
    await agent.delete(`${base}/plans/${c.planId}`).expect(204);
    expect((await typeRow(c.live.typeId)).deletedAt).not.toBeNull();
    await agent.post(`${base}/plans/${c.planId}/restore`).expect(200);
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: c.planId } });
    expect(plan).toMatchObject({
      swimlaneSource: 'ACTIVITY_CODE',
      swimlaneCodeTypeId: c.live.typeId,
    });
    expect((await typeRow(c.live.typeId)).deletedAt).toBeNull();
  });

  it('leaves code types, values and assignments alone when an activity is deleted and restored', async () => {
    const c = await codedPlan('Plan A');
    await agent.delete(`${base}/activities/${c.activityId}`).expect(200);
    expect((await typeRow(c.live.typeId)).deletedAt).toBeNull();
    for (const id of c.live.valueIds) expect((await valueRow(id)).deletedAt).toBeNull();
    await agent.post(`${base}/activities/${c.activityId}/restore`).expect(200);
    expect((await typeRow(c.live.typeId)).deletedAt).toBeNull();
    expect(await prisma.codeValueAssignment.count({ where: { planId: c.planId } })).toBe(1);
  });

  it('does not revive a type or value whose own batch is not the delete’s', async () => {
    const c = await codedPlan('Plan A');
    // A foreign batch id on a live-looking deleted row: the plan restore selects by ITS batch only.
    await prisma.codeValue.update({
      where: { id: c.earlierValueId },
      data: { deleteBatchId: EARLIER_BATCH },
    });
    await agent.delete(`${base}/plans/${c.planId}`).expect(204);
    await agent.post(`${base}/plans/${c.planId}/restore`).expect(200);
    const row = await valueRow(c.earlierValueId);
    expect(row.deletedAt).not.toBeNull();
    expect(row.deleteBatchId).toBe(EARLIER_BATCH);
  });

  describe('a codes write that meets a plan delete in flight', () => {
    const principal = () =>
      new Principal(userId, [
        { organizationId: orgId, role: 'ORG_ADMIN', permissions: permissionsForRole('ORG_ADMIN') },
      ]);

    /**
     * Runs `write` while a test-owned transaction holds the plan lock, then has that transaction run
     * the real cascade and commit. Returns what the write did and whether it finished inside the hold.
     */
    async function raceAgainstDelete(planId: string, write: () => Promise<unknown>) {
      let held!: () => void;
      const heldPromise = new Promise<void>((resolve) => (held = resolve));
      const deleter = prisma.$transaction(
        async (tx) => {
          await acquirePlanWriteLock(tx, planId);
          held();
          await sleep(HOLD_MS);
          await app.get(HierarchyLifecycleService).cascadeSoftDelete(tx, 'plan', planId, userId);
        },
        { timeout: 30_000 },
      );
      await heldPromise;

      let settled = false;
      const outcome = write()
        .then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason: unknown) => ({ status: 'rejected' as const, reason }),
        )
        .finally(() => {
          settled = true;
        });
      await sleep(HOLD_MS / 2);
      const finishedWhileHeld = settled;
      await deleter;
      return { result: await outcome, finishedWhileHeld };
    }

    const liveUnder = async (planId: string) => ({
      types: await prisma.codeType.count({ where: { planId, deletedAt: null } }),
      values: await prisma.codeValue.count({
        where: { codeType: { planId }, deletedAt: null },
      }),
    });

    it('refuses a type create and leaves no live code row under the deleted plan', async () => {
      const c = await codedPlan('Plan A');
      const before = await prisma.codeType.count({ where: { planId: c.planId } });
      const { result, finishedWhileHeld } = await raceAgainstDelete(c.planId, () =>
        app.get(CodeTypesService).create(principal(), 'acme', c.planId, { name: 'Late' }),
      );
      expect(finishedWhileHeld, 'the create was not held by the plan lock').toBe(false);
      expect(result.status).toBe('rejected');
      expect((result as { reason: unknown }).reason).toBeInstanceOf(NotFoundError);
      expect(await prisma.codeType.count({ where: { planId: c.planId } })).toBe(before);
      expect(await liveUnder(c.planId)).toEqual({ types: 0, values: 0 });
    });

    it('refuses a value create and leaves no live code row under the deleted plan', async () => {
      const c = await codedPlan('Plan A');
      const before = await prisma.codeValue.count({ where: { codeType: { planId: c.planId } } });
      const { result, finishedWhileHeld } = await raceAgainstDelete(c.planId, () =>
        app
          .get(CodeValuesService)
          .create(principal(), 'acme', c.planId, c.live.typeId, { shortCode: 'LATE' }),
      );
      expect(finishedWhileHeld, 'the create was not held by the plan lock').toBe(false);
      expect(result.status).toBe('rejected');
      expect((result as { reason: unknown }).reason).toBeInstanceOf(NotFoundError);
      expect(await prisma.codeValue.count({ where: { codeType: { planId: c.planId } } })).toBe(
        before,
      );
      expect(await liveUnder(c.planId)).toEqual({ types: 0, values: 0 });
    });

    it('refuses an assignment write and leaves the assignment as it was', async () => {
      const c = await codedPlan('Plan A');
      const activity = await prisma.activity.findUniqueOrThrow({ where: { id: c.activityId } });
      const [, l2] = c.live.valueIds;
      const { result, finishedWhileHeld } = await raceAgainstDelete(c.planId, () =>
        app.get(ActivityCodesService).write(principal(), 'acme', c.planId, {
          activities: [
            {
              id: c.activityId,
              version: activity.version,
              codes: [{ codeTypeId: c.live.typeId, codeValueId: l2 as string }],
            },
          ],
        }),
      );
      expect(finishedWhileHeld, 'the write was not held by the plan lock').toBe(false);
      expect(result.status).toBe('rejected');
      expect((result as { reason: unknown }).reason).toBeInstanceOf(NotFoundError);
      const kept = await prisma.codeValueAssignment.findFirstOrThrow({
        where: { activityId: c.activityId },
      });
      expect(kept.codeValueId).toBe(c.live.valueIds[0]);
      expect(await liveUnder(c.planId)).toEqual({ types: 0, values: 0 });
    });
  });
});
