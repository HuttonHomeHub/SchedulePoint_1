import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { permissionsForRole } from '../src/common/auth/org-permissions';
import { Principal } from '../src/common/auth/principal';
import { ActivitiesService } from '../src/modules/activities/activities.service';
import { ActivityRepository } from '../src/modules/activities/activity.repository';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * **Does the plan advisory lock actually stop two mirror WBS re-parents?**
 * (`docs/TECH_DEBT.md` #70, the first of its two remedies.)
 *
 * ADR-0038 invariant (a) is a read-then-write: `assertValidParent` walks the parent chain and then
 * writes on the strength of what it read, so two concurrent mirror re-parents — A under B, B under
 * A — each read a chain that is still acyclic, both pass, and the tree ends up cyclic. Optimistic
 * `version` cannot catch it, because each request writes only its OWN row at exactly the version it
 * read. `activities.service.ts` takes `acquirePlanWriteLock` before the walk for that reason.
 *
 * **The existing HTTP test cannot prove that, and #70 is the record of finding out.** Two mirror
 * `PATCH`es fired with `Promise.all` through Supertest do **not** race: instrumenting the walk
 * showed the second request beginning ~15 ms AFTER the first transaction had committed, so the case
 * passes identically with the lock removed. It is named `rejects the mirror re-parent …` rather
 * than `serialises concurrent …` precisely so it stops implying a guarantee it does not make.
 *
 * **So this drives the race below HTTP**, which is the remedy that row left open: two direct
 * `ActivitiesService.update` calls, each opening its own interactive transaction (#70 records two
 * of those measured interleaving correctly), with a **barrier at the read seam**.
 *
 * **This is not the first file here to drive concurrency below HTTP, and the older one records a
 * DIFFERENT reason** (noticed 2026-09-12; neither referenced the other until then).
 * `csp-report.e2e-spec.ts`'s burst case has resolved its service off the container and fired
 * sixteen concurrent `record()` calls since 2026-08-10 — a month before this file — because
 * sixteen concurrent Supertest requests reset the connection and leaked their in-flight writes past
 * `beforeEach` into the following test. That is a high-N failure of the harness; #70's own
 * measurement is a low-N one (two requests that never overlap). Both are true of this harness, and
 * a reader choosing where to put a race test wants both. What is new HERE is the barrier, not the
 * idea of calling the service directly.
 *
 * **And the older one has already caught a production defect**, which is the strongest argument for
 * the pattern: it is what reported `expected 15 to be 16` while `docs/TECH_DEBT.md` #311's residual
 * race was live — a real one-in-sixteen loss, in a subsystem holding no advisory lock at all.
 *
 * ## Why the barrier is the whole design, and what it proves
 *
 * `ActivityRepository.findActiveByIdInOrg` is wrapped so that the first in-transaction call for one
 * of the two summaries waits for a **peer** call to arrive before returning — the "barrier between
 * the read and the write" #70 names. Two outcomes, and they are opposite:
 *
 * - **With the lock (today), measured:** `peerArrived` false, durations **1524 ms and 3025 ms**.
 *   The second transaction blocks on the advisory lock BEFORE it can reach the read, so the peer
 *   never arrives, the barrier times out at 1500 ms, and the loser then waits out the winner on top
 *   of that. Those two facts are the non-vacuity proof: they say the calls really were concurrent
 *   and really were serialised, which is exactly what the HTTP test could not say.
 * - **Without the lock, also measured rather than predicted:** `peerArrived` true, durations
 *   **17 ms and 17 ms**, and **both calls succeed** — both reach the read, both see an acyclic tree,
 *   both write, and the tree is cyclic. Contrast those 17 ms with the ~15 ms by which Supertest
 *   *separates* the same pair: the same order of magnitude, opposite meanings.
 *
 * **Verified red before shipping**: commenting out `acquirePlanWriteLock` in
 * `activities.service.ts`'s update path turns this case red on the acyclicity assertion, with
 * `peerArrived` true. A test that looks like a race and is not one is this row's entire subject, so
 * a passing run here is worth nothing without that.
 *
 * **Where it bypasses the product, stated plainly** (ADR-0081's rule): the setup is real HTTP, but
 * the two racing calls are service calls, so this measures neither the controller, the DTO layer
 * nor the guards. What it measures is the seam the invariant lives at — the transaction, the
 * advisory lock, the ancestor walk and the write — on a real PostgreSQL.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
/** How long the first arrival waits for its peer. Generous: with the lock, it always expires. */
const BARRIER_MS = 1_500;

describe.skipIf(!hasDatabase)('WBS re-parent race (below HTTP)', () => {
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

  it('serialises two mirror re-parents that a Supertest pair cannot race', async () => {
    const stamp = Date.now();
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Racer', email: `race-${stamp}@example.com`, password: PASSWORD })
      .expect(200);

    const org = await agent
      .post('/api/v1/organizations')
      .send({ name: `Race Co ${stamp}` })
      .expect(201);
    const orgId = org.body.data.id as string;
    const orgSlug = org.body.data.slug as string;

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
      .send({ name: 'Race', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;

    const summary = async (name: string): Promise<{ id: string; version: number }> => {
      const res = await agent
        .post(`/api/v1/organizations/${orgSlug}/plans/${planId}/activities`)
        .send({ name, durationDays: 5, type: 'WBS_SUMMARY' })
        .expect(201);
      return { id: res.body.data.id as string, version: res.body.data.version as number };
    };
    const a = await summary('A');
    const b = await summary('B');

    const me = await agent.get('/api/v1/me').expect(200);
    const principal = new Principal(me.body.data.id as string, [
      { organizationId: orgId, role: 'PLANNER', permissions: permissionsForRole('PLANNER') },
    ]);

    const service = app.get(ActivitiesService);
    const repository = app.get(ActivityRepository);
    const original = repository.findActiveByIdInOrg.bind(repository);

    // The barrier. `arrive()` resolves as soon as a peer arrives, or after BARRIER_MS.
    let waiting: (() => void) | null = null;
    let peerArrived = false;
    const arrive = async (): Promise<void> => {
      if (waiting) {
        peerArrived = true;
        waiting();
        waiting = null;
        return;
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          waiting = null;
          resolve();
        }, BARRIER_MS);
        waiting = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    };

    // Armed ONLY for the in-transaction parent read: `assertValidParent` passes a third `tx`
    // argument and asks for one of the two summaries, while `update`'s own preamble reads the
    // activity being edited with two arguments and must not trip anything.
    (repository as unknown as Record<string, unknown>).findActiveByIdInOrg = async (
      ...args: Parameters<typeof original>
    ): ReturnType<typeof original> => {
      const [id, , tx] = args;
      if (tx !== undefined && (id === a.id || id === b.id)) await arrive();
      return original(...args);
    };

    const timed = async (p: Promise<unknown>): Promise<number> => {
      const started = Date.now();
      await p.catch(() => undefined);
      return Date.now() - started;
    };

    let outcomes: PromiseSettledResult<unknown>[];
    let durations: number[];
    try {
      const first = service.update(principal, orgSlug, a.id, {
        parentId: b.id,
        version: a.version,
      });
      const second = service.update(principal, orgSlug, b.id, {
        parentId: a.id,
        version: b.version,
      });
      [durations, outcomes] = await Promise.all([
        Promise.all([timed(first), timed(second)]),
        Promise.allSettled([first, second]),
      ]);
    } finally {
      (repository as unknown as Record<string, unknown>).findActiveByIdInOrg = original;
    }

    // --- Non-vacuity FIRST: did this actually race, and was it actually serialised? ------------
    //
    // Both are about the harness rather than the product, and #70 exists because a case that could
    // not say either of them read as proof for two months.
    expect(
      peerArrived,
      'the second transaction reached the parent read, so the lock did not serialise them',
    ).toBe(false);
    expect(
      Math.max(...durations),
      'neither call waited on the other — they were serialised before reaching the lock, which is ' +
        'the Supertest defect this test exists to escape',
    ).toBeGreaterThanOrEqual(BARRIER_MS);

    // --- The invariant -------------------------------------------------------------------------
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      details: { reason: 'PARENT_CYCLE' },
    });

    const rows = await prisma.activity.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.filter((r) => r.parentId !== null)).toHaveLength(1);
  });
});
