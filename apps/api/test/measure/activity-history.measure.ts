/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return --
   Supertest bodies are untyped JSON and this is a measurement script, not a contract test: typing
   every response would be noise around the numbers. */
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
 * ADR-0174 M1-T7 — what does recording cost, and what does the History read cost at scale?
 *
 * Run against a DISPOSABLE database that has had `prisma migrate deploy` applied (never the e2e or
 * the dev database: it creates an organisation and bulk-loads one million history rows):
 *
 *   DATABASE_URL=postgresql://…/app_measure_history MEASURE_OUT=/path/run.json \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts
 *
 * **How "without recording" is measured.** There is no production toggle and none was added. The
 * recorder is a singleton, so this harness replaces its four methods ON THE INSTANCE with stubs that
 * consult a flag: `record` returns, and the three diff-builders return nothing to record. The same
 * service path then runs with and without. Each iteration runs one request of each arm, in random
 * order, on different (statistically identical) activities, so machine drift lands on both arms. What
 * the baseline still pays: the services' own before/after reads. What it does not: the diff, the
 * endpoint/resource/calendar name lookups, the history lock, the probe and the entry write.
 */
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';
const PLANS = 20;
const PER_PLAN = 50;
const ENTRIES_PER_ACTIVITY = 1000;
const ITER = Number(process.env.MEASURE_ITER ?? 150);
const READS = Number(process.env.MEASURE_READS ?? 200);

type Json = Record<string, any>;

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] as number;
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: +pct(s, 0.5).toFixed(2),
    p95: +pct(s, 0.95).toFixed(2),
    p99: +pct(s, 0.99).toFixed(2),
    max: +(s[s.length - 1] as number).toFixed(2),
  };
}

