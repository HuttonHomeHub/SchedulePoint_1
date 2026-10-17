import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { permissionsForRole } from '../src/common/auth/org-permissions';
import { Principal } from '../src/common/auth/principal';
import { HierarchyLifecycleService } from '../src/common/hierarchy/hierarchy-lifecycle.service';
import { CalendarRepository } from '../src/modules/calendars/calendar.repository';
import { CalendarsService } from '../src/modules/calendars/calendars.service';
import { ClientsService } from '../src/modules/clients/clients.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * **Does a restore stop a delete of its ancestor from leaving it active under a deleted row?**
 * (`docs/TECH_DEBT.md` #520, ADR-0201 D3.)
 *
 * A restore reads its parent and writes on the strength of it; a client or project delete sweeps its
 * subtree and then stamps itself. With neither locked they interleave and the child ends ACTIVE under
 * a deleted ancestor. Optimistic `version` cannot see it: the two write different rows. The fix is a
 * `FOR SHARE` lock on every ancestor in the restore (top-down) against a `FOR NO KEY UPDATE` lock on
 * the delete's own root, taken before it reads its subtree (`common/db/hierarchy-row-lock.ts`).
 *
 * **Like `wbs-reparent-race.e2e-spec.ts`, this drives the race below HTTP.** Two Supertest requests
 * fired together do not overlap (#70 measured the second beginning ~15 ms after the first had
 * committed), so a pair of them passes with the lock removed. Here the restore is a direct service
 * call that is **held** at a seam after it has read its ancestors, the delete is started while it is
 * held, and the test waits long enough that an unobstructed delete would already have committed.
 *
 * ## What each outcome means
 *
 * - **With the lock (today):** the delete blocks on the restore's share lock, so it has NOT finished
 *   when the hold is released (`deleteFinishedWhileHeld` false). The restore commits, the delete then
 *   reads the restored child and sweeps it, and the end state is "child and ancestor both deleted".
 * - **Without it:** the delete is not blocked, finishes inside the hold (`true`), and the restore,
 *   released afterwards, writes an active child under the ancestor the delete just stamped.
 *
 * The first assertion in every case is the non-vacuity one, for the reason #70 exists: a test that
 * looks like a race and is not one reads as proof.
 *
 * **Verify it red before trusting it** (the orchestrator runs the suite; this file was written
 * without a database): comment out, in turn, `lockActiveProjectChainForShare` /
 * `lockActiveClientForShare` in `HierarchyLifecycleService.assertParentActive`, the same call in
 * `CalendarsService.restore`, and `lockClientRowForDelete` / `lockProjectRowForDelete` in
 * `cascadeSoftDelete`. Each removal must turn the cases named in its comment below red. Removing
 * the client lock from `assertParentActive` must fail the two client-delete cases and not the
 * project-delete ones, which is what shows the top-down rule is load-bearing.
 *
 * **Where it bypasses the product, stated plainly:** setup is real HTTP, but the racing calls are
 * service calls, so the controller, DTOs and guards are not measured. What is measured is the seam
 * the invariant lives at: the transaction, the row locks, and the writes, on a real PostgreSQL.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
/** Long enough that an unobstructed delete (tens of ms) has certainly committed inside the hold. */
const HOLD_MS = 1_000;
/** Guard so a restore that never reaches the seam fails the test instead of hanging it. */
const REACH_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(!hasDatabase)('Restore against a delete of its ancestor (below HTTP)', () => {
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

  interface World {
    orgSlug: string;
    principal: Principal;
    clientId: string;
    projectId: string;
    planId: string;
    /** DELETE a resource through the public API (setup only). */
    remove: (path: string) => Promise<void>;
    createProjectCalendar: (name: string) => Promise<string>;
  }

  /** A fresh organisation with one client → project → plan. */
  async function world(): Promise<World> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Racer', email: `lockrace-${stamp}@example.com`, password: PASSWORD })
      .expect(200);
    const org = await agent
      .post('/api/v1/organizations')
      .send({ name: `Lock Race ${stamp}` })
      .expect(201);
    const orgId = org.body.data.id as string;
    const orgSlug = org.body.data.slug as string;
    const base = `/api/v1/organizations/${orgSlug}`;
    const client = await agent.post(`${base}/clients`).send({ name: 'Northgate' }).expect(201);
    const clientId = client.body.data.id as string;
    const project = await agent
      .post(`${base}/clients/${clientId}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const projectId = project.body.data.id as string;
    const plan = await agent
      .post(`${base}/projects/${projectId}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-05' })
      .expect(201);
    const me = await agent.get('/api/v1/me').expect(200);
    const principal = new Principal(me.body.data.user.id as string, [
      { organizationId: orgId, role: 'ORG_ADMIN', permissions: permissionsForRole('ORG_ADMIN') },
    ]);
    return {
      orgSlug,
      principal,
      clientId,
      projectId,
      planId: plan.body.data.id as string,
      remove: async (path) => {
        await agent.delete(`${base}${path}`).expect(204);
      },
      createProjectCalendar: async (name) => {
        const res = await agent
          .post(`${base}/calendars`)
          .send({ name, workingWeekdays: 31, scope: 'PROJECT', projectId })
          .expect(201);
        return res.body.data.id as string;
      },
    };
  }

  /**
   * Active rows under a deleted ancestor: the state the locks exist to make unreachable. Written as
   * explicit relation filters so a failure names which level broke.
   */
  async function orphans(
    w: World,
  ): Promise<{ plans: number; projects: number; calendars: number }> {
    const ids = { clientId: w.clientId, projectId: w.projectId };
    return {
      plans: await prisma.plan.count({
        where: { projectId: ids.projectId, deletedAt: null, project: { deletedAt: { not: null } } },
      }),
      projects: await prisma.project.count({
        where: { id: ids.projectId, deletedAt: null, client: { deletedAt: { not: null } } },
      }),
      calendars: await prisma.calendar.count({
        where: { projectId: ids.projectId, deletedAt: null, project: { deletedAt: { not: null } } },
      }),
    };
  }

  /**
   * Run `restore` held at `installSeam`'s hook, start `remove` while it is held, release after
   * `HOLD_MS`, and report whether the delete had finished while the restore was holding its locks.
   */
  async function raceHeld(params: {
    installSeam: (hold: () => Promise<void>) => () => void;
    restore: () => Promise<unknown>;
    remove: () => Promise<unknown>;
  }): Promise<{
    deleteFinishedWhileHeld: boolean;
    restoreResult: PromiseSettledResult<unknown>;
    removeResult: PromiseSettledResult<unknown>;
  }> {
    let reached!: () => void;
    const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const uninstall = params.installSeam(async () => {
      reached();
      await released;
    });
    try {
      const restore = params.restore();
      const restoreSettled = Promise.allSettled([restore]).then(([r]) => r);
      await Promise.race([
        reachedPromise,
        sleep(REACH_TIMEOUT_MS).then(() => {
          throw new Error('the restore never reached the hold');
        }),
      ]);
      let deleteSettled = false;
      const remove = params.remove();
      const removeSettled = Promise.allSettled([remove]).then(([r]) => {
        deleteSettled = true;
        return r;
      });
      await sleep(HOLD_MS);
      const deleteFinishedWhileHeld = deleteSettled;
      release();
      return {
        deleteFinishedWhileHeld,
        restoreResult: await restoreSettled,
        removeResult: await removeSettled,
      };
    } finally {
      release();
      uninstall();
    }
  }

  /** Hold `HierarchyLifecycleService.restoreBatch` right after its ancestor locks are taken. */
  function holdAfterAncestorLocks(hold: () => Promise<void>): () => void {
    const lifecycle = app.get<Record<string, unknown>>(HierarchyLifecycleService);
    const original = lifecycle.assertCalendarsActive as (...args: unknown[]) => Promise<void>;
    lifecycle.assertCalendarsActive = async function (this: unknown, ...args: unknown[]) {
      await hold();
      return original.apply(this, args);
    };
    return () => {
      lifecycle.assertCalendarsActive = original;
    };
  }

  /** Hold `CalendarsService.restore` right after its project check, before its first write. */
  function holdAfterProjectCheck(hold: () => Promise<void>): () => void {
    // The instance the service holds: several modules provide their own `CalendarRepository`, so
    // `app.get(CalendarRepository)` may hand back one the restore never calls.
    const repository = (app.get(CalendarsService) as unknown as { calendars: CalendarRepository })
      .calendars as unknown as Record<string, unknown>;
    const original = repository.findActiveHoldingNameInTier as (
      ...args: unknown[]
    ) => Promise<unknown>;
    repository.findActiveHoldingNameInTier = async function (this: unknown, ...args: unknown[]) {
      await hold();
      return original.apply(this, args);
    };
    return () => {
      repository.findActiveHoldingNameInTier = original;
    };
  }

  it('a project-calendar restore against a delete of its project ends with both deleted', async () => {
    // Red without: the project lock in CalendarsService.restore, or lockProjectRowForDelete.
    const w = await world();
    const calendarId = await w.createProjectCalendar('Site hours');
    await w.remove(`/calendars/${calendarId}`);

    const result = await raceHeld({
      installSeam: holdAfterProjectCheck,
      restore: () => app.get(CalendarsService).restore(w.principal, w.orgSlug, calendarId),
      remove: () => app.get(ProjectsService).remove(w.principal, w.orgSlug, w.projectId),
    });

    expect(
      result.deleteFinishedWhileHeld,
      'the delete was not held by the restore, so there was nothing for the lock to serialise',
    ).toBe(false);
    expect(result.restoreResult.status).toBe('fulfilled');
    expect(result.removeResult.status).toBe('fulfilled');
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0, calendars: 0 });
    expect(
      (await prisma.calendar.findUniqueOrThrow({ where: { id: calendarId } })).deletedAt,
    ).not.toBe(null);
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: w.projectId } })).deletedAt,
    ).not.toBe(null);
  });

  it('a plan restore against a delete of its project ends with both deleted', async () => {
    // Red without: the project share lock in assertParentActive, or lockProjectRowForDelete.
    const w = await world();
    await w.remove(`/plans/${w.planId}`);

    const result = await raceHeld({
      installSeam: holdAfterAncestorLocks,
      restore: () => app.get(PlansService).restore(w.principal, w.orgSlug, w.planId),
      remove: () => app.get(ProjectsService).remove(w.principal, w.orgSlug, w.projectId),
    });

    expect(result.deleteFinishedWhileHeld, 'the delete was not held by the restore').toBe(false);
    expect(result.restoreResult.status).toBe('fulfilled');
    expect(result.removeResult.status).toBe('fulfilled');
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0, calendars: 0 });
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: w.planId } })).deletedAt).not.toBe(
      null,
    );
  });

  it('a plan restore against a delete of its CLIENT ends with both deleted', async () => {
    // The hole the database-architect review found: a client delete reads its project and plan ids
    // as a snapshot and only takes the project rows when it stamps them, so a restore that locked
    // just its project would never meet the client's lock. Red without: lockActiveClientForShare in
    // the plan branch of assertParentActive (the project-delete cases stay green, which is the point).
    const w = await world();
    await w.remove(`/plans/${w.planId}`);

    const result = await raceHeld({
      installSeam: holdAfterAncestorLocks,
      restore: () => app.get(PlansService).restore(w.principal, w.orgSlug, w.planId),
      remove: () => app.get(ClientsService).remove(w.principal, w.orgSlug, w.clientId),
    });

    expect(result.deleteFinishedWhileHeld, 'the delete was not held by the restore').toBe(false);
    expect(result.restoreResult.status).toBe('fulfilled');
    expect(result.removeResult.status).toBe('fulfilled');
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0, calendars: 0 });
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: w.planId } })).deletedAt).not.toBe(
      null,
    );
  });

  it('a project restore against a delete of its client ends with both deleted', async () => {
    // Red without: the client share lock in the project branch of assertParentActive, or
    // lockClientRowForDelete.
    const w = await world();
    await w.remove(`/projects/${w.projectId}`);

    const result = await raceHeld({
      installSeam: holdAfterAncestorLocks,
      restore: () => app.get(ProjectsService).restore(w.principal, w.orgSlug, w.projectId),
      remove: () => app.get(ClientsService).remove(w.principal, w.orgSlug, w.clientId),
    });

    expect(result.deleteFinishedWhileHeld, 'the delete was not held by the restore').toBe(false);
    expect(result.restoreResult.status).toBe('fulfilled');
    expect(result.removeResult.status).toBe('fulfilled');
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0, calendars: 0 });
  });

  it('the other order: a restore that arrives after the delete committed is refused PARENT_DELETED', async () => {
    // The delete-first half of the argument, without a hold: nothing may be restored under a project
    // that is already deleted, and the refusal is the existing 409 rather than a lock timeout.
    const w = await world();
    await w.remove(`/plans/${w.planId}`);
    await app.get(ProjectsService).remove(w.principal, w.orgSlug, w.projectId);

    await expect(
      app.get(PlansService).restore(w.principal, w.orgSlug, w.planId),
    ).rejects.toMatchObject({ details: { reason: 'PARENT_DELETED' } });
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0, calendars: 0 });
  });
});
