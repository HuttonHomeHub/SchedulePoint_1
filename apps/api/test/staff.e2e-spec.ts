import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

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
 * `vitest.e2e.config.mts` sets `fileParallelism: false`, so all suites share one process and one
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
  let throttlerStorage: ThrottlerStorage;

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
    throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);
  });

  afterAll(async () => {
    await app?.close();
    if (originalStaffEmails === undefined) delete process.env.STAFF_EMAILS;
    else process.env.STAFF_EMAILS = originalStaffEmails;
  });

  beforeEach(async () => {
    /**
     * **The throttle counter is shared mutable state between tests, and clearing it is isolation
     * rather than a weakened bound.**
     *
     * `StaffController` carries `@Throttle({ default: { limit: 30, ttl: 60_000 } })` — a real
     * security bound, with `staff-throttle.structural.spec.ts` pinning the literal — and the whole
     * suite runs inside one 60-second window against one in-memory counter. So the file had
     * silently reached the ceiling: it passed at 22 tests and any new coverage pushed **unrelated**
     * tests into 429, each failing with a message about its own assertion rather than about the
     * limit. Measured three ways before this was written, because the first two diagnoses were
     * wrong — a global `RATE_LIMIT_LIMIT` (overridden per controller, so the change was inert) and
     * "my test is greedy" (the baseline passed at exactly 22).
     *
     * The product bound is untouched: every test still runs its own requests under the real 30 per
     * minute. What is removed is one test's spending counting against the next one's, which
     * `docs/TESTING.md` already forbids in as many words — deterministic and isolated, no shared
     * mutable state. Nothing in `apps/api/test` asserts a 429, so no assertion is disarmed by this.
     */
    (throttlerStorage as ThrottlerStorageService).storage.clear();

    await prisma.mailEvent.deleteMany();
    // `perf_probe_results` has no foreign key at all — deliberately, so a reading outlives the
    // account that took it — so it blocks nothing and `clearDomainData` does not sweep it. It is
    // cleared here for the reason `mail_events` is: the history read is installation-wide with
    // nothing to scope it, so a row left by an earlier test is a row this one would read.
    await prisma.perfProbeResult.deleteMany();
    // **The shared sweep, not a hand-rolled one — which is what this was, and it broke.**
    //
    // This block used to delete org members, audit events, organisations, verifications and users,
    // in that order, having grown that list one failure at a time. It was correct only for the file
    // order the runner happened to pick: `vitest.e2e.config.mts` sets `fileParallelism: false`, so
    // all 40 suites share one database, and adding `retention-alerting.e2e-spec.ts` reshuffled them
    // until a suite leaving `clients` behind ran first. The organisation delete then tripped
    // `clients_organization_id_fkey` — a message naming a foreign key and saying nothing about the
    // spec that actually left the rows.
    //
    // That is `docs/TECH_DEBT.md` #119's class exactly, and `clearDomainData`'s own docblock
    // predicted it: "a second copy would drift again, and the drift would be invisible until an
    // unrelated change reordered the files." It is order-dependence, not flake — the same rows,
    // every run, revealed or hidden by ordering.
    //
    // The helper also handles the part a spec cannot do for itself: `audit_events` is append-only in
    // the database and holds an `ON DELETE RESTRICT` FK to its organisation, so its rows must go
    // first and only `clearAuditEvents` may remove them.
    await clearDomainData(prisma);
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

    // A PANEL route, not `/staff/me`: the identity probe's refusal is deliberately unaudited,
    // because the app asks it for every reader and a row per account-menu open would bury the
    // refusals that mean something.
    await agent.get('/api/v1/staff/health').set('Origin', ORIGIN).expect(404);

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

  it('carries the retention state on the health response, through the real envelope', async () => {
    // ADR-0087 M3. Asserted **here** rather than in a controller unit test because the shape the
    // web client consumes is the one the `TransformInterceptor` produces, and a unit test on the
    // service cannot see the envelope at all (`staff.controller.ts` records why).
    //
    // It also proves the read is wired to the SAME store the sweep writes: `RetentionStatusStore`
    // is global, and providing a second copy in `StaffModule` would compile, inject and report a
    // healthy sweep as one that had never run — forever, with nothing failing anywhere.
    const agent = await signedInStaff();
    await prisma.mailEvent.create({
      data: { kind: 'test', outcome: 'FAILED', recipient: 'retention@example.test' },
    });

    const response = await agent.get('/api/v1/staff/health').set('Origin', ORIGIN).expect(200);
    const retention = response.body.data.retention;

    // `perf_probe_results` joined this list in M4-T5 and **this assertion was not updated with
    // it**, so the slice that added the third table shipped with the e2e that reads the panel
    // failing. The structural set-equality spec beside `RETENTION_TABLES` was updated; this one
    // reads the same fact through the real route and the real envelope, and nothing connected the
    // two. Kept as an exact list rather than a `toContain`: the whole point of the pair is that a
    // fourth table forces a decision here rather than sliding in.
    expect(retention.tables.map((t: { table: string }) => t.table)).toEqual([
      'csp_reports',
      'mail_events',
      'perf_probe_results',
    ]);
    expect(typeof retention.intervalMinutes).toBe('number');
    expect(typeof retention.processStartedAt).toBe('string');
    const mail = retention.tables.find((t: { table: string }) => t.table === 'mail_events');
    // A row written moments ago: an age of zero days, and NOT the null that means "no rows".
    expect(mail.oldestAgeDays).toBe(0);
    expect(mail.retentionDays).toBeGreaterThan(0);
    expect(mail.overdue).toBe(false);
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

  /**
   * A valid press. Two limbs, because the ONE audit row per press is only checkable when a press
   * writes more than one row — ADR-0073 C3.1's rule is "one row per user action, never per swept
   * row", and a single-limb payload would satisfy both readings.
   */
  const probeBody = (overrides: Record<string, unknown> = {}) => ({
    scenarioId: 'canvas-draw',
    scenarioVersion: 1,
    preset: 'week',
    viewportWidth: 1646,
    viewportHeight: 900,
    devicePixelRatio: 1.75,
    idleIntervalMs: 16.67,
    hardwareConcurrency: 8,
    deviceMemoryGb: 16,
    gpuRenderer: 'ANGLE (NVIDIA GeForce RTX 4070)',
    userAgent: 'Mozilla/5.0 (probe)',
    reducedMotion: false,
    lostFocusDuringRun: false,
    machineLabel: 'the Dell, docked, on mains',
    appVersion: '0.109.0',
    limbs: [
      {
        limbId: 'scale-500',
        limbKind: 'absolute',
        pxPerDay: 4.2,
        activityCount: 500,
        edgeCount: 800,
        sceneSummary: '500 activities, 800 links',
        counts: { visibleBars: 312 },
        thresholds: { minFps: 45, gated: true, source: 'ADR-0026 §9 at 500', minVisibleBars: 50 },
        runs: [
          { droppedPct: 0.4, intervalP50: 16.6, intervalP95: 17.2, fps: 59.8 },
          { droppedPct: 0.6, intervalP50: 16.7, intervalP95: 17.4, fps: 59.6 },
        ],
      },
      {
        limbId: 'scale-2000',
        limbKind: 'absolute',
        pxPerDay: 1.1,
        activityCount: 2000,
        edgeCount: 3200,
        sceneSummary: '2000 activities, 3200 links',
        counts: { visibleBars: 255 },
        thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9 at 2,000', minVisibleBars: 50 },
        runs: [{ droppedPct: 10.2, intervalP50: 16.7, intervalP95: 33.4, fps: 41.1 }],
      },
    ],
    ...overrides,
  });

  it('stores one row per limb, grouped by a server-minted run id', async () => {
    const agent = await signedInStaff();

    const response = await agent
      .post('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .send(probeBody())
      .expect(201);

    // Bare DTOs from the controller: `TransformInterceptor` wraps, and this is the only place the
    // real interceptor runs, so a double wrap shows up here and nowhere else.
    const rows = response.body.data;
    expect(rows).toHaveLength(2);
    expect(rows[0].runId).toBe(rows[1].runId);
    expect(rows.map((r: { limbId: string }) => r.limbId)).toEqual(['scale-500', 'scale-2000']);

    // Server-set, never posted. `apiVersion` in particular is a claim about a process the browser
    // cannot observe, and the body above does not carry it at all.
    expect(rows[0].apiVersion).toEqual(expect.any(String));
    expect(rows[0].apiVersion.length).toBeGreaterThan(0);
    expect(rows[0].recordedAt).toEqual(expect.any(String));
    expect(rows[0].recordedByLabel).toBe(STAFF_EMAIL);

    // The samples come back as stored, because the server does not judge: the verdict is derived on
    // read by the one shared judge, from these numbers and the thresholds beside them.
    expect(rows[1].samples).toEqual([
      { droppedPct: 10.2, intervalP50: 16.7, intervalP95: 33.4, fps: 41.1 },
    ]);
    expect(rows[1].thresholds).toMatchObject({ minFps: 30, gated: true });
  });

  it('writes ONE audit row per press, naming the scenario and no device data', async () => {
    const agent = await signedInStaff();
    const before = await prisma.auditEvent.count({ where: { action: 'staff.probe_recorded' } });

    await agent
      .post('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .send(probeBody())
      .expect(201);

    // Two rows stored, ONE audit row — never one per limb (ADR-0073 C3.1).
    expect(await prisma.auditEvent.count({ where: { action: 'staff.probe_recorded' } })).toBe(
      before + 1,
    );

    const row = await prisma.auditEvent.findFirst({
      where: { action: 'staff.probe_recorded' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(row?.actorType).toBe('STAFF');
    expect(row?.actorLabel).toBe(STAFF_EMAIL);
    expect(row?.organizationId).toBeNull();
    expect(row?.subjectLabel).toBe('canvas-draw');
    // The allow-list is EMPTY, so the GPU string and the user agent — which name a staff member's
    // own machine — never reach the one table that refuses DELETE. Asserted on the stored row
    // rather than on the redactor, because that is where it would leak.
    expect(row?.changes).toBeNull();
    expect(JSON.stringify(row)).not.toContain('RTX 4070');
  });

  it('reads the history newest first, records a panel read, and round-trips the sitting columns', async () => {
    /**
     * **M4's round trip rides on the requests this test already spends, and that is deliberate.**
     *
     * `StaffController` carries `@Throttle({ default: { limit: 30, ttl: 60_000 } })` — a real
     * security bound with a structural test pinning the literal — and this file sits **exactly**
     * at it: the suite passes at 22 tests and one more four-request test pushed three UNRELATED
     * ones into 429, each failing with a message about its own assertion rather than about the
     * limit. Raising the bound to fit a test is not available, and trimming M4's coverage to
     * squeeze underneath would leave the next person the same trap.
     *
     * So the new facts are asserted where the posts already happen. One press carries the sitting
     * columns and one does not, which is the pair that matters: only a mocked Prisma cannot see
     * whether the column exists, the service writes it, and the response hands it back.
     */
    const agent = await signedInStaff();
    const sweepId = '018f3a5b-7c9d-7e2f-8a1b-2c3d4e5f6071';

    await agent
      .post('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .send(probeBody())
      .expect(201);
    await agent
      .post('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .send(probeBody({ appVersion: '0.110.0', sweepId, framesPerPhase: 180 }))
      .expect(201);
    const before = await prisma.auditEvent.count({ where: { action: 'staff.panel_read' } });

    const response = await agent
      .get('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .expect(200);

    expect(response.body.data).toHaveLength(4);
    expect(response.body.data[0].appVersion).toBe('0.110.0');
    expect(await prisma.auditEvent.count({ where: { action: 'staff.panel_read' } })).toBe(
      before + 1,
    );

    // Newest first, so the two limbs of the second press lead — both carrying the sitting id,
    // because it is a press-level fact denormalised across its rows.
    const [first, second, third, fourth] = response.body.data;
    expect(first.sweepId, 'every limb of one press carries the sitting id').toBe(sweepId);
    expect(second.sweepId).toBe(sweepId);
    expect(first.framesPerPhase).toBe(180);
    expect(second.framesPerPhase).toBe(180);

    // **Absent reads back as NULL, never as anything else.** A default would claim membership of a
    // sitting that does not exist, which is the whole reason neither column has one.
    expect(third.sweepId).toBeNull();
    expect(fourth.sweepId).toBeNull();
    expect(third.framesPerPhase).toBeNull();
  });

  it('honours the limit, and refuses one outside its bounds', async () => {
    const agent = await signedInStaff();
    await agent
      .post('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .send(probeBody())
      .expect(201);

    const limited = await agent
      .get('/api/v1/staff/probe-results?limit=1')
      .set('Origin', ORIGIN)
      .expect(200);
    expect(limited.body.data).toHaveLength(1);

    await agent.get('/api/v1/staff/probe-results?limit=0').set('Origin', ORIGIN).expect(422);
    await agent.get('/api/v1/staff/probe-results?limit=101').set('Origin', ORIGIN).expect(422);
  });

  it('refuses a server-set field supplied in the body', async () => {
    // `whitelist` + `forbidNonWhitelisted` (`app.module.ts:142-147`) makes this a 422 rather than a
    // silent drop, which is what turns the three service-layer obligations into an enforced rule.
    const agent = await signedInStaff();

    for (const field of ['runId', 'recordedAt', 'apiVersion', 'recordedByUserId']) {
      await agent
        .post('/api/v1/staff/probe-results')
        .set('Origin', ORIGIN)
        .send(probeBody({ [field]: 'anything' }))
        .expect(422);
    }
  });

  it('refuses every bound the DTO declares', async () => {
    const agent = await signedInStaff();

    const bad: Record<string, unknown>[] = [
      { scenarioVersion: 0 },
      { scenarioVersion: 10_000 },
      { viewportWidth: 199 },
      { viewportHeight: 10_001 },
      { devicePixelRatio: 0 },
      { devicePixelRatio: 9 },
      { idleIntervalMs: 0 },
      { idleIntervalMs: 201 },
      { hardwareConcurrency: 0 },
      { deviceMemoryGb: -1 },
      { gpuRenderer: 'x'.repeat(257) },
      { userAgent: 'x'.repeat(513) },
      { machineLabel: 'x'.repeat(201) },
      // Release granularity, and semver-shaped: a commit SHA never reaches either artefact
      // (ADR-0088 D1), so a value that is not a version is a producer bug rather than a skew.
      { appVersion: 'main' },
      // A LABEL, so the shape is checked and the value is not — but the shape still is.
      { scenarioId: 'Canvas Draw' },
      { preset: 'Week' },
      { limbs: [] },
      // The column is `@db.Uuid`; a malformed value reaching it raises an error this route does
      // not map, so the DTO must refuse first or a 422 becomes a 500.
      { sweepId: 'not-a-uuid' },
      // **The sharp one.** `Number.isInteger(1e12)` is `true`, so `@IsInt()` alone passes this,
      // the value reaches an `int4` column and overflows — a 500 that loses the whole press. The
      // DTO's `@Max` is what makes this line a 422, and removing it turns this case red.
      { framesPerPhase: 1e12 },
      // The database's own bound is sign only, on purpose: a range is a protocol, and a protocol
      // in a CHECK means the day the product widens it the database silently refuses rows the
      // product decided to accept. This is the DTO staying a strict subset of that CHECK.
      { framesPerPhase: 0 },
    ];

    for (const overrides of bad) {
      await agent
        .post('/api/v1/staff/probe-results')
        .set('Origin', ORIGIN)
        .send(probeBody(overrides))
        .expect(422);
    }
  });

  it('refuses a samples array that does not match the limb kind', async () => {
    // The rule `@ValidateIf` cannot express: it SKIPS a property rather than refusing it, so a
    // `runs` array on a `difference` limb would validate and then be dropped on the floor, and the
    // database's own non-empty CHECK would turn that into a 500 rather than the 422 it is.
    const agent = await signedInStaff();
    const limb = probeBody().limbs[0];

    await agent
      .post('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .send(probeBody({ limbs: [{ ...limb, limbKind: 'difference' }] }))
      .expect(422);

    await agent
      .post('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .send(
        probeBody({
          limbs: [
            {
              ...limb,
              pairs: [
                {
                  baseline: { droppedPct: 1, intervalP50: 16, intervalP95: 17, fps: 60 },
                  treatment: { droppedPct: 2, intervalP50: 16, intervalP95: 18, fps: 59 },
                },
              ],
            },
          ],
        }),
      )
      .expect(422);
  });

  it('refuses both probe routes to a non-staff member, and stores nothing', async () => {
    const agent = request.agent(server());
    await signUp(agent, MEMBER_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });

    await agent
      .post('/api/v1/staff/probe-results')
      .set('Origin', ORIGIN)
      .send(probeBody())
      .expect(404);
    await agent.get('/api/v1/staff/probe-results').set('Origin', ORIGIN).expect(404);

    expect(await prisma.perfProbeResult.count()).toBe(0);
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

  it('writes NO denial row for the identity probe', async () => {
    // `GET /staff/me` is what the account menu calls to decide whether to offer a link, for every
    // signed-in reader in the installation. A 404 there is the expected answer and carries no
    // security signal; recording it would grow an append-only table on ordinary use. Driven end to
    // end because the exclusion is a property of the wired route, not of a helper.
    const agent = request.agent(server());
    await signUp(agent, MEMBER_EMAIL).expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });
    const before = await prisma.auditEvent.count({ where: { action: 'staff.access_denied' } });

    await agent.get('/api/v1/staff/me').set('Origin', ORIGIN).expect(404);

    expect(await prisma.auditEvent.count({ where: { action: 'staff.access_denied' } })).toBe(
      before,
    );
  });
});
