import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { permissionsForRole } from '../src/common/auth/org-permissions';
import { Principal } from '../src/common/auth/principal';
import { ClientsService } from '../src/modules/clients/clients.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * **Does a create stop a delete of its parent from leaving it active under a deleted row?**
 * (`docs/TECH_DEBT.md` #531, the create-path twin of #520 / ADR-0201 D3.)
 *
 * A plan or project create read its parent and then inserted, unlocked. The insert's own
 * foreign-key check takes `FOR KEY SHARE`, which a delete's `FOR NO KEY UPDATE` does not conflict
 * with, so a create that had read an active parent could still insert after the delete had swept
 * and stamped it. The fix reads the parent `FOR SHARE` in the create's transaction
 * (`common/db/hierarchy-row-lock.ts`), ancestors top-down.
 *
 * **Like `hierarchy-parent-lock-race.e2e-spec.ts`, this drives the race below HTTP**, for the same
 * reason (two Supertest requests do not overlap, #70). The create is a direct service call **held**
 * at a seam, the delete is started while it is held, and the test waits long enough that an
 * unobstructed delete would already have committed.
 *
 * - **Held after the lock (the repository insert):** the delete must be blocked on the create's
 *   share lock (`deleteFinishedWhileHeld` false). The create commits, the delete then reads the new
 *   row and sweeps it: both deleted. Without the lock the delete finishes inside the hold and the
 *   released insert lands active under it.
 * - **Held between the read and the lock:** nothing is locked yet, so the delete finishes. The
 *   create resumes, finds the parent deleted and is refused 404, inserting nothing. Without the
 *   transaction there is no second look and the row lands active under the deleted parent.
 *
 * **Verify it red before trusting it:** remove `lockActiveProjectChainForShare` from
 * `PlansService.create`, or `lockActiveClientForShare` from `ProjectsService.create`, and the cases
 * naming them must fail.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
/** Long enough that an unobstructed delete (tens of ms) has certainly committed inside the hold. */
const HOLD_MS = 1_000;
/** Guard so a create that never reaches the seam fails the test instead of hanging it. */
const REACH_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(!hasDatabase)('Create against a delete of its parent (below HTTP)', () => {
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
  }

  /** A fresh organisation with one client → project. */
  async function world(): Promise<World> {
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
    const orgId = org.body.data.id as string;
    const orgSlug = org.body.data.slug as string;
    const base = `/api/v1/organizations/${orgSlug}`;
    const client = await agent.post(`${base}/clients`).send({ name: 'Northgate' }).expect(201);
    const clientId = client.body.data.id as string;
    const project = await agent
      .post(`${base}/clients/${clientId}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const me = await agent.get('/api/v1/me').expect(200);
    const principal = new Principal(me.body.data.user.id as string, [
      { organizationId: orgId, role: 'ORG_ADMIN', permissions: permissionsForRole('ORG_ADMIN') },
    ]);
    return { orgSlug, principal, clientId, projectId: project.body.data.id as string };
  }

  /** Active rows under a deleted parent: the state the lock exists to make unreachable. */
  async function orphans(w: World): Promise<{ plans: number; projects: number }> {
    return {
      plans: await prisma.plan.count({
        where: { projectId: w.projectId, deletedAt: null, project: { deletedAt: { not: null } } },
      }),
      projects: await prisma.project.count({
        where: { clientId: w.clientId, deletedAt: null, client: { deletedAt: { not: null } } },
      }),
    };
  }

  /**
   * Run `create` held at `installSeam`'s hook, start `remove` while it is held, release after
   * `HOLD_MS`, and report whether the delete had finished while the create was holding.
   */
  async function raceHeld(params: {
    installSeam: (hold: () => Promise<void>) => () => void;
    create: () => Promise<unknown>;
    remove: () => Promise<unknown>;
  }): Promise<{
    deleteFinishedWhileHeld: boolean;
    createResult: PromiseSettledResult<unknown>;
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
      const createSettled = Promise.allSettled([params.create()]).then(([r]) => r);
      await Promise.race([
        reachedPromise,
        sleep(REACH_TIMEOUT_MS).then(() => {
          throw new Error('the create never reached the hold');
        }),
      ]);
      let deleteSettled = false;
      const removeSettled = Promise.allSettled([params.remove()]).then(([r]) => {
        deleteSettled = true;
        return r;
      });
      await sleep(HOLD_MS);
      const deleteFinishedWhileHeld = deleteSettled;
      release();
      return {
        deleteFinishedWhileHeld,
        createResult: await createSettled,
        removeResult: await removeSettled,
      };
    } finally {
      release();
      uninstall();
    }
  }

  /**
   * Wrap `owner[method]` so `hold` runs before (`before`) or after (`after`) the original, on its
   * FIRST call only: the delete under test may share the repository instance and must not be held.
   */
  function wrap(
    owner: Record<string, unknown>,
    method: string,
    when: 'before' | 'after',
    hold: () => Promise<void>,
  ): () => void {
    const original = owner[method] as (...args: unknown[]) => Promise<unknown>;
    let held = false;
    owner[method] = async function (this: unknown, ...args: unknown[]) {
      const mine = !held;
      held = true;
      if (mine && when === 'before') await hold();
      const result = await original.apply(this, args);
      if (mine && when === 'after') await hold();
      return result;
    };
    return () => {
      owner[method] = original;
    };
  }

  // The instances the services hold: several modules provide their own repositories, so
  // `app.get(PlanRepository)` may hand back one the create never calls.
  const plansOf = () => app.get<{ plans: Record<string, unknown> }>(PlansService).plans;
  const projectReadsOf = () =>
    app.get<{ projects: Record<string, unknown> }>(PlansService).projects;
  const projectsOf = () => app.get<{ projects: Record<string, unknown> }>(ProjectsService).projects;
  const clientReadsOf = () =>
    app.get<{ clients: Record<string, unknown> }>(ProjectsService).clients;

  it('a plan create against a delete of its project ends with both deleted', async () => {
    // Red without: lockActiveProjectChainForShare in PlansService.create (or lockProjectRowForDelete).
    const w = await world();
    const result = await raceHeld({
      installSeam: (hold) => wrap(plansOf(), 'create', 'before', hold),
      create: () =>
        app.get(PlansService).create(w.principal, w.orgSlug, w.projectId, {
          name: 'Late',
          plannedStart: '2026-01-05',
        }),
      remove: () => app.get(ProjectsService).remove(w.principal, w.orgSlug, w.projectId),
    });

    expect(result.deleteFinishedWhileHeld, 'the delete was not held by the create').toBe(false);
    expect(result.createResult.status).toBe('fulfilled');
    expect(result.removeResult.status).toBe('fulfilled');
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0 });
    expect(await prisma.plan.count({ where: { projectId: w.projectId, deletedAt: null } })).toBe(0);
  });

  it('a plan create against a delete of its CLIENT ends with both deleted', async () => {
    // A client delete takes the project rows only when it stamps them, so the create must meet the
    // client's own lock: red without the client half of lockActiveProjectChainForShare.
    const w = await world();
    const result = await raceHeld({
      installSeam: (hold) => wrap(plansOf(), 'create', 'before', hold),
      create: () =>
        app.get(PlansService).create(w.principal, w.orgSlug, w.projectId, {
          name: 'Late',
          plannedStart: '2026-01-05',
        }),
      remove: () => app.get(ClientsService).remove(w.principal, w.orgSlug, w.clientId),
    });

    expect(result.deleteFinishedWhileHeld, 'the delete was not held by the create').toBe(false);
    expect(result.createResult.status).toBe('fulfilled');
    expect(result.removeResult.status).toBe('fulfilled');
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0 });
  });

  it('a project create against a delete of its client ends with both deleted', async () => {
    // Red without: lockActiveClientForShare in ProjectsService.create (or lockClientRowForDelete).
    const w = await world();
    const result = await raceHeld({
      installSeam: (hold) => wrap(projectsOf(), 'create', 'before', hold),
      create: () =>
        app.get(ProjectsService).create(w.principal, w.orgSlug, w.clientId, { name: 'Late' }),
      remove: () => app.get(ClientsService).remove(w.principal, w.orgSlug, w.clientId),
    });

    expect(result.deleteFinishedWhileHeld, 'the delete was not held by the create').toBe(false);
    expect(result.createResult.status).toBe('fulfilled');
    expect(result.removeResult.status).toBe('fulfilled');
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0 });
  });

  it('a plan create that read its project before the delete committed is refused 404', async () => {
    // The window between the read and the lock: nothing is held yet, so the delete finishes, and the
    // create must look again rather than insert on the strength of a read that is now false.
    const w = await world();
    const result = await raceHeld({
      installSeam: (hold) => wrap(projectReadsOf(), 'findActiveByIdInOrg', 'after', hold),
      create: () =>
        app.get(PlansService).create(w.principal, w.orgSlug, w.projectId, {
          name: 'Late',
          plannedStart: '2026-01-05',
        }),
      remove: () => app.get(ProjectsService).remove(w.principal, w.orgSlug, w.projectId),
    });

    expect(result.deleteFinishedWhileHeld, 'the delete had nothing to wait for').toBe(true);
    expect(result.createResult).toMatchObject({
      status: 'rejected',
      reason: { message: 'Project not found.' },
    });
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0 });
    expect(await prisma.plan.count({ where: { projectId: w.projectId } })).toBe(0);
  });

  it('a project create that read its client before the delete committed is refused 404', async () => {
    const w = await world();
    const result = await raceHeld({
      installSeam: (hold) => wrap(clientReadsOf(), 'findActiveByIdInOrg', 'after', hold),
      create: () =>
        app.get(ProjectsService).create(w.principal, w.orgSlug, w.clientId, { name: 'Late' }),
      remove: () => app.get(ClientsService).remove(w.principal, w.orgSlug, w.clientId),
    });

    expect(result.deleteFinishedWhileHeld, 'the delete had nothing to wait for').toBe(true);
    expect(result.createResult).toMatchObject({
      status: 'rejected',
      reason: { message: 'Client not found.' },
    });
    expect(await orphans(w)).toEqual({ plans: 0, projects: 0 });
    expect(await prisma.project.count({ where: { clientId: w.clientId, name: 'Late' } })).toBe(0);
  });
});
