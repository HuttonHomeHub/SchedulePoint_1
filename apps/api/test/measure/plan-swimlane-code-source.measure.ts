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
import { CodeTypeRepository } from '../../src/modules/codes/code-type.repository';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { clearDomainData } from '../audit-reset';

/**
 * p6-activity-codes M4-T2 — what does the swimlane source switch cost (ADR-0142)? Two success criteria,
 * `m4-plan.md` T2: the values-in-use count with the WBS-summary exclusion at 5,000 activities x 30
 * types stays at or under 10 ms, and a code-sourced baseline capture at 5,000 activities adds at most
 * 50 ms over the same plan captured by hand (MANUAL source).
 *
 * Run against a DISPOSABLE database that has had `prisma migrate deploy` applied, on the build
 * machine (`docs/specs/p6-activity-codes/m4-record.md` §2 records the figures):
 *
 *   DATABASE_URL=postgresql://… MEASURE_OUT=/path/run.txt pnpm --filter @repo/api exec vitest run \
 *     --config vitest.measure.config.mts plan-swimlane-code-source
 *
 * The seed is the database review's (`m4-database-review.md` §8): 5,000 activities (5 % soft-deleted,
 * 5 % WBS summaries so the exclusion has something to do), 30 types of 50 values, every activity
 * carrying every type (150,000 assignments), 15,000 code lanes on one type, one value of each type
 * soft-deleted, v4 ids. The count is timed in the repository alone, so the figure is the statement
 * and not the HTTP round trip; the capture is the real POST, with the source switched through the real
 * PATCH, so it includes the guards and the transaction.
 */
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const ACTIVITIES = 5000;
const TYPES = 30;
const VALUES = 50;
const ITER = Number(process.env.MEASURE_ITER ?? 15);
const CAPTURE_ITER = Number(process.env.MEASURE_CAPTURE_ITER ?? 8);

const API = '/api/v1/organizations/acme';

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

describe('plan swimlane code source — switch and capture cost', () => {
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

  it('times the in-use count and the code-sourced capture', async () => {
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
    const planId = (
      await agent
        .post(`${API}/projects/${project.body.data.id}/plans`)
        .send({ name: 'Coded', plannedStart: '2026-01-01' })
        .expect(201)
    ).body.data.id as string;

    await prisma.activity.createMany({
      data: Array.from({ length: ACTIVITIES }, (_, i) => ({
        organizationId: orgId,
        planId,
        name: `Activity ${i}`,
        code: `A${String(i).padStart(5, '0')}`,
        // A capture needs a calculated schedule: the dates are set directly, the cost is the capture's.
        earlyStart: new Date('2026-01-05T00:00:00Z'),
        earlyFinish: new Date('2026-01-09T00:00:00Z'),
      })),
    });
    await prisma.$executeRaw`
      UPDATE activities SET deleted_at = now(), delete_batch_id = gen_random_uuid()
      WHERE plan_id = ${planId}::uuid AND code LIKE 'A%' AND substring(code, 2)::int % 20 = 0`;
    await prisma.$executeRaw`
      UPDATE activities SET type = 'WBS_SUMMARY'
      WHERE plan_id = ${planId}::uuid AND deleted_at IS NULL AND substring(code, 2)::int % 20 = 1`;

    await prisma.$executeRaw`
      INSERT INTO code_types (id, organization_id, plan_id, name, position, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${planId}::uuid, 'Type ' || t, t, 1, now(), now()
      FROM generate_series(0, ${TYPES - 1}) AS t`;
    await prisma.$executeRaw`
      INSERT INTO code_values (id, organization_id, code_type_id, short_code, position, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ct.id, 'V' || v, v, 1, now(), now()
      FROM code_types ct, generate_series(0, ${VALUES - 1}) AS v
      WHERE ct.plan_id = ${planId}::uuid`;
    await prisma.$executeRaw`
      UPDATE code_values SET deleted_at = now(), delete_batch_id = gen_random_uuid()
      WHERE short_code = 'V0' AND code_type_id IN (SELECT id FROM code_types WHERE plan_id = ${planId}::uuid)`;
    await prisma.$executeRaw`
      INSERT INTO code_value_assignments
        (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${planId}::uuid, a.id, ct.id,
             (SELECT cv.id FROM code_values cv WHERE cv.code_type_id = ct.id
              ORDER BY cv.position OFFSET (abs(hashtext(a.id::text || ct.id::text)) % ${VALUES}) LIMIT 1),
             now(), now()
      FROM activities a CROSS JOIN code_types ct
      WHERE a.plan_id = ${planId}::uuid AND ct.plan_id = ${planId}::uuid`;
    const first = await prisma.codeType.findFirstOrThrow({
      where: { planId, position: 0 },
      select: { id: true },
    });
    await prisma.$executeRaw`
      INSERT INTO code_swimlane_lanes
        (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, lane_index, created_at, updated_at)
      SELECT gen_random_uuid(), ${orgId}::uuid, ${planId}::uuid, cva.activity_id, cva.code_type_id,
             cva.code_value_id, abs(hashtext(cva.activity_id::text)) % 400, now(), now()
      FROM code_value_assignments cva
      WHERE cva.plan_id = ${planId}::uuid AND cva.code_type_id = ${first.id}::uuid`;
    await prisma.$executeRawUnsafe('ANALYZE');

    const out: string[] = [];
    const time = async (
      label: string,
      fn: () => Promise<unknown>,
      reps: number,
    ): Promise<number> => {
      await fn(); // warm
      const samples: number[] = [];
      for (let i = 0; i < reps; i += 1) {
        const started = performance.now();
        await fn();
        samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);
      const p50 = quantile(samples, 0.5);
      out.push(
        `${label.padEnd(72)} p50 ${p50.toFixed(1).padStart(7)} ms   p95 ${quantile(samples, 0.95).toFixed(1).padStart(7)} ms   (n=${reps})`,
      );
      return p50;
    };

    const repo = app.get(CodeTypeRepository);
    await time(
      'countValuesInUse (summaries excluded): 5,000 activities x 30 types',
      () => repo.countValuesInUse(orgId, planId, first.id, prisma),
      ITER,
    );

    const plan = `${API}/plans/${planId}`;
    const patch = async (body: Record<string, unknown>): Promise<void> => {
      const current = await agent.get(plan).expect(200);
      const version = current.body.data.version as number;
      await agent
        .patch(plan)
        .send({ ...body, version })
        .expect(200);
    };
    await time(
      'PATCH switch to the code (HTTP, count included), then back to NONE',
      async () => {
        await patch({ swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: first.id });
        await patch({ swimlaneSource: 'NONE' });
      },
      ITER,
    );

    let n = 0;
    const capture = (): Promise<unknown> => {
      n += 1;
      return agent
        .post(`${plan}/baselines`)
        .send({ name: `Baseline ${n}` })
        .expect(201);
    };
    await patch({ swimlaneSource: 'MANUAL' });
    const byHand = await time(
      'capture, MANUAL source (by hand): 5,000 activities',
      capture,
      CAPTURE_ITER,
    );
    await patch({ swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: first.id });
    const byCode = await time(
      'capture, ACTIVITY_CODE source: 5,000 activities, 15,000 code lanes',
      capture,
      CAPTURE_ITER,
    );
    out.push(`added by the code half of the capture (p50): ${(byCode - byHand).toFixed(1)} ms`);

    process.stdout.write(`\n${out.join('\n')}\n`);
    if (process.env.MEASURE_OUT) writeFileSync(process.env.MEASURE_OUT, `${out.join('\n')}\n`);
  });
});
