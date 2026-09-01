import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the recycle bin (`GET .../deleted`): the combined
 * deleted-list across clients/projects/plans, `canRestore` reflecting the
 * top-down invariant, org-scoping (non-members/outsiders see nothing), and the
 * list → per-entity restore round-trip — against a real PostgreSQL + Better Auth.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface DeletedItem {
  kind: 'client' | 'project' | 'plan';
  id: string;
  name: string;
  deletedAt: string;
  canRestore: boolean;
  deleteBatchId: string | null;
  blockedBy: {
    kind: 'client' | 'project';
    id: string;
    name: string;
    deleteBatchId: string | null;
  } | null;
}

describe.skipIf(!hasDatabase)('Recycle bin API (e2e)', () => {
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
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    // Notes hold `activity_id`/`plan_id` FKs, so they must go before what they annotate. The
    // e2e database is shared with the Playwright run and `apps/web/e2e-notes` leaves notes
    // behind, so without this the failure lands in a spec that has never heard of notes — the
    // same way `plan_shares` did, one table along.
    await prisma.note.deleteMany();
    // Resource assignments hold `activity_id` FKs and resources are organisation-scoped, so both
    // are swept here for the same shared-database reason as the link tables above
    // (docs/TECH_DEBT.md #119): a leftover row from a sibling suite or a Playwright run against
    // the same `app_test` otherwise fails a spec that never touches resources — which happened
    // on 2026-08-28, in `beforeEach`, to every test in the file at once.
    // Weighted steps hold `activity_id` (ADR-0044 §33), and they are the THIRD table to fail this
    // way — after `plan_shares` and `resource_assignments` (`docs/TECH_DEBT.md` #119a). Found the
    // same way and recorded here rather than in one file: a full API run on 2026-08-31 failed 282
    // tests across 10 files in `beforeEach` on `activity_steps_activity_id_fkey`, and by the time
    // anyone looked the database was clean, because a later suite in the same run had swept it.
    // The log was kept, which is the only reason this was diagnosable at all.
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
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
    return res.body.data.id as string;
  }

  async function createProject(actor: Actor, clientId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createPlan(actor: Actor, projectId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return res.body.data.id as string;
  }

  it('lists a cascade-deleted subtree with only the root restorable', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');

    // Empty to start.
    const empty = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    expect(empty.body.data).toHaveLength(0);
    expect(empty.body.meta).toMatchObject({ hasMore: false, nextCursor: null });

    // Deleting the client cascades the project + plan into one batch.
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    const items = res.body.data as DeletedItem[];
    expect(items).toHaveLength(3);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId[clientId]).toMatchObject({ kind: 'client', canRestore: true });
    expect(byId[projectId]).toMatchObject({ kind: 'project', canRestore: false });
    expect(byId[planId]).toMatchObject({ kind: 'plan', canRestore: false });
  });

  it("stamps one batch id across a cascade, and names each row's blocker (ADR-0096)", async () => {
    // **The two fields the grouped list is built on, checked where the SQL actually runs.** They are
    // computed in a raw `UNION ALL` with three different parent shapes; a unit test mocking the
    // repository would assert the mapping and never the query that feeds it.
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    const byId = Object.fromEntries((res.body.data as DeletedItem[]).map((i) => [i.id, i]));

    // ONE batch across all three. This is the whole premise of grouping: restoring the client
    // restores this set, so presenting them as three independently-actionable rows is the defect.
    const batch = byId[clientId]!.deleteBatchId;
    expect(batch).toEqual(expect.any(String));
    expect(byId[projectId]!.deleteBatchId).toBe(batch);
    expect(byId[planId]!.deleteBatchId).toBe(batch);

    // The root has no blocker; its descendants name their immediate parent — PER ROW, which is why
    // the client groups by batch and reads only the root's blocker.
    expect(byId[clientId]!.blockedBy).toBeNull();
    expect(byId[projectId]!.blockedBy).toMatchObject({
      kind: 'client',
      id: clientId,
      name: 'Northgate',
    });
    expect(byId[planId]!.blockedBy).toMatchObject({
      kind: 'project',
      id: projectId,
      name: 'Riverside',
    });
    // A plan can never block anything. Asserted against the RAW body rather than the typed view:
    // this file's `DeletedItem` forbids `'plan'` already, so a typed check would be the test
    // agreeing with itself. The real guarantee is that the SQL emits the two kinds as literals —
    // this is what fails if someone widens it.
    const kinds = (res.body.data as { blockedBy: { kind: string } | null }[])
      .map((i) => i.blockedBy?.kind)
      .filter((k): k is string => k !== undefined);
    expect(kinds).not.toContain('plan');
    expect(kinds.length).toBeGreaterThan(0); // and the check is not vacuous
  });

  it('gives a CROSS-BATCH blocker its own batch id, which is the one to restore', async () => {
    // The case grouping cannot solve and the whole reason `blockedBy` carries a batch id: a plan
    // deleted on its own, then its project deleted later, are two different cascades. Restoring the
    // plan's group is not enough — the blocker's OWN batch is what must come back first.
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');

    await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);
    await actor.agent.delete(`/api/v1/organizations/acme/projects/${projectId}`).expect(204);

    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    const byId = Object.fromEntries((res.body.data as DeletedItem[]).map((i) => [i.id, i]));

    expect(byId[planId]!.deleteBatchId).not.toBe(byId[projectId]!.deleteBatchId);
    expect(byId[planId]!.blockedBy).toMatchObject({
      kind: 'project',
      id: projectId,
      deleteBatchId: byId[projectId]!.deleteBatchId,
    });
    expect(byId[planId]!.canRestore).toBe(false);
  });

  it('serves the retention period and whether it is armed (ADR-0096)', async () => {
    // The countdown on screen is only honest if the period comes from the server: it is an
    // operator override, so a client constant would be silently wrong on any host that changed it.
    const { actor } = await adminWithOrg();
    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    expect(res.body.meta).toMatchObject({
      retentionDays: expect.any(Number),
      // False by default: M3 ships the countdown, M4 arms the delete (ADR-0096 D4).
      retentionActive: false,
    });
    expect(res.body.meta.retentionDays).toBeGreaterThan(0);
  });

  it('restoring the root (via its own endpoint) empties the recycle bin', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    await createPlan(actor, projectId, 'Baseline');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    await actor.agent.post(`/api/v1/organizations/acme/clients/${clientId}/restore`).expect(200);

    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('shows a directly-deleted plan as restorable', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');

    await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);

    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    const items = res.body.data as DeletedItem[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'plan', id: planId, canRestore: true });
  });

  it('paginates newest-deleted first with a working cursor', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Owner');
    const projectId = await createProject(actor, clientId, 'Proj');
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await createPlan(actor, projectId, `Plan ${i}`);
      await actor.agent.delete(`/api/v1/organizations/acme/plans/${id}`).expect(204);
      ids.push(id);
    }

    const first = await actor.agent.get('/api/v1/organizations/acme/deleted?limit=2').expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.hasMore).toBe(true);
    const cursor = first.body.meta.nextCursor as string;

    const second = await actor.agent
      .get(`/api/v1/organizations/acme/deleted?limit=2&cursor=${encodeURIComponent(cursor)}`)
      .expect(200);
    expect(second.body.data.length).toBeGreaterThanOrEqual(1);
    expect(second.body.meta.hasMore).toBe(false);

    // Every deleted plan appears exactly once across the two pages.
    const seen = [...first.body.data, ...second.body.data].map((i: DeletedItem) => i.id);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  /**
   * The union's hard case, and the reason the merge moved into one `UNION ALL` query
   * (TECH_DEBT #22). A cascade stamps the client, its project and its plan with ONE
   * `deleted_at`, so ordering falls entirely to the id tiebreaker — and every page
   * boundary lands mid-batch, across three different tables. Page one row at a time
   * so the `deleted_at = cursor AND id > cursorId` branch is exercised on each.
   */
  it('pages one row at a time through a same-instant cascade spanning all three tables', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const seen: DeletedItem[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const suffix: string = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
      const res = await actor.agent
        .get(`/api/v1/organizations/acme/deleted?limit=1${suffix}`)
        .expect(200);
      // Exactly the page size asked for — never a partial page while more remain.
      expect(res.body.data).toHaveLength(1);
      seen.push(res.body.data[0] as DeletedItem);
      if (!res.body.meta.hasMore) break;
      cursor = res.body.meta.nextCursor as string;
    }

    // All three rows, each exactly once, in the same total order the unpaged read gives.
    const whole = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    expect(seen.map((i) => i.id)).toEqual((whole.body.data as DeletedItem[]).map((i) => i.id));
    expect(new Set(seen.map((i) => i.id))).toEqual(new Set([clientId, projectId, planId]));

    // The restorability join survives the union: only the cascade root can come back.
    const byId = Object.fromEntries(seen.map((i) => [i.id, i]));
    expect(byId[clientId]?.canRestore).toBe(true);
    expect(byId[projectId]?.canRestore).toBe(false);
    expect(byId[planId]?.canRestore).toBe(false);
  });

  it('scopes the bin to the caller — outsiders and non-members see nothing/404', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    // An outsider is not a member of 'acme' → 404 (org not found for them).
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get('/api/v1/organizations/acme/deleted').expect(404);

    // Their own org's bin is empty (no cross-tenant leak).
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const own = await outsider.agent.get('/api/v1/organizations/other/deleted').expect(200);
    expect(own.body.data).toHaveLength(0);
  });

  it('lets a Viewer read the bin (read is any member)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });

    const res = await viewer.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('401s without a session', async () => {
    await request(server()).get('/api/v1/organizations/acme/deleted').expect(401);
  });
});
