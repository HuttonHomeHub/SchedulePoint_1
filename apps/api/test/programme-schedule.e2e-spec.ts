import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for **programme recalculation** (inter-project M2, ADR-0045 §4 F5):
 * `POST /organizations/:orgSlug/plans/:planId/schedule/recalculate-programme`. Boots with the pen
 * write-gate ENFORCED (`PLAN_EDIT_LOCK_ENFORCED=true`) so the fail-fast pre-flight is live: it covers
 * (1) a happy two-plan programme recalc — an upstream Procurement plan linked to a downstream
 * Construction plan, recalculated upstream-first with both pens held, returning both plan summaries in
 * dependency order; and (2) the fail-fast 423 `PROGRAMME_PLANS_LOCKED` path — the caller holds the
 * downstream pen but not the upstream one, so the whole solve is refused with the blocked-plan list and
 * nothing is written. Verified against a real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Programme recalculation API (e2e, pen enforced)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let priorEnforced: string | undefined;

  beforeAll(async () => {
    // Enforce the pen for THIS app instance only (restored in afterAll). e2e files run sequentially and
    // each boots its own ConfigModule, so this does not leak into the unenforced suites.
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
  const programmeUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/schedule/recalculate-programme`;
  const recalcUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`;
  const summaryUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/schedule/summary`;
  const lockUrl = (planId: string) => `/api/v1/organizations/acme/plans/${planId}/edit-lock`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(): Promise<Actor> {
    const actor = await signUp('admin@example.com');
    await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return actor;
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

  /**
   * Upstream Procurement (activity U) linked into downstream Construction (activity D).
   *
   * The pen is ENFORCED for this suite, so every structural write below (activity creates, cross-plan
   * link) must be made while holding the target plan's pen. We acquire each plan's pen only for its
   * setup writes and release it immediately, so the test bodies below start from a clean lock state and
   * can assert the pen pre-flight themselves. The cross-plan link is gated on the successor plan's pen
   * (link-home = successor, ADR-0045), so it is created while the downstream pen is held.
   */
  async function programme(): Promise<{
    actor: Actor;
    upPlan: string;
    downPlan: string;
  }> {
    const actor = await adminWithOrg();
    const upPlan = await makePlan(actor, 'Procurement');
    const downPlan = await makePlan(actor, 'Construction');

    await actor.agent.post(lockUrl(upPlan)).send({}).expect(200);
    const u = await makeActivity(actor, upPlan, 'Deliver steel');
    await actor.agent.delete(lockUrl(upPlan)).expect(204);

    await actor.agent.post(lockUrl(downPlan)).send({}).expect(200);
    const d = await makeActivity(actor, downPlan, 'Erect frame');
    await actor.agent
      .post('/api/v1/organizations/acme/cross-plan-dependencies')
      .send({ predecessorActivityId: u, successorActivityId: d, lagDays: 5 })
      .expect(201);
    await actor.agent.delete(lockUrl(downPlan)).expect(204);

    return { actor, upPlan, downPlan };
  }

  it('recalculates the whole upstream closure in dependency order when the caller holds every pen', async () => {
    const { actor, upPlan, downPlan } = await programme();
    // Hold the pen on BOTH plans the solve writes (pre-flight + per-plan assert both pass).
    await actor.agent.post(lockUrl(upPlan)).send({}).expect(200);
    await actor.agent.post(lockUrl(downPlan)).send({}).expect(200);

    const res = await actor.agent.post(programmeUrl(downPlan)).send({}).expect(200);
    // Upstream-first, target last: Procurement (upPlan) then Construction (downPlan).
    expect(res.body.data.plans.map((p: { planId: string }) => p.planId)).toEqual([
      upPlan,
      downPlan,
    ]);
    expect(res.body.data.programme.planCount).toBe(2);
    expect(res.body.data.programme.crossPlanUpstreamMissingCount).toBe(0);
    // Each plan carries its single-plan summary shape.
    expect(res.body.data.plans[0].summary).toMatchObject({ dataDate: '2026-01-01' });
  });

  it('fails fast with 423 PROGRAMME_PLANS_LOCKED (blocked-plan list) and writes nothing when an upstream pen is not held', async () => {
    const { actor, upPlan, downPlan } = await programme();
    // Hold ONLY the downstream pen; the upstream plan is unheld → blocked in the pre-flight.
    await actor.agent.post(lockUrl(downPlan)).send({}).expect(200);

    const res = await actor.agent.post(programmeUrl(downPlan)).send({}).expect(423);
    expect(res.body.error).toMatchObject({
      details: { reason: 'PROGRAMME_PLANS_LOCKED', blockedPlanIds: [upPlan] },
    });
    // Nothing was written: the downstream plan was never recalculated (still no computed finish).
    const summary = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${downPlan}/schedule/summary`)
      .expect(200);
    expect(summary.body.data.projectFinish).toBeNull();
  });

  it('flags the downstream plan STALE after its upstream is re-recalculated, and a programme recalc clears it (F6, ADR-0045 §5)', async () => {
    const { actor, upPlan, downPlan } = await programme();
    // Hold both pens so the single-plan recalcs below are permitted under enforcement.
    await actor.agent.post(lockUrl(upPlan)).send({}).expect(200);
    await actor.agent.post(lockUrl(downPlan)).send({}).expect(200);

    // Recalculate upstream-first, then downstream: the downstream is now FRESH relative to its upstream.
    await actor.agent.post(recalcUrl(upPlan)).send({}).expect(200);
    await actor.agent.post(recalcUrl(downPlan)).send({}).expect(200);

    const fresh = await actor.agent.get(summaryUrl(downPlan)).expect(200);
    expect(fresh.body.data.scheduleStale).toBe(false);
    expect(fresh.body.data.staleUpstreamPlanIds).toEqual([]);

    // Re-recalculate ONLY the upstream: the downstream's persisted dates now predate it → stale.
    await actor.agent.post(recalcUrl(upPlan)).send({}).expect(200);
    const stale = await actor.agent.get(summaryUrl(downPlan)).expect(200);
    expect(stale.body.data.scheduleStale).toBe(true);
    expect(stale.body.data.staleUpstreamPlanIds).toEqual([upPlan]);

    // A programme recalc of the downstream recomputes the closure upstream-first → clears the staleness.
    await actor.agent.post(programmeUrl(downPlan)).send({}).expect(200);
    const cleared = await actor.agent.get(summaryUrl(downPlan)).expect(200);
    expect(cleared.body.data.scheduleStale).toBe(false);
    expect(cleared.body.data.staleUpstreamPlanIds).toEqual([]);

    // The upstream plan itself has cross-plan edges but NO upstream, so it is present-but-never-stale.
    const upSummary = await actor.agent.get(summaryUrl(upPlan)).expect(200);
    expect(upSummary.body.data.scheduleStale).toBe(false);
    expect(upSummary.body.data.staleUpstreamPlanIds).toEqual([]);
  });
});
