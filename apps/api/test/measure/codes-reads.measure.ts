/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
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
 * Each figure is a wall-clock HTTP round trip through the real application (guards, validation, the
 * service, Prisma), warm, `ITER` repetitions, reported as p50 and p95 in milliseconds. The ids are v4
 * (`gen_random_uuid()`), so the index locality is the worst case, not the v7 an import writes.
 */
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const ACTIVITIES = 5000;
const TYPES = 30;
const VALUES = 50;
const ITER = Number(process.env.MEASURE_ITER ?? 30);

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

  it('times the list, the batch write and the type list', async () => {
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

    process.stdout.write(`\n${out.join('\n')}\n`);
    if (process.env.MEASURE_OUT) writeFileSync(process.env.MEASURE_OUT, `${out.join('\n')}\n`);
  });
});
