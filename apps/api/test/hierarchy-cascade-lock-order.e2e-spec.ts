import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient, type Prisma } from '@prisma/client';
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
  /**
   * The test's own connections, for the transactions it parks and the `pg_stat_activity` polling. A
   * held transaction pins a connection for the whole case, and case D parks one while two requests
   * wait on it: on the app's pool (small on a small runner) that could starve the very requests
   * under test, which would look like a failure of the lock order and be nothing of the sort.
   */
  let aux: PrismaClient;
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
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.searchParams.set('connection_limit', '4');
    aux = new PrismaClient({ datasourceUrl: url.toString() });
  });

  afterAll(async () => {
    await aux?.$disconnect();
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
    const done = aux.$transaction(
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
    // If `take` itself fails, `started` would never settle: race it against the transaction so a
    // setup failure surfaces as that failure rather than as a timeout.
    const tx = await Promise.race([
      started,
      done.then(() => {
        throw new Error('the held transaction ended before it was released');
      }),
    ]);
    return {
      tx,
      release: async () => {
        open();
        await settled;
      },
    };
  }

  /**
   * Reads `pg_stat_activity` until `count` backends are waiting on one of the given lock kinds,
   * narrowed to the statement they are running (`query` ILIKE `pattern`) so an unrelated backend
   * on the shared database cannot satisfy it.
   */
  async function waitUntilBlocked(
    events: readonly string[],
    pattern: string,
    count = 1,
  ): Promise<string> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await aux.$queryRaw<{ wait_event: string }[]>`
        SELECT wait_event FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND wait_event = ANY(${[...events]}::text[])
          AND query ILIKE ${pattern}`;
      const hit = rows[0];
      if (rows.length >= count && hit) return hit.wait_event;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${count} backend(s) did not wait on ${events.join(' or ')} within 10 s`);
  }

  const ON_ADVISORY = '%pg_advisory_xact_lock%';
  const ON_ACTIVITY_ROWS = '%activities%';

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
      expect(await waitUntilBlocked(['advisory'], ON_ADVISORY)).toBe('advisory');
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
      await waitUntilBlocked(['transactionid', 'tuple'], ON_ACTIVITY_ROWS);
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
    // Plan ids are time-ordered (uuid v7), so two plans created in turn would already be in sorted
    // order and a delete that locked them in creation order would pass. The second plan is inserted
    // with an explicit id BELOW the first's, so the plan created first has the HIGHER id and only a
    // delete that sorts takes the lower one first.
    //
    // The delete reads its plans in heap order, which earlier cases in this file can scramble by
    // leaving free slots that a later insert reuses. Compacting the (empty) table first makes the
    // inserts append, and the precondition below fails loudly if the plans still do not come back
    // higher-first, rather than letting the case pass without being able to fail.
    await prisma.$executeRawUnsafe('VACUUM FULL plans');
    const first = await createPlan(projectId, 'Plan C1');
    const template = await prisma.plan.findUniqueOrThrow({ where: { id: first.planId } });
    const lowerId = '00000000-0000-4000-8000-000000000001';
    const { id: _id, createdAt: _created, updatedAt: _updated, ...shared } = template;
    await prisma.plan.create({ data: { ...shared, id: lowerId, name: 'Plan C2' } });
    const higher = first.planId;
    const lower = lowerId;
    expect(lower < higher).toBe(true);
    const scanned = await prisma.plan.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true },
    });
    expect(
      scanned.map((p) => p.id),
      'precondition: the unsorted scan is higher-first',
    ).toEqual([higher, lower]);

    const holder = await hold((tx) => acquirePlanWriteLock(tx, lower));
    let status: Promise<number> | undefined;
    let tookHigher = false;
    try {
      status = sendDelete(`${ORG}/clients/${clientId}`);
      await waitUntilBlocked(['advisory'], ON_ADVISORY);
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
      await waitUntilBlocked(['advisory'], ON_ADVISORY);
      removal = sendDelete(`${ORG}/plans/${planId}`);
      // Both requests are now queued on the plan lock, whatever order they release in.
      await waitUntilBlocked(['advisory'], ON_ADVISORY, 2);
    } finally {
      await holder.release();
    }
    // Whichever gets the lock first, the capture either lands before the delete and is swept by it
    // (201), or finds no activities left and is refused (422): never a 5xx, never a survivor.
    expect([201, 422]).toContain(await capture);
    expect(await removal).toBe(204);
    expect(await prisma.baseline.count({ where: { planId, deletedAt: null } })).toBe(0);
  });
});
