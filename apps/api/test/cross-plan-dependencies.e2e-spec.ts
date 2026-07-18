import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for cross-plan dependencies (LIVE inter-project logic ties, ADR-0045 M2 F3):
 * the flat org-scoped create/get/delete, the per-plan (incoming) and per-activity (both-direction)
 * link lists, the same-plan (422 N31), plan-level-cycle (409 N30), and duplicate (409 N33)
 * integrity rules, the org-scoped mirror-create race (exactly one wins), the IDOR/cross-org 404
 * matrix, and the RBAC split (Planner + Org Admin link, Viewer/Contributor read only). Verified
 * against a real PostgreSQL + Better Auth session. The pen write-gate (423) ships inert by default
 * (PLAN_EDIT_LOCK_ENFORCED off) exactly as for dependencies — its enforcement is covered by the
 * plan-lock write-gate suite and the service unit spec.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Cross-plan dependencies API (e2e)', () => {
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
    await prisma.crossPlanDependency.deleteMany();
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

  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  async function makePlan(actor: Actor, clientName: string): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: clientName })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Programme' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Plan', plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  async function makeActivity(actor: Actor, planId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  const CROSS = '/api/v1/organizations/acme/cross-plan-dependencies';

  /** An admin org with an upstream plan (activity U) and a downstream plan (activity D). */
  async function setup(): Promise<{
    actor: Actor;
    orgId: string;
    upPlan: string;
    downPlan: string;
    u: string;
    d: string;
  }> {
    const { actor, orgId } = await adminWithOrg();
    const upPlan = await makePlan(actor, 'Procurement');
    const downPlan = await makePlan(actor, 'Construction');
    const u = await makeActivity(actor, upPlan, 'Deliver steel');
    const d = await makeActivity(actor, downPlan, 'Erect frame');
    return { actor, orgId, upPlan, downPlan, u, d };
  }

  it('links two activities across plans, embeds endpoints, and lists by plan and by activity', async () => {
    const { actor, upPlan, downPlan, u, d } = await setup();
    const created = await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d, lagDays: 5 })
      .expect(201);
    expect(created.body.data).toMatchObject({
      predecessorPlanId: upPlan,
      successorPlanId: downPlan,
      type: 'FS',
      lagDays: 5,
      lagCalendar: 'PROJECT_DEFAULT',
      predecessor: { id: u, name: 'Deliver steel' },
      successor: { id: d, name: 'Erect frame' },
      version: 1,
    });
    const id = created.body.data.id as string;
    // The response carries no engine-owned isDriving flag (the engine never sees cross-plan edges).
    expect(created.body.data.isDriving).toBeUndefined();

    await actor.agent.get(`${CROSS}/${id}`).expect(200);

    // The downstream plan lists the link as INCOMING; the upstream plan does not.
    const downList = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${downPlan}/cross-plan-dependencies`)
      .expect(200);
    expect(downList.body.data).toHaveLength(1);
    const upList = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${upPlan}/cross-plan-dependencies`)
      .expect(200);
    expect(upList.body.data).toHaveLength(0);

    // Both endpoint activities list the link (both directions).
    const uLinks = await actor.agent
      .get(`/api/v1/organizations/acme/activities/${u}/cross-plan-dependencies`)
      .expect(200);
    expect(uLinks.body.data).toHaveLength(1);
    const dLinks = await actor.agent
      .get(`/api/v1/organizations/acme/activities/${d}/cross-plan-dependencies`)
      .expect(200);
    expect(dLinks.body.data).toHaveLength(1);
  });

  it('round-trips a 24-Hour lag calendar on create (ADR-0036 §6)', async () => {
    const { actor, u, d } = await setup();
    const created = await actor.agent
      .post(CROSS)
      .send({
        predecessorActivityId: u,
        successorActivityId: d,
        lagDays: 7,
        lagCalendar: 'TWENTY_FOUR_HOUR',
      })
      .expect(201);
    expect(created.body.data).toMatchObject({ lagDays: 7, lagCalendar: 'TWENTY_FOUR_HOUR' });

    // An unknown lag-calendar value is rejected (422).
    await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d, type: 'SS', lagCalendar: 'NOPE' })
      .expect(422);
  });

  it('rejects a same-plan edge (422 CROSS_PLAN_SAME_PLAN, N31)', async () => {
    const { actor, upPlan, u } = await setup();
    const u2 = await makeActivity(actor, upPlan, 'Also upstream');
    const res = await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: u2 })
      .expect(422);
    expect(res.body.error?.details?.reason).toBe('CROSS_PLAN_SAME_PLAN');
  });

  it('rejects a duplicate of the same type (409 N33) but allows another type', async () => {
    const { actor, u, d } = await setup();
    await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d })
      .expect(201);
    const dup = await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d })
      .expect(409);
    expect(dup.body.error?.details?.reason).toBe('DUPLICATE_CROSS_PLAN_DEPENDENCY');
    // A different type between the same pair is allowed (the SS+FF ladder).
    await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d, type: 'SS' })
      .expect(201);
  });

  it('rejects a cross-plan link that would create a plan-level cycle (409 N30)', async () => {
    const { actor, u, d } = await setup();
    // u(upPlan) → d(downPlan) is fine.
    await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d })
      .expect(201);
    // d(downPlan) → u(upPlan) would close upPlan → downPlan → upPlan at plan grain.
    const cyclic = await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: d, successorActivityId: u })
      .expect(409);
    expect(cyclic.body.error?.details?.reason).toBe('CROSS_PLAN_CYCLE_DETECTED');
  });

  it('serialises concurrent mirror cross-plan creates so exactly one wins (no plan-level cycle)', async () => {
    const { actor, u, d } = await setup();
    // upPlan → downPlan and downPlan → upPlan raced together: the org lock orders them; the loser's
    // plan-level walk sees the winner's edge and is rejected as a cycle (ADR-0045 §3).
    const [r1, r2] = await Promise.all([
      actor.agent.post(CROSS).send({ predecessorActivityId: u, successorActivityId: d }),
      actor.agent.post(CROSS).send({ predecessorActivityId: d, successorActivityId: u }),
    ]);
    const statuses = [r1.status, r2.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error?.details?.reason).toBe('CROSS_PLAN_CYCLE_DETECTED');
    // Exactly one edge persisted (visible on the winner's successor plan).
    const total = await prisma.crossPlanDependency.count({ where: { deletedAt: null } });
    expect(total).toBe(1);
  });

  it('refuses cross-org endpoints (404) and validates the endpoint ids (422)', async () => {
    const { actor, u } = await setup();

    // An activity that belongs to ANOTHER org is indistinguishable from missing → 404.
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const otherClient = await outsider.agent
      .post('/api/v1/organizations/other/clients')
      .send({ name: 'Foreign' })
      .expect(201);
    const otherProject = await outsider.agent
      .post(`/api/v1/organizations/other/clients/${otherClient.body.data.id}/projects`)
      .send({ name: 'Foreign programme' })
      .expect(201);
    const otherPlan = await outsider.agent
      .post(`/api/v1/organizations/other/projects/${otherProject.body.data.id}/plans`)
      .send({ name: 'Foreign plan', plannedStart: '2026-01-01' })
      .expect(201);
    const foreign = await outsider.agent
      .post(`/api/v1/organizations/other/plans/${otherPlan.body.data.id}/activities`)
      .send({ name: 'Foreign activity' })
      .expect(201);

    await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: foreign.body.data.id })
      .expect(404);
    // An unknown activity id → 404.
    await actor.agent
      .post(CROSS)
      .send({
        predecessorActivityId: u,
        successorActivityId: '00000000-0000-7000-8000-000000000000',
      })
      .expect(404);
    // A malformed id → 422 (DTO validation).
    await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: 'not-a-uuid' })
      .expect(422);
  });

  it('hides cross-plan dependencies from non-members (404)', async () => {
    const { actor, u, d } = await setup();
    const created = await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d })
      .expect(201);
    const id = created.body.data.id as string;

    const outsider = await signUp('nosey@example.com');
    await outsider.agent.get(`${CROSS}/${id}`).expect(404);
  });

  it('soft-deletes a cross-plan link (204 then 404)', async () => {
    const { actor, u, d } = await setup();
    const created = await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d })
      .expect(201);
    const id = created.body.data.id as string;

    await actor.agent.delete(`${CROSS}/${id}`).expect(204);
    await actor.agent.get(`${CROSS}/${id}`).expect(404);
    // The triple is freed — the same link can be created again.
    await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d })
      .expect(201);
  });

  it('lets a Viewer read but forbids linking; a Contributor also cannot link', async () => {
    const { orgId, actor, downPlan, u, d } = await setup();
    const created = await actor.agent
      .post(CROSS)
      .send({ predecessorActivityId: u, successorActivityId: d })
      .expect(201);
    const id = created.body.data.id as string;
    const downList = `/api/v1/organizations/acme/plans/${downPlan}/cross-plan-dependencies`;

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(downList).expect(200);
    await viewer.agent
      .post(CROSS)
      .send({ predecessorActivityId: d, successorActivityId: u })
      .expect(403);
    await viewer.agent.delete(`${CROSS}/${id}`).expect(403);

    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.get(downList).expect(200);
    await contributor.agent
      .post(CROSS)
      .send({ predecessorActivityId: d, successorActivityId: u })
      .expect(403);
  });

  it('401s without a session', async () => {
    await request(server()).get(`${CROSS}/00000000-0000-7000-8000-000000000000`).expect(401);
  });
});
