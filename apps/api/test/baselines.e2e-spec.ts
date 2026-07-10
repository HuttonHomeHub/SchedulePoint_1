import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the baselines capture/list/get endpoints (M7 Task B1,
 * ADR-0025). Covers capturing a snapshot of a plan's computed schedule, the
 * first-baseline auto-active rule, the 422 never-calculated guard, the 409
 * duplicate-name guard, the RBAC split (Planner captures, Viewer/Contributor 403),
 * the IDOR/cross-org 404 matrix, and reading a baseline's frozen activity rows.
 * Verified against a real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Baselines API (e2e)', () => {
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

  // Delete children before parents so the FK restrictions never bite. Baselines and
  // their snapshot rows reference plans (RESTRICT), so they go before plans; snapshot
  // rows reference their baseline (RESTRICT), so they go first of all.
  async function resetDatabase(): Promise<void> {
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
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
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const baselinesUrl = (planId: string) => `/api/v1/organizations/acme/plans/${planId}/baselines`;

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

  /** A plan with a start date (all-days-work). Returns its id. */
  async function makePlan(actor: Actor, clientName: string): Promise<string> {
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
      .send({ plannedStart: '2026-01-01', calendarId: null, version: 1 })
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

  async function recalc(actor: Actor, planId: string): Promise<void> {
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
      .expect(200);
  }

  /** A calculated plan with one activity A(3) from 2026-01-01. Returns { planId, activityId }. */
  async function calculatedPlan(
    actor: Actor,
    clientName = 'Northgate',
  ): Promise<{ planId: string; activityId: string }> {
    const planId = await makePlan(actor, clientName);
    const activityId = await makeActivity(actor, planId, 'A', 3);
    await recalc(actor, planId);
    return { planId, activityId };
  }

  it('captures, lists and reads a baseline of a computed plan', async () => {
    const { actor } = await adminWithOrg();
    const { planId, activityId } = await calculatedPlan(actor);

    const created = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Contract Baseline' })
      .expect(201);
    expect(created.body.data).toMatchObject({
      name: 'Contract Baseline',
      planId,
      isActive: true, // the plan's first baseline is captured active
      dataDate: '2026-01-01',
      capturedProjectFinish: '2026-01-03',
      activityCount: 1,
    });
    const baselineId = created.body.data.id as string;

    const list = await actor.agent.get(baselinesUrl(planId)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: baselineId, isActive: true, activityCount: 1 });

    const detail = await actor.agent.get(`${baselinesUrl(planId)}/${baselineId}`).expect(200);
    expect(detail.body.data.activities).toHaveLength(1);
    expect(detail.body.data.activities[0]).toMatchObject({
      sourceActivityId: activityId,
      name: 'A',
      durationDays: 3,
      baselineStart: '2026-01-01',
      baselineFinish: '2026-01-03',
      isCritical: true,
      totalFloat: 0,
    });
  });

  it('activates only the first baseline; later captures are inactive', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);

    const first = await actor.agent.post(baselinesUrl(planId)).send({ name: 'First' }).expect(201);
    const second = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Second' })
      .expect(201);
    expect(first.body.data.isActive).toBe(true);
    expect(second.body.data.isActive).toBe(false);
  });

  it('422s (SCHEDULE_NOT_CALCULATED) capturing a plan that was never calculated', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    await makeActivity(actor, planId, 'A', 3); // present but not recalculated

    const res = await actor.agent.post(baselinesUrl(planId)).send({ name: 'X' }).expect(422);
    expect(res.body.error?.details?.reason).toBe('SCHEDULE_NOT_CALCULATED');
  });

  it('422s (SCHEDULE_NOT_CALCULATED) capturing an empty plan', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Empty');
    const res = await actor.agent.post(baselinesUrl(planId)).send({ name: 'X' }).expect(422);
    expect(res.body.error?.details?.reason).toBe('SCHEDULE_NOT_CALCULATED');
  });

  it('409s (DUPLICATE_BASELINE) on a name already used by an active baseline', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(201);
    const res = await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(409);
    expect(res.body.error?.details?.reason).toBe('DUPLICATE_BASELINE');
  });

  it('422s on an empty name', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    await actor.agent.post(baselinesUrl(planId)).send({ name: '   ' }).expect(422);
  });

  it('enforces RBAC: Viewer and Contributor cannot capture (403), but can read', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Base' }).expect(201);

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.post(baselinesUrl(planId)).send({ name: 'Nope' }).expect(403);
    await viewer.agent.get(baselinesUrl(planId)).expect(200); // read is open to every member

    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.post(baselinesUrl(planId)).send({ name: 'Nope' }).expect(403);
  });

  it('hides the plan from non-members and other orgs (404), and validates the id (400)', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(baselinesUrl(planId)).expect(404); // not a member of acme
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/plans/${planId}/baselines`).expect(404); // a member of another org cannot reach acme's plan
    await actor.agent.get(baselinesUrl('00000000-0000-7000-8000-000000000000')).expect(404); // well-formed but unknown plan
    await actor.agent.get('/api/v1/organizations/acme/plans/not-a-uuid/baselines').expect(400); // malformed plan id
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/plans/00000000-0000-7000-8000-000000000000/baselines')
      .expect(401);
  });
});
