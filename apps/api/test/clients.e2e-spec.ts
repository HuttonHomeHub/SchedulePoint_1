import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { ClientRepository } from '../src/modules/clients/client.repository';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for clients: CRUD, the IDOR/404 matrix, name uniqueness, and
 * the cascade soft-delete + restore round-trip (verified against a real
 * PostgreSQL + Better Auth session). Projects/plans are seeded directly via
 * Prisma since their HTTP modules land in later tasks.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Clients API (e2e)', () => {
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

  beforeEach(async () => {
    // Both link tables and `activities` first, even though this spec creates none of them.
    // `activities` is the link tables' FK target and `plans` is its own, so ANY row left in the
    // shared local database — by a sibling spec, or by a Playwright journey run against the same
    // `app_test` — makes the `plan.deleteMany()` below a foreign-key violation, and every test in
    // this file then fails in `beforeEach` naming a table the spec never touches.
    //
    // This order was missing from NINE specs and present in the rest, so each of them passed or
    // failed on the order the files happened to run in. Adding one new e2e file was enough to
    // change that order and break them (`docs/TECH_DEBT.md` #119).
    // **The shared list, not a private copy** (`docs/TECH_DEBT.md` #119a). This hand-rolled its own
    // sweep and omitted `plan_shares`, so `plan.deleteMany()` died on `plan_shares_plan_id_fkey`
    // whenever a Playwright run left a share behind on the same database — the failure that took all
    // 45 of `activities.e2e-spec.ts` down. `clearDomainData` is a strict superset in the same
    // deepest-first order, ending identically, and it handles the append-only audit triggers itself.
    await clearDomainData(prisma);
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

  /** An admin (Planner privileges included) who owns an org 'acme'. */
  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  async function createClient(actor: Actor, name: string): Promise<string> {
    const res = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name })
      .expect(201);
    expect(res.body.data).toMatchObject({ name, description: null, version: 1 });
    return res.body.data.id as string;
  }

  it('creates, gets and lists clients', async () => {
    const { actor } = await adminWithOrg();
    const id = await createClient(actor, 'Northgate');

    const got = await actor.agent.get(`/api/v1/organizations/acme/clients/${id}`).expect(200);
    expect(got.body.data.name).toBe('Northgate');

    const list = await actor.agent.get('/api/v1/organizations/acme/clients').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ hasMore: false });
  });

  /**
   * **`?q=` — the clients list gains the search the libraries already had** (page-consistency M7).
   *
   * Asserted end to end rather than at the repository, because the thing that can go wrong is the
   * composition: the fragment has to merge with the org scope and the soft-delete filter without
   * either clobbering the other, and a unit test of `clientSearchWhere` alone cannot see that.
   * The deleted-row case is the one that would be silently wrong.
   */
  it('filters clients by ?q= — case-insensitive, trimmed, and still org-scoped and soft-delete aware', async () => {
    const { actor } = await adminWithOrg();
    await createClient(actor, 'Northgate Developments');
    await createClient(actor, 'Bellway Homes');
    const goneId = await createClient(actor, 'Northgate Retail');

    const url = '/api/v1/organizations/acme/clients';

    // Case-insensitive, and a substring rather than a prefix.
    const hit = await actor.agent.get(`${url}?q=NORTHGATE`).expect(200);
    expect((hit.body.data as { name: string }[]).map((c) => c.name).sort()).toEqual([
      'Northgate Developments',
      'Northgate Retail',
    ]);
    const middle = await actor.agent.get(`${url}?q=way%20Hom`).expect(200);
    expect((middle.body.data as { name: string }[]).map((c) => c.name)).toEqual(['Bellway Homes']);

    // A term matching nothing is an empty page, never an error.
    const none = await actor.agent.get(`${url}?q=nonexistent`).expect(200);
    expect(none.body.data).toHaveLength(0);

    // A whitespace-only term is no search at all — the full list comes back.
    const blank = await actor.agent.get(`${url}?q=${encodeURIComponent('   ')}`).expect(200);
    expect(blank.body.data).toHaveLength(3);

    // **The composition, which is the point.** A soft-deleted row must not come back through the
    // search — the filter merges with `active(…)` rather than replacing it.
    await actor.agent.delete(`${url}/${goneId}`).expect(204);
    const afterDelete = await actor.agent.get(`${url}?q=northgate`).expect(200);
    expect((afterDelete.body.data as { name: string }[]).map((c) => c.name)).toEqual([
      'Northgate Developments',
    ]);
  });

  it('422s a ?q= over the max length', async () => {
    const { actor } = await adminWithOrg();
    await actor.agent.get(`/api/v1/organizations/acme/clients?q=${'x'.repeat(201)}`).expect(422);
  });

  it('rejects a duplicate active name (409) but allows reuse after delete', async () => {
    const { actor } = await adminWithOrg();
    const id = await createClient(actor, 'Dup');
    await actor.agent.post('/api/v1/organizations/acme/clients').send({ name: 'Dup' }).expect(409);

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${id}`).expect(204);
    // Same name is free once the holder is soft-deleted.
    await createClient(actor, 'Dup');
  });

  it('updates with optimistic locking (stale version → 409)', async () => {
    const { actor } = await adminWithOrg();
    const id = await createClient(actor, 'Renamed');

    const ok = await actor.agent
      .patch(`/api/v1/organizations/acme/clients/${id}`)
      .send({ name: 'Renamed Ltd', version: 1 })
      .expect(200);
    expect(ok.body.data).toMatchObject({ name: 'Renamed Ltd', version: 2 });

    await actor.agent
      .patch(`/api/v1/organizations/acme/clients/${id}`)
      .send({ name: 'Again', version: 1 })
      .expect(409);
  });

  it('cascade soft-deletes the subtree and restores it as one batch', async () => {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Cascade');

    // Seed a project + plan directly (their HTTP modules land later).
    const project = await prisma.project.create({
      data: { organizationId: orgId, clientId, name: 'Proj', createdBy: actor.userId },
    });
    const plan = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        name: 'Plan',
        plannedStart: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: actor.userId,
      },
    });

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const deletedProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const deletedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(deletedProject.deletedAt).not.toBeNull();
    expect(deletedPlan.deletedAt).not.toBeNull();
    // One batch id spans the whole deleted subtree.
    expect(deletedPlan.deleteBatchId).toBe(deletedProject.deleteBatchId);
    // The client is gone from the active list.
    const list = await actor.agent.get('/api/v1/organizations/acme/clients').expect(200);
    expect(list.body.data).toHaveLength(0);

    // Restore brings the whole batch back.
    await actor.agent.post(`/api/v1/organizations/acme/clients/${clientId}/restore`).expect(200);
    const restoredProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const restoredPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(restoredProject.deletedAt).toBeNull();
    expect(restoredPlan.deletedAt).toBeNull();
    expect(restoredPlan.deleteBatchId).toBeNull();
  });

  it('carries child counts on the DETAIL read and NOT on the list', async () => {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Counted');

    /**
     * **Two projects, one of them soft-deleted, and three plans of which one is deleted.** A count
     * over live rows only is indistinguishable from a count over all rows unless the fixture holds
     * a deleted one — and `deletedAt: null` dropping out of the predicate does not error, it
     * silently falls back to a wider index and counts everything
     * (`20260818220000_overview_recently_changed_indexes`, note 1). So the numbers below are 1
     * and 2, not 2 and 3, and the difference is the assertion.
     */
    const live = await prisma.project.create({
      data: { organizationId: orgId, clientId, name: 'Live', createdBy: actor.userId },
    });
    const gone = await prisma.project.create({
      data: {
        organizationId: orgId,
        clientId,
        name: 'Gone',
        createdBy: actor.userId,
        deletedAt: new Date(),
      },
    });
    const plan = (name: string, projectId: string, deleted = false) =>
      prisma.plan.create({
        data: {
          organizationId: orgId,
          projectId,
          name,
          plannedStart: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: actor.userId,
          ...(deleted ? { deletedAt: new Date() } : {}),
        },
      });
    await plan('P1', live.id);
    await plan('P2', live.id);
    await plan('P3', live.id, true);
    // A plan under the DELETED project. It is live in its own right, so only the nested
    // `project: { deletedAt: null }` clause excludes it — which is the clause a later reader is
    // most likely to call redundant and remove.
    await plan('Orphan', gone.id);

    const detail = await actor.agent
      .get(`/api/v1/organizations/acme/clients/${clientId}`)
      .expect(200);
    expect(detail.body.data.projectCount).toBe(1);
    /**
     * **No plan count, and asserted rather than merely omitted.** One was built and FC-9 withdrew
     * it: a two-level count under a client plans as a `Seq Scan on projects` once the client holds
     * a substantial share of that table (500 of 2,000 measured at 4.12 ms, O(installation) rather
     * than O(client)). Without this line, re-adding it would be silent — the fixture holds exactly
     * the plans that would make it look right.
     */
    expect(detail.body.data).not.toHaveProperty('planCount');

    /**
     * **The list does not carry them, and that is the regression this asserts against.** A count on
     * the list is measured at 14.509 ms against 0.034 ms on 50,004 projects, and abandons the
     * keyset index entirely — O(all projects in the installation) rather than O(page). The two
     * routes share `ClientsController`, and until this epic they shared a DTO, so the field would
     * have arrived here without anyone choosing it.
     */
    const list = await actor.agent.get('/api/v1/organizations/acme/clients').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).not.toHaveProperty('projectCount');
  });

  it('omits a count rather than reporting zero when it cannot be taken', async () => {
    /**
     * **Absent, never `0`.** ADR-0126's rule: a zero is a claim that there are none, and nothing
     * downstream can tell a fabricated zero from a real one. Forced by making the count throw,
     * because the realistic cause — a statement timeout on an unbounded activity count — cannot be
     * provoked at this fixture's size.
     *
     * The subject still resolves and the read still returns 200: a count that fails must not take
     * the detail read down with it.
     */
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Unstable');

    const repository = app.get(ClientRepository);
    const original = repository.countActiveProjects.bind(repository);
    repository.countActiveProjects = () => Promise.reject(new Error('statement timeout'));
    try {
      const detail = await actor.agent
        .get(`/api/v1/organizations/acme/clients/${clientId}`)
        .expect(200);
      expect(detail.body.data).not.toHaveProperty('projectCount');
      // The read itself still succeeds and still carries the client: a count that fails must not
      // take the detail read down with it.
      expect(detail.body.data.name).toBe('Unstable');
    } finally {
      repository.countActiveProjects = original;
    }
  });

  it('404s a foreign/unknown client id and hides clients from non-members', async () => {
    const { actor } = await adminWithOrg();
    const id = await createClient(actor, 'Secret');

    const outsider = await signUp('outsider@example.com');
    // Non-member: the org is invisible (404, not 403).
    await outsider.agent.get('/api/v1/organizations/acme/clients').expect(404);
    await outsider.agent.get(`/api/v1/organizations/acme/clients/${id}`).expect(404);

    // A member of a *different* org cannot reach this org's client either.
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/clients/${id}`).expect(404);
  });

  it('forbids a Viewer from creating a client but allows reading (403 / 200)', async () => {
    const { actor, orgId } = await adminWithOrg();
    await createClient(actor, 'Visible');

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });

    await viewer.agent.get('/api/v1/organizations/acme/clients').expect(200);
    await viewer.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('401s without a session', async () => {
    await request(server()).get('/api/v1/organizations/acme/clients').expect(401);
  });
});
