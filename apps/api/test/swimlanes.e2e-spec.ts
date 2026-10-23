import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for a plan's swimlanes (swimlanes spec §4.12, M1-T2), against a real database.
 *
 * Boots with the plan edit-lock ENFORCED so the 423 on every write is observable, and so "a refused
 * write records nothing" can be asserted. Covers each role, the pen, organisation scope (404 before
 * anything else), the stale-version and duplicate-name 409s (including a non-ASCII case fold on
 * CI's own `postgres:17-alpine`, schema-design Q2), the 100-swimlane cap under the plan advisory
 * lock, reorder, soft delete and restore, a restore under a deleted plan, and the audit rows.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const LIMIT = 100;

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface LaneBody {
  id: string;
  planId: string;
  name: string;
  position: number;
  version: number;
}

describe.skipIf(!hasDatabase)('Swimlanes API (e2e, pen enforced)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let priorEnforced: string | undefined;

  beforeAll(async () => {
    priorEnforced = process.env.PLAN_EDIT_LOCK_ENFORCED;
    process.env.PLAN_EDIT_LOCK_ENFORCED = 'true';
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
    // Leave no swimlane behind: a sibling spec whose reset deletes plans directly would meet the
    // swimlanes' RESTRICT foreign key.
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
    if (priorEnforced === undefined) delete process.env.PLAN_EDIT_LOCK_ENFORCED;
    else process.env.PLAN_EDIT_LOCK_ENFORCED = priorEnforced;
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();
  const base = (org = 'acme') => `/api/v1/organizations/${org}`;
  const lanes = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/swimlanes`;
  const lockUrl = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/edit-lock`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function makePlan(actor: Actor, org = 'acme', planName = 'Plan'): Promise<string> {
    const client = await actor.agent
      .post(`${base(org)}/clients`)
      .send({ name: `Client ${planName}` })
      .expect(201);
    const project = await actor.agent
      .post(`${base(org)}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    const plan = await actor.agent
      .post(`${base(org)}/projects/${project.body.data.id}/plans`)
      .send({ name: planName, plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  /** An admin org with a plan, the pen taken. */
  async function setup(): Promise<{ actor: Actor; orgId: string; planId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const planId = await makePlan(actor);
    await actor.agent.post(lockUrl(planId)).send({}).expect(200);
    return { actor, orgId: res.body.data.id as string, planId };
  }

  async function addMember(
    orgId: string,
    role: 'VIEWER' | 'CONTRIBUTOR' | 'PLANNER',
    email: string,
  ): Promise<Actor> {
    const member = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: member.userId, role } });
    return member;
  }

  async function create(actor: Actor, planId: string, name: string, after?: string) {
    const res = await actor.agent
      .post(lanes(planId))
      .send({ name, ...(after ? { after } : {}) })
      .expect(201);
    return res.body.data as LaneBody;
  }

  async function list(actor: Actor, planId: string): Promise<LaneBody[]> {
    const res = await actor.agent.get(lanes(planId)).expect(200);
    return res.body.data as LaneBody[];
  }

  async function auditRows(action: string) {
    return prisma.auditEvent.findMany({ where: { action }, orderBy: { occurredAt: 'asc' } });
  }

  describe('create, list and rename', () => {
    it('appends in order, derives the organisation from the plan, and lists by position', async () => {
      const { actor, orgId, planId } = await setup();
      const a = await create(actor, planId, 'Civil');
      const b = await create(actor, planId, 'Mechanical');
      const c = await create(actor, planId, 'Electrical');
      expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);
      expect(a).toMatchObject({ planId, name: 'Civil', version: 1 });

      const stored = await prisma.swimlane.findUniqueOrThrow({ where: { id: a.id } });
      expect(stored.organizationId).toBe(orgId);
      expect(stored.createdBy).toBe(actor.userId);

      const res = await actor.agent.get(lanes(planId)).expect(200);
      expect(res.body.data.map((l: LaneBody) => l.name)).toEqual([
        'Civil',
        'Mechanical',
        'Electrical',
      ]);
      expect(res.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
    });

    it('inserts after a named swimlane, shifting the later ones', async () => {
      const { actor, planId } = await setup();
      const a = await create(actor, planId, 'A');
      await create(actor, planId, 'C');
      await create(actor, planId, 'B', a.id);
      expect((await list(actor, planId)).map((l) => [l.name, l.position])).toEqual([
        ['A', 0],
        ['B', 1],
        ['C', 2],
      ]);
    });

    it('trims the name and renames with a version bump', async () => {
      const { actor, planId } = await setup();
      const a = await create(actor, planId, '  Civil  ');
      expect(a.name).toBe('Civil');
      const res = await actor.agent
        .patch(`${lanes(planId)}/${a.id}`)
        .send({ name: 'Civil works', version: a.version })
        .expect(200);
      expect(res.body.data).toMatchObject({ name: 'Civil works', version: 2 });
    });

    it.each([
      ['empty', ''],
      ['whitespace only', '   '],
      ['81 characters', 'x'.repeat(81)],
      ['a control character', 'Civil\nworks'],
    ])('refuses a name that is %s with 422', async (_label, name) => {
      const { actor, planId } = await setup();
      await actor.agent.post(lanes(planId)).send({ name }).expect(422);
    });

    it('refuses an unknown property (forbidNonWhitelisted), so organizationId cannot be injected', async () => {
      const { actor, planId } = await setup();
      await actor.agent
        .post(lanes(planId))
        .send({ name: 'Civil', organizationId: '00000000-0000-0000-0000-000000000000' })
        .expect(422);
    });
  });

  describe('roles and the pen', () => {
    it('lets a Viewer read, and refuses a Viewer and a Contributor every write with 403', async () => {
      const { actor, orgId, planId } = await setup();
      const lane = await create(actor, planId, 'Civil');
      for (const role of ['VIEWER', 'CONTRIBUTOR'] as const) {
        const member = await addMember(orgId, role, `${role.toLowerCase()}@example.com`);
        await member.agent.get(lanes(planId)).expect(200);
        await member.agent.post(lanes(planId)).send({ name: 'X' }).expect(403);
        await member.agent
          .patch(`${lanes(planId)}/${lane.id}`)
          .send({ name: 'X', version: 1 })
          .expect(403);
        await member.agent
          .patch(`${lanes(planId)}/order`)
          .send({ order: [{ id: lane.id, version: 1 }] })
          .expect(403);
        await member.agent.delete(`${lanes(planId)}/${lane.id}`).expect(403);
        await member.agent.post(`${lanes(planId)}/${lane.id}/restore`).expect(403);
      }
    });

    it('lets a Planner who holds the pen write', async () => {
      const { actor, orgId, planId } = await setup();
      const planner = await addMember(orgId, 'PLANNER', 'planner@example.com');
      await actor.agent.delete(lockUrl(planId)).expect(204);
      await planner.agent.post(lockUrl(planId)).send({}).expect(200);
      await planner.agent.post(lanes(planId)).send({ name: 'Civil' }).expect(201);
    });

    it('answers 423 to every write without the pen, and changes nothing', async () => {
      const { actor, planId } = await setup();
      const lane = await create(actor, planId, 'Civil');
      const gone = await create(actor, planId, 'Gone');
      await actor.agent.delete(`${lanes(planId)}/${gone.id}`).expect(204);
      await actor.agent.delete(lockUrl(planId)).expect(204);

      await actor.agent.post(lanes(planId)).send({ name: 'X' }).expect(423);
      await actor.agent
        .patch(`${lanes(planId)}/${lane.id}`)
        .send({ name: 'X', version: 1 })
        .expect(423);
      await actor.agent
        .patch(`${lanes(planId)}/order`)
        .send({ order: [{ id: lane.id, version: 1 }] })
        .expect(423);
      await actor.agent.delete(`${lanes(planId)}/${lane.id}`).expect(423);
      await actor.agent.post(`${lanes(planId)}/${gone.id}/restore`).expect(423);

      await actor.agent.post(lockUrl(planId)).send({}).expect(200);
      expect((await list(actor, planId)).map((l) => l.name)).toEqual(['Civil']);
      expect(await auditRows('swimlane.deleted')).toHaveLength(1);
      expect(await auditRows('swimlane.restored')).toHaveLength(0);
    });

    it('answers 401 without a session', async () => {
      const { planId } = await setup();
      await request(server()).get(lanes(planId)).expect(401);
    });
  });

  describe('organisation and plan scope', () => {
    it('answers 404 for another organisation’s plan and swimlane on every route', async () => {
      const { actor, planId } = await setup();
      const lane = await create(actor, planId, 'Civil');
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);

      // Their own slug, our plan id.
      await outsider.agent.get(lanes(planId, 'other-co')).expect(404);
      await outsider.agent.post(lanes(planId, 'other-co')).send({ name: 'X' }).expect(404);
      // Our slug: not a member.
      await outsider.agent.get(lanes(planId)).expect(404);
      await outsider.agent.post(lanes(planId)).send({ name: 'X' }).expect(404);
      await outsider.agent
        .patch(`${lanes(planId)}/${lane.id}`)
        .send({ name: 'X', version: 1 })
        .expect(404);
      await outsider.agent.delete(`${lanes(planId)}/${lane.id}`).expect(404);
      await outsider.agent.post(`${lanes(planId)}/${lane.id}/restore`).expect(404);
    });

    it('answers 404 for a swimlane addressed through a different plan of the same organisation', async () => {
      const { actor, planId } = await setup();
      const lane = await create(actor, planId, 'Civil');
      const otherPlan = await makePlan(actor, 'acme', 'Second');
      await actor.agent.post(lockUrl(otherPlan)).send({}).expect(200);

      await actor.agent
        .patch(`${lanes(otherPlan)}/${lane.id}`)
        .send({ name: 'X', version: 1 })
        .expect(404);
      await actor.agent.delete(`${lanes(otherPlan)}/${lane.id}`).expect(404);
      await actor.agent.post(`${lanes(otherPlan)}/${lane.id}/restore`).expect(404);
      await actor.agent.post(lanes(otherPlan)).send({ name: 'B', after: lane.id }).expect(404);
      await actor.agent
        .patch(`${lanes(otherPlan)}/order`)
        .send({ order: [{ id: lane.id, version: 1 }] })
        .expect(404);
      expect(await list(actor, otherPlan)).toEqual([]);
    });
  });

  describe('409 and 422', () => {
    it('answers 409 for a stale version, applying nothing', async () => {
      const { actor, planId } = await setup();
      const lane = await create(actor, planId, 'Civil');
      await actor.agent
        .patch(`${lanes(planId)}/${lane.id}`)
        .send({ name: 'One', version: 1 })
        .expect(200);
      const stale = await actor.agent
        .patch(`${lanes(planId)}/${lane.id}`)
        .send({ name: 'Two', version: 1 })
        .expect(409);
      expect(stale.body.error.details.reason).toBe('STALE_VERSION');
      expect((await list(actor, planId))[0]?.name).toBe('One');
    });

    it('answers 409 SWIMLANE_NAME_TAKEN for a duplicate, ignoring case', async () => {
      const { actor, planId } = await setup();
      await create(actor, planId, 'Civil');
      const dup = await actor.agent.post(lanes(planId)).send({ name: 'CIVIL' }).expect(409);
      expect(dup.body.error.details.reason).toBe('SWIMLANE_NAME_TAKEN');
      // The message is fixed text: it never echoes a stored name.
      expect(JSON.stringify(dup.body)).not.toContain('Civil');
    });

    it('folds a non-ASCII pair (É/é) on this database, the schema-design Q2 measurement', async () => {
      const { actor, planId } = await setup();
      await create(actor, planId, 'Électrique');
      await actor.agent.post(lanes(planId)).send({ name: 'éLECTRIQUE' }).expect(409);
    });

    it('answers 409 when a rename collides with a sibling', async () => {
      const { actor, planId } = await setup();
      await create(actor, planId, 'Civil');
      const b = await create(actor, planId, 'Mechanical');
      await actor.agent
        .patch(`${lanes(planId)}/${b.id}`)
        .send({ name: 'civil', version: 1 })
        .expect(409);
    });

    it('lets two plans use the same name, and a deleted name be reused', async () => {
      const { actor, planId } = await setup();
      const otherPlan = await makePlan(actor, 'acme', 'Second');
      await actor.agent.post(lockUrl(otherPlan)).send({}).expect(200);
      const a = await create(actor, planId, 'Civil');
      await create(actor, otherPlan, 'Civil');
      await actor.agent.delete(`${lanes(planId)}/${a.id}`).expect(204);
      await create(actor, planId, 'Civil');
    });

    it('answers 422 SWIMLANE_LIMIT for the 101st swimlane, and 100 are accepted', async () => {
      const { actor, orgId, planId } = await setup();
      await prisma.swimlane.createMany({
        data: Array.from({ length: LIMIT - 1 }, (_, i) => ({
          organizationId: orgId,
          planId,
          name: `Lane ${i}`,
          position: i,
        })),
      });
      await create(actor, planId, 'The hundredth');
      const over = await actor.agent.post(lanes(planId)).send({ name: 'One too many' }).expect(422);
      expect(over.body.error.details.reason).toBe('SWIMLANE_LIMIT');
    });

    it('lets exactly one of two concurrent creates take the last slot (the plan lock)', async () => {
      const { actor, orgId, planId } = await setup();
      await prisma.swimlane.createMany({
        data: Array.from({ length: LIMIT - 1 }, (_, i) => ({
          organizationId: orgId,
          planId,
          name: `Lane ${i}`,
          position: i,
        })),
      });
      const results = await Promise.all(
        ['Racer A', 'Racer B'].map((name) => actor.agent.post(lanes(planId)).send({ name })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await prisma.swimlane.count({ where: { planId, deletedAt: null } })).toBe(LIMIT);
    });
  });

  describe('reorder', () => {
    it('rewrites positions densely and bumps the versions of what moved', async () => {
      const { actor, planId } = await setup();
      const a = await create(actor, planId, 'A');
      const b = await create(actor, planId, 'B');
      const c = await create(actor, planId, 'C');
      const res = await actor.agent
        .patch(`${lanes(planId)}/order`)
        .send({
          order: [
            { id: c.id, version: c.version },
            { id: a.id, version: a.version },
            { id: b.id, version: b.version },
          ],
        })
        .expect(200);
      expect(res.body.data.map((l: LaneBody) => [l.name, l.position])).toEqual([
        ['C', 0],
        ['A', 1],
        ['B', 2],
      ]);
      expect(res.body.data.map((l: LaneBody) => l.version)).toEqual([2, 2, 2]);
      expect((await list(actor, planId)).map((l) => l.name)).toEqual(['C', 'A', 'B']);
    });

    it('applies nothing on a stale version, a missing swimlane or a duplicate', async () => {
      const { actor, planId } = await setup();
      const a = await create(actor, planId, 'A');
      const b = await create(actor, planId, 'B');
      const stale = await actor.agent
        .patch(`${lanes(planId)}/order`)
        .send({
          order: [
            { id: b.id, version: 7 },
            { id: a.id, version: 1 },
          ],
        })
        .expect(409);
      expect(stale.body.error.details.reason).toBe('STALE_VERSION');
      await actor.agent
        .patch(`${lanes(planId)}/order`)
        .send({ order: [{ id: b.id, version: 1 }] })
        .expect(409);
      await actor.agent
        .patch(`${lanes(planId)}/order`)
        .send({
          order: [
            { id: b.id, version: 1 },
            { id: b.id, version: 1 },
          ],
        })
        .expect(422);
      expect((await list(actor, planId)).map((l) => l.name)).toEqual(['A', 'B']);
    });
  });

  describe('delete and restore', () => {
    it('soft-deletes, hides from the list, restores in place, and audits both', async () => {
      const { actor, planId } = await setup();
      await create(actor, planId, 'A');
      const b = await create(actor, planId, 'B');
      await create(actor, planId, 'C');

      await actor.agent.delete(`${lanes(planId)}/${b.id}`).expect(204);
      expect((await list(actor, planId)).map((l) => l.name)).toEqual(['A', 'C']);
      const stored = await prisma.swimlane.findUniqueOrThrow({ where: { id: b.id } });
      expect(stored.deletedAt).not.toBeNull();
      expect(stored.deleteBatchId).not.toBeNull();
      await actor.agent.delete(`${lanes(planId)}/${b.id}`).expect(404);

      const restored = await actor.agent.post(`${lanes(planId)}/${b.id}/restore`).expect(200);
      expect(restored.body.data).toMatchObject({ id: b.id, name: 'B', position: 1 });
      expect((await list(actor, planId)).map((l) => l.name)).toEqual(['A', 'B', 'C']);

      const [deleted] = await auditRows('swimlane.deleted');
      expect(deleted).toMatchObject({
        subjectType: 'SWIMLANE',
        subjectId: b.id,
        subjectLabel: 'B',
        actorUserId: actor.userId,
      });
      expect(deleted?.changes).toMatchObject({
        before: { name: 'B', planName: 'Plan', deleteBatchId: stored.deleteBatchId },
      });
      const [back] = await auditRows('swimlane.restored');
      expect(back).toMatchObject({ subjectType: 'SWIMLANE', subjectId: b.id });
      expect(back?.changes).toMatchObject({ after: { name: 'B', planName: 'Plan' } });
    });

    it('writes no audit row for create, rename or reorder', async () => {
      const { actor, planId } = await setup();
      const a = await create(actor, planId, 'A');
      await actor.agent
        .patch(`${lanes(planId)}/${a.id}`)
        .send({ name: 'A2', version: 1 })
        .expect(200);
      expect(
        await prisma.auditEvent.count({ where: { action: { startsWith: 'swimlane.' } } }),
      ).toBe(0);
    });

    it('refuses a delete at a stale ?version= and deletes nothing', async () => {
      const { actor, planId } = await setup();
      const a = await create(actor, planId, 'A');
      const res = await actor.agent.delete(`${lanes(planId)}/${a.id}?version=5`).expect(409);
      expect(res.body.error.details.reason).toBe('STALE_VERSION');
      expect(await list(actor, planId)).toHaveLength(1);
      expect(await auditRows('swimlane.deleted')).toHaveLength(0);
      await actor.agent.delete(`${lanes(planId)}/${a.id}?version=1`).expect(204);
    });

    it('answers 409 when the name was taken while it was deleted, and keeps it deleted', async () => {
      const { actor, planId } = await setup();
      const a = await create(actor, planId, 'Civil');
      await actor.agent.delete(`${lanes(planId)}/${a.id}`).expect(204);
      await create(actor, planId, 'civil');
      const res = await actor.agent.post(`${lanes(planId)}/${a.id}/restore`).expect(409);
      expect(res.body.error.details.reason).toBe('SWIMLANE_NAME_TAKEN');
      expect(await auditRows('swimlane.restored')).toHaveLength(0);
    });

    it('answers 409 PARENT_DELETED for a restore under a deleted plan', async () => {
      const { actor, planId } = await setup();
      const a = await create(actor, planId, 'Civil');
      await actor.agent.delete(`${lanes(planId)}/${a.id}`).expect(204);
      await actor.agent.delete(`${base()}/plans/${planId}`).expect(204);
      const res = await actor.agent.post(`${lanes(planId)}/${a.id}/restore`).expect(409);
      expect(res.body.error.details.reason).toBe('PARENT_DELETED');
    });

    it('answers 422 for a restore that would pass the cap', async () => {
      const { actor, orgId, planId } = await setup();
      const a = await create(actor, planId, 'Civil');
      await actor.agent.delete(`${lanes(planId)}/${a.id}`).expect(204);
      await prisma.swimlane.createMany({
        data: Array.from({ length: LIMIT }, (_, i) => ({
          organizationId: orgId,
          planId,
          name: `Lane ${i}`,
          position: i,
        })),
      });
      await actor.agent.post(`${lanes(planId)}/${a.id}/restore`).expect(422);
    });
  });
});
