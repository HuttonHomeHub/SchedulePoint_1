/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   Supertest bodies are untyped JSON and this is a measurement script, not a contract test. */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { configureHttpApp } from '../../src/app-setup';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { clearDomainData } from '../audit-reset';

/**
 * p6-activity-codes M2-T4 — what do the codes cost on the request path (spec SC-5, reads)?
 *
 * Run against a DISPOSABLE database that has had `prisma migrate deploy` applied: it seeds a plan of
 * 5,000 activities carrying 30 code types of 50 values each, every activity holding every type (150,000
 * assignments, the import cap), and a second plan of 5,000 with no code type to compare against. It
 * ends by clearing the domain tables, as the e2e specs do.
 *
 *   DATABASE_URL=postgresql://… MEASURE_OUT=/path/run.txt pnpm --filter @repo/api exec vitest run \
 *     --config vitest.measure.config.mts codes-reads
 *
 * M3-T0 adds the on-demand reads (p6-activity-codes m3-plan T0, ADR-0142): the 100 x 1,000 plan also
 * holds 1,000 deleted values on its first type and 100 deleted types, and the cases are the plan's
 * ceilings (`m3-record.md` §1).
 *
 * Each figure is a wall-clock HTTP round trip through the real application (guards, validation, the
 * service, Prisma), warm, `ITER` repetitions, reported as p50 and p95 in milliseconds. The ids are v4
 * (`gen_random_uuid()`), so the index locality is the worst case, not the v7 an import writes.
 */
// M4-T1 (p6-activity-codes m4-plan T1): a switch that turns the code-lane read off, so the same running
// application answers both with and without it and the difference is the statement, nothing else.
const skipLanes = vi.hoisted(() => ({ on: false }));
vi.mock('../../src/modules/activities/swimlane-lanes', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/modules/activities/swimlane-lanes')>();
  return {
    ...original,
    loadCurrentCodeLanes: (...args: Parameters<typeof original.loadCurrentCodeLanes>) =>
      skipLanes.on ? Promise.resolve(new Map()) : original.loadCurrentCodeLanes(...args),
  };
});

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const ACTIVITIES = 5000;
const TYPES = 30;
const VALUES = 50;
const ITER = Number(process.env.MEASURE_ITER ?? 30);
// M4-T1 only: `MEASURE_ONLY=lanes` runs the code-lane cases alone, on their own smaller plan.
const ONLY_LANES = process.env.MEASURE_ONLY === 'lanes';

const API = '/api/v1/organizations/acme';

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

