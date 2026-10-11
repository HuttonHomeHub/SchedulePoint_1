import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * An opted-in single-row delete refuses a row that changed after the caller read it
 * (`docs/TECH_DEBT.md` #450): `DELETE …?version=N` on an activity, a dependency and an assignment,
 * and `{ version }` on a dissolve.
 *
 * Needs a real database for what the refusal must NOT do. A stale delete answers 409 **and**
 * deletes nothing, writes no audit row and stamps no plan — three things a mocked repository
 * agrees with whatever it is handed. Every route is also driven WITHOUT a version, because the
 * guarantee that existing callers are unaffected is half of the claim.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';

interface Actor {
  agent: ReturnType<typeof request.agent>;
}
type Versioned = { id: string; version: number };

describe.skipIf(!hasDatabase)('Versioned single-row delete (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    await app?.close();
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  async function world() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent.post(`${API}/clients`).send({ name: 'Northgate' }).expect(201);
    const project = await agent
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Tower' })
      .expect(201);
    const plan = await agent
      .post(`${API}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Plan', plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await agent.post(`${API}/plans/${planId}/edit-lock`).send({}).expect(200);
    return { actor: { agent }, planId };
  }

  async function addActivity(actor: Actor, planId: string, over: object = {}): Promise<Versioned> {
    const res = await actor.agent
      .post(`${API}/plans/${planId}/activities`)
      .send({ name: `A${Math.random().toString(36).slice(2, 8)}`, durationDays: 3, ...over })
      .expect(201);
    return res.body.data as Versioned;
  }

  /** What a refusal must leave untouched: the row, the audit trail and the plan's freshness flag. */
  async function plansEdited(actor: Actor, planId: string): Promise<boolean> {
    const plan = await actor.agent.get(`${API}/plans/${planId}`).expect(200);
    return (plan.body.data as { editedSinceCalculated: boolean }).editedSinceCalculated;
  }

  const recalculate = (actor: Actor, planId: string) =>
    actor.agent.post(`${API}/plans/${planId}/schedule/recalculate`).send({}).expect(200);

  const auditCount = (action: string) => prisma.auditEvent.count({ where: { action } });

  describe('DELETE activity', () => {
    it('refuses a stale version with 409 STALE_VERSION and deletes, audits and stamps nothing', async () => {
      const { actor, planId } = await world();
      const a = await addActivity(actor, planId);
      // A colleague's edit lands after the caller read the row.
      await actor.agent
        .patch(`${API}/activities/${a.id}`)
        .send({ durationDays: 9, version: a.version })
        .expect(200);
      await recalculate(actor, planId);

      const res = await actor.agent.delete(`${API}/activities/${a.id}?version=${a.version}`);

      expect(res.status).toBe(409);
      expect(res.body.error.details).toMatchObject({ reason: 'STALE_VERSION' });
      const row = await prisma.activity.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.deletedAt).toBeNull();
      expect(await auditCount('activity.deleted')).toBe(0);
      expect(await plansEdited(actor, planId)).toBe(false);
    });

    it('deletes at the current version, and with no version at all, exactly as before', async () => {
      const { actor, planId } = await world();
      const a = await addActivity(actor, planId);
      const b = await addActivity(actor, planId);

      const versioned = await actor.agent
        .delete(`${API}/activities/${a.id}?version=${a.version}`)
        .expect(200);
      const bare = await actor.agent.delete(`${API}/activities/${b.id}`).expect(200);

      expect(versioned.body.data.deleteBatchId).toEqual(expect.any(String));
      expect(bare.body.data.deleteBatchId).toEqual(expect.any(String));
      expect(await auditCount('activity.deleted')).toBe(2);
    });

    it('rejects a version that is not a positive integer with 422', async () => {
      const { actor, planId } = await world();
      const a = await addActivity(actor, planId);

      await actor.agent.delete(`${API}/activities/${a.id}?version=abc`).expect(422);
      await actor.agent.delete(`${API}/activities/${a.id}?version=0`).expect(422);
      await actor.agent.delete(`${API}/activities/${a.id}?unknown=1`).expect(422);
      const row = await prisma.activity.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.deletedAt).toBeNull();
    });

    it('guards a summary by its own version, and a stale one leaves the whole subtree alone', async () => {
      const { actor, planId } = await world();
      const summary = await addActivity(actor, planId, { type: 'WBS_SUMMARY', durationDays: 0 });
      const child = await addActivity(actor, planId, { parentId: summary.id });
      const moved = await actor.agent
        .patch(`${API}/activities/${summary.id}`)
        .send({ name: 'Renamed phase', version: summary.version })
        .expect(200);

      await actor.agent
        .delete(`${API}/activities/${summary.id}?version=${summary.version}`)
        .expect(409);
      expect(
        (await prisma.activity.findUniqueOrThrow({ where: { id: child.id } })).deletedAt,
      ).toBeNull();

      await actor.agent
        .delete(`${API}/activities/${summary.id}?version=${moved.body.data.version}`)
        .expect(200);
      expect(
        (await prisma.activity.findUniqueOrThrow({ where: { id: child.id } })).deletedAt,
      ).not.toBeNull();
    });
  });

  describe('DELETE dependency', () => {
    async function linked() {
      const { actor, planId } = await world();
      const a = await addActivity(actor, planId);
      const b = await addActivity(actor, planId);
      const c = await addActivity(actor, planId);
      const link = await actor.agent
        .post(`${API}/plans/${planId}/dependencies`)
        .send({ predecessorId: a.id, successorId: b.id })
        .expect(201);
      const other = await actor.agent
        .post(`${API}/plans/${planId}/dependencies`)
        .send({ predecessorId: b.id, successorId: c.id })
        .expect(201);
      return {
        actor,
        planId,
        link: link.body.data as Versioned,
        other: other.body.data as Versioned,
      };
    }

    it('refuses a stale version with 409 and keeps the link, its audit trail and the flag', async () => {
      const { actor, planId, link } = await linked();
      await actor.agent
        .patch(`${API}/dependencies/${link.id}`)
        .send({ lagDays: 2, version: link.version })
        .expect(200);
      await recalculate(actor, planId);

      const res = await actor.agent.delete(
        `${API}/dependencies/${link.id}?version=${link.version}`,
      );

      expect(res.status).toBe(409);
      expect(res.body.error.details).toMatchObject({ reason: 'STALE_VERSION' });
      const row = await prisma.activityDependency.findUniqueOrThrow({ where: { id: link.id } });
      expect(row.deletedAt).toBeNull();
      expect(await auditCount('dependency.deleted')).toBe(0);
      expect(await plansEdited(actor, planId)).toBe(false);
    });

    it('deletes at the current version and with none', async () => {
      const { actor, link, other } = await linked();
      await actor.agent
        .delete(`${API}/dependencies/${link.id}?version=${link.version}`)
        .expect(204);
      await actor.agent.delete(`${API}/dependencies/${other.id}`).expect(204);
      expect(await auditCount('dependency.deleted')).toBe(2);
    });
  });

  describe('DELETE assignment', () => {
    async function assigned() {
      const { actor, planId } = await world();
      const activity = await addActivity(actor, planId);
      const assign = async (name: string): Promise<Versioned> => {
        const resource = await actor.agent
          .post(`${API}/resources`)
          .send({ name, kind: 'LABOUR' })
          .expect(201);
        const res = await actor.agent
          .post(`${API}/activities/${activity.id}/assignments`)
          .send({ resourceId: resource.body.data.id })
          .expect(201);
        return res.body.data as Versioned;
      };
      return { actor, planId, assignment: await assign('Crew'), other: await assign('Crane') };
    }

    it('refuses a stale version with 409 and keeps the assignment and the flag', async () => {
      const { actor, planId, assignment } = await assigned();
      await actor.agent
        .patch(`${API}/assignments/${assignment.id}`)
        .send({ budgetedUnits: 40, version: assignment.version })
        .expect(200);
      await recalculate(actor, planId);

      const res = await actor.agent.delete(
        `${API}/assignments/${assignment.id}?version=${assignment.version}`,
      );

      expect(res.status).toBe(409);
      expect(res.body.error.details).toMatchObject({ reason: 'STALE_VERSION' });
      const row = await prisma.resourceAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      expect(row.deletedAt).toBeNull();
      expect(await plansEdited(actor, planId)).toBe(false);
    });

    it('unassigns at the current version and with none', async () => {
      const { actor, assignment, other } = await assigned();
      await actor.agent
        .delete(`${API}/assignments/${assignment.id}?version=${assignment.version}`)
        .expect(204);
      await actor.agent.delete(`${API}/assignments/${other.id}`).expect(204);
    });
  });

  describe('POST dissolve', () => {
    async function summaryWithChildren() {
      const { actor, planId } = await world();
      const summary = await addActivity(actor, planId, { type: 'WBS_SUMMARY', durationDays: 0 });
      const child = await addActivity(actor, planId, { parentId: summary.id });
      return { actor, planId, summary, child };
    }

    it('refuses a stale version with 409 and promotes nothing', async () => {
      const { actor, summary, child } = await summaryWithChildren();
      const renamed = await actor.agent
        .patch(`${API}/activities/${summary.id}`)
        .send({ name: 'Renamed phase', version: summary.version })
        .expect(200);

      const res = await actor.agent
        .post(`${API}/activities/${summary.id}/dissolve`)
        .send({ version: summary.version });

      expect(res.status).toBe(409);
      expect(res.body.error.details).toMatchObject({ reason: 'STALE_VERSION' });
      const still = await prisma.activity.findUniqueOrThrow({ where: { id: child.id } });
      expect(still.parentId).toBe(summary.id);
      expect(
        (await prisma.activity.findUniqueOrThrow({ where: { id: summary.id } })).deletedAt,
      ).toBeNull();
      expect(await auditCount('activity.dissolved')).toBe(0);

      await actor.agent
        .post(`${API}/activities/${summary.id}/dissolve`)
        .send({ version: renamed.body.data.version })
        .expect(200);
    });

    it('dissolves with no body at all, and records the batch id the undo joins on', async () => {
      const { actor, summary } = await summaryWithChildren();

      const res = await actor.agent.post(`${API}/activities/${summary.id}/dissolve`).expect(200);

      const [event] = await prisma.auditEvent.findMany({ where: { action: 'activity.dissolved' } });
      expect((event?.changes as { before: Record<string, unknown> }).before).toMatchObject({
        promotedChildCount: 1,
        deleteBatchId: res.body.data.deleteBatchId,
      });
    });
  });
});
