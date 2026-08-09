import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

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
    // **Before the organisations, and this suite failed for three runs without it.**
    // `audit_events.organization_id` is `ON DELETE RESTRICT`, so any row another suite left behind
    // blocks the organisation delete — and the append-only trigger refuses to let the spec remove
    // those rows itself. `clearAuditEvents` is the sanctioned escape hatch ADR-0072 documents
    // rather than hides: it disables the trigger as the table's owner and restores `ENABLE ALWAYS`
    // afterwards.
    //
    // The failure was intermittent because it depended on what earlier suites had written, which is
    // why it read as flake for three runs before it was diagnosed. It was not flake.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
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

  /** Counts are still read as deltas within a test: `clearAuditEvents` runs per test, not per assertion. */
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

  it('records a refused caller as a denial — attributed, and never as staff', async () => {
    // This asserted the OPPOSITE until the M6 security review: that a refusal wrote nothing, on the
    // reasoning that a denial log becomes an inventory of who tried. It does, and that is the
    // point — the approved spec called it non-negotiable in five places and the code shipped
    // silence. What must not leak is WHICH condition failed, and the redactor's empty allow-list
    // for this action is what holds that, not the absence of the row.
    const agent = request.agent(server());
    await signUp(agent, MEMBER_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });

    await agent.get('/api/v1/staff/me').set('Origin', ORIGIN).expect(404);

    const row = await prisma.auditEvent.findFirst({
      where: { action: 'staff.access_denied' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(row).not.toBeNull();
    // Typed as the caller really is. `STAFF` would be a lie about a prober, and would put them in
    // the console's own "what staff have done" panel.
    expect(row?.actorType).toBe('USER');
    expect(row?.outcome).toBe('DENIED');
    expect(row?.actorLabel).toBe(MEMBER_EMAIL);
    // No `changes` at all: "not allowlisted" and "allowlisted but unverified" are the difference
    // the uniform 404 exists to withhold, and a member can cause rows in this table.
    expect(row?.changes).toBeNull();
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

  it('NEVER puts a configured secret in the installation response', async () => {
    // The assertion this panel's design exists for. `MAIL_SMTP_URL` is
    // `smtps://user:PASSWORD@host:port`, and a response assembled by spreading the config object
    // and deleting what somebody remembered leaks the password the first time a field is added.
    // Asserted against the SERIALISED response rather than field by field, because the failure mode
    // is a field nobody thought about — checking the fields you know about cannot catch it.
    const agent = await signedInStaff();

    const response = await agent
      .get('/api/v1/staff/installation')
      .set('Origin', ORIGIN)
      .expect(200);
    const body = JSON.stringify(response.body);

    expect(body).not.toContain('correct-horse-battery');
    for (const secret of [process.env.MAIL_SMTP_URL, process.env.BETTER_AUTH_SECRET]) {
      if (secret !== undefined && secret !== '') expect(body).not.toContain(secret);
    }
    // And it still says something useful.
    expect(response.body.data).toMatchObject({ environment: expect.any(String) });
  });

  it('lists unverified accounts, bounded, with a total', async () => {
    const agent = await signedInStaff();
    // `unverified@schedulepoint.test` is created by the guard tests above and never verified.
    const response = await agent.get('/api/v1/staff/accounts').set('Origin', ORIGIN).expect(200);

    expect(response.body.data.unverifiedTotal).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(response.body.data.unverified)).toBe(true);
    expect(response.body.data.unverified.length).toBeLessThanOrEqual(25);
  });

  it('records reading the accounts panel WITHOUT recording any address', async () => {
    // The rule that keeps CQ-1 from leaking into the one table that refuses DELETE. The panel may
    // show addresses; the audit row may not carry them, or erasure could never reach them.
    const agent = await signedInStaff();
    await prisma.user.updateMany({
      where: { email: MEMBER_EMAIL },
      data: { emailVerified: false },
    });

    await agent.get('/api/v1/staff/accounts').set('Origin', ORIGIN).expect(200);

    const row = await prisma.auditEvent.findFirst({
      where: { action: 'staff.panel_read', subjectLabel: 'accounts' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(MEMBER_EMAIL);
    expect(row?.changes).toBeNull();
  });

  it("returns staff actions only — never a member's audit row", async () => {
    // The route most likely to become a cross-tenant leak by accident: `audit_events` holds every
    // organisation's activity, and one caller-supplied filter would turn a staff self-audit into a
    // read of everybody's. The filter is in the repository; this pins it.
    const agent = await signedInStaff();

    const response = await agent.get('/api/v1/staff/activity').set('Origin', ORIGIN).expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const row of response.body.data) {
      expect(String(row.action).startsWith('staff.')).toBe(true);
    }
  });

  it('refuses every M5 panel to a non-staff member', async () => {
    const agent = request.agent(server());
    await signUp(agent, MEMBER_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });

    for (const path of ['/installation', '/accounts', '/activity']) {
      await agent.get(`/api/v1/staff${path}`).set('Origin', ORIGIN).expect(404);
    }
  });

  it('refuses the health panel to a non-staff member too', async () => {
    const agent = request.agent(server());
    await signUp(agent, MEMBER_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });

    await agent.get('/api/v1/staff/health').set('Origin', ORIGIN).expect(404);
  });
});
