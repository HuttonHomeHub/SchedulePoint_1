import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { permissionsForRole } from '../src/common/auth/org-permissions';
import { Principal } from '../src/common/auth/principal';
import { acquirePlanWriteLock } from '../src/common/db/plan-advisory-lock';
import { NotFoundError } from '../src/common/errors/domain-errors';
import { ActivitiesService } from '../src/modules/activities/activities.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **Can a top-level activity create commit a live row under a plan that is being deleted?**
 * (`docs/TECH_DEBT.md` #550, the same race #520 closed for project calendars.)
 *
 * A plan delete holds the plan advisory lock across its sweep. The insert's foreign key takes
 * `KEY SHARE` on the plan row, which does not conflict with the cascade's `NO KEY UPDATE`, so only
 * the advisory lock keeps a create from landing after the sweep has read. Create used to take it
 * only for a child; it now takes it for every create and re-checks the plan once it holds it.
 *
 * **Driven below HTTP**, like `hierarchy-parent-lock-race.e2e-spec.ts`: two Supertest requests do
 * not overlap (#70). A second connection plays the delete: it holds the plan lock, the create is
 * started while it is held, and the plan is stamped deleted before the lock is released. The create
 * has already passed its pre-transaction plan read by then, which is exactly the window.
 *
 * **Red without the fix:** the create never waits, so it finishes inside the hold
 * (`createFinishedWhileHeld` true) and leaves a live activity under the deleted plan.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
/** Long enough that an unobstructed create (tens of ms) has certainly committed inside the hold. */
const HOLD_MS = 1_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(!hasDatabase)('Activity create against a delete of its plan (below HTTP)', () => {
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
    if (prisma) await clearDomainData(prisma);
    await app?.close();
  });

  async function world(): Promise<{ orgSlug: string; principal: Principal; planId: string }> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Racer', email: `createrace-${stamp}@example.com`, password: PASSWORD })
      .expect(200);
    const org = await agent
      .post('/api/v1/organizations')
      .send({ name: `Create Race ${stamp}` })
      .expect(201);
    const orgSlug = org.body.data.slug as string;
    const base = `/api/v1/organizations/${orgSlug}`;
    const client = await agent.post(`${base}/clients`).send({ name: 'Northgate' }).expect(201);
    const project = await agent
      .post(`${base}/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await agent
      .post(`${base}/projects/${project.body.data.id as string}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-05' })
      .expect(201);
    const me = await agent.get('/api/v1/me').expect(200);
    const principal = new Principal(me.body.data.user.id as string, [
      {
        organizationId: org.body.data.id as string,
        role: 'ORG_ADMIN',
        permissions: permissionsForRole('ORG_ADMIN'),
      },
    ]);
    return { orgSlug, principal, planId: plan.body.data.id as string };
  }

  it('a top-level create that meets a plan delete in flight is a 404 and inserts nothing', async () => {
    const w = await world();
    let held!: () => void;
    const heldPromise = new Promise<void>((resolve) => (held = resolve));

    // The "delete": holds the plan lock, then stamps the plan deleted, then commits.
    const deleter = prisma.$transaction(
      async (tx) => {
        await acquirePlanWriteLock(tx, w.planId);
        held();
        await sleep(HOLD_MS);
        await tx.plan.update({ where: { id: w.planId }, data: { deletedAt: new Date() } });
      },
      { timeout: 30_000 },
    );
    await heldPromise;

    let createSettled = false;
    const createResult = app
      .get(ActivitiesService)
      .create(w.principal, w.orgSlug, w.planId, { name: 'Top level' })
      .then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      )
      .finally(() => {
        createSettled = true;
      });
    await sleep(HOLD_MS / 2);
    const createFinishedWhileHeld = createSettled;
    await deleter;
    const result = await createResult;

    expect(
      createFinishedWhileHeld,
      'the create was not held by the plan lock, so there was nothing for it to serialise',
    ).toBe(false);
    expect(result.status).toBe('rejected');
    expect((result as { reason: unknown }).reason).toBeInstanceOf(NotFoundError);
    expect(await prisma.activity.count({ where: { planId: w.planId, deletedAt: null } })).toBe(0);
  });
});
