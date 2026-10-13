import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { acquirePlanWriteLock } from '../src/common/db/plan-advisory-lock';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * A delete waits for the writers it would otherwise deadlock with (`docs/TECH_DEBT.md` #492).
 *
 * The cascade stamps a plan's activities with one `updateMany`, and until #492 it took neither the
 * plan's advisory lock nor its rows in id order. A recalculation (which holds the lock and writes
 * activities then the plan row) or a placement batch (which locks rows in id order) could then hold
 * a row the delete wanted while wanting one the delete held, and Postgres cancelled one side with
 * `40P01`: a 500 on a delete the user was entitled to.
 *
 * **Deterministic by construction, never a race.** Each case parks a test-owned transaction on the
 * exact resource in question, sends the real `DELETE`, and then reads `pg_stat_activity` until the
 * delete's backend reports what it is waiting for. What it waits on, and what it already holds when
 * it gets there, is the whole claim: a sleep would only make it a race that passes by luck.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const ORG = '/api/v1/organizations/acme';

type Tx = Prisma.TransactionClient;

interface Holder {
  tx: Tx;
  /** Commits the held transaction and resolves once it has ended. */
  release: () => Promise<void>;
}

describe.skipIf(!hasDatabase)('Hierarchy cascade lock order (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;

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

  beforeEach(async () => {
    await clearDomainData(prisma);
    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
  });

  /** Opens a transaction, runs `take` inside it, and keeps it open until `release()`. */
  async function hold(take: (tx: Tx) => Promise<void>): Promise<Holder> {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let ready!: (tx: Tx) => void;
    const started = new Promise<Tx>((resolve) => (ready = resolve));
    const done = prisma.$transaction(
      async (tx) => {
        await take(tx);
        ready(tx);
        await gate;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    // A statement that failed inside the held transaction (case B's NOWAIT probe) ends it in
    // rollback; the test has already read what it needed, so that end is not an error here.
    const settled = done.catch(() => undefined);
    return {
      tx: await started,
      release: async () => {
        open();
        await settled;
      },
    };
  }

  /** Reads `pg_stat_activity` until some backend is waiting on one of the given lock kinds. */
  async function waitUntilBlocked(events: readonly string[]): Promise<string> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<{ wait_event: string }[]>`
        SELECT wait_event FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND wait_event = ANY(${[...events]}::text[])`;
      const hit = rows[0];
      if (hit) return hit.wait_event;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`no backend waited on ${events.join(' or ')} within 10 s`);
  }

  async function createProject(): Promise<{ clientId: string; projectId: string }> {
    const client = await agent.post(`${ORG}/clients`).send({ name: 'Northgate' }).expect(201);
    const clientId = client.body.data.id as string;
    const project = await agent
      .post(`${ORG}/clients/${clientId}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    return { clientId, projectId: project.body.data.id as string };
  }

  async function createPlan(
    projectId: string,
    name: string,
  ): Promise<{ planId: string; activityId: string }> {
    const plan = await agent
      .post(`${ORG}/projects/${projectId}/plans`)
      .send({ name, plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const activity = await agent
      .post(`${ORG}/plans/${planId}/activities`)
      .send({ name: 'Seed', durationDays: 3 })
      .expect(201);
    return { planId, activityId: activity.body.data.id as string };
  }

  /** Fires a DELETE without awaiting it; the returned promise settles with the status. */
  function sendDelete(url: string): Promise<number> {
    return agent.delete(url).then((res) => res.status);
  }

  it('A: a plan delete waits for the plan advisory lock', async () => {
    const { projectId } = await createProject();
    const { planId } = await createPlan(projectId, 'Plan A');

    const holder = await hold((tx) => acquirePlanWriteLock(tx, planId));
    let status: Promise<number> | undefined;
    try {
      status = sendDelete(`${ORG}/plans/${planId}`);
      expect(await waitUntilBlocked(['advisory'])).toBe('advisory');
    } finally {
      await holder.release();
    }
    expect(await status).toBe(204);
  });

  it('B: a plan delete locks activity rows in id order, holding nothing while it waits', async () => {
    const { projectId } = await createProject();
    const { planId, activityId } = await createPlan(projectId, 'Plan B');
    const template = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
    await prisma.activity.delete({ where: { id: activityId } });
    const { id: _id, createdAt: _created, updatedAt: _updated, ...shared } = template;

    // Inserted highest id first, so heap (and plan_id index) order is the reverse of id order: a
    // statement that locks in scan order reaches the highest id first, one that sorts reaches the
    // lowest.
    const ids = Array.from({ length: 4 }, () => randomUUID()).sort();
    const lowest = ids[0] as string;
    const highest = ids[ids.length - 1] as string;
    await prisma.activity.createMany({
      data: [...ids].reverse().map((id, i) => ({ ...shared, id, name: `Row ${i}` })),
    });

    const holder = await hold(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM activities WHERE id = ${lowest}::uuid FOR NO KEY UPDATE`;
    });
    let status: Promise<number> | undefined;
    let probe: unknown;
    try {
      status = sendDelete(`${ORG}/plans/${planId}`);
      await waitUntilBlocked(['transactionid', 'tuple']);
      // In id order the delete is parked on the lowest row and holds nothing above it, so this
      // succeeds. In scan order it already holds the highest row and this fails with 55P03.
      try {
        await holder.tx
          .$queryRaw`SELECT 1 FROM activities WHERE id = ${highest}::uuid FOR NO KEY UPDATE NOWAIT`;
      } catch (error) {
        probe = error;
      }
    } finally {
      await holder.release();
    }
    expect(probe, 'the delete already held a higher-id row while parked on the lowest').toBe(
      undefined,
    );
    expect(await status).toBe(204);
  });

  it('C: a client delete takes its plans locks in sorted order', async () => {
    const { clientId, projectId } = await createProject();
    const first = await createPlan(projectId, 'Plan C1');
    const second = await createPlan(projectId, 'Plan C2');
    const [lower, higher] = [first.planId, second.planId].sort() as [string, string];

    const holder = await hold((tx) => acquirePlanWriteLock(tx, lower));
    let status: Promise<number> | undefined;
    let tookHigher = false;
    try {
      status = sendDelete(`${ORG}/clients/${clientId}`);
      await waitUntilBlocked(['advisory']);
      // Parked on the lower key, the delete has not reached the higher one: a sorted order.
      const [row] = await holder.tx.$queryRaw<{ got: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext('dependency-plan'), hashtext(${higher})) AS got`;
      tookHigher = row?.got === true;
    } finally {
      await holder.release();
    }
    expect(tookHigher, 'the delete held the higher plan key while waiting on the lower').toBe(true);
    expect(await status).toBe(204);
  });

  it('D: a baseline captured while the plan is locked does not survive the plan delete', async () => {
    const { projectId } = await createProject();
    const { planId } = await createPlan(projectId, 'Plan D');
    await agent.post(`${ORG}/plans/${planId}/schedule/recalculate`).send({}).expect(200);

    const holder = await hold((tx) => acquirePlanWriteLock(tx, planId));
    let capture: Promise<number> | undefined;
    let removal: Promise<number> | undefined;
    try {
      capture = agent
        .post(`${ORG}/plans/${planId}/baselines`)
        .send({ name: 'Racing' })
        .then((res) => res.status);
      await waitUntilBlocked(['advisory']);
      removal = sendDelete(`${ORG}/plans/${planId}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      await holder.release();
    }
    await capture;
    expect(await removal).toBe(204);
    expect(await prisma.baseline.count({ where: { planId, deletedAt: null } })).toBe(0);
  });
});
