import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the plan edit-lock (ADR-0028): acquire / heartbeat /
 * release / request / hand-off / take-over and the peer-vs-admin policy. Covers
 * the happy path, contention (423 HELD), heartbeat-loss (423 LOST), expiry
 * reclaim, the graceful peer request → grace → take-over, holder hand-off, the
 * Org-Admin immediate override, the RBAC split (Viewer/Contributor 403), and the
 * cross-org IDOR 404. Timing (grace / expiry / inactivity) is driven by backdating
 * the row via Prisma, so the suite is deterministic (no sleeps). Verified against a
 * real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const GRACE_MS = 45_000;
const INACTIVE_MS = 90_000;

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Plan edit-lock API (e2e)', () => {
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
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const lockUrl = (planId: string, sub = '') =>
    `/api/v1/organizations/acme/plans/${planId}/edit-lock${sub}`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** An Org Admin owning a fresh "Acme" org (slug `acme`). Returns the admin + orgId. */
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

  /** A plan under the org (via the admin). Returns its id. */
  async function makePlan(actor: Actor, name = 'Baseline'): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: `Client-${randomUUID().slice(0, 8)}` })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  it('grants a free lock and reports HELD_BY_ME', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor);

    const before = await actor.agent.get(lockUrl(planId)).expect(200);
    expect(before.body.data).toMatchObject({ state: 'FREE', holder: null, canAcquire: true });

    const acquired = await actor.agent.post(lockUrl(planId)).send({}).expect(200);
    expect(acquired.body.data).toMatchObject({ state: 'HELD_BY_ME' });
    expect(acquired.body.data.holder.id).toBe(actor.userId);
    expect(acquired.body.data.expiresAt).toBeTruthy();
  });

  it('rejects a second Planner’s acquire on a live lock with 423 HELD', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    await admin.agent.post(lockUrl(planId)).send({}).expect(200);

    const res = await planner.agent.post(lockUrl(planId)).send({}).expect(423);
    expect(res.body.error).toMatchObject({
      code: 'LOCKED',
      details: { reason: 'PLAN_EDIT_LOCK_HELD' },
    });
    expect(res.body.error.details.holder.id).toBe(admin.userId);

    // The contender sees who holds the pen and can request it.
    const status = await planner.agent.get(lockUrl(planId)).expect(200);
    expect(status.body.data).toMatchObject({
      state: 'HELD_BY_OTHER',
      canRequest: true,
      canTakeOver: false,
    });
  });

  it('heartbeats a live lease, and returns 423 LOST after it is taken over', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    await planner.agent.post(lockUrl(planId)).send({}).expect(200);
    await planner.agent.post(lockUrl(planId, '/heartbeat')).expect(200);

    // Admin overrides immediately; the displaced holder's next heartbeat is 423 LOST.
    await admin.agent.post(lockUrl(planId)).send({ takeover: true }).expect(200);
    const lost = await planner.agent.post(lockUrl(planId, '/heartbeat')).expect(423);
    expect(lost.body.error).toMatchObject({ details: { reason: 'PLAN_EDIT_LOCK_LOST' } });
  });

  it('releases the lock (204) and frees it for the next Planner', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    await planner.agent.post(lockUrl(planId)).send({}).expect(200);
    await planner.agent.delete(lockUrl(planId)).expect(204);

    const status = await admin.agent.get(lockUrl(planId)).expect(200);
    expect(status.body.data.state).toBe('FREE');
    await admin.agent.post(lockUrl(planId)).send({}).expect(200);
  });

  it('reclaims an expired lock', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    await planner.agent.post(lockUrl(planId)).send({}).expect(200);
    // Backdate the lease past its TTL — it now reads as free/expired.
    await prisma.planLock.update({
      where: { planId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const status = await admin.agent.get(lockUrl(planId)).expect(200);
    expect(status.body.data).toMatchObject({ state: 'EXPIRED', canAcquire: true });
    const acquired = await admin.agent.post(lockUrl(planId)).send({}).expect(200);
    expect(acquired.body.data).toMatchObject({ state: 'HELD_BY_ME' });
    expect(acquired.body.data.holder.id).toBe(admin.userId);
  });

  it('peer hand-off: request → premature take-over 423 → post-grace take-over 201', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const p1 = await addMember(orgId, 'p1@example.com', 'PLANNER');
    const p2 = await addMember(orgId, 'p2@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    await p1.agent.post(lockUrl(planId)).send({}).expect(200);

    // p2 requests control (no transfer yet).
    const requested = await p2.agent.post(lockUrl(planId, '/request')).expect(200);
    expect(requested.body.data.requestedBy.id).toBe(p2.userId);

    // Immediately taking over is refused — grace has not elapsed and p1 is active.
    const premature = await p2.agent.post(lockUrl(planId)).send({ takeover: true }).expect(423);
    expect(premature.body.error.details.reason).toBe('PLAN_EDIT_LOCK_HELD');

    // Age the request past the grace window; the take-over now succeeds.
    await prisma.planLock.update({
      where: { planId },
      data: { requestedAt: new Date(Date.now() - GRACE_MS - 1_000) },
    });
    const takenOver = await p2.agent.post(lockUrl(planId)).send({ takeover: true }).expect(200);
    expect(takenOver.body.data).toMatchObject({ state: 'HELD_BY_ME' });
    expect(takenOver.body.data.holder.id).toBe(p2.userId);

    // p1 is demoted; their next heartbeat is 423 LOST.
    await p1.agent.post(lockUrl(planId, '/heartbeat')).expect(423);
  });

  it('peer take-over of an inactive holder does not need the grace window', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const p1 = await addMember(orgId, 'p1@example.com', 'PLANNER');
    const p2 = await addMember(orgId, 'p2@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    await p1.agent.post(lockUrl(planId)).send({}).expect(200);
    // p1 goes quiet: last heartbeat older than the inactive threshold (lease still live).
    await prisma.planLock.update({
      where: { planId },
      data: { heartbeatAt: new Date(Date.now() - INACTIVE_MS - 1_000) },
    });

    const status = await p2.agent.get(lockUrl(planId)).expect(200);
    expect(status.body.data).toMatchObject({ state: 'HELD_BY_OTHER', canTakeOver: true });
    await p2.agent.post(lockUrl(planId)).send({ takeover: true }).expect(200);
  });

  it('holder hand-off transfers the pen directly to the pending requester', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const p1 = await addMember(orgId, 'p1@example.com', 'PLANNER');
    const p2 = await addMember(orgId, 'p2@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    await p1.agent.post(lockUrl(planId)).send({}).expect(200);
    await p2.agent.post(lockUrl(planId, '/request')).expect(200);

    // p1 sees the request on their next heartbeat and hands over.
    const beat = await p1.agent.post(lockUrl(planId, '/heartbeat')).expect(200);
    expect(beat.body.data.requestedBy.id).toBe(p2.userId);
    const handed = await p1.agent.post(lockUrl(planId, '/handoff')).expect(200);
    expect(handed.body.data.holder.id).toBe(p2.userId);

    // p2 now holds it; p1 has lost it.
    const p2status = await p2.agent.get(lockUrl(planId)).expect(200);
    expect(p2status.body.data.state).toBe('HELD_BY_ME');
    await p1.agent.post(lockUrl(planId, '/heartbeat')).expect(423);
  });

  it('409s a hand-off when no one has requested control', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor);
    await actor.agent.post(lockUrl(planId)).send({}).expect(200);
    const res = await actor.agent.post(lockUrl(planId, '/handoff')).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('lets an Org Admin take over a live, active lock immediately', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const planner = await addMember(orgId, 'planner@example.com', 'PLANNER');
    const planId = await makePlan(admin);

    await planner.agent.post(lockUrl(planId)).send({}).expect(200);
    const status = await admin.agent.get(lockUrl(planId)).expect(200);
    expect(status.body.data).toMatchObject({ canOverride: true, canTakeOver: true });
    const takenOver = await admin.agent.post(lockUrl(planId)).send({ takeover: true }).expect(200);
    expect(takenOver.body.data.holder.id).toBe(admin.userId);
  });

  it('denies the lock to Viewer and Contributor (403)', async () => {
    const { actor: admin, orgId } = await adminWithOrg();
    const viewer = await addMember(orgId, 'viewer@example.com', 'VIEWER');
    const contributor = await addMember(orgId, 'contributor@example.com', 'CONTRIBUTOR');
    const planId = await makePlan(admin);

    await viewer.agent.post(lockUrl(planId)).send({}).expect(403);
    await contributor.agent.post(lockUrl(planId)).send({}).expect(403);
    // …but they can still READ the status (plan:read).
    await viewer.agent.get(lockUrl(planId)).expect(200);
    // …and cannot request control.
    await admin.agent.post(lockUrl(planId)).send({}).expect(200);
    await contributor.agent.post(lockUrl(planId, '/request')).expect(403);
  });

  it('404s a cross-org plan (anti-IDOR)', async () => {
    const { actor: admin } = await adminWithOrg();
    // A plan in a DIFFERENT org, addressed through the caller's `acme` slug.
    const otherAdmin = await signUp('other@example.com');
    await otherAdmin.agent.post('/api/v1/organizations').send({ name: 'Globex' }).expect(201);
    const otherClient = await otherAdmin.agent
      .post('/api/v1/organizations/globex/clients')
      .send({ name: 'Foreign' })
      .expect(201);
    const otherProject = await otherAdmin.agent
      .post(`/api/v1/organizations/globex/clients/${otherClient.body.data.id}/projects`)
      .send({ name: 'Secret' })
      .expect(201);
    const otherPlan = await otherAdmin.agent
      .post(`/api/v1/organizations/globex/projects/${otherProject.body.data.id}/plans`)
      .send({ name: 'Hidden', plannedStart: '2026-01-01' })
      .expect(201);

    await admin.agent.get(lockUrl(otherPlan.body.data.id)).expect(404);
    await admin.agent.post(lockUrl(otherPlan.body.data.id)).send({}).expect(404);
  });
});