describe('codes — request-path cost', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
  });

  it.skipIf(ONLY_LANES)('times the list, the batch write and the type list', async () => {
    await clearDomainData(prisma);
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'measure', email: 'measure@example.com', password: PASSWORD })
      .expect(200);
    const org = await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const orgId = org.body.data.id as string;
    const client = await agent.post(`${API}/clients`).send({ name: 'C' }).expect(201);
    const project = await agent
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name: 'P' })
      .expect(201);
    const makePlan = async (name: string): Promise<string> =>
      (
        await agent
          .post(`${API}/projects/${project.body.data.id}/plans`)
          .send({ name, plannedStart: '2026-01-01' })
          .expect(201)
      ).body.data.id as string;
    const coded = await makePlan('Coded');
    const plain = await makePlan('Plain');
    const worst = await makePlan('Worst case');

    for (const planId of [coded, plain]) {
      await prisma.activity.createMany({
        data: Array.from({ length: ACTIVITIES }, (_, i) => ({
          organizationId: orgId,
          planId,
          name: `Activity ${i}`,
          code: `A${String(i).padStart(5, '0')}`,
        })),
      });
    }

    // 30 types x 50 values, then every activity holding every type.
    await prisma.$executeRaw`
      INSERT INTO code_types (id, organization_id, plan_id, name, position, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${coded}::uuid, 'Type ' || t, t, 1, now(), now()
      FROM generate_series(0, ${TYPES - 1}) AS t`;
    await prisma.$executeRaw`
      INSERT INTO code_values (id, organization_id, code_type_id, short_code, position, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ct.id, 'V' || v, v, 1, now(), now()
      FROM code_types ct, generate_series(0, ${VALUES - 1}) AS v
      WHERE ct.plan_id = ${coded}::uuid`;
    await prisma.$executeRaw`
      INSERT INTO code_value_assignments
        (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${coded}::uuid, a.id, ct.id,
             (SELECT cv.id FROM code_values cv WHERE cv.code_type_id = ct.id
              ORDER BY cv.position OFFSET (abs(hashtext(a.id::text || ct.id::text)) % ${VALUES}) LIMIT 1),
             now(), now()
      FROM activities a CROSS JOIN code_types ct
      WHERE a.plan_id = ${coded}::uuid AND ct.plan_id = ${coded}::uuid`;

    // The worst case a plan may hold: 100 types of 1,000 values (no assignments, for the list only).
    await prisma.$executeRaw`
      INSERT INTO code_types (id, organization_id, plan_id, name, position, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${worst}::uuid, 'Type ' || t, t, 1, now(), now()
      FROM generate_series(0, 99) AS t`;
    await prisma.$executeRaw`
      INSERT INTO code_values (id, organization_id, code_type_id, short_code, description, position, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ct.id, 'V' || v, 'Value number ' || v, v, 1, now(), now()
      FROM code_types ct, generate_series(0, 999) AS v
      WHERE ct.plan_id = ${worst}::uuid`;
    // The include=deleted cases (m3-plan T0): the first type also holds 1,000 deleted values, and the
    // plan 100 deleted types, so a page that must show deleted rows has the most to read.
    await prisma.$executeRaw`
      INSERT INTO code_values (id, organization_id, code_type_id, short_code, position, version, created_at, updated_at, deleted_at, delete_batch_id)
      SELECT gen_random_uuid(), ${orgId}::uuid, ct.id, 'D' || v, 1000 + v, 1, now(), now(), now(), gen_random_uuid()
      FROM (SELECT id FROM code_types WHERE plan_id = ${worst}::uuid ORDER BY position, id LIMIT 1) ct,
           generate_series(0, 999) AS v`;
    await prisma.$executeRaw`
      INSERT INTO code_types (id, organization_id, plan_id, name, position, version, created_at, updated_at, deleted_at, delete_batch_id)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${worst}::uuid, 'Deleted ' || t, 100 + t, 1, now(), now(), now(), gen_random_uuid()
      FROM generate_series(0, 99) AS t`;
    await prisma.$executeRawUnsafe('ANALYZE');

    const out: string[] = [];
    const time = async (label: string, fn: () => Promise<unknown>, reps = ITER): Promise<void> => {
      await fn(); // warm
      const samples: number[] = [];
      for (let i = 0; i < reps; i += 1) {
        const started = performance.now();
        await fn();
        samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);
      out.push(
        `${label.padEnd(66)} p50 ${quantile(samples, 0.5).toFixed(1).padStart(7)} ms   p95 ${quantile(samples, 0.95).toFixed(1).padStart(7)} ms   (n=${reps})`,
      );
    };

    const list = (planId: string, query = 'limit=100') =>
      agent.get(`${API}/plans/${planId}/activities?${query}`).expect(200);
    const mid = ((await list(coded, 'limit=100')).body.meta.nextCursor ?? '') as string;

    await time('list 100 activities, plan with no code type', () => list(plain));
    await time('list 100 activities, 30 types x 50 values, every activity coded', () =>
      list(coded),
    );
    await time('list 100 activities (a later page), same plan', () =>
      list(coded, `limit=100&cursor=${mid}`),
    );

    const codedRows = (await prisma.activity.findMany({
      where: { planId: coded },
      orderBy: { id: 'asc' },
      select: { id: true },
    })) as { id: string }[];
    const types = (await prisma.codeType.findMany({
      where: { planId: coded },
      orderBy: { position: 'asc' },
    })) as { id: string }[];
    const valueOf = new Map<string, string[]>();
    for (const t of types) {
      valueOf.set(
        t.id,
        (
          (await prisma.codeValue.findMany({
            where: { codeTypeId: t.id },
            orderBy: { position: 'asc' },
            select: { id: true },
          })) as { id: string }[]
        ).map((v) => v.id),
      );
    }

    let flip = 0;
    const write = async (count: number, typeCount: number): Promise<void> => {
      flip += 1;
      const rows = await prisma.activity.findMany({
        where: { id: { in: codedRows.slice(0, count).map((r) => r.id) } },
        select: { id: true, version: true },
      });
      await agent
        .patch(`${API}/plans/${coded}/activities/codes`)
        .send({
          activities: rows.map((r: { id: string; version: number }) => ({
            id: r.id,
            version: r.version,
            codes: types.slice(0, typeCount).map((t) => ({
              codeTypeId: t.id,
              codeValueId: valueOf.get(t.id)![flip % VALUES],
            })),
          })),
        })
        .expect(200);
    };
    await time('PATCH codes: 1 activity, 1 type', () => write(1, 1));
    await time('PATCH codes: 100 activities, 1 type (100 changes)', () => write(100, 1));
    await time('PATCH codes: 100 activities, 30 types (3,000 changes)', () => write(100, 30), 10);
    await time('PATCH codes: 2,000 activities, 1 type (2,000 changes)', () => write(2000, 1), 5);

    // The comparator: the same 2,000 rows through the placements batch, with a real change each time so it
    // records history the same way (one batch entry per activity).
    let nudge = 0;
    const placeBatch = async (): Promise<void> => {
      nudge += 1;
      const rows = await prisma.activity.findMany({
        where: { id: { in: codedRows.slice(0, 2000).map((r) => r.id) } },
        select: { id: true, version: true },
      });
      await agent
        .patch(`${API}/plans/${coded}/activities/placements`)
        .send({
          placements: rows.map((r: { id: string; version: number }) => ({
            id: r.id,
            version: r.version,
            constraintType: null,
            constraintDate: null,
            visualStart: `2026-02-${String(1 + (nudge % 2)).padStart(2, '0')}`,
            laneIndex: null,
          })),
        })
        .expect(200);
    };
    await time('comparator, PATCH placements: 2,000 activities, a change each', placeBatch, 5);

    const typeList = (planId: string) => agent.get(`${API}/plans/${planId}/code-types`).expect(200);
    await time('GET code-types: 30 types x 50 values (1,500 values)', () => typeList(coded));
    await time(
      'GET code-types: 100 types x 1,000 values (100,000 values)',
      () => typeList(worst),
      5,
    );

    // M3-T0: the on-demand reads, against the ceilings in m3-plan.md.
    const typesNone = (planId: string, extra = '') =>
      agent.get(`${API}/plans/${planId}/code-types?values=none${extra}`).expect(200);
    const firstType = (await typesNone(worst)).body.data[0].id as string;
    const typeValues = (planId: string, typeId: string, query = '') =>
      agent.get(`${API}/plans/${planId}/code-types/${typeId}/values${query}`).expect(200);
    await time('GET code-types?values=none: 100 types', () => typesNone(worst));
    await time('GET code-types/:first/values: 1,000 values', () => typeValues(worst, firstType));
    await time('Codes… first paint: values=none + first type values (together)', async () => {
      await typesNone(worst);
      await typeValues(worst, firstType);
    });
    await time('GET code-types/:id/values?include=deleted: 1,000 live + 1,000 deleted', () =>
      typeValues(worst, firstType, '?include=deleted'),
    );
    await time('GET code-types?values=none&include=deleted: 100 live + 100 deleted types', () =>
      typesNone(worst, '&include=deleted'),
    );
    const oneEach = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON (ct.id) cv.id FROM code_values cv JOIN code_types ct ON ct.id = cv.code_type_id
      WHERE ct.plan_id = ${worst}::uuid AND ct.deleted_at IS NULL AND cv.deleted_at IS NULL
      ORDER BY ct.id, cv.position`;
    const ids = oneEach.map((r) => `id=${r.id}`).join('&');
    await time(`GET code-values?id= x ${oneEach.length} ids across ${oneEach.length} types`, () =>
      agent.get(`${API}/plans/${worst}/code-values?${ids}`).expect(200),
    );
    const detailOf = async (planId: string): Promise<string> =>
      (await prisma.activity.findFirstOrThrow({ where: { planId }, select: { id: true } })).id;
    const codedDetail = await detailOf(coded);
    const plainDetail = await detailOf(plain);
    await time('GET activities/:id, plan with no code type', () =>
      agent.get(`${API}/activities/${plainDetail}`).expect(200),
    );
    await time('GET activities/:id, 30-type coded plan, every type set', () =>
      agent.get(`${API}/activities/${codedDetail}`).expect(200),
    );

    process.stdout.write(`\n${out.join('\n')}\n`);
    if (process.env.MEASURE_OUT) writeFileSync(process.env.MEASURE_OUT, `${out.join('\n')}\n`);
  });

  /**
   * M4-T1 (`m4-record.md` §1, ADR-0142): what code lanes add to the request path. One plan of 5,000
   * activities, three code types of 50 values each, every activity holding every type and a lane under
   * each (15,000 lane rows), the plan drawn from the first type. Ceilings: a 2,000-row codes write with
   * lanes at most 150 ms over the same write without; a 200-row list page (two 100-row pages, the route's cap) at most 6 ms over the same
   * page without the lane statement; the full list payload recorded.
   */
  it('times the code lanes on the codes write and the list', async () => {
    await clearDomainData(prisma);
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'lanes', email: 'lanes@example.com', password: PASSWORD })
      .expect(200);
    const org = await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const orgId = org.body.data.id as string;
    const client = await agent.post(`${API}/clients`).send({ name: 'C' }).expect(201);
    const project = await agent
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name: 'P' })
      .expect(201);
    const planId = (
      await agent
        .post(`${API}/projects/${project.body.data.id}/plans`)
        .send({ name: 'Lanes', plannedStart: '2026-01-01' })
        .expect(201)
    ).body.data.id as string;
    await prisma.activity.createMany({
      data: Array.from({ length: ACTIVITIES }, (_, i) => ({
        organizationId: orgId,
        planId,
        name: `Activity ${i}`,
        code: `A${String(i).padStart(5, '0')}`,
      })),
    });
    await prisma.$executeRaw`
      INSERT INTO code_types (id, organization_id, plan_id, name, position, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${planId}::uuid, 'Type ' || t, t, 1, now(), now()
      FROM generate_series(0, 2) AS t`;
    await prisma.$executeRaw`
      INSERT INTO code_values (id, organization_id, code_type_id, short_code, position, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ct.id, 'V' || v, v, 1, now(), now()
      FROM code_types ct, generate_series(0, ${VALUES - 1}) AS v
      WHERE ct.plan_id = ${planId}::uuid`;
    await prisma.$executeRaw`
      INSERT INTO code_value_assignments
        (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${planId}::uuid, a.id, ct.id,
             (SELECT cv.id FROM code_values cv WHERE cv.code_type_id = ct.id
              ORDER BY cv.position OFFSET (abs(hashtext(a.id::text || ct.id::text)) % ${VALUES}) LIMIT 1),
             now(), now()
      FROM activities a CROSS JOIN code_types ct
      WHERE a.plan_id = ${planId}::uuid AND ct.plan_id = ${planId}::uuid`;
    await prisma.$executeRaw`
      INSERT INTO code_swimlane_lanes
        (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, lane_index, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${planId}::uuid, cva.activity_id, cva.code_type_id,
             cva.code_value_id, abs(hashtext(cva.activity_id::text)) % 40, now(), now()
      FROM code_value_assignments cva WHERE cva.plan_id = ${planId}::uuid`;
    const types = (await prisma.codeType.findMany({
      where: { planId },
      orderBy: { position: 'asc' },
    })) as { id: string }[];
    const source = types[0]!.id;
    await prisma.plan.update({
      where: { id: planId },
      data: { swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: source },
    });
    await prisma.$executeRawUnsafe('ANALYZE');

    const out: string[] = [];

    const list = (query: string) =>
      agent.get(`${API}/plans/${planId}/activities?${query}`).expect(200);
    // Paired: each repetition times the page without the lane statement and then with it, back to back,
    // so the machine's drift lands on both halves; the figure is the median of the paired differences.
    const median = (xs: number[]): number =>
      [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!;
    const timed = async (fn: () => Promise<unknown>): Promise<number> => {
      const started = performance.now();
      await fn();
      return performance.now() - started;
    };
    const pairedList: number[] = [];
    const listWithout: number[] = [];
    const listWith: number[] = [];
    await list('limit=100');
    for (let i = 0; i < ITER; i += 1) {
      skipLanes.on = true;
      const without = await timed(() => list('limit=100'));
      skipLanes.on = false;
      const withLanes = await timed(() => list('limit=100'));
      listWithout.push(without);
      listWith.push(withLanes);
      pairedList.push(withLanes - without);
    }
    out.push(
      `list 100 activities, 3 placed types: median without ${median(listWithout).toFixed(1)} ms, with ${median(listWith).toFixed(1)} ms, median paired difference ${median(pairedList).toFixed(1)} ms (n=${ITER} pairs; two pages = 2x)`,
    );

    // The full list payload: every page, summed as bytes on the wire.
    const payload = async (): Promise<number> => {
      let bytes = 0;
      let cursor = '';
      for (;;) {
        const res = await list(`limit=100${cursor}`);
        bytes += Buffer.byteLength(JSON.stringify(res.body));
        if (!res.body.meta.hasMore) return bytes;
        cursor = `&cursor=${res.body.meta.nextCursor as string}`;
      }
    };
    skipLanes.on = true;
    const without = await payload();
    skipLanes.on = false;
    const withLanes = await payload();
    out.push(
      `list payload, 5,000 activities x 3 placed types: without ${without} B, with ${withLanes} B (+${withLanes - without} B, ${(((withLanes - without) / without) * 100).toFixed(1)} %)`,
    );

    const rows = (await prisma.activity.findMany({
      where: { planId },
      orderBy: { id: 'asc' },
      take: 2000,
      select: { id: true },
    })) as { id: string }[];
    const valueIds = (await prisma.codeValue.findMany({
      where: { codeTypeId: source },
      orderBy: { position: 'asc' },
      select: { id: true },
    })) as { id: string }[];
    let flip = 0;
    const write = async (withLanes: boolean): Promise<void> => {
      flip += 1;
      const current = await prisma.activity.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: { id: true, version: true },
      });
      const body: Record<string, unknown> = {
        activities: current.map((r: { id: string; version: number }) => ({
          id: r.id,
          version: r.version,
          codes: [{ codeTypeId: source, codeValueId: valueIds[flip % VALUES]!.id }],
        })),
      };
      if (withLanes) {
        body.lanes = current.map((r: { id: string; version: number }, i: number) => ({
          id: r.id,
          version: r.version,
          laneIndex: i % 40,
        }));
        body.lanesCodeTypeId = source;
      }
      await agent.patch(`${API}/plans/${planId}/activities/codes`).send(body).expect(200);
    };
    // The lane table grows with every write that changes a value (a new basis row each time), which
    // is what made an unpaired run drift; it is rebuilt to the seeded 15,000 rows before every half.
    const rebuildLanes = async (): Promise<void> => {
      await prisma.$executeRaw`DELETE FROM code_swimlane_lanes WHERE plan_id = ${planId}::uuid`;
      await prisma.$executeRaw`
        INSERT INTO code_swimlane_lanes
          (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, lane_index, created_at, updated_at)
        SELECT gen_random_uuid(), ${orgId}::uuid, ${planId}::uuid, cva.activity_id, cva.code_type_id,
               cva.code_value_id, abs(hashtext(cva.activity_id::text)) % 40, now(), now()
        FROM code_value_assignments cva WHERE cva.plan_id = ${planId}::uuid`;
      await prisma.$executeRawUnsafe('ANALYZE code_swimlane_lanes');
    };
    const PAIRS = Number(process.env.MEASURE_PAIRS ?? 7);
    const writeWithout: number[] = [];
    const writeWith: number[] = [];
    const pairedWrite: number[] = [];
    await write(false);
    for (let i = 0; i < PAIRS; i += 1) {
      await rebuildLanes();
      const without = await timed(() => write(false));
      await rebuildLanes();
      const withLanes = await timed(() => write(true));
      writeWithout.push(without);
      writeWith.push(withLanes);
      pairedWrite.push(withLanes - without);
    }
    out.push(
      `PATCH codes, 2,000 activities, 1 type, a new value each time: median without ${median(writeWithout).toFixed(1)} ms, with 2,000 lanes ${median(writeWith).toFixed(1)} ms, median paired difference ${median(pairedWrite).toFixed(1)} ms (n=${PAIRS} pairs, lanes rebuilt before each half; pairs: ${pairedWrite.map((x) => x.toFixed(0)).join(', ')})`,
    );

    process.stdout.write(`\n${out.join('\n')}\n`);
    if (process.env.MEASURE_OUT) writeFileSync(process.env.MEASURE_OUT, `${out.join('\n')}\n`);
  });
});
