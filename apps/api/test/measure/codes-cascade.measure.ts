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
 * p6-activity-codes M2-T5 — what does the codes sweep cost a plan, project or client delete and its
 * restore (database-design §8.2, ADR-0142)?
 *
 * Run against a DISPOSABLE database that has had `prisma migrate deploy` applied. Case (a) is one plan
 * holding the caps, 100 types of 1,000 values (100,000 values); case (b) is a project of 10 such plans
 * (1,000,000 values). Neither carries activities or assignments: this isolates the codes sweep, whose
 * cost does not depend on them. It ends by clearing the domain tables.
 *
 *   DATABASE_URL=postgresql://… MEASURE_OUT=/path/run.txt pnpm --filter @repo/api exec vitest run \
 *     --config vitest.measure.config.mts codes-cascade
 *
 * Each figure is a wall-clock HTTP round trip of the real DELETE or restore through the real
 * application, `ITER` delete-then-restore cycles, reported as p50 and max in milliseconds. The ids are
 * v4 (`gen_random_uuid()`), the worst case for index locality.
 */
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const TYPES = 100;
const VALUES = 1000;
const ITER = Number(process.env.MEASURE_ITER ?? 3);
const API = '/api/v1/organizations/acme';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;

describe('codes — delete and restore cascade cost', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const lines: string[] = [];

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
    const out = lines.join('\n');
    process.stdout.write(`${out}\n`);
    if (process.env.MEASURE_OUT) writeFileSync(process.env.MEASURE_OUT, `${out}\n`);
  });

  it('times a plan and a project of ten plans at the caps', async () => {
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
    const makeProject = async (name: string): Promise<string> =>
      (
        await agent
          .post(`${API}/clients/${client.body.data.id}/projects`)
          .send({ name })
          .expect(201)
      ).body.data.id as string;
    const makePlan = async (projectId: string, name: string): Promise<string> =>
      (
        await agent
          .post(`${API}/projects/${projectId}/plans`)
          .send({ name, plannedStart: '2026-01-01' })
          .expect(201)
      ).body.data.id as string;
    const code = async (planId: string) => {
      await prisma.$executeRaw`
        INSERT INTO code_types (id, organization_id, plan_id, name, position, version, created_at, updated_at)
        SELECT gen_random_uuid(), ${orgId}::uuid, ${planId}::uuid, 'Type ' || t, t, 1, now(), now()
        FROM generate_series(0, ${TYPES - 1}) AS t`;
      await prisma.$executeRaw`
        INSERT INTO code_values (id, organization_id, code_type_id, short_code, position, version, created_at, updated_at)
        SELECT gen_random_uuid(), ${orgId}::uuid, ct.id, 'V' || v, v, 1, now(), now()
        FROM code_types ct, generate_series(0, ${VALUES - 1}) AS v
        WHERE ct.plan_id = ${planId}::uuid`;
    };

    const cycle = async (label: string, root: string, kind: 'plans' | 'projects', rows: number) => {
      const del: number[] = [];
      const res: number[] = [];
      for (let i = 0; i < ITER; i += 1) {
        let t = performance.now();
        await agent.delete(`${API}/${kind}/${root}`).expect(204);
        del.push(performance.now() - t);
        t = performance.now();
        await agent.post(`${API}/${kind}/${root}/restore`).expect(200);
        res.push(performance.now() - t);
      }
      const fmt = (xs: number[]) =>
        `p50 ${Math.round(median(xs))} ms, max ${Math.round(Math.max(...xs))} ms`;
      lines.push(`${label} (${rows} values): delete ${fmt(del)}; restore ${fmt(res)}`);
    };

    const soloProject = await makeProject('Solo');
    const solo = await makePlan(soloProject, 'Solo plan');
    await code(solo);
    await prisma.$executeRaw`ANALYZE code_types`;
    await prisma.$executeRaw`ANALYZE code_values`;
    await cycle('(a) one plan, plan delete', solo, 'plans', TYPES * VALUES);
    await cycle('(a) one plan, project delete', soloProject, 'projects', TYPES * VALUES);

    const bigProject = await makeProject('Big');
    for (let i = 0; i < 10; i += 1) await code(await makePlan(bigProject, `Plan ${i}`));
    await prisma.$executeRaw`ANALYZE code_types`;
    await prisma.$executeRaw`ANALYZE code_values`;
    await cycle(
      '(b) project of 10 plans, project delete',
      bigProject,
      'projects',
      10 * TYPES * VALUES,
    );
  });
});
