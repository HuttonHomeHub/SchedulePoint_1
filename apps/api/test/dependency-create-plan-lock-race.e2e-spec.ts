import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { permissionsForRole } from '../src/common/auth/org-permissions';
import { Principal } from '../src/common/auth/principal';
import { acquirePlanWriteLock } from '../src/common/db/plan-advisory-lock';
import { NotFoundError } from '../src/common/errors/domain-errors';
import { DependenciesService } from '../src/modules/dependencies/dependencies.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **Can a dependency create commit a live link under an endpoint, or a plan, that is being deleted?**
 * (`docs/TECH_DEBT.md` #553, the sibling of #550.)
 *
 * The create reads the plan and both endpoints BEFORE its transaction, then waits for the plan
 * advisory lock. A delete that holds the lock sweeps and commits first; the insert's foreign keys
 * only take `KEY SHARE`, which the sweep's `NO KEY UPDATE` does not block, so without a re-read
 * under the lock a live link lands under a deleted endpoint, and the engine's graph build then
 * throws on it (`UnknownActivityError`).
 *
 * **Driven below HTTP**, like `activity-create-plan-lock-race.e2e-spec.ts`: two Supertest requests
 * do not overlap (#70), so a second connection plays the delete (holds the lock, stamps, commits)
 * while the create is started.
 *
 * **Red without the fix:** the create resolves with a link (`status` is `fulfilled`) and one live
 * link is left under the deleted endpoint.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
/** Long enough that an unobstructed create (tens of ms) has certainly committed inside the hold. */
const HOLD_MS = 1_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface World {
  orgSlug: string;
  principal: Principal;
  planId: string;
  predId: string;
  succId: string;
}

describe.skipIf(!hasDatabase)('Dependency create against a delete in flight (below HTTP)', () => {
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
    try {
      if (prisma) await clearDomainData(prisma);
    } finally {
      await app?.close();
    }
  });

  async function world(): Promise<World> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Racer', email: `deprace-${stamp}@example.com`, password: PASSWORD })
      .expect(200);
    const org = await agent
      .post('/api/v1/organizations')
      .send({ name: `Dep Race ${stamp}` })
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
    const planId = plan.body.data.id as string;
    const activity = async (name: string): Promise<string> => {
      const res = await agent.post(`${base}/plans/${planId}/activities`).send({ name }).expect(201);
      return res.body.data.id as string;
    };
    const me = await agent.get('/api/v1/me').expect(200);
    const principal = new Principal(me.body.data.user.id as string, [
      {
        organizationId: org.body.data.id as string,
        role: 'ORG_ADMIN',
        permissions: permissionsForRole('ORG_ADMIN'),
      },
    ]);
    return {
      orgSlug,
      principal,
      planId,
      predId: await activity('Pred'),
      succId: await activity('Succ'),
    };
  }

  /** Hold the plan lock, run `sweep`, commit; start a create meanwhile and report how it ended. */
  async function createMeetingDelete(
    w: World,
    sweep: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    let held!: () => void;
    const heldPromise = new Promise<void>((resolve) => (held = resolve));
    const deleter = prisma.$transaction(
      async (tx) => {
        await acquirePlanWriteLock(tx, w.planId);
        held();
        await sleep(HOLD_MS);
        await sweep(tx);
      },
      { timeout: 30_000 },
    );
    await heldPromise;

    let createSettled = false;
    const createResult = app
      .get(DependenciesService)
      .create(w.principal, w.orgSlug, w.planId, {
        predecessorId: w.predId,
        successorId: w.succId,
      })
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
    return { createFinishedWhileHeld, result: await createResult };
  }

  const liveLinks = (planId: string) =>
    prisma.activityDependency.count({ where: { planId, deletedAt: null } });

  it('a create that meets a delete of its predecessor is a 404 and leaves no live link', async () => {
    const w = await world();
    const { createFinishedWhileHeld, result } = await createMeetingDelete(w, async (tx) => {
      await tx.activity.update({ where: { id: w.predId }, data: { deletedAt: new Date() } });
    });

    expect(
      createFinishedWhileHeld,
      'the create was not held by the plan lock, so there was nothing for it to serialise',
    ).toBe(false);
    expect(result.status).toBe('rejected');
    expect((result as { reason: unknown }).reason).toBeInstanceOf(NotFoundError);
    expect(await liveLinks(w.planId)).toBe(0);
  });

  it('a create that meets a delete of its plan is a 404 and leaves no live link', async () => {
    const w = await world();
    const { createFinishedWhileHeld, result } = await createMeetingDelete(w, async (tx) => {
      const deletedAt = new Date();
      await tx.activity.updateMany({ where: { planId: w.planId }, data: { deletedAt } });
      await tx.plan.update({ where: { id: w.planId }, data: { deletedAt } });
    });

    expect(createFinishedWhileHeld).toBe(false);
    expect(result.status).toBe('rejected');
    expect((result as { reason: unknown }).reason).toBeInstanceOf(NotFoundError);
    expect(await liveLinks(w.planId)).toBe(0);
  });
});
