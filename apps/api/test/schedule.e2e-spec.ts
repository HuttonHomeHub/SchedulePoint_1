import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the CPM recalculation endpoint (M6, ADR-0022):
 * `POST /organizations/:orgSlug/plans/:planId/schedule/recalculate`. Covers a
 * multi-path plan producing the expected critical set + summary, the
 * version/updated_by-untouched guarantee of the engine-owned write, the RBAC
 * split (Planner writes, Viewer/Contributor 403), the IDOR/cross-org 404 matrix,
 * the 422 no-start path, and a performance smoke at 500 activities. Verified
 * against a real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Schedule API (e2e)', () => {
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

  // Delete children before parents so the FK restrictions never bite.
  async function resetDatabase(): Promise<void> {
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  afterAll(async () => {
    // Leave a clean database. This file's last test seeds hundreds of activities;
    // the e2e DB is shared (with the Playwright run and, since file order isn't
    // guaranteed, with other API specs whose cleanup predates activities), so we
    // must not leave rows that a later `plan.deleteMany()` would trip over.
    await resetDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const recalcUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`;

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

  /** A plan with a start date so it can be scheduled. Returns its id. */
  async function makePlan(
    actor: Actor,
    clientName: string,
    plannedStart = '2026-01-01',
  ): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: clientName })
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
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({ plannedStart, version: 1 })
      .expect(200);
    return planId;
  }

  async function makeActivity(
    actor: Actor,
    planId: string,
    name: string,
    durationDays: number,
  ): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name, durationDays })
      .expect(201);
    return res.body.data.id as string;
  }

  async function link(actor: Actor, planId: string, pred: string, succ: string): Promise<void> {
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: pred, successorId: succ })
      .expect(201);
  }

  /** GET the plan's activities, keyed by name. */
  async function activitiesByName(actor: Actor, planId: string) {
    const res = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .expect(200);
    return new Map<string, Record<string, unknown>>(
      (res.body.data as Record<string, unknown>[]).map((a) => [a.name as string, a]),
    );
  }

  it('recalculates a multi-path plan: correct critical set, summary, and dates', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    // A(3)→B(4)→D(5)→E(1); A(3)→C(2)→D(5). Critical A,B,D,E; C carries float 2.
    const a = await makeActivity(actor, planId, 'A', 3);
    const b = await makeActivity(actor, planId, 'B', 4);
    const c = await makeActivity(actor, planId, 'C', 2);
    const d = await makeActivity(actor, planId, 'D', 5);
    const e = await makeActivity(actor, planId, 'E', 1);
    await link(actor, planId, a, b);
    await link(actor, planId, a, c);
    await link(actor, planId, b, d);
    await link(actor, planId, c, d);
    await link(actor, planId, d, e);

    const res = await actor.agent.post(recalcUrl(planId)).expect(200);
    expect(res.body.data).toMatchObject({
      dataDate: '2026-01-01',
      projectFinish: '2026-01-13',
      activityCount: 5,
      criticalCount: 4,
      nearCriticalCount: 1,
      parkedConstraintCount: 0,
    });

    const acts = await activitiesByName(actor, planId);
    expect(acts.get('A')).toMatchObject({
      earlyStart: '2026-01-01',
      earlyFinish: '2026-01-03',
      isCritical: true,
      totalFloat: 0,
    });
    expect(acts.get('C')).toMatchObject({ isCritical: false, isNearCritical: true, totalFloat: 2 });
    expect(acts.get('E')).toMatchObject({ earlyFinish: '2026-01-13', isCritical: true });
  });

  it('leaves version and updated_by untouched (the engine-owned write)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await makeActivity(actor, planId, 'A', 3);

    const before = await prisma.activity.findUniqueOrThrow({
      where: { id: a },
      select: { version: true, updatedAt: true, updatedBy: true },
    });

    await actor.agent.post(recalcUrl(planId)).expect(200);

    const after = await prisma.activity.findUniqueOrThrow({
      where: { id: a },
      select: { version: true, updatedAt: true, updatedBy: true, earlyStart: true },
    });
    expect(after.version).toBe(before.version);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.updatedBy).toBe(before.updatedBy);
    expect(after.earlyStart).not.toBeNull(); // but the schedule DID compute
  });

  it('422s with PLAN_START_REQUIRED when the plan has no start date', async () => {
    const { actor } = await adminWithOrg();
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
      .send({ name: 'No start' })
      .expect(201);

    const res = await actor.agent.post(recalcUrl(plan.body.data.id as string)).expect(422);
    expect(res.body.error?.details?.reason).toBe('PLAN_START_REQUIRED');
  });

  it('enforces RBAC: Viewer and Contributor cannot recalculate (403)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.post(recalcUrl(planId)).expect(403);

    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.post(recalcUrl(planId)).expect(403);
  });

  it('hides the plan from non-members and other orgs (404), and validates the id (422)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post(recalcUrl(planId)).expect(404); // not a member of acme
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    // A member of another org cannot reach acme's plan.
    await outsider.agent
      .post(`/api/v1/organizations/other/plans/${planId}/schedule/recalculate`)
      .expect(404);
    // A well-formed but unknown plan id → 404.
    await actor.agent.post(recalcUrl('00000000-0000-7000-8000-000000000000')).expect(404);
    // A malformed plan id → 400 (ParseUuidPipe rejects the path param).
    await actor.agent
      .post('/api/v1/organizations/acme/plans/not-a-uuid/schedule/recalculate')
      .expect(400);
  });

  it('401s without a session', async () => {
    await request(server())
      .post(
        '/api/v1/organizations/acme/plans/00000000-0000-7000-8000-000000000000/schedule/recalculate',
      )
      .expect(401);
  });

  const summaryUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/schedule/summary`;

  it('summary reflects the last recompute and reads for any member', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await makeActivity(actor, planId, 'A', 3);
    const b = await makeActivity(actor, planId, 'B', 2);
    await link(actor, planId, a, b);

    // Before any recompute: zeroed counts, null finish, but the data date is set.
    const before = await actor.agent.get(summaryUrl(planId)).expect(200);
    expect(before.body.data).toMatchObject({
      dataDate: '2026-01-01',
      projectFinish: null,
      activityCount: 2,
      criticalCount: 0,
    });

    await actor.agent.post(recalcUrl(planId)).expect(200);

    // After: the summary reflects the persisted columns.
    const after = await actor.agent.get(summaryUrl(planId)).expect(200);
    expect(after.body.data).toMatchObject({
      dataDate: '2026-01-01',
      projectFinish: '2026-01-05',
      activityCount: 2,
      criticalCount: 2,
      nearCriticalCount: 0,
      parkedConstraintCount: 0,
    });

    // A Viewer can read the summary (schedule:read is granted to every member).
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(summaryUrl(planId)).expect(200);
  });

  it('summary hides the plan from non-members (404)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(summaryUrl(planId)).expect(404);
  });

  it('scale smoke: a 500-activity chain recalculates in one batched write', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'BigPlan');

    // Seed a 500-node critical chain directly (bulk insert; HTTP per-activity is
    // too slow for a fixture). Ids are plain UUIDs — any UUID is valid.
    const ids = Array.from({ length: 500 }, () => randomUUID());
    await prisma.activity.createMany({
      data: ids.map((id, i) => ({
        id,
        organizationId: orgId,
        planId,
        name: `A${i}`,
        durationDays: 1,
      })),
    });
    await prisma.activityDependency.createMany({
      data: ids.slice(0, -1).map((id, i) => ({
        organizationId: orgId,
        planId,
        predecessorId: id,
        successorId: ids[i + 1]!,
      })),
    });

    // Proves the whole plan computes and persists in one recalculation. The
    // performance target itself is measured out-of-band, not asserted on a shared
    // CI runner where wall-clock is too noisy to gate on.
    const res = await actor.agent.post(recalcUrl(planId)).expect(200);

    expect(res.body.data).toMatchObject({ activityCount: 500, criticalCount: 500 });
    // Every activity on the single chain is critical, and the finish is day 500.
    expect(res.body.data.projectFinish).toBe('2027-05-15');
  });
});
