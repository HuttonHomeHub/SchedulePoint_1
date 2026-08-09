import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * **This suite exists because M2 shipped unable to complete a single request, and 1,589 unit tests
 * said it was fine.**
 *
 * `ck_audit_events_actor_shape` is a fail-closed `CASE … ELSE false` over `actor_type`, and adding
 * the `STAFF` enum label without a branch in it made every staff audit row a constraint violation.
 * The producer uses `record()` rather than `recordBestEffort()` — deliberately — so that violation
 * became a guaranteed 500 on the one route, for a correctly-allowlisted, verified staff member.
 * Every unit test passed throughout, because every one of them mocks Prisma.
 *
 * The constraint did its job; the test suite did not. So this suite drives the real route through
 * the real guard, the real audit producer and a real migrated Postgres — and asserts the audit ROW,
 * not just the response, because a 200 with no row would be the same defect wearing a smile.
 *
 * `STAFF_EMAILS` is set before `AppModule` is imported and restored in `afterAll`:
 * `vitest.e2e.config.ts` sets `fileParallelism: false`, so all suites share one process and one
 * `process.env`, and a leaked value here would silently make an address staff in every later suite.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const STAFF_EMAIL = 'ops@schedulepoint.test';
const MEMBER_EMAIL = 'planner@acme.test';

describe.skipIf(!hasDatabase)('Staff console (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let originalStaffEmails: string | undefined;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    originalStaffEmails = process.env.STAFF_EMAILS;
    // Mixed case on purpose: the guard normalises with `toLowerCase()` and nothing else, and the
    // allowlist's own entries are trimmed at parse time. Both directions are exercised here rather
    // than only in the mocked unit test.
    process.env.STAFF_EMAILS = ` OPS@SchedulePoint.test , spare@schedulepoint.test `;

    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaServiceToken);
  });

  afterAll(async () => {
    await app?.close();
    if (originalStaffEmails === undefined) delete process.env.STAFF_EMAILS;
    else process.env.STAFF_EMAILS = originalStaffEmails;
  });

  beforeEach(async () => {
    await prisma.mailEvent.deleteMany();
    await prisma.orgMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
    // `audit_events` is append-only in the database and CANNOT be cleared — the triggers refuse
    // both DELETE and TRUNCATE. So assertions below count rows created DURING a test rather than
    // asserting a total, which is the only honest way to read this table.
  });

  const server = () => app.getHttpServer();

  const signUp = (agent: ReturnType<typeof request.agent>, email: string) =>
    agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Test Person', email, password: PASSWORD });

  /** Sign up, then mark the address verified — the guard demands it unconditionally. */
  async function signedInStaff(): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(server());
    await signUp(agent, STAFF_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: STAFF_EMAIL }, data: { emailVerified: true } });
    return agent;
  }

  const staffAuditCount = () => prisma.auditEvent.count({ where: { actorType: 'STAFF' } });

  it('answers /staff/me for a verified allowlisted account AND writes the audit row', async () => {
    // The regression test for the shipped defect. The response alone is not the assertion: the
    // producer fails closed, so a 200 proves the INSERT succeeded — but asserting the row makes the
    // intent explicit rather than incidental, so a later switch to `recordBestEffort()` cannot make
    // this pass while silently recording nothing.
    const agent = await signedInStaff();
    const before = await staffAuditCount();

    const response = await agent.get('/api/v1/staff/me').set('Origin', ORIGIN).expect(200);

    expect(response.body.data).toMatchObject({ email: STAFF_EMAIL });
    expect(await staffAuditCount()).toBe(before + 1);
  });

  it('records the staff actor with a user id, which the CHECK constraint requires', async () => {
    const agent = await signedInStaff();

    await agent.get('/api/v1/staff/me').set('Origin', ORIGIN).expect(200);

    const row = await prisma.auditEvent.findFirst({
      where: { actorType: 'STAFF' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(row?.actorUserId).not.toBeNull();
    expect(row?.actorLabel).toBe(STAFF_EMAIL);
    // A staff act belongs to no organisation, and the column is nullable precisely so that can be
    // recorded honestly rather than attributed to whichever org happened to be nearby.
    expect(row?.organizationId).toBeNull();
    // The allow-list for this action is EMPTY by design — the row says a surface was reached, never
    // what was on it, because the console reads customer addresses and this table refuses DELETE.
    expect(row?.changes).toBeNull();
  });

  it('answers an authenticated non-staff member with 404, not 403', async () => {
    // The uniform refusal. A 403 would tell a prober their address is worth attacking.
    const agent = request.agent(server());
    await signUp(agent, MEMBER_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });

    await agent.get('/api/v1/staff/me').set('Origin', ORIGIN).expect(404);
  });

  it('refuses an allowlisted account whose address is unverified', async () => {
    // The control that makes an address-keyed allowlist safe. Driven end to end because
    // AUTH_REQUIRE_EMAIL_VERIFICATION is off here — exactly the configuration in which a squatted
    // address would otherwise become staff.
    const agent = request.agent(server());
    await signUp(agent, STAFF_EMAIL).expect(200);

    await agent.get('/api/v1/staff/me').set('Origin', ORIGIN).expect(404);
  });

  it('writes no audit row for a refused caller', async () => {
    // A refusal is not a staff act, and recording one would make the log an inventory of who tried
    // — which on this surface is a list of addresses somebody probed.
    const agent = request.agent(server());
    await signUp(agent, MEMBER_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });
    const before = await staffAuditCount();

    await agent.get('/api/v1/staff/me').set('Origin', ORIGIN).expect(404);

    expect(await staffAuditCount()).toBe(before);
  });

  it('serves the health panel and records reading it', async () => {
    const agent = await signedInStaff();
    await prisma.mailEvent.create({
      data: {
        kind: 'password_reset',
        outcome: 'FAILED',
        recipient: 'someone@example.test',
        errorClass: 'ECONNREFUSED',
      },
    });
    const before = await prisma.auditEvent.count({ where: { action: 'staff.panel_read' } });

    const response = await agent.get('/api/v1/staff/health').set('Origin', ORIGIN).expect(200);

    expect(response.body.data.failuresLast24h).toBe(1);
    expect(response.body.data.recentFailures[0]).toMatchObject({
      kind: 'password_reset',
      errorClass: 'ECONNREFUSED',
      // CQ-1: a staff member may read the address. Asserted against the real response so a later
      // change that masks it has to argue with a test.
      recipient: 'someone@example.test',
    });
    expect(await prisma.auditEvent.count({ where: { action: 'staff.panel_read' } })).toBe(
      before + 1,
    );
  });

  it('refuses the health panel to a non-staff member too', async () => {
    const agent = request.agent(server());
    await signUp(agent, MEMBER_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });

    await agent.get('/api/v1/staff/health').set('Origin', ORIGIN).expect(404);
  });
});
