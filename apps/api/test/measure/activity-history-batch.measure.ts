/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   Supertest bodies are untyped JSON and this is a measurement script, not a contract test. */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { configureHttpApp } from '../../src/app-setup';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { resetThrottleCounters } from '../throttle-reset';

/**
 * ADR-0174 M2-T5 — what does recording a batch cost at the 2,000-activity scale?
 *
 * Run against a DISPOSABLE database that has had `prisma migrate deploy` applied:
 *
 *   DATABASE_URL=postgresql://…/app_measure_batch MEASURE_OUT=/path/run.json \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts \
 *     test/measure/activity-history-batch.measure.ts
 *
 * Pass bar (plan M2-T5): added time at most 25 % of the route's own time and at most 150 ms absolute.
 * A miss returns to database-architect.
 *
 * **"Without recording"** stubs the recorder's `record`, `recordKnockOn` and its two batch builders
 * on the singleton instance, as the M1 harness does — there is no production toggle. The difference
 * between the arms is everything recording adds: the exclusive plan lock, the probe, the entry
 * write. Two things are NOT separable and are stated rather than hidden: the delete's link sweep
 * `RETURNING`s its rows in both arms (the pre-feature `updateMany` returned a count), and the
 * placements route's before-values ride on a read it already made. Each arm runs interleaved, in a
 * random order, on freshly built identical data, so machine drift lands on both.
 */
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';
const ROWS = 2000;
const ITER = Number(process.env.MEASURE_ITER ?? 8);
const BRANCH_CHILDREN = 200;
const LINKS_PER_CHILD = 10;

type Json = Record<string, any>;
/** Median without, median with, worst without, worst with (ms). */
type Summary = [number, number, number, number];

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
};
const worst = (xs: number[]): number => Math.max(...xs);

describe.skipIf(!process.env.DATABASE_URL)('activity history batch measurement', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttler: ThrottlerStorage;
  const out: Json = {};

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
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
    throttler = app.get<ThrottlerStorage>(ThrottlerStorage);
  });

  afterAll(async () => {
    if (process.env.MEASURE_OUT)
      writeFileSync(process.env.MEASURE_OUT, JSON.stringify(out, null, 2));
    await app?.close();
  });

  it('measures', async () => {
    const { ActivityHistoryRecorder } =
      await import('../../src/modules/activity-history/activity-history.recorder');
    const recorder = app.get(ActivityHistoryRecorder, { strict: false });
    let recording = true;
    const real = {
      record: recorder.record.bind(recorder),
      recordKnockOn: recorder.recordKnockOn.bind(recorder),
      placementWrites: recorder.placementWrites.bind(recorder),
    };
    const patched = recorder as unknown as Record<string, unknown>;
    patched.record = (...a: Parameters<typeof real.record>) =>
      recording ? real.record(...a) : Promise.resolve();
    patched.recordKnockOn = (...a: Parameters<typeof real.recordKnockOn>) =>
      recording ? real.recordKnockOn(...a) : Promise.resolve();
    patched.placementWrites = (...a: Parameters<typeof real.placementWrites>) =>
      recording ? real.placementWrites(...a) : [];

    const calm = () => resetThrottleCounters(throttler);
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: `admin-${String(Date.now())}@example.com`, password: PASSWORD })
      .expect(200);
    const org = await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const organizationId = org.body.data.id as string;
    const client = await agent.post(`${API}/clients`).send({ name: 'Northgate' }).expect(201);
    const project = await agent
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);

    const newPlan = async (name: string): Promise<string> =>
      (
        await agent
          .post(`${API}/projects/${project.body.data.id}/plans`)
          .send({ name, plannedStart: '2026-01-01' })
          .expect(201)
      ).body.data.id as string;

    async function placements(): Promise<Summary> {
      const without: number[] = [];
      const withRec: number[] = [];
      const planId = await newPlan('Scale');
      await prisma.activity.createMany({
        data: Array.from({ length: ROWS }, (_, i) => ({
          organizationId,
          planId,
          name: `Bar ${String(i).padStart(4, '0')}`,
          durationMinutes: 7200,
        })),
      });
      for (let i = 0; i < ITER * 2 + 2; i += 1) {
        const arm = i < 2 ? 'warm' : i % 2 === 0 ? 'with' : 'without';
        recording = arm !== 'without';
        const rows = await prisma.activity.findMany({ where: { planId } });
        const day = `2026-${String((i % 9) + 2).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`;
        const body = {
          placements: rows.map((r) => ({
            id: r.id,
            version: r.version,
            constraintType: 'SNET',
            constraintDate: day,
            visualStart: day,
            laneIndex: null,
          })),
        };
        calm();
        const t0 = performance.now();
        await agent.patch(`${API}/plans/${planId}/activities/placements`).send(body).expect(200);
        const ms = performance.now() - t0;
        if (arm === 'with') withRec.push(ms);
        if (arm === 'without') without.push(ms);
      }
      out.placements = { without, with: withRec };
      return [median(without), median(withRec), worst(without), worst(withRec)];
    }

    async function branchDelete(): Promise<Summary> {
      const without: number[] = [];
      const withRec: number[] = [];
      for (let i = 0; i < ITER * 2; i += 1) {
        const arm = i % 2 === 0 ? 'with' : 'without';
        recording = arm === 'with';
        const planId = await newPlan(`Branch ${i}`);
        const summary = await agent
          .post(`${API}/plans/${planId}/activities`)
          .send({ name: 'Phase', type: 'WBS_SUMMARY' })
          .expect(201);
        const summaryId = summary.body.data.id as string;
        await prisma.activity.createMany({
          data: Array.from({ length: BRANCH_CHILDREN }, (_, k) => ({
            organizationId,
            planId,
            parentId: summaryId,
            name: `Child ${k}`,
            durationMinutes: 7200,
          })),
        });
        await prisma.activity.createMany({
          data: Array.from({ length: BRANCH_CHILDREN * LINKS_PER_CHILD }, (_, k) => ({
            organizationId,
            planId,
            name: `Outside ${k}`,
            durationMinutes: 7200,
          })),
        });
        const children = await prisma.activity.findMany({ where: { planId, parentId: summaryId } });
        const outside = await prisma.activity.findMany({
          where: { planId, name: { startsWith: 'Outside' } },
        });
        await prisma.activityDependency.createMany({
          data: outside.map((o, k) => ({
            organizationId,
            planId,
            predecessorId: (children[Math.floor(k / LINKS_PER_CHILD)] as Json).id,
            successorId: o.id,
          })),
        });
        calm();
        const t0 = performance.now();
        await agent.delete(`${API}/activities/${summaryId}`).expect(200);
        const ms = performance.now() - t0;
        (arm === 'with' ? withRec : without).push(ms);
      }
      out.branchDelete = { without, with: withRec };
      return [median(without), median(withRec), worst(without), worst(withRec)];
    }

    for (const [name, run] of [
      ['placements', placements],
      ['branchDelete', branchDelete],
    ] as const) {
      const [wo, w, woMax, wMax] = await run();
      const added = w - wo;
      console.warn(
        `${name}: without p50 ${wo.toFixed(0)} ms, with p50 ${w.toFixed(0)} ms, added ${added.toFixed(0)} ms ` +
          `(${((added / wo) * 100).toFixed(1)} % of the route); worst without ${woMax.toFixed(0)}, with ${wMax.toFixed(0)}`,
      );
    }
  });
});
