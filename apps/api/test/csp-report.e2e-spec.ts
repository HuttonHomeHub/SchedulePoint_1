import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * The CSP sink against a real database (staff console M4).
 *
 * The unit suite proves the parser; only this proves the **route** — that it is reachable without a
 * session, that it answers 204 to everything, and that the dedup upsert actually deduplicates
 * rather than erroring on the unique index. That last one is the reason this file exists: the key
 * is a hash precisely because an 8 KB attacker-controlled URI indexed directly would make the
 * INSERT fail, and "fails on hostile input" is invisible to any test that only sends realistic
 * input.
 *
 * M2 shipped unable to serve a request with 1,589 unit tests green, because they all mock Prisma.
 * This is the gate that class of defect cannot pass.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('CSP report sink (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
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
  });

  beforeEach(async () => {
    await prisma.cspReport.deleteMany();
  });

  const server = () => app.getHttpServer();
  const legacy = (blockedUri: string) => ({
    'csp-report': {
      'document-uri': 'https://app.example/plans/42',
      'effective-directive': 'script-src-elem',
      'blocked-uri': blockedUri,
    },
  });

  it('accepts a report with NO session and records it', async () => {
    // Unauthenticated by necessity: a browser cannot authenticate a violation report.
    //
    // **`Content-Type: application/csp-report`, which is what a browser actually sends.** This
    // suite used supertest's `.send(obj)` default of `application/json` — a type no browser uses
    // for a violation report — and every test passed against an endpoint that recorded nothing at
    // all, because the parser was registered for `application/json` only. A test that sends
    // something the real client never sends measures the wrong thing however green it is.
    await request(server())
      .post('/api/v1/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(legacy('inline')))
      .expect(204);

    const rows = await prisma.cspReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      effectiveDirective: 'script-src-elem',
      blockedUri: 'inline',
      count: 1,
      // NULL, not 'report': the legacy body carries no disposition in every engine, and inventing
      // one would read a real block as hypothetical — see `csp-report-body.ts`.
      disposition: null,
    });
  });

  it('deduplicates a repeat rather than inserting again', async () => {
    // The design, not an optimisation: one misconfigured resource on a busy route would otherwise
    // bury the second, rarer violation that actually needed reading.
    for (let i = 0; i < 5; i += 1) {
      await request(server()).post('/api/v1/csp-report').send(legacy('inline')).expect(204);
    }

    const rows = await prisma.cspReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(5);
    // `first_seen_at` must NOT move — it is the fact that makes "this started when we deployed X"
    // answerable at all.
    expect(rows[0]?.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      rows[0]?.firstSeenAt.getTime() ?? 0,
    );
  });

  it('survives a hostile 8 KB URI, and still deduplicates it', async () => {
    // The reason the dedup key is a hash. A btree index row caps near 2704 bytes, so indexing the
    // URI directly would make this INSERT fail — on an unauthenticated endpoint, which would let a
    // hostile report deny the reporting this table exists to collect.
    // **INCOMPRESSIBLE, and that is the whole point.** This test used `'a'.repeat(8_192)` and its
    // comment claimed it proved the hazard. It did not: a btree compresses index tuples, so 8 KB of
    // one character fits comfortably and the test would have passed with no hash at all. Measured
    // during the schema review — a plain three-column unique index accepts the repeated string and
    // fails at 2,700 characters of RANDOM text with "index row size 2776 exceeds btree version 4
    // maximum 2704". A test that cannot fail against the defect it names is worse than no test.
    // Alphanumerics only, in a non-repeating order. Both halves matter: incompressible, AND free of
    // `?`/`#`, which `clean()` correctly treats as the start of a query or fragment and truncates
    // at — the first attempt at this string included them and produced an 81-character URI, so it
    // measured the stripper rather than the index.
    const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const huge = `https://evil.example/${Array.from(
      { length: 8_192 },
      (_v, i) => ALPHABET[(i * 31 + ((i * i) % 61)) % ALPHABET.length] ?? 'x',
    ).join('')}`;

    await request(server()).post('/api/v1/csp-report').send(legacy(huge)).expect(204);
    await request(server()).post('/api/v1/csp-report').send(legacy(huge)).expect(204);

    const rows = await prisma.cspReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(2);
    // Capped by the producer, well inside the column's CHECK.
    expect(rows[0]?.blockedUri.length).toBe(1_024);
  });

  it('accepts the Reporting API batch shape too', async () => {
    await request(server())
      .post('/api/v1/csp-report')
      .send([
        { type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'data' } },
        { type: 'csp-violation', body: { effectiveDirective: 'font-src', blockedURL: 'data' } },
      ])
      .expect(204);

    expect(await prisma.cspReport.count()).toBe(2);
  });

  it.each([
    ['garbage JSON object', { nonsense: true }],
    ['an empty array', []],
    ['a bare string', 'hello'],
  ])('answers 204 and records nothing for %s', async (_label, body) => {
    // A report endpoint that returned errors would tell an attacker their probe was interesting,
    // and there is no caller to inform — a browser does not read this response.
    await request(server()).post('/api/v1/csp-report').send(body).expect(204);

    expect(await prisma.cspReport.count()).toBe(0);
  });

  it('loses nothing when a NEW violation arrives from several browsers at once', async () => {
    // The regression test for a defect that silently lost reports, and the loss fell entirely on a
    // violation's FIRST burst — exactly when a newly-shipped policy breaks something for several
    // people at once, and exactly the count that decides whether to enforce.
    //
    // The cause was two clocks in one statement: `first_seen_at` stamped by the Prisma engine as it
    // built the INSERT, `last_seen_at` a `new Date()` taken a millisecond earlier in the process.
    // The loser of the insert race wrote a `last_seen_at` older than the winner's `first_seen_at`,
    // `ck_csp_reports_seen_order` refused it, and the endpoint swallowed the failure. Measured
    // before the fix: 16 concurrent reports recorded `count = 1`.
    // Driven at the SERVICE rather than through HTTP, deliberately. Sixteen concurrent supertest
    // requests reset the connection and — worse — their in-flight writes leaked past `beforeEach`
    // into the following test, so the harness was measuring itself. The defect is in the statement,
    // not the transport, so this is where it belongs.
    const { CspReportService } = await import('../src/modules/csp/csp-report.service');
    const service = app.get(CspReportService);
    const report = {
      effectiveDirective: 'script-src',
      blockedUri: 'https://cdn.example/burst.js',
      documentUri: 'https://app.example/plans/42',
      disposition: null,
      sourceFile: null,
      lineNumber: null,
      columnNumber: null,
    };

    const burst = 16;
    await Promise.all(Array.from({ length: burst }, () => service.record([report])));

    const rows = await prisma.cspReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(burst);
  });

  it('keeps a report-only observation separate from a real enforced block', async () => {
    // `disposition` is part of the dedup key, and this is the assertion that says why. Without it,
    // 500 report-only observations and one real block collapse into `count = 501,
    // disposition = 'enforce'` — which claims 501 people were blocked when one was, on exactly the
    // transition this table exists to inform, and a reader cannot recover the truth from it.
    //
    // Conflation and fragmentation are not symmetric: one is invisible and overstates harm, the
    // other is visible and adds up. This pins the safe direction.
    const violation = (disposition: string) => ({
      'csp-report': {
        'document-uri': 'https://app.example/plans/42',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
        disposition,
      },
    });

    for (let i = 0; i < 3; i += 1) {
      await request(server())
        .post('/api/v1/csp-report')
        .set('Content-Type', 'application/csp-report')
        .send(JSON.stringify(violation('report')))
        .expect(204);
    }
    await request(server())
      .post('/api/v1/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(violation('enforce')))
      .expect(204);

    const rows = await prisma.cspReport.findMany({ orderBy: { count: 'desc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ disposition: 'report', count: 3 });
    expect(rows[1]).toMatchObject({ disposition: 'enforce', count: 1 });
  });

  it('strips the query string, so a share token cannot land in this table', async () => {
    await request(server())
      .post('/api/v1/csp-report')
      .send({
        'csp-report': {
          'document-uri': 'https://app.example/share?token=sp_share_secret',
          'effective-directive': 'script-src',
          'blocked-uri': 'inline',
        },
      })
      .expect(204);

    const row = await prisma.cspReport.findFirst();
    expect(row?.documentUri).toBe('https://app.example/share');
    expect(row?.documentUri).not.toContain('sp_share_secret');
  });
});
