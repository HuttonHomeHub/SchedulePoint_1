import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { CrashReportService } from '../src/modules/crash-reports/crash-report.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { resetThrottleCounters } from './throttle-reset';

/**
 * The browser crash-report sink against a real Postgres (browser crash reports M1-T2).
 *
 * The unit suites prove the cleaners and the hash; only this proves the **statement** — that the
 * one-statement upsert is valid SQL against this schema, that every CHECK holds at its cap, that a
 * burst of one new crash counts every report (the #311 regression shape), and that the cap admits a
 * repeat but not a new fingerprint. A mocked Prisma accepts any SQL.
 *
 * **The burst goes through the service, not the route.** The route is throttled at 10 a minute per
 * address, which is a real bound this file also proves (the 11th request is a 429), so a 16-way
 * HTTP burst could never reach 16. The statement under test is the same either way.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const EMAIL = `crash-reporter-${Date.now()}@example.com`;
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const UUID = '0b9f7c1e-3a52-4d0e-8a1b-5c2d9e7f1a30';

const BODY = {
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'startAt')",
  stack: 'TypeError: x\n    at PlanView (/assets/plan-Ab12.jsx:10:20)',
  componentStack: '\n    at PlanView (/assets/plan-Ab12.jsx:10:20)\n    at div',
  routeId: '/_authed/orgs/$orgSlug/plans/$planId',
  boundary: 'route',
  webVersion: '0.200.7',
};

describe.skipIf(!hasDatabase)('Browser crash reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: CrashReportService;
  let throttlerStorage: ThrottlerStorage;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    const { CrashReportService: CrashReportServiceToken } =
      await import('../src/modules/crash-reports/crash-report.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaServiceToken);
    service = app.get(CrashReportServiceToken);
    throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);

    await clearDomainData(prisma);
    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Crash Reporter', email: EMAIL, password: PASSWORD })
      .expect(200);
  });

  afterAll(async () => {
    await prisma?.crashReport.deleteMany();
    if (prisma) await clearDomainData(prisma);
    await app?.close();
  });

  beforeEach(async () => {
    resetThrottleCounters(throttlerStorage);
    await prisma.crashReport.deleteMany();
  });

  afterEach(() => {
    // The 429 test spends the whole 60-second bucket; later suites in this shared process must not
    // inherit it. Same isolation `throttle-reset.ts` documents, not a weakened bound.
    resetThrottleCounters(throttlerStorage);
  });

  const server = () => app.getHttpServer();
  const post = (body: string | object) =>
    agent.post('/api/v1/crash-reports').set('Origin', ORIGIN).set('User-Agent', CHROME).send(body);

  it('refuses a request with no session (401) and stores nothing', async () => {
    await request(server())
      .post('/api/v1/crash-reports')
      .set('Origin', ORIGIN)
      .send(BODY)
      .expect(401);

    expect(await prisma.crashReport.count()).toBe(0);
  });

  it('stores a report for a signed-in person and answers a six-character reference', async () => {
    const audits = await prisma.auditEvent.count();

    const res = await post(BODY).expect(200);

    expect(res.body.data.reference).toMatch(/^[0-9A-F]{6}$/);
    const rows = await prisma.crashReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      boundary: 'route',
      errorName: 'TypeError',
      message: BODY.message,
      routePattern: BODY.routeId,
      webVersion: '0.200.7',
      browser: 'chrome',
      browserMajor: 141,
      stack: 'PlanView @ /assets/plan-Ab12.jsx:10:20',
      componentStack: 'PlanView @ /assets/plan-Ab12.jsx:10:20\ndiv',
      count: 1,
    });
    expect(rows[0]?.dedupeHash.slice(0, 6).toUpperCase()).toBe(res.body.data.reference);
    // Unaudited by census (`BROWSER_TELEMETRY`): one broken screen must not fill the append-only log.
    expect(await prisma.auditEvent.count()).toBe(audits);
  });

  it('deduplicates a repeat and moves only the count and last-seen time', async () => {
    for (let i = 0; i < 3; i += 1) await post(BODY).expect(200);

    const rows = await prisma.crashReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(3);
    expect(rows[0]?.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      rows[0]?.firstSeenAt.getTime() ?? 0,
    );
  });

  it('keeps the release and the route in the key: the same crash on a new release is a new row', async () => {
    await post(BODY).expect(200);
    await post({ ...BODY, webVersion: '0.200.8' }).expect(200);
    await post({ ...BODY, routeId: '/_authed/orgs/$orgSlug' }).expect(200);

    expect(await prisma.crashReport.count()).toBe(3);
  });

  it('counts every report in a 16-way burst of one NEW crash (the #311 regression shape)', async () => {
    // Fifteen of sixteen were lost on `csp_reports` before its clamp: the loser of the insert race
    // tried to write a `last_seen_at` older than the winner's `first_seen_at`, and the seen-order
    // CHECK refused it. Straight to the service so the route's 10-a-minute throttle is not the
    // subject; the statement is the same.
    const answers = await Promise.all(
      Array.from({ length: 16 }, () => service.record(BODY, CHROME)),
    );

    expect(answers.every((answer) => answer.reference !== null)).toBe(true);
    const rows = await prisma.crashReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(16);
    expect(rows[0]?.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      rows[0]?.firstSeenAt.getTime() ?? 0,
    );
  });

  describe('every bounded column holds at its cap', () => {
    // The producer caps; the database CHECKs the same number. A cap raised without a migration (or a
    // cleaner that stopped capping last) fails here, because the row is refused and the answer is
    // `reference: null`.
    it('stores a message, stack and component stack that hit their caps', async () => {
      const frame = (i: number) =>
        `at ${'f'.repeat(50)}${i % 10} (/assets/${'p'.repeat(180)}.jsx:1:2)`;
      const res = await post({
        ...BODY,
        message: 'word '.repeat(200),
        stack: Array.from({ length: 30 }, (_v, i) => frame(i)).join('\n'),
        componentStack: Array.from(
          { length: 30 },
          () => `at ${'C'.repeat(60)} (/assets/${'p'.repeat(60)}.jsx:1:2)`,
        ).join('\n'),
      }).expect(200);

      expect(res.body.data.reference).not.toBeNull();
      const row = await prisma.crashReport.findFirstOrThrow();
      expect(Array.from(row.message)).toHaveLength(300);
      expect(Array.from(row.stack ?? '')).toHaveLength(4_000);
      expect(Array.from(row.componentStack ?? '')).toHaveLength(2_000);
    });

    it('counts a message in code points, so astral characters at the cap still fit', async () => {
      const res = await post({ ...BODY, message: '😀'.repeat(400) }).expect(200);

      expect(res.body.data.reference).not.toBeNull();
      const [row] = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT char_length(message)::int AS n FROM crash_reports`;
      expect(row?.n).toBe(300);
    });

    it('stores a 64-character error name, a 200-character route id and a 32-character version', async () => {
      const res = await post({
        ...BODY,
        name: 'E'.repeat(64),
        routeId: `/${'r'.repeat(199)}`,
        webVersion: '1'.repeat(32),
      }).expect(200);

      expect(res.body.data.reference).not.toBeNull();
      const row = await prisma.crashReport.findFirstOrThrow();
      expect(row.errorName).toHaveLength(64);
      expect(row.routePattern).toHaveLength(200);
      expect(row.webVersion).toHaveLength(32);
    });

    it('stores the largest browser major the CHECK allows, and no more', async () => {
      const at = await service.record(BODY, 'Chrome/9999');
      expect(at.reference).not.toBeNull();
      expect((await prisma.crashReport.findFirstOrThrow()).browserMajor).toBe(9999);

      await prisma.crashReport.deleteMany();
      const over = await service.record(BODY, 'Chrome/123456789012345678901234567890');
      expect(over.reference).not.toBeNull();
      expect((await prisma.crashReport.findFirstOrThrow()).browserMajor).toBeNull();
    });
  });

  describe('hostile input is stored cleaned', () => {
    it('removes an email, UUID, URL query, quoted values, JSON snippet and long number', async () => {
      const hostile = [
        'Failed for ada@example.com on',
        UUID,
        'at https://u:pw@evil.example/a/b?token=s3cr3t#frag',
        `with "Mrs Smith" and 'Acme Tower' and code 123456`,
        `Unexpected token 'o', "[object Obj"... is not valid JSON`,
        'x\u0000y',
      ].join(' ');

      const res = await post({
        ...BODY,
        message: hostile,
        stack: `Error: ada@example.com\n    at a (https://evil.example/x.js?token=s3cr3t:1:2)\n    at b (/assets/ok.jsx:3:4)`,
        componentStack: `\n    at C (https://evil.example/c.js?q=Mrs+Smith:1:2)`,
        routeId: `/orgs/${UUID}/plans`,
      }).expect(200);

      expect(res.body.data.reference).not.toBeNull();
      const row = await prisma.crashReport.findFirstOrThrow();
      const everything = JSON.stringify(row);
      for (const secret of [
        'ada@example.com',
        UUID,
        's3cr3t',
        'token=',
        'Mrs Smith',
        'Acme Tower',
        '123456',
        'object Obj',
        'u:pw',
        '\u0000',
        'Mozilla',
      ]) {
        expect(everything, secret).not.toContain(secret);
      }
      expect(row.message).toContain('[email]');
      expect(row.message).toContain('[id]');
      expect(row.message).toContain('https://evil.example/a/b');
      expect(row.message).toContain('xy');
      // A route id that carries a UUID is a pathname, not a pattern: stored as null, report kept.
      expect(row.routePattern).toBeNull();
      // A foreign-origin frame keeps only its scheme; a bare path survives; the `Error: …` line,
      // which carried an email, is not a frame and is gone.
      expect(row.stack).toBe('a @ [https]:1:2\nb @ /assets/ok.jsx:3:4');
      expect(row.componentStack).toBe('C @ [https]:1:2');
    });

    it('does not store the full User-Agent, only a family and a major version', async () => {
      await post(BODY).expect(200);

      const row = await prisma.crashReport.findFirstOrThrow();
      expect(row.browser).toBe('chrome');
      expect(row.browserMajor).toBe(141);
      expect(JSON.stringify(row)).not.toMatch(/Mozilla|AppleWebKit|Windows/);
    });

    it('answers reference null, not an error, for a body it cannot use', async () => {
      for (const body of [{}, { stack: 'at a (/x.jsx:1:2)' }, []]) {
        const res = await agent
          .post('/api/v1/crash-reports')
          .set('Origin', ORIGIN)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(body))
          .expect(200);
        expect(res.body.data.reference).toBeNull();
      }
      expect(await prisma.crashReport.count()).toBe(0);
    });
  });

  describe('the 1,000-row cap', () => {
    const seed = (rows: number) =>
      prisma.$executeRaw`
        INSERT INTO crash_reports (id, dedupe_hash, boundary, error_name, message, web_version,
                                   browser, count, first_seen_at, last_seen_at)
        SELECT gen_random_uuid(), encode(sha256(('seed' || g)::bytea), 'hex'), 'route', 'Error', '',
               '1.0.0', 'other', 1, now(), now()
        FROM generate_series(1, ${rows}::int) g`;

    it('drops a NEW fingerprint at the cap and still counts a repeat', async () => {
      const first = await post(BODY).expect(200);
      await seed(999);
      expect(await prisma.crashReport.count()).toBe(1_000);

      const repeat = await post(BODY).expect(200);
      expect(repeat.body.data.reference).toBe(first.body.data.reference);
      expect(
        (await prisma.crashReport.findFirstOrThrow({ where: { errorName: 'TypeError' } })).count,
      ).toBe(2);

      const fresh = await post({ ...BODY, message: 'a different crash' }).expect(200);
      expect(fresh.body.data.reference).toBeNull();
      expect(await prisma.crashReport.count()).toBe(1_000);
    });

    it('admits a new fingerprint just under the cap', async () => {
      await seed(999);

      const res = await post(BODY).expect(200);

      expect(res.body.data.reference).not.toBeNull();
      expect(await prisma.crashReport.count()).toBe(1_000);
    });
  });

  it('throttles the 11th request in a minute (429) and the first ten are not', async () => {
    for (let i = 0; i < 10; i += 1) await post({}).expect(200);

    await post({}).expect(429);
  });

  describe('a failed write', () => {
    it('answers reference null and logs a SQLSTATE and constraint, never the content', async () => {
      // A trigger rather than a privilege: the test database role is a superuser, and a superuser
      // bypasses privilege checks (`retention-sweep.e2e-spec.ts`). The message and DETAIL mimic a
      // real CHECK violation, whose DETAIL is `Failing row contains (…)` — the content that must
      // never reach a log.
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION crash_reports_refuse_insert() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'new row for relation "crash_reports" violates check constraint "ck_crash_reports_message_length"'
            USING ERRCODE = '23514', DETAIL = 'Failing row contains (HOSTILE-CONTENT)';
        END;
        $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER tr_crash_reports_refuse_insert BEFORE INSERT ON crash_reports
        FOR EACH ROW EXECUTE FUNCTION crash_reports_refuse_insert()`);
      const logger = (service as unknown as { logger: { warn: (...args: unknown[]) => void } })
        .logger;
      const warn = vi.spyOn(logger, 'warn');

      try {
        const res = await post({ ...BODY, message: 'HOSTILE-CONTENT' }).expect(200);

        expect(res.body.data.reference).toBeNull();
        expect(await prisma.crashReport.count()).toBe(0);
        const logged = warn.mock.calls.find(
          ([fields]) => (fields as { event?: string }).event === 'crash_report.persist_failed',
        );
        expect(logged?.[0]).toMatchObject({ sqlstate: '23514' });
        expect(JSON.stringify(warn.mock.calls)).not.toContain('HOSTILE-CONTENT');
      } finally {
        warn.mockRestore();
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS tr_crash_reports_refuse_insert ON crash_reports',
        );
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS crash_reports_refuse_insert()');
      }
    });
  });
});
