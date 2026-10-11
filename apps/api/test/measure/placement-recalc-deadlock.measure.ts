/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return --
   Supertest bodies are untyped JSON and this is a measurement script, not a contract test. */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { configureHttpApp } from '../../src/app-setup';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { clearDomainData } from '../audit-reset';

/**
 * Correctness sweep M2-T0 (`docs/TECH_DEBT.md` #440) — does a placement batch overlapping a
 * recalculation deadlock, and how long does the recalculation's result write take at 2,000 rows?
 *
 * Run against a DISPOSABLE database with migrations applied:
 *
 *   DATABASE_URL=postgresql://…/app_measure MEASURE_OUT=/path/run.json MEASURE_ROUNDS=200 \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts \
 *     test/measure/placement-recalc-deadlock.measure.ts
 *
 * Each round fires one `PATCH …/activities/placements` over every activity of a 2,000-activity plan,
 * in REVERSE id order, and one `POST …/schedule/recalculate` together. The deadlock count is read
 * from `pg_stat_database.deadlocks`, the server's own counter, so it does not depend on what the API
 * logs or how its filter maps the error; the HTTP statuses are recorded beside it. A count of zero
 * before the change is a possible and honest outcome: whether Postgres deadlocks depends on the join
 * plan it picks, which is the argument the fix rests on, not this number.
 */
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const ROWS = Number(process.env.MEASURE_ROWS ?? 2000);
const ROUNDS = Number(process.env.MEASURE_ROUNDS ?? 200);

