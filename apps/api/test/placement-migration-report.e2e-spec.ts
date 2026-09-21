import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **The placement-migration report over HTTP** (one-planning-surface M-I-T2).
 *
 * The rows are written by a shipped SQL migration and by nothing else, so this is the only thing
 * in the product that can say what the strip did — `PATCH …/activities/:activityId` is classified
 * `PLAN_CONTENT` in the audit census and permanently excluded from `audit_events` under ADR-0073,
 * which is why the table exists at all.
 *
 * **The rows are seeded through Prisma rather than by running the migration**, and the split is
 * deliberate: `strip-drag-constraints-migration.e2e-spec.ts` owns whether the migration produces
 * the right rows, and this file owns whether a member can read them, scoped and shaped correctly.
 * Combining them would make a route defect and a SQL defect indistinguishable in a failure.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('the placement-migration report (e2e)', () => {
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

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await app?.close();
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function seedPlan(
    actor: Actor,
    slug: string,
    orgName: string,
  ): Promise<{ planId: string; organizationId: string; activityId: string }> {
    const org = await actor.agent.post('/api/v1/organizations').send({ name: orgName }).expect(201);
    const client = await actor.agent
      .post(`/api/v1/organizations/${slug}/clients`)
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/${slug}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/${slug}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Programme', plannedStart: '2026-01-05' })
      .expect(201);
    const activity = await actor.agent
      .post(`/api/v1/organizations/${slug}/plans/${plan.body.data.id}/activities`)
      .send({ name: 'Pour slab', code: 'A100', durationDays: 3 })
      .expect(201);
    return {
      planId: plan.body.data.id as string,
      organizationId: org.body.data.id as string,
      activityId: activity.body.data.id as string,
    };
  }

  /** One row, exactly as the migration writes one. */
  async function recordStrip(seed: {
    planId: string;
    organizationId: string;
    activityId: string;
  }): Promise<void> {
    await prisma.placementMigration.create({
      data: {
        organizationId: seed.organizationId,
        planId: seed.planId,
        activityId: seed.activityId,
        activityCode: 'A100',
        activityName: 'Pour slab',
        priorConstraintType: 'SNET',
        priorConstraintDate: new Date('2026-02-02T00:00:00.000Z'),
        priorVisualStart: null,
      },
    });
  }

  it('reports what was converted, with the constraint it replaced', async () => {
    const actor = await signUp('report-admin@example.com');
    const seed = await seedPlan(actor, 'acme', 'Acme');
    await recordStrip(seed);

    const res = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${seed.planId}/placement-migration`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      planId: seed.planId,
      count: 1,
      rows: [
        {
          activityId: seed.activityId,
          activityCode: 'A100',
          activityName: 'Pour slab',
          priorConstraintType: 'SNET',
          priorConstraintDate: '2026-02-02',
          priorVisualStart: null,
        },
      ],
    });
  });

  /**
   * **Zero is an answer, not an error.** Most plans have nothing to report — the strip only ever
   * touched plans carrying a binding `SNET` written by a drag before the collapse, and every plan
   * created since is in that set. A 404 here would make "nothing happened" indistinguishable from
   * "this plan does not exist".
   */
  it('reports zero for a plan the migration did not touch', async () => {
    const actor = await signUp('report-empty@example.com');
    const seed = await seedPlan(actor, 'acme', 'Acme');

    const res = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${seed.planId}/placement-migration`)
      .expect(200);

    expect(res.body.data).toEqual({ planId: seed.planId, count: 0, rows: [] });
  });

  /**
   * **Another organisation's plan is an indistinguishable 404**, the uniform anti-IDOR answer every
   * plan-nested read gives. Asserted with a REAL foreign plan that really has rows, so a route that
   * leaked would return them — a non-existent id would 404 for the wrong reason and prove nothing.
   */
  it('404s another organisation’s plan, which really does have rows', async () => {
    const owner = await signUp('report-owner@example.com');
    const ownerSeed = await seedPlan(owner, 'northwind', 'Northwind');
    await recordStrip(ownerSeed);

    const outsider = await signUp('report-outsider@example.com');
    await seedPlan(outsider, 'acme', 'Acme');

    await outsider.agent
      .get(`/api/v1/organizations/acme/plans/${ownerSeed.planId}/placement-migration`)
      .expect(404);
    await outsider.agent
      .get(`/api/v1/organizations/northwind/plans/${ownerSeed.planId}/placement-migration`)
      .expect(404);
  });

  it('refuses an unauthenticated read', async () => {
    const actor = await signUp('report-auth@example.com');
    const seed = await seedPlan(actor, 'acme', 'Acme');

    await request(server())
      .get(`/api/v1/organizations/acme/plans/${seed.planId}/placement-migration`)
      .expect(401);
  });
});
