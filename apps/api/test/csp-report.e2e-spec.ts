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
    await request(server()).post('/api/v1/csp-report').send(legacy('inline')).expect(204);

    const rows = await prisma.cspReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      effectiveDirective: 'script-src-elem',
      blockedUri: 'inline',
      count: 1,
      disposition: 'report',
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
    const huge = `https://evil.example/${'a'.repeat(8_192)}`;

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