describe.skipIf(!process.env.DATABASE_URL)('placement vs recalculation deadlock', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const out: Record<string, any> = {};

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    process.env.RATE_LIMIT_LIMIT ??= '1000000';
    const { AppModule } = await import('../../src/app.module');
    const { PrismaService: Token } = await import('../../src/prisma/prisma.service');
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
    if (process.env.MEASURE_OUT)
      writeFileSync(process.env.MEASURE_OUT, JSON.stringify(out, null, 2));
    await app?.close();
  });

  it('runs the rounds', async () => {
    // The database is disposable by contract (see above); start from an empty one so the slug is stable.
    await clearDomainData(prisma);
    const API = '/api/v1/organizations/acme';
    const agent = request.agent(app.getHttpServer());
    const email = `measure-${Date.now()}@example.com`;
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'measure', email, password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent.post(`${API}/clients`).send({ name: 'C' }).expect(201);
    const project = await agent
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name: 'P' })
      .expect(201);
    const plan = await agent
      .post(`${API}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Deadlock', plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await agent.post(`${API}/plans/${planId}/edit-lock`).send({}).expect(200);

    const org = await prisma.organization.findFirstOrThrow({ where: { slug: 'acme' } });
    await prisma.activity.createMany({
      data: Array.from({ length: ROWS }, (_, i) => ({
        organizationId: org.id,
        planId,
        name: `A${i}`,
        durationMinutes: 480 * (1 + (i % 9)),
        laneIndex: i % 40,
      })),
    });
    // Other tenants' work, so the planner sees a table where one plan is a small fraction of it, as
    // production is. Without it every statement here is a scan of a table that is all one plan, and
    // the ordered lock's plan choice (index or sequential) is decided by an artefact.
    const noisePlans = Number(process.env.MEASURE_NOISE_PLANS ?? 50);
    const projectRow = await prisma.plan.findFirstOrThrow({
      where: { id: planId },
      select: { projectId: true },
    });
    for (let i = 0; i < noisePlans; i += 1) {
      const other = await prisma.plan.create({
        data: {
          organizationId: org.id,
          projectId: projectRow.projectId,
          name: `Noise ${i}`,
          plannedStart: new Date('2026-01-05'),
        },
      });
      await prisma.activity.createMany({
        data: Array.from({ length: ROWS }, (_, j) => ({
          organizationId: org.id,
          planId: other.id,
          name: `N${j}`,
          durationMinutes: 480,
          laneIndex: j % 40,
        })),
      });
    }
    await prisma.$executeRaw`VACUUM ANALYZE activities`;
    out.noiseActivities = noisePlans * ROWS;

    await agent.post(`${API}/plans/${planId}/schedule/recalculate`).send({}).expect(200);

    const rows = await prisma.activity.findMany({
      where: { planId, deletedAt: null },
      select: { id: true, version: true },
      orderBy: { id: 'desc' },
    });
    const versions = new Map(rows.map((r) => [r.id, r.version]));
    const deadlocksNow = async (): Promise<number> => {
      const r: any[] = await prisma.$queryRaw`
        SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`;
      return r[0].n as number;
    };

    // The cost of the result write alone: a serial recalculation of the whole plan, no contention.
    // `writeResults` is where the ordered pre-lock is added, so this is the figure that moves.
    const serialMs: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const t0 = performance.now();
      await agent.post(`${API}/plans/${planId}/schedule/recalculate`).send({}).expect(200);
      serialMs.push(performance.now() - t0);
    }
    out.serialRecalcMedianMs = Math.round(
      [...serialMs].sort((a, b) => a - b)[Math.floor(serialMs.length / 2)] ?? 0,
    );
    out.serialRecalcMs = serialMs.map(Math.round);

    const before = await deadlocksNow();
    const statuses: Record<string, number> = {};
    const placementMs: number[] = [];
    const recalcMs: number[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const body = {
        placements: rows.map((r, i) => ({
          id: r.id,
          version: versions.get(r.id),
          constraintType: null,
          constraintDate: null,
          visualStart: null,
          laneIndex: (i + round) % 40,
        })),
      };
      const t0 = performance.now();
      const [placed, recalculated] = await Promise.all([
        agent
          .patch(`${API}/plans/${planId}/activities/placements`)
          .send(body)
          .then((res) => {
            placementMs.push(performance.now() - t0);
            return res;
          }),
        agent
          .post(`${API}/plans/${planId}/schedule/recalculate`)
          .send({})
          .then((res) => {
            recalcMs.push(performance.now() - t0);
            return res;
          }),
      ]);
      for (const res of [placed, recalculated]) {
        statuses[String(res.status)] = (statuses[String(res.status)] ?? 0) + 1;
      }
      if (placed.status === 200)
        for (const r of rows) versions.set(r.id, (versions.get(r.id) ?? 0) + 1);
      else {
        const fresh = await prisma.activity.findMany({
          where: { planId, deletedAt: null },
          select: { id: true, version: true },
        });
        for (const r of fresh) versions.set(r.id, r.version);
      }
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    out.rows = ROWS;
    out.rounds = ROUNDS;
    out.deadlocksDuringRun = (await deadlocksNow()) - before;
    out.httpStatuses = statuses;
    out.placementMedianMs = Math.round(median(placementMs));
    out.recalcMedianMs = Math.round(median(recalcMs));
    out.recalcByRoundMs = recalcMs.map(Math.round);

    // The join the statements choose, and the locking the change adds, for the record.
    const ids = rows.map((r) => r.id);
    const explain = async (label: string, sql: string, params: unknown[]) => {
      const plan = await prisma.$transaction(async (tx) => {
        const r: any[] = await tx.$queryRawUnsafe(`EXPLAIN ${sql}`, ...params);
        return r.map((x) => x['QUERY PLAN']).join('\n');
      });
      out[`explain.${label}`] = plan;
    };
    await explain(
      'placementUpdate',
      `UPDATE activities AS a SET lane_index = v.lane_index FROM unnest($1::uuid[], $2::int[]) AS v(id, lane_index) WHERE a.id = v.id AND a.plan_id = $3::uuid AND a.deleted_at IS NULL`,
      [ids, ids.map((_, i) => i % 40), planId],
    );
    await explain(
      'orderedLock',
      `SELECT 1 FROM activities WHERE id IN (SELECT u FROM unnest($1::uuid[]) AS u) AND plan_id = $2::uuid AND deleted_at IS NULL ORDER BY id FOR NO KEY UPDATE`,
      [ids, planId],
    );
    await clearDomainData(prisma);
  });
});
