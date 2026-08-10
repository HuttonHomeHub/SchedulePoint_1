import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * The retention sweep against a real Postgres (ADR-0087, M1).
 *
 * **This is the only place the delete can be proven.** A unit test with a mocked Prisma accepts any
 * statement — which is exactly how ADR-0086 M2 shipped a feature that could not serve a single
 * request with 1,589 unit tests green. The statement here uses `ctid`, a bounded `LIMIT` and a
 * literal table name; whether that is *valid SQL against this schema* is a question only a real
 * database answers.
 *
 * It drives `RetentionSweepRunner` **directly**. No timer is involved and none is created: M1 ships
 * dark, so nothing in the wired application calls this yet.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Far enough past both periods (30 days and 365) that one constant serves both tables. */
const LONG_AGO = new Date('2020-01-01T00:00:00.000Z');
const RECENT = new Date();

describe.skipIf(!hasDatabase)('Retention sweep (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let runner: import('../src/common/operational/retention-sweep.runner').RetentionSweepRunner;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';

    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    const { RetentionSweepRunner } =
      await import('../src/common/operational/retention-sweep.runner');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaServiceToken);
    // `strict: false` searches the whole container. `OperationalModule` deliberately does not export
    // the runner — it is the piece that executes the `DELETE`, and exporting it from a `@Global()`
    // module made it injectable from any controller in the application, which is the opposite of
    // the boundary that module's docblock spends a paragraph describing.
    runner = app.get(RetentionSweepRunner, { strict: false });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await prisma.cspReport.deleteMany();
    await prisma.mailEvent.deleteMany();
  });

  /** A CSP row with independently-controlled first/last timestamps — the distinction under test. */
  const cspRow = (suffix: string, firstSeenAt: Date, lastSeenAt: Date) =>
    prisma.cspReport.create({
      data: {
        // The dedupe hash has a shape CHECK (`^[0-9a-f]{64}$`), so it cannot be an arbitrary string.
        dedupeHash: suffix.padStart(64, '0'),
        effectiveDirective: 'script-src',
        blockedUri: 'inline',
        documentUri: `https://app.example/plans/${suffix}`,
        firstSeenAt,
        lastSeenAt,
      },
    });

  const mailRow = (recipient: string, occurredAt: Date) =>
    prisma.mailEvent.create({
      data: { kind: 'password_reset', outcome: 'FAILED', recipient, occurredAt },
    });

  it('deletes expired CSP reports and keeps fresh ones', async () => {
    await cspRow('a1', LONG_AGO, LONG_AGO);
    await cspRow('b2', RECENT, RECENT);

    const [result] = await runner.sweepAll(new Date());

    expect(result?.table).toBe('csp_reports');
    expect(result?.deleted).toBe(1);
    const survivors = await prisma.cspReport.findMany({ select: { documentUri: true } });
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.documentUri).toContain('b2');
  });

  it('KEEPS a violation that is old but still being reported', async () => {
    // The distinction the whole policy turns on, and the one a later "tidy-up" would break by
    // switching the predicate to `first_seen_at`. This row was first seen in 2020 and last seen
    // moments ago: it is a live finding, and expiring it would remove it from the Security panel
    // — the one screen built to show what the policy is blocking now.
    await cspRow('c3', LONG_AGO, RECENT);

    await runner.sweepAll(new Date());

    expect(await prisma.cspReport.count()).toBe(1);
  });

  it('deletes an expired mail event, and with it the recipient address', async () => {
    // The privacy half. ADR-0085 kept this address erasable and nothing ever erased it; the row
    // going is the point, so the assertion is on the address rather than only on the count.
    await mailRow('old@example.test', LONG_AGO);
    await mailRow('recent@example.test', RECENT);

    const results = await runner.sweepAll(new Date());

    const mail = results.find((r) => r.table === 'mail_events');
    expect(mail?.deleted).toBe(1);
    const left = await prisma.mailEvent.findMany({ select: { recipient: true } });
    expect(left.map((r) => r.recipient)).toEqual(['recent@example.test']);
  });

  it('keeps a row exactly at the cutoff', async () => {
    // The predicate is `<`, so equality survives — the safe direction on something irreversible.
    const now = new Date('2026-08-10T12:00:00.000Z');
    const exactly = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    await cspRow('d4', exactly, exactly);

    await runner.sweepAll(now);

    expect(await prisma.cspReport.count()).toBe(1);
  });

  it('drains across multiple batches, and reports how many it took', async () => {
    // More rows than one batch, so the loop's termination is exercised against real row counts
    // rather than a mock's return value.
    await prisma.$executeRaw`
      INSERT INTO csp_reports (id, dedupe_hash, effective_directive, blocked_uri, document_uri,
                               first_seen_at, last_seen_at)
      SELECT gen_random_uuid(), encode(sha256(g::text::bytea), 'hex'), 'script-src', 'inline',
             'https://app.example/p/' || g,
             now() - interval '400 days', now() - interval '400 days'
      FROM generate_series(1, 1500) g`;

    const [result] = await runner.sweepAll(new Date());

    expect(result?.deleted).toBe(1500);
    expect(result?.batches).toBeGreaterThan(1);
    expect(result?.cappedOut).toBe(false);
    expect(await prisma.cspReport.count()).toBe(0);
  });

  it('leaves audit_events untouched, and that table still refuses DELETE', async () => {
    // Two assertions, and the second is the one that matters. The first proves the sweep does not
    // touch the audit log; the second proves nothing in this epic RELAXED the guarantee that it
    // could not, which is the property ADR-0085 D1 refused to trade away. A future sweep that
    // added the table would meet this error rather than quietly succeeding.
    // A REAL row, and that detail is the test's whole validity. The first version asserted on
    // `DELETE FROM audit_events WHERE false` and passed while proving nothing: the guard is a
    // `BEFORE DELETE ... FOR EACH ROW` trigger, so a delete that matches no rows never fires it.
    // A guarantee about rows has to be attacked with a row.
    await prisma.auditEvent.create({
      data: {
        action: 'staff.session_started',
        outcome: 'SUCCESS',
        actorType: 'SYSTEM',
        subjectType: 'RetentionSweepTest',
      },
    });
    const before = await prisma.auditEvent.count();
    expect(before).toBeGreaterThan(0);

    await runner.sweepAll(new Date());

    expect(await prisma.auditEvent.count()).toBe(before);
    await expect(
      prisma.$executeRaw`DELETE FROM audit_events WHERE subject_type = 'RetentionSweepTest'`,
    ).rejects.toThrow();
    await clearAuditEvents(prisma);
  });
});
