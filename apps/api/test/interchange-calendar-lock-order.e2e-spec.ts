import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient, type Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { acquireCalendarWriteLock } from '../src/common/db/calendar-advisory-lock';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * An import takes the calendar locks BEFORE the project chain (ADR-0208 D3).
 *
 * Every other path that holds a calendar and an ancestor takes the calendar first
 * (`CalendarsService.restore`, `HierarchyLifecycleService.restoreBatch`). The import used to take only
 * the chain. A reusing import that took the chain first and then waited for a calendar lock would sit
 * on `FOR SHARE` of the client and project while a project delete queued for `FOR NO KEY UPDATE`
 * behind it, and a calendar write that already held the calendar lock and wanted the same ancestors
 * would queue behind that delete: a cycle of three.
 *
 * **Deterministic by construction, never a race** (the `hierarchy-cascade-lock-order` precedent). The
 * test parks its own transaction on the calendar's advisory lock, sends the real import, waits until
 * the import's backend reports it is waiting for that lock, and then asks whether the project row can
 * still be taken `FOR NO KEY UPDATE NOWAIT`. If the import were holding the ancestors while it waited
 * for the calendar, that probe would fail with `55P03`. What the request holds while it waits is the
 * whole claim.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const ORG = '/api/v1/organizations/acme';

type Tx = Prisma.TransactionClient;

/** A calendar-bearing XER (Mon–Fri 08:00–16:00, one New Year exception). */
function xer(projectName: string): string {
  const workDay = (day: number): string => `(0||${day}()( (0||0(s|08:00|f|16:00)) ))`;
  const restDay = (day: number): string => `(0||${day}()())`;
  const days = [restDay(1), ...[2, 3, 4, 5, 6].map(workDay), restDay(7)].join('');
  const data = `(0||CalendarData()( (0||DaysOfWeek()( ${days} )) (0||Exceptions()( (0||d|46023()()) )) ))`;
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    `%R\tP1\t${projectName}\t2026-01-05 00:00\t2026-01-04 00:00\tC1`,
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tdefault_flag\tday_hr_cnt\tclndr_data',
    `%R\tC1\tSite 6-Day\tY\t8\t${data}`,
    '%T\tTASK',
    '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tC1\tA1000\tMobilise\tTT_Task\t40',
    '%E',
  ].join('\n');
}

describe.skipIf(!hasDatabase)('Interchange calendar lock order (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /** The test's own connections, so a parked transaction cannot starve the request under test. */
  let aux: PrismaClient;
  let agent: ReturnType<typeof request.agent>;

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
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.searchParams.set('connection_limit', '4');
    aux = new PrismaClient({ datasourceUrl: url.toString() });
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await aux?.$disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
  });

  async function hold(take: (tx: Tx) => Promise<void>): Promise<() => Promise<void>> {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let ready!: () => void;
    const started = new Promise<void>((resolve) => (ready = resolve));
    const done = aux.$transaction(
      async (tx) => {
        await take(tx);
        ready();
        await gate;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    const settled = done.catch(() => undefined);
    await Promise.race([
      started,
      done.then(() => {
        throw new Error('the held transaction ended before it was released');
      }),
    ]);
    return async () => {
      open();
      await settled;
    };
  }

  async function waitUntilAdvisoryBlocked(): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await aux.$queryRaw<{ wait_event: string }[]>`
        SELECT wait_event FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND wait_event = 'advisory'
          AND query ILIKE '%pg_advisory_xact_lock%'`;
      if (rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('the import did not wait on the calendar advisory lock within 10 s');
  }

  it('waits for a calendar lock while holding no ancestor row', async () => {
    const client = await agent.post(`${ORG}/clients`).send({ name: 'Northgate' }).expect(201);
    const clientId = client.body.data.id as string;
    const project = await agent
      .post(`${ORG}/clients/${clientId}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const projectId = project.body.data.id as string;
    const commit = `${ORG}/projects/${projectId}/interchange/commit`;

    const first = await agent
      .post(commit)
      .attach('file', Buffer.from(xer('Rev A'), 'utf8'), 'a.xer')
      .expect(201);
    const seeded = await prisma.plan.findUniqueOrThrow({ where: { id: first.body.data.planId } });
    const calendarId = seeded.calendarId as string;

    const release = await hold((tx) => acquireCalendarWriteLock(tx, calendarId));
    let status: Promise<number> | undefined;
    try {
      status = agent
        .post(commit)
        .attach('file', Buffer.from(xer('Rev B'), 'utf8'), 'b.xer')
        .then((res) => res.status);
      await waitUntilAdvisoryBlocked();

      // The import is parked on the calendar. If it already held the client or project `FOR SHARE`,
      // these probes would fail with 55P03 (lock not available).
      await expect(
        aux.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR NO KEY UPDATE NOWAIT`,
      ).resolves.toBeDefined();
      await expect(
        aux.$queryRaw`SELECT id FROM clients WHERE id = ${clientId}::uuid FOR NO KEY UPDATE NOWAIT`,
      ).resolves.toBeDefined();
    } finally {
      await release();
    }

    expect(await status).toBe(201);
    const second = await prisma.plan.findFirstOrThrow({ where: { projectId, name: 'Rev B' } });
    expect(second.calendarId).toBe(calendarId);
  });
});
