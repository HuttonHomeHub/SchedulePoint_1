import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the plan edit-lock **write-gate** (ADR-0028, Task 1.5) with
 * enforcement ON (`PLAN_EDIT_LOCK_ENFORCED=true`, set before the app boots). Proves
 * the matrix on the gated structural writes (activity create/update/delete/positions,
 * dependency create, schedule recalculate): the pen-holder succeeds; a non-holder is
 * rejected with **423 `PLAN_EDIT_LOCK_REQUIRED`** (distinct from the 409 version
 * clash a holder still gets on a stale write); and the Contributor progress path is
 * **never** gated. Permission (403) and scope (404) still precede the 423 gate.
 * Verified against a real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Plan edit-lock write-gate (e2e, enforced)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let priorEnforced: string | undefined;

  beforeAll(async () => {
    // Turn the gate ON for THIS app instance only; restore in afterAll. e2e files
    // run sequentially (fileParallelism: false) and each boots its own ConfigModule,
    // so this does not leak into the other (unenforced) suites.
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

  async function resetDatabase(): Promise<void> {
    await prisma.planLock.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
    if (priorEnforced === undefined) delete process.env.PLAN_EDIT_LOCK_ENFORCED;
    else process.env.PLAN_EDIT_LOCK_ENFORCED = priorEnforced;
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const base = (planId: string) => `/api/v1/organizations/acme/plans/${planId}`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  async function addMember(orgId: string, email: string, role: OrganizationRole): Promise<Actor> {
    const actor = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: actor.userId, role } });
    return actor;
  }

  /** A plan with a start date (so recalculate is valid). Returns its id. */
  async function makePlan(actor: Actor): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Baseline' })
      .expect(201);
    const planId = plan.body.data.id as string;
    // Metadata edit (plannedStart) is NOT pen-gated — this must succeed without a lock.
    await actor.agent
      .patch(base(planId))
      .send({ plannedStart: '2026-01-01', calendarId: null, version: 1 })
      .expect(200);
    return planId;
  }

  const acquire = (actor: Actor, planId: string) =>
    actor.agent
      .post(`${base(planId)}/edit-lock`)
      .send({})
      .expect(201);

  /** Create an activity as the current pen-holder. Returns { id, version }. */
  async function makeActivity(actor: Actor, planId: string, name: string, durationDays = 1) {
    const res = await actor.agent
      .post(`${base(planId)}/activities`)
      .send({ name, durationDays })
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  it('lets the pen-holder create an activity, and 423s a non-holder', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    // Non-holder (has the permission, but no pen) → 423 REQUIRED, nothing written.
    const denied = await planner.agent
      .post(`${base(planId)}/activities`)
      .send({ name: 'Nope', durationDays: 1 })
      .expect(423);
    expect(denied.body.error).toMatchObject({
      code: 'LOCKED',
      details: { reason: 'PLAN_EDIT_LOCK_REQUIRED' },
    });

    // Holder → 201.
    await acquire(admin, planId);
    await admin.agent
      .post(`${base(planId)}/activities`)
      .send({ name: 'A', durationDays: 3 })
      .expect(201);
  });

  it('403 (permission) and 404 (scope) still precede the 423 gate', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const viewer = await addMember(orgId, 'viewer@example.com', 'VIEWER');
    const planId = await makePlan(admin);

    // Viewer lacks activity:create → 403, not 423 (permission check runs first).
    await viewer.agent
      .post(`${base(planId)}/activities`)
      .send({ name: 'X', durationDays: 1 })
      .expect(403);

    // A missing plan → 404, not 423 (scope/existence runs before the gate).
    const missing = '00000000-0000-0000-0000-000000000000';
    await admin.agent
      .post(`${base(missing)}/activities`)
      .send({ name: 'X', durationDays: 1 })
      .expect(404);
  });

  it('gives the holder a 409 (not 423) on a stale-version update', async () => {
    const { actor: admin } = await adminWithOrg();
    const planId = await makePlan(admin);
    await acquire(admin, planId);
    const a = await makeActivity(admin, planId, 'A', 2);

    // Holds the pen, but a stale version → the existing optimistic 409, distinctly.
    await admin.agent
      .patch(`/api/v1/organizations/acme/activities/${a.id}`)
      .send({ name: 'A-renamed', version: a.version + 5 })
      .expect(409);
  });

  it('gates dependency create and schedule recalculate on the pen', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const planId = await makePlan(admin);
    await acquire(admin, planId);
    const a = await makeActivity(admin, planId, 'A', 3);
    const b = await makeActivity(admin, planId, 'B', 2);

    // Non-holder cannot create a dependency or recalculate.
    await planner.agent
      .post(`${base(planId)}/dependencies`)
      .send({ predecessorId: a.id, successorId: b.id })
      .expect(423);
    await planner.agent.post(`${base(planId)}/schedule/recalculate`).expect(423);

    // Holder can.
    await admin.agent
      .post(`${base(planId)}/dependencies`)
      .send({ predecessorId: a.id, successorId: b.id })
      .expect(201);
    await admin.agent.post(`${base(planId)}/schedule/recalculate`).expect(200);
  });

  it('gates the positions batch on the pen', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const planId = await makePlan(admin);
    await acquire(admin, planId);
    const a = await makeActivity(admin, planId, 'A', 1);

    await planner.agent
      .patch(`${base(planId)}/activities/positions`)
      .send({ positions: [{ id: a.id, laneIndex: 2, version: a.version }] })
      .expect(423);
    await admin.agent
      .patch(`${base(planId)}/activities/positions`)
      .send({ positions: [{ id: a.id, laneIndex: 2, version: a.version }] })
      .expect(200);
  });

  it('never gates the Contributor progress path, even without the pen', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const contributor = await addMember(orgId, 'contributor@example.com', 'CONTRIBUTOR');
    const planId = await makePlan(admin);
    await acquire(admin, planId);
    const a = await makeActivity(admin, planId, 'A', 3);

    // The Contributor holds no pen (and could not acquire one) — progress still 200.
    await contributor.agent
      .patch(`/api/v1/organizations/acme/activities/${a.id}/progress`)
      .send({ percentComplete: 50, version: a.version })
      .expect(200);
  });
});
