import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

// TEMPORARY REVIEW PROBE — deleted after the run. Not a shipped test.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('PROBE', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: { record: (r: readonly unknown[]) => Promise<void> };

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: T } = await import('../src/prisma/prisma.service');
    const { CspReportService } = await import('../src/modules/csp/csp-report.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(T);
    service = app.get(CspReportService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await prisma.cspReport.deleteMany();
  });

  const rep = (path: string) => ({
    effectiveDirective: 'script-src',
    blockedUri: 'inline',
    documentUri: `https://app.example/${path}`,
    disposition: 'report',
  });

  it('PROBE C: what SQL does the upsert emit', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const c = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    const seen: string[] = [];
    // @ts-expect-error event typing
    c.$on('query', (e: { query: string }) => seen.push(e.query));
    const h = 'e'.repeat(64);
    for (let i = 0; i < 2; i += 1) {
      await c.cspReport.upsert({
        where: { dedupeHash: h },
        update: { count: { increment: 1 }, lastSeenAt: new Date() },
        create: {
          dedupeHash: h,
          effectiveDirective: 'img-src',
          blockedUri: 'data',
          documentUri: 'https://a/',
          disposition: 'report',
        },
      });
    }
    await new Promise((r) => setTimeout(r, 300));
    console.log('PROBE C SQL:\n' + seen.join('\n>> '));
    await c.$disconnect();
    await prisma.cspReport.deleteMany();
  });

  it('PROBE D: concurrent FIRST report of the same violation (service level)', async () => {
    const N = 16;
    await Promise.all(Array.from({ length: N }, () => service.record([rep('race')])));
    const rows = await prisma.cspReport.findMany();
    console.log(
      `PROBE D: ${N} concurrent records -> rows=${rows.length} count=${rows[0]?.count} (lost=${N - (rows[0]?.count ?? 0)})`,
    );
  });

  it('PROBE D2: concurrent repeats on an EXISTING row', async () => {
    await service.record([rep('race2')]);
    const N = 16;
    await Promise.all(Array.from({ length: N }, () => service.record([rep('race2')])));
    const rows = await prisma.cspReport.findMany();
    console.log(
      `PROBE D2: 1 + ${N} concurrent -> rows=${rows.length} count=${rows[0]?.count} (expected ${N + 1})`,
    );
  });

  it('PROBE E: repeat updates, HOT and index bloat', async () => {
    await prisma.$executeRawUnsafe(
      `select pg_stat_reset_single_table_counters('csp_reports'::regclass)`,
    );
    for (let i = 0; i < 500; i += 1) await service.record([rep('hot')]);
    const stats = await prisma.$queryRawUnsafe(
      `select n_tup_upd, n_tup_hot_upd, n_dead_tup, pg_relation_size('csp_reports') tbl,
              pg_relation_size('csp_reports_last_seen_at_id_idx') idx
       from pg_stat_user_tables where relname='csp_reports'`,
    );
    console.log(
      'PROBE E:',
      JSON.stringify(stats, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
    );
  });

  it('PROBE F: clock-skew reachability of ck_csp_reports_seen_order', async () => {
    const rows = await prisma.$queryRawUnsafe(`select now() as db_now`);
    console.log('PROBE F db_now:', JSON.stringify(rows), 'app_now:', new Date().toISOString());
  });
});
