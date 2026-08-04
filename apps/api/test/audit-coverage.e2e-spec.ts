import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * ADR-0073 C3 — the mutation-coverage producers, against a real database.
 *
 * **These cannot be unit-tested and that is the point.** Every one of them fires inside a real
 * transaction, after a real `assertHoldsPen`, and its whole contract is about the ROW: one per
 * user action however large the cascade, none at all when the transaction rolls back or the pen
 * refuses. A mocked `AuditService` can only prove a mock was called — the four properties that
 * matter are all properties of the database.
 *
 * The pen is **enforced** here (`PLAN_EDIT_LOCK_ENFORCED=true`, set before the app boots), because
 * "a refused write records nothing" is one of the four and is untestable with the gate inert.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface AuditRow {
  action: string;
  outcome: string;
  subjectType: string;
  subjectId: string | null;
  subjectLabel: string | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
}

describe.skipIf(!hasDatabase)('Audit coverage — plan structure and destruction (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let priorEnforced: string | undefined;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    priorEnforced = process.env.PLAN_EDIT_LOCK_ENFORCED;
    process.env.PLAN_EDIT_LOCK_ENFORCED = 'true';
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
    if (priorEnforced === undefined) delete process.env.PLAN_EDIT_LOCK_ENFORCED;
    else process.env.PLAN_EDIT_LOCK_ENFORCED = priorEnforced;
  });

  beforeEach(async () => {
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planLock.deleteMany();
    await prisma.planShare.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** An admin org holding one client → project → plan, with the pen already taken. */
  async function setup(): Promise<{ actor: Actor; planId: string }> {
    const actor = await signUp('admin@example.com');
    await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id as string}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/edit-lock`)
      .send({})
      .expect(200);
    return { actor, planId };
  }

  async function addActivity(
    actor: Actor,
    planId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ durationDays: 1, ...body })
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  /** Every audit row for one action, newest first — read from the database, not the API, so a
   *  read-surface filter cannot hide a producer defect. */
  async function rows(action: string): Promise<AuditRow[]> {
    return (await prisma.auditEvent.findMany({
      where: { action },
      orderBy: { occurredAt: 'desc' },
    })) as unknown as AuditRow[];
  }

  describe('activity.deleted', () => {
    it('writes exactly ONE row for a whole subtree, carrying the flattened counts', async () => {
      const { actor, planId } = await setup();
      const summary = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const a = await addActivity(actor, planId, { name: 'Dig', parentId: summary.id });
      const b = await addActivity(actor, planId, { name: 'Pour', parentId: summary.id });
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: a.id, successorId: b.id })
        .expect(201);

      await actor.agent.delete(`/api/v1/organizations/acme/activities/${summary.id}`).expect(204);

      const written = await rows('activity.deleted');
      // ONE row, not four. The whole argument for the coverage rung is that the log records user
      // actions and not swept rows; a subtree delete is the case where the two differ most.
      expect(written).toHaveLength(1);
      const row = written[0]!;
      expect(row.subjectType).toBe('ACTIVITY');
      expect(row.subjectId).toBe(summary.id);
      expect(row.subjectLabel).toBe('Phase 1');
      expect(row.changes?.before).toMatchObject({
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        planName: 'Baseline',
        // 3 = the summary and its two children. The link between them rides the same batch.
        activityCount: 3,
        dependencyCount: 1,
      });
      expect(typeof row.changes?.before?.deleteBatchId).toBe('string');
    });

    it('writes NOTHING when the pen refuses (423)', async () => {
      const { actor, planId } = await setup();
      const activity = await addActivity(actor, planId, { name: 'Dig' });
      await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}/edit-lock`).expect(204);

      await actor.agent.delete(`/api/v1/organizations/acme/activities/${activity.id}`).expect(423);

      // Families D–G record no `DENIED` rows (spec §2.3): a 423 is an everyday concurrency
      // outcome, not an attempt to escalate.
      expect(await rows('activity.deleted')).toHaveLength(0);
    });

    it('writes NOTHING when the activity was never there (404)', async () => {
      const { actor } = await setup();
      await actor.agent
        .delete('/api/v1/organizations/acme/activities/00000000-0000-7000-8000-000000000000')
        .expect(404);
      expect(await rows('activity.deleted')).toHaveLength(0);
    });
  });

  describe('activity.restored', () => {
    it('pairs with its delete, carrying the same batch id', async () => {
      const { actor, planId } = await setup();
      const activity = await addActivity(actor, planId, { name: 'Dig', code: 'A100' });
      await actor.agent.delete(`/api/v1/organizations/acme/activities/${activity.id}`).expect(204);
      await actor.agent
        .post(`/api/v1/organizations/acme/activities/${activity.id}/restore`)
        .expect(200);

      const deleted = (await rows('activity.deleted'))[0]!;
      const restored = (await rows('activity.restored'))[0]!;
      // The pair is what makes "what happened to this activity?" answerable in one read; a restore
      // that carried a different batch would look like a different incident.
      expect(restored.changes?.after?.deleteBatchId).toBe(deleted.changes?.before?.deleteBatchId);
      expect(restored.changes?.after).toMatchObject({
        name: 'Dig',
        code: 'A100',
        activityCount: 1,
      });
    });
  });

  describe('activity.dissolved', () => {
    it('is NOT recorded as a deletion, and says how many activities were kept', async () => {
      const { actor, planId } = await setup();
      const summary = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      await addActivity(actor, planId, { name: 'Dig', parentId: summary.id });
      await addActivity(actor, planId, { name: 'Pour', parentId: summary.id });

      await actor.agent
        .post(`/api/v1/organizations/acme/activities/${summary.id}/dissolve`)
        .expect(200);

      // The distinction the action exists for: the grouping went, the work stayed. A reader
      // scanning `activity.deleted` for lost work must not find this.
      expect(await rows('activity.deleted')).toHaveLength(0);
      const written = await rows('activity.dissolved');
      expect(written).toHaveLength(1);
      expect(written[0]!.changes?.before).toMatchObject({
        name: 'Phase 1',
        promotedChildCount: 2,
      });
    });
  });

  describe('activity.reparented', () => {
    it('records ONE row for the batch, naming the destination', async () => {
      const { actor, planId } = await setup();
      const summary = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const a = await addActivity(actor, planId, { name: 'Dig' });
      const b = await addActivity(actor, planId, { name: 'Pour' });

      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}/activities/parents`)
        .send({
          parents: [
            { id: a.id, parentId: summary.id, version: a.version },
            { id: b.id, parentId: summary.id, version: b.version },
          ],
        })
        .expect(200);

      const written = await rows('activity.reparented');
      expect(written).toHaveLength(1);
      // The subject is the PLAN: there is no one activity this happened to.
      expect(written[0]!.subjectType).toBe('PLAN');
      expect(written[0]!.subjectId).toBe(planId);
      expect(written[0]!.changes?.after).toMatchObject({
        movedCount: 2,
        parentCount: 1,
        parentName: 'Phase 1',
      });
    });

    it('distinguishes a move to the top level from a move to several groups', async () => {
      const { actor, planId } = await setup();
      const one = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const two = await addActivity(actor, planId, {
        name: 'Phase 2',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const a = await addActivity(actor, planId, { name: 'Dig' });
      const b = await addActivity(actor, planId, { name: 'Pour' });

      const parents = (rowsIn: { id: string; parentId: string | null; version: number }[]) =>
        actor.agent
          .patch(`/api/v1/organizations/acme/plans/${planId}/activities/parents`)
          .send({ parents: rowsIn })
          .expect(200);

      // Two destinations in one batch. Without `parentCount` this would render exactly like the
      // top-level case below — absence a reader cannot distinguish from a fact.
      await parents([
        { id: a.id, parentId: one.id, version: a.version },
        { id: b.id, parentId: two.id, version: b.version },
      ]);
      const mixed = (await rows('activity.reparented'))[0]!;
      expect(mixed.changes?.after).toMatchObject({ movedCount: 2, parentCount: 2 });
      expect(mixed.changes?.after).not.toHaveProperty('parentName');

      await parents([
        { id: a.id, parentId: null, version: a.version + 1 },
        { id: b.id, parentId: null, version: b.version + 1 },
      ]);
      const top = (await rows('activity.reparented'))[0]!;
      expect(top.changes?.after).toMatchObject({ movedCount: 2, parentCount: 1 });
      expect(top.changes?.after).not.toHaveProperty('parentName');
    });

    it('writes NOTHING when the batch is rejected as a whole', async () => {
      const { actor, planId } = await setup();
      const summary = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const a = await addActivity(actor, planId, { name: 'Dig' });

      // A stale `version` fails the all-or-nothing count check and rolls the transaction back —
      // including the audit insert, which is the whole reason it is inside the transaction.
      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}/activities/parents`)
        .send({ parents: [{ id: a.id, parentId: summary.id, version: a.version + 99 }] })
        .expect(409);

      expect(await rows('activity.reparented')).toHaveLength(0);
    });
  });

  describe('dependency.created / dependency.deleted', () => {
    it('records the DIRECTION, predecessor first', async () => {
      const { actor, planId } = await setup();
      const dig = await addActivity(actor, planId, { name: 'Dig' });
      const pour = await addActivity(actor, planId, { name: 'Pour' });

      const link = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: dig.id, successorId: pour.id, type: 'FS', lagMinutes: 120 })
        .expect(201);

      const created = await rows('dependency.created');
      expect(created).toHaveLength(1);
      // The fact ADR-0064 found planners most often get wrong. A row that recorded only ids would
      // be unable to settle the argument it exists to settle.
      expect(created[0]!.changes?.after).toMatchObject({
        predecessorName: 'Dig',
        successorName: 'Pour',
        type: 'FS',
        lagMinutes: 120,
      });
      expect(created[0]!.subjectLabel).toBe('Dig → Pour');

      await actor.agent
        .delete(`/api/v1/organizations/acme/dependencies/${link.body.data.id as string}`)
        .expect(204);
      const deleted = await rows('dependency.deleted');
      expect(deleted).toHaveLength(1);
      expect(deleted[0]!.changes?.before).toMatchObject({
        predecessorName: 'Dig',
        successorName: 'Pour',
      });
      expect(typeof deleted[0]!.changes?.before?.deleteBatchId).toBe('string');
    });

    it('writes NOTHING when the link is refused as a cycle', async () => {
      const { actor, planId } = await setup();
      const dig = await addActivity(actor, planId, { name: 'Dig' });
      const pour = await addActivity(actor, planId, { name: 'Pour' });
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: dig.id, successorId: pour.id })
        .expect(201);

      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: pour.id, successorId: dig.id })
        .expect(409);

      // One row, from the link that actually exists. The refused one rolled back with its audit
      // insert inside the same transaction.
      expect(await rows('dependency.created')).toHaveLength(1);
    });
  });

  describe('the family-C fix (spec §0.1)', () => {
    it('records the cascade SIZE on a plan delete, not just its batch id', async () => {
      const { actor, planId } = await setup();
      const a = await addActivity(actor, planId, { name: 'Dig' });
      const b = await addActivity(actor, planId, { name: 'Pour' });
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: a.id, successorId: b.id })
        .expect(201);

      await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);

      // The M1 shape promised `counts: CascadeCounts` and recorded nothing at all, so a delete of
      // 412 activities said only that a batch happened. Flattened scalars, because the redactor
      // reduces any non-scalar to a type marker by design.
      expect((await rows('plan.deleted'))[0]!.changes?.before).toMatchObject({
        name: 'Baseline',
        activityCount: 2,
        dependencyCount: 1,
      });
    });
  });
});