describe.skipIf(!process.env.DATABASE_URL)('activity history measurement', () => {
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

  const server = () => app.getHttpServer();
  const calm = () => resetThrottleCounters(throttler);

  async function signUp(email: string) {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function hotSnapshot() {
    // Statistics are flushed to the shared stats at transaction end / idle, not instantly.
    await new Promise((r) => setTimeout(r, 4000));
    const rows = await prisma.$queryRaw<Json[]>`
      SELECT n_tup_ins::int AS ins, n_tup_upd::int AS upd, n_tup_hot_upd::int AS hot,
             n_tup_del::int AS del
        FROM pg_stat_user_tables WHERE relname = 'activity_history_entries'`;
    return rows[0] as Json;
  }

  it('measures', async () => {
    const { ActivityHistoryRecorder } =
      await import('../../src/modules/activity-history/activity-history.recorder');
    const recorder = app.get(ActivityHistoryRecorder, { strict: false });
    let recording = true;
    const real = {
      record: recorder.record.bind(recorder),
      activityFieldChanges: recorder.activityFieldChanges.bind(recorder),
      assignmentChanges: recorder.assignmentChanges.bind(recorder),
      linkWrites: recorder.linkWrites.bind(recorder),
    };
    const patched = recorder as unknown as Record<string, unknown>;
    patched.record = (...a: Parameters<typeof real.record>) =>
      recording ? real.record(...a) : Promise.resolve();
    patched.activityFieldChanges = (...a: Parameters<typeof real.activityFieldChanges>) =>
      recording ? real.activityFieldChanges(...a) : Promise.resolve({});
    patched.assignmentChanges = (...a: Parameters<typeof real.assignmentChanges>) =>
      recording ? real.assignmentChanges(...a) : Promise.resolve({});
    patched.linkWrites = (...a: Parameters<typeof real.linkWrites>) =>
      recording ? real.linkWrites(...a) : Promise.resolve([]);

    // ---- seed: an org, 20 plans x 50 activities, a resource, a second planner, a viewer.
    const admin = await signUp('admin@example.com');
    const planner = await signUp('planner@example.com');
    const viewer = await signUp('viewer@example.com');
    const org = await admin.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const orgId = org.body.data.id as string;
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: planner.userId, role: 'PLANNER' },
    });
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    const client = await admin.agent.post(`${API}/clients`).send({ name: 'Northgate' }).expect(201);
    const project = await admin.agent
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plans: { planId: string; ids: string[] }[] = [];
    for (let p = 0; p < PLANS; p++) {
      calm();
      const plan = await admin.agent
        .post(`${API}/projects/${project.body.data.id}/plans`)
        .send({ name: `Plan ${p}`, plannedStart: '2026-01-01' })
        .expect(201);
      const planId = plan.body.data.id as string;
      const ids: string[] = [];
      for (let i = 0; i < PER_PLAN; i++) {
        calm();
        const res = await admin.agent
          .post(`${API}/plans/${planId}/activities`)
          .send({ name: `A${p}-${i}`, durationDays: 5 })
          .expect(201);
        ids.push(res.body.data.id as string);
      }
      plans.push({ planId, ids });
    }
    const crane = (
      await admin.agent.post(`${API}/resources`).send({ name: 'Crane', kind: 'LABOUR' }).expect(201)
    ).body.data.id as string;

    // ---- bulk-load 1,000 entries per activity (1,000,000 rows), then ANALYZE as autovacuum would.
    // Spaced an hour apart and ending a day ago, so the measured writes are always newer and never
    // merge into seeded rows; ~0.4 KB of `changes`, the spec's per-entry estimate.
    await prisma.$executeRaw`
      INSERT INTO activity_history_entries
        (id, organization_id, activity_id, actor_user_id, scope, first_recorded_at,
         last_recorded_at, edit_count, has_non_cost_change, changes)
      SELECT gen_random_uuid(), a.organization_id, a.id, ${admin.userId},
             (ARRAY['DEFINITION','PROGRESS','PLACEMENT','LOGIC','RESOURCES'])[1 + (g % 5)]::activity_history_scope,
             now() - interval '1 day' - (g * interval '1 hour'),
             now() - interval '1 day' - (g * interval '1 hour') + interval '30 seconds',
             1 + (g % 4), (g % 10) <> 0,
             jsonb_build_object(
               'durationMinutes', jsonb_build_object('from', 1000 + g, 'to', 1001 + g),
               'name', jsonb_build_object('from', 'Excavate trench ' || g, 'to', 'Excavate trench ' || (g + 1)),
               'description', jsonb_build_object('changed', true),
               'budgetedCost', jsonb_build_object('from', '1000.0000', 'to', '1250.0000'),
               'assignment:' || gen_random_uuid()::text, jsonb_build_object(
                 'resource', jsonb_build_object('id', gen_random_uuid()::text, 'code', 'CR600', 'name', 'Tower crane'),
                 'from', jsonb_build_object('budgetedUnits', '40.0000', 'isDriving', false),
                 'to', jsonb_build_object('budgetedUnits', '50.0000', 'isDriving', false)))
        FROM activities a, generate_series(1, ${ENTRIES_PER_ACTIVITY}) AS g
       WHERE a.organization_id = ${orgId}::uuid`;
    await prisma.$executeRawUnsafe('ANALYZE activity_history_entries');
    const size = await prisma.$queryRaw<Json[]>`
      SELECT (SELECT count(*)::int FROM activity_history_entries) AS rows,
             pg_size_pretty(pg_table_size('activity_history_entries')) AS table,
             pg_size_pretty(pg_indexes_size('activity_history_entries')) AS indexes`;
    out.table = size[0];

    // ---- (b) the read, over HTTP, first page and a deep page, with and without cost:read.
    const target = (plans[0] as { ids: string[] }).ids[0] as string;
    const first = await admin.agent.get(`${API}/activities/${target}/history?limit=50`).expect(200);
    const deepCursor = Buffer.from(
      JSON.stringify({
        t: new Date(Date.now() - (86400 + 500 * 3600) * 1000).toISOString(),
        id: '00000000-0000-0000-0000-000000000000',
      }),
    ).toString('base64url');
    const reads: Record<string, [typeof admin, string]> = {
      firstPage_costReader: [admin, `${API}/activities/${target}/history?limit=50`],
      firstPage_nonCostReader: [viewer, `${API}/activities/${target}/history?limit=50`],
      deepPage_costReader: [
        admin,
        `${API}/activities/${target}/history?limit=50&cursor=${deepCursor}`,
      ],
    };
    out.readSample = { items: first.body.data.length, hasMore: first.body.meta.hasMore };
    out.readHttp = {};
    for (const [name, [actor, url]] of Object.entries(reads)) {
      for (let i = 0; i < 20; i++) {
        calm();
        await actor.agent.get(url).expect(200);
      }
      const ts: number[] = [];
      for (let i = 0; i < READS; i++) {
        calm();
        const t0 = performance.now();
        await actor.agent.get(url).expect(200);
        ts.push(performance.now() - t0);
      }
      out.readHttp[name] = stats(ts);
    }
    // The control: the same path against an activity with no history, to separate the endpoint's
    // fixed cost from the history query's.
    const ctrl = (
      await prisma.$queryRaw<Json[]>`
      SELECT a.id FROM activities a WHERE NOT EXISTS
        (SELECT 1 FROM activity_history_entries h WHERE h.activity_id = a.id) LIMIT 1`
    )[0];
    if (ctrl) {
      const ts: number[] = [];
      for (let i = 0; i < READS; i++) {
        calm();
        const t0 = performance.now();
        await admin.agent.get(`${API}/activities/${ctrl.id}/history?limit=50`).expect(200);
        ts.push(performance.now() - t0);
      }
      out.readHttp.emptyHistoryControl = stats(ts);
    }

    // ---- (c) writes, both arms interleaved. Arm A = recording, arm B = stubbed.
    type Op = (arm: 'with' | 'without', i: number) => Promise<number>;
    async function timed(fn: () => Promise<unknown>): Promise<number> {
      calm();
      const t0 = performance.now();
      await fn();
      return performance.now() - t0;
    }
    async function compare(name: string, op: Op) {
      const w: number[] = [];
      const wo: number[] = [];
      for (let i = 0; i < ITER; i++) {
        const order: ('with' | 'without')[] =
          Math.random() < 0.5 ? ['with', 'without'] : ['without', 'with'];
        for (const arm of order) {
          recording = arm === 'with';
          (arm === 'with' ? w : wo).push(await op(arm, i));
        }
      }
      recording = true;
      out.writes ??= {};
      const a = stats(w);
      const b = stats(wo);
      out.writes[name] = {
        with: a,
        without: b,
        addedP50: +(a.p50 - b.p50).toFixed(2),
        addedP95: +(a.p95 - b.p95).toFixed(2),
      };
    }

    // Activity pools per arm: each arm uses its own activities so the arms never share state.
    const pool = (arm: 'with' | 'without', i: number, plan = 1) =>
      (plans[plan + (arm === 'with' ? 0 : 1)] as { ids: string[] }).ids[i % PER_PLAN] as string;
    const versions = new Map<string, number>();
    async function patchActivity(actor: typeof admin, id: string, days: number) {
      const v =
        versions.get(id) ?? (await admin.agent.get(`${API}/activities/${id}`)).body.data.version;
      const res = await actor.agent
        .patch(`${API}/activities/${id}`)
        .send({ durationDays: days, version: v })
        .expect(200);
      versions.set(id, res.body.data.version);
    }

    // Warm both pools: one unmeasured write each so every measured "merge" write has a live entry
    // by the same actor to merge into (the burst case), then measure.
    const hot0 = await hotSnapshot();
    for (const arm of ['with', 'without'] as const) {
      recording = arm === 'with';
      for (let i = 0; i < PER_PLAN; i++) await patchActivity(admin, pool(arm, i), 6);
    }
    recording = true;
    let day = 6;
    await compare('patchActivity_merge', (arm, i) =>
      timed(() => patchActivity(admin, pool(arm, i), ++day)),
    );
    const hot1 = await hotSnapshot();
    out.hot_patchMerge = { before: hot0, after: hot1 };

    // Insert case: two people alternate by lap over the pool, so every write opens a new entry.
    let day2 = 100;
    await compare('patchActivity_insert', (arm, i) =>
      timed(() =>
        patchActivity(
          Math.floor(i / PER_PLAN) % 2 === 0 ? planner : admin,
          pool(arm, i, 3),
          ++day2,
        ),
      ),
    );
    const hot2 = await hotSnapshot();
    out.hot_patchInsert = { before: hot1, after: hot2 };

    // Assignments: one per activity in plans 5/6, updated in place.
    const assign: Record<string, string> = {};
    for (const arm of ['with', 'without'] as const) {
      for (let i = 0; i < PER_PLAN; i++) {
        const act = pool(arm, i, 5);
        recording = arm === 'with';
        calm();
        const res = await admin.agent
          .post(`${API}/activities/${act}/assignments`)
          .send({ resourceId: crane, budgetedUnits: 10 })
          .expect(201);
        assign[act] = res.body.data.id as string;
        versions.set(`as:${assign[act]}`, res.body.data.version as number);
      }
    }
    recording = true;
    let units = 10;
    const updateAssignment = async (actor: typeof admin, act: string) => {
      const id = assign[act] as string;
      const res = await actor.agent
        .patch(`${API}/assignments/${id}`)
        .send({ budgetedUnits: ++units, version: versions.get(`as:${id}`) })
        .expect(200);
      versions.set(`as:${id}`, res.body.data.version);
    };
    const hot3 = await hotSnapshot();
    await compare('assignmentUpdate_merge', (arm, i) =>
      timed(() => updateAssignment(admin, pool(arm, i, 5))),
    );
    const hot4 = await hotSnapshot();
    out.hot_assignmentMerge = { before: hot3, after: hot4 };
    await compare('assignmentUpdate_insert', (arm, i) =>
      timed(() =>
        updateAssignment(Math.floor(i / PER_PLAN) % 2 === 0 ? planner : admin, pool(arm, i, 5)),
      ),
    );

    // Link create: disjoint pairs (i, i + 25) in plans 7 (with) and 8 (without), so no chains.
    // 25 pairs per plan, so ITER is capped by the pairs available per arm across plans.
    const linkPlans = { with: [7, 9, 11, 13, 15, 17], without: [8, 10, 12, 14, 16, 18] };
    let linkN = 0;
    const iterLinks = Math.min(ITER, 25 * 6);
    const w: number[] = [];
    const wo: number[] = [];
    for (let i = 0; i < iterLinks; i++) {
      const order: ('with' | 'without')[] =
        Math.random() < 0.5 ? ['with', 'without'] : ['without', 'with'];
      for (const arm of order) {
        recording = arm === 'with';
        const pl = plans[linkPlans[arm][Math.floor(i / 25)] as number] as {
          planId: string;
          ids: string[];
        };
        const k = i % 25;
        const t = await timed(() =>
          admin.agent
            .post(`${API}/plans/${pl.planId}/dependencies`)
            .send({ predecessorId: pl.ids[k], successorId: pl.ids[k + 25] })
            .expect(201),
        );
        (arm === 'with' ? w : wo).push(t);
        linkN++;
      }
    }
    recording = true;
    {
      const a = stats(w);
      const b = stats(wo);
      out.writes.linkCreate_insert = {
        with: a,
        without: b,
        addedP50: +(a.p50 - b.p50).toFixed(2),
        addedP95: +(a.p95 - b.p95).toFixed(2),
      };
    }
    out.linksCreated = linkN;
    out.hot_final = await hotSnapshot();
    out.historyRowsAfter = (
      await prisma.$queryRaw<Json[]>`SELECT count(*)::int AS n FROM activity_history_entries`
    )[0];
  });
});
