import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the External-Guest share-link MANAGEMENT API (Stage F,
 * ADR-0051 F-M2): create / list / revoke, gated on `plan:share` (Planner + Org
 * Admin only). Covers the happy path (create/list/revoke, idempotent revoke),
 * the 422 past-expiry guard, that no response ever leaks a token/tokenHash, the
 * RBAC split (Viewer/Contributor 403), the anti-IDOR matrix (cross-org, foreign
 * plan, foreign share id), and malformed-id validation. Verified against a real
 * PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

/** Recursively scan a JSON value for a forbidden key name (token/tokenHash), anywhere. */
function containsKey(value: unknown, keys: readonly string[]): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, keys));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, v]) => keys.includes(key) || containsKey(v, keys),
    );
  }
  return false;
}

describe.skipIf(!hasDatabase)('Share links API (e2e)', () => {
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
    await prisma.planShare.deleteMany();
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
  const sharesUrl = (planId: string, sub = '') =>
    `/api/v1/organizations/acme/plans/${planId}/shares${sub}`;

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

  /** A plan under the org (via the given actor). Returns its id. */
  async function makePlan(
    actor: Actor,
    orgSlug = 'acme',
    name = 'Riverside Plan',
  ): Promise<string> {
    const client = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/clients`)
      .send({ name: `Client-${Math.random().toString(36).slice(2, 10)}` })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  const FORBIDDEN_KEYS = ['token', 'tokenHash'];

  it('creates a share link: 201, a fragment-delivered URL, and no token/tokenHash anywhere', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor);

    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await actor.agent
      .post(sharesUrl(planId))
      .send({ label: 'Client review – Acme', expiresAt: futureExpiry })
      .expect(201);

    expect(res.body.data.url).toMatch(/\/share#sp_share_/);
    expect(containsKey(res.body, FORBIDDEN_KEYS)).toBe(false);

    expect(res.body.data.share).toMatchObject({
      planId,
      label: 'Client review – Acme',
      active: true,
      revokedAt: null,
    });
    expect(res.body.data.share.id).toBeTruthy();
    expect(new Date(res.body.data.share.expiresAt as string).toISOString()).toBe(futureExpiry);
    expect(res.body.data.share.createdAt).toBeTruthy();
  });

  it('creates an unlabelled, non-expiring link when both fields are omitted', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor);

    const res = await actor.agent.post(sharesUrl(planId)).send({}).expect(201);
    expect(res.body.data.share).toMatchObject({ label: null, expiresAt: null, active: true });
    expect(containsKey(res.body, FORBIDDEN_KEYS)).toBe(false);
  });

  it('422s (SHARE_EXPIRY_IN_PAST) creating a link with a past expiry', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor);

    const pastExpiry = new Date(Date.now() - 60_000).toISOString();
    const res = await actor.agent
      .post(sharesUrl(planId))
      .send({ expiresAt: pastExpiry })
      .expect(422);
    expect(res.body.error?.details?.reason).toBe('SHARE_EXPIRY_IN_PAST');
  });

  it('lists a plan’s links newest-first, metadata only (no token anywhere)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor);

    const first = await actor.agent.post(sharesUrl(planId)).send({ label: 'First' }).expect(201);
    const second = await actor.agent.post(sharesUrl(planId)).send({ label: 'Second' }).expect(201);

    const list = await actor.agent.get(sharesUrl(planId)).expect(200);
    expect(containsKey(list.body, FORBIDDEN_KEYS)).toBe(false);
    expect(list.body.data).toHaveLength(2);
    // Newest-first: the second-created link comes first.
    expect(list.body.data[0]).toMatchObject({ id: second.body.data.share.id, label: 'Second' });
    expect(list.body.data[1]).toMatchObject({ id: first.body.data.share.id, label: 'First' });
  });

  it('revokes a link (204), shows it inactive on list, and is idempotent', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor);
    const created = await actor.agent.post(sharesUrl(planId)).send({ label: 'Temp' }).expect(201);
    const shareId = created.body.data.share.id as string;

    await actor.agent.delete(sharesUrl(planId, `/${shareId}`)).expect(204);

    const list = await actor.agent.get(sharesUrl(planId)).expect(200);
    expect(list.body.data[0]).toMatchObject({ id: shareId, active: false });
    expect(list.body.data[0].revokedAt).toBeTruthy();

    // Idempotent: revoking the same id again is still 204.
    await actor.agent.delete(sharesUrl(planId, `/${shareId}`)).expect(204);
  });

  it('enforces RBAC: Viewer and Contributor are forbidden (403) on create/list/revoke', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor);
    const created = await actor.agent.post(sharesUrl(planId)).send({}).expect(201);
    const shareId = created.body.data.share.id as string;

    const viewer = await addMember(orgId, 'viewer@example.com', 'VIEWER');
    await viewer.agent.post(sharesUrl(planId)).send({}).expect(403);
    await viewer.agent.get(sharesUrl(planId)).expect(403);
    await viewer.agent.delete(sharesUrl(planId, `/${shareId}`)).expect(403);

    const contributor = await addMember(orgId, 'contributor@example.com', 'CONTRIBUTOR');
    await contributor.agent.post(sharesUrl(planId)).send({}).expect(403);
    await contributor.agent.get(sharesUrl(planId)).expect(403);
    await contributor.agent.delete(sharesUrl(planId, `/${shareId}`)).expect(403);
  });

  it('404s a cross-org plan (anti-IDOR): a member of a different org cannot reach it', async () => {
    const { actor: admin } = await adminWithOrg();
    const planId = await makePlan(admin);

    const otherAdmin = await signUp('other@example.com');
    await otherAdmin.agent.post('/api/v1/organizations').send({ name: 'Globex' }).expect(201);

    // The Globex admin addresses acme's plan through THEIR OWN org slug — 404, not 403.
    await otherAdmin.agent.get(`/api/v1/organizations/globex/plans/${planId}/shares`).expect(404);
    await otherAdmin.agent
      .post(`/api/v1/organizations/globex/plans/${planId}/shares`)
      .send({})
      .expect(404);
  });

  it('404s a plan id that is not in the caller’s org (well-formed but unknown/foreign)', async () => {
    const { actor: admin } = await adminWithOrg();

    const otherAdmin = await signUp('other@example.com');
    await otherAdmin.agent.post('/api/v1/organizations').send({ name: 'Globex' }).expect(201);
    const foreignPlanId = await makePlan(otherAdmin, 'globex', 'Foreign');

    // The acme admin cannot see the Globex plan even addressed through acme's own slug.
    await admin.agent.get(sharesUrl(foreignPlanId)).expect(404);
    await admin.agent.post(sharesUrl(foreignPlanId)).send({}).expect(404);
    await admin.agent
      .delete(sharesUrl(foreignPlanId, '/00000000-0000-7000-8000-000000000000'))
      .expect(404);
  });

  it('404s revoking a shareId that belongs to a different plan of the same org', async () => {
    const { actor: admin } = await adminWithOrg();
    const planA = await makePlan(admin, 'acme', 'Plan A');
    const planB = await makePlan(admin, 'acme', 'Plan B');

    const createdOnA = await admin.agent.post(sharesUrl(planA)).send({}).expect(201);
    const shareIdOnA = createdOnA.body.data.share.id as string;

    // Same org, but the share belongs to plan A — addressing it via plan B's route 404s.
    await admin.agent.delete(sharesUrl(planB, `/${shareIdOnA}`)).expect(404);

    // It is still live, addressed through its OWN plan.
    const list = await admin.agent.get(sharesUrl(planA)).expect(200);
    expect(list.body.data[0]).toMatchObject({ id: shareIdOnA, active: true });
  });

  it('validates malformed ids: a non-UUID planId/shareId is rejected (400)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor);
    const created = await actor.agent.post(sharesUrl(planId)).send({}).expect(201);
    const shareId = created.body.data.share.id as string;

    await actor.agent.get('/api/v1/organizations/acme/plans/not-a-uuid/shares').expect(400);
    await actor.agent
      .post('/api/v1/organizations/acme/plans/not-a-uuid/shares')
      .send({})
      .expect(400);
    await actor.agent.delete(sharesUrl(planId, '/not-a-uuid')).expect(400);

    // A well-formed but genuinely unknown shareId 404s (distinct from malformed → 400).
    await actor.agent
      .delete(sharesUrl(planId, '/00000000-0000-7000-8000-000000000000'))
      .expect(404);
    // Sanity: the real link is still there and untouched.
    const list = await actor.agent.get(sharesUrl(planId)).expect(200);
    expect(list.body.data.map((s: { id: string }) => s.id)).toContain(shareId);
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/plans/00000000-0000-7000-8000-000000000000/shares')
      .expect(401);
  });
});
