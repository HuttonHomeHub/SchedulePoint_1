import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for invitations: create → preview → accept, plus revoke and
 * the 401/403/404/409/410 error matrix, against a real Better Auth session +
 * PostgreSQL. The stub MailService is a no-op; the accept URL is read from the
 * create response.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Invitations API (e2e)', () => {
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
    await prisma.invitation.deleteMany();
    // Both link tables and `activities` first, even though this spec creates none of them.
    // `activities` is the link tables' FK target and `plans` is its own, so ANY row left in the
    // shared local database — by a sibling spec, or by a Playwright journey run against the same
    // `app_test` — makes the `plan.deleteMany()` below a foreign-key violation, and every test in
    // this file then fails in `beforeEach` naming a table the spec never touches.
    //
    // This order was missing from NINE specs and present in the rest, so each of them passed or
    // failed on the order the files happened to run in. Adding one new e2e file was enough to
    // change that order and break them (`docs/TECH_DEBT.md` #119).
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    // Notes hold `activity_id`/`plan_id` FKs, so they must go before what they annotate. The
    // e2e database is shared with the Playwright run and `apps/web/e2e-notes` leaves notes
    // behind, so without this the failure lands in a spec that has never heard of notes — the
    // same way `plan_shares` did, one table along.
    await prisma.note.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
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

  async function adminWithOrg(): Promise<Actor> {
    const admin = await signUp('admin@example.com');
    await admin.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return admin;
  }

  const tokenFrom = (acceptUrl: string): string =>
    new URL(acceptUrl).searchParams.get('token') ?? '';

  async function invite(admin: Actor, email: string, role = 'PLANNER'): Promise<string> {
    const res = await admin.agent
      .post('/api/v1/organizations/acme/invitations')
      .send({ email, role })
      .expect(201);
    expect(res.body.data).toMatchObject({ email, role, status: 'PENDING' });
    return tokenFrom(res.body.data.acceptUrl as string);
  }

  it('creates an invitation and previews it by token', async () => {
    const admin = await adminWithOrg();
    const token = await invite(admin, 'invitee@example.com');

    const preview = await request(server())
      .post('/api/v1/invitations/preview')
      .send({ token })
      .expect(200);
    expect(preview.body.data).toMatchObject({
      organizationName: 'Acme',
      role: 'PLANNER',
      email: 'invitee@example.com',
      status: 'PENDING',
      // The server reports its own `AUTH_REQUIRE_EMAIL_VERIFICATION` (ADR-0074 M5). It is off in
      // this harness, exactly as on the running deployment — and it has to be **present and
      // false**, not absent: the client branches on it, and `undefined` would read as "not
      // enforced" by luck rather than by contract. Asserting the value is what stops the field
      // being dropped from the DTO without anything failing.
      requiresEmailVerification: false,
    });
  });

  it('rejects a duplicate pending invitation (409)', async () => {
    const admin = await adminWithOrg();
    await invite(admin, 'invitee@example.com');
    await admin.agent
      .post('/api/v1/organizations/acme/invitations')
      .send({ email: 'invitee@example.com', role: 'VIEWER' })
      .expect(409);
  });

  it('lets the invited user accept and become a member', async () => {
    const admin = await adminWithOrg();
    const token = await invite(admin, 'invitee@example.com', 'CONTRIBUTOR');

    const invitee = await signUp('invitee@example.com');
    const accepted = await invitee.agent
      .post('/api/v1/invitations/accept')
      .send({ token })
      .expect(200);
    expect(accepted.body.data).toMatchObject({ slug: 'acme', role: 'CONTRIBUTOR' });

    // The invitee is now a member.
    const orgs = await invitee.agent.get('/api/v1/organizations').expect(200);
    expect(orgs.body.data).toHaveLength(1);

    // The invitation is spent — a second accept is Gone.
    await invitee.agent.post('/api/v1/invitations/accept').send({ token }).expect(410);
  });

  it('403s when a different account accepts', async () => {
    const admin = await adminWithOrg();
    const token = await invite(admin, 'invitee@example.com');

    const other = await signUp('someone-else@example.com');
    await other.agent.post('/api/v1/invitations/accept').send({ token }).expect(403);
  });

  it('401s when accepting without a session', async () => {
    const admin = await adminWithOrg();
    const token = await invite(admin, 'invitee@example.com');
    await request(server()).post('/api/v1/invitations/accept').send({ token }).expect(401);
  });

  it('revokes a pending invitation, which then cannot be accepted (410)', async () => {
    const admin = await adminWithOrg();
    const listBefore = await admin.agent
      .post('/api/v1/organizations/acme/invitations')
      .send({ email: 'revoke-me@example.com', role: 'VIEWER' })
      .expect(201);
    const token = tokenFrom(listBefore.body.data.acceptUrl as string);

    const pending = await admin.agent.get('/api/v1/organizations/acme/invitations').expect(200);
    const invitationId = pending.body.data[0].id as string;
    await admin.agent.delete(`/api/v1/organizations/acme/invitations/${invitationId}`).expect(204);

    const invitee = await signUp('revoke-me@example.com');
    await invitee.agent.post('/api/v1/invitations/accept').send({ token }).expect(410);
  });

  it('404s previewing an unknown token', async () => {
    await request(server())
      .post('/api/v1/invitations/preview')
      .send({ token: 'not-a-real-token' })
      .expect(404);
  });

  it('forbids a non-admin member from inviting (403)', async () => {
    const admin = await adminWithOrg();
    const org = await admin.agent.get('/api/v1/organizations/acme').expect(200);
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: org.body.data.id as string, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent
      .post('/api/v1/organizations/acme/invitations')
      .send({ email: 'x@example.com', role: 'VIEWER' })
      .expect(403);
  });
});
