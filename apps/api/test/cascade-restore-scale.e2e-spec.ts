import { writeFileSync } from 'node:fs';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * **How long does restoring a 2,000-activity phase take?** (`docs/TECH_DEBT.md` #230, M0-T3.)
 *
 * #230 M1 turns a cascade restore from a rare redo into the ordinary consequence of pressing Undo
 * after deleting a phase, so its cost stops being an academic question. The falsification condition
 * was committed to `docs/specs/cascade-undo/implementation-plan.md` **before this ran**: if a
 * 2,000-activity cascade restore exceeds **5 s** end-to-end, M1 stops and the batching question is
 * reopened as its own decision.
 *
 * **Opt-in, and skipped everywhere else.** It is not a gate and must never become one: it asserts a
 * budget on a shared machine, and a timing assertion in CI is a flake generator. Run it with
 * `SP_MEASURE=1`; it is silent in `pnpm test`, in `scripts/e2e-local.sh api` and in CI.
 *
 * **Where it bypasses the product, stated plainly** (ADR-0081's rule for a measurement harness):
 * the 2,000 activities are inserted with one `createMany` rather than 2,000 REST calls, so this
 * measures neither the write path nor the DTO layer. What it measures is the real thing — a real
 * HTTP `DELETE` and a real HTTP `POST …/restore-batch` through the real guards, the real advisory
 * lock, the real audit write and the real response serialisation, on a real Postgres.
 */
const enabled = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SP_MEASURE);
const ORIGIN = 'http://localhost:5173';
const SUBTREE = 2_000;
/** The committed falsification condition. Exceeding it stops M1; it does not fail a build. */
const BUDGET_MS = 5_000;

describe.skipIf(!enabled)('Cascade restore at scale (measurement)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it(`restores a ${SUBTREE}-activity phase inside the committed budget`, async () => {
    const agent = request.agent(app.getHttpServer());
    const email = `scale-${Date.now()}@example.com`;
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Scale', email, password: 'correct-horse-battery' })
      .expect(200);
    const slug = `scale-${Date.now()}`;
    const org = await agent.post('/api/v1/organizations').send({ name: slug }).expect(201);
    const orgSlug = org.body.data.slug as string;
    const orgId = org.body.data.id as string;
    const client = await agent
      .post(`/api/v1/organizations/${orgSlug}/clients`)
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await agent
      .post(`/api/v1/organizations/${orgSlug}/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await agent
      .post(`/api/v1/organizations/${orgSlug}/projects/${project.body.data.id as string}/plans`)
      .send({ name: 'Scale', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const summary = await agent
      .post(`/api/v1/organizations/${orgSlug}/plans/${planId}/activities`)
      .send({ name: 'Substructure', durationDays: 5, type: 'WBS_SUMMARY' })
      .expect(201);
    const summaryId = summary.body.data.id as string;
    const template = await prisma.activity.findUniqueOrThrow({ where: { id: summaryId } });

    // One insert, not 2,000 REST calls — see the docblock. Every row copies the summary's own
    // scalar columns, so nothing here invents a shape the write path would not produce.
    const {
      id: _id,
      name: _name,
      type: _type,
      parentId: _parentId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...shared
    } = template;
    await prisma.activity.createMany({
      data: Array.from({ length: SUBTREE }, (_unused, i) => ({
        ...shared,
        name: `Member ${i}`,
        type: 'TASK' as const,
        parentId: summaryId,
      })),
    });
    expect(await prisma.activity.count({ where: { planId, deletedAt: null } })).toBe(SUBTREE + 1);

    const deleteStart = performance.now();
    const deleted = await agent
      .delete(`/api/v1/organizations/${orgSlug}/activities/${summaryId}`)
      .expect(200);
    const deleteMs = performance.now() - deleteStart;
    const batchId = deleted.body.data.deleteBatchId as string;
    expect(await prisma.activity.count({ where: { planId, deletedAt: null } })).toBe(0);

    const restoreStart = performance.now();
    await agent
      .post(`/api/v1/organizations/${orgSlug}/plans/${planId}/activities/restore-batch/${batchId}`)
      .expect(200);
    const restoreMs = performance.now() - restoreStart;
    expect(await prisma.activity.count({ where: { planId, deletedAt: null } })).toBe(SUBTREE + 1);

    // Written to a file, not `console.log`: vitest's default reporter swallowed the log line on
    // the first run, which is exactly the shape of instrument failure this repository keeps
    // recording — a harness that looks like it reported and did not.
    const report =
      `subtree            ${SUBTREE} activities\n` +
      `cascade delete     ${deleteMs.toFixed(0)} ms\n` +
      `cascade restore    ${restoreMs.toFixed(0)} ms\n` +
      `budget             ${BUDGET_MS} ms\n` +
      `verdict            ${restoreMs < BUDGET_MS ? 'PASS' : 'FAIL — M1 stops'}\n`;
    writeFileSync(process.env.SP_MEASURE_OUT ?? 'cascade-restore-scale.txt', report);

    await prisma.activity.deleteMany({ where: { planId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.client.deleteMany({ where: { organizationId: orgId } });

    expect(restoreMs).toBeLessThan(BUDGET_MS);
  }, 300_000);
});
