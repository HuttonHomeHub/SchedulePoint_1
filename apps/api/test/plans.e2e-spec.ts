import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for plans: nested create/list under a parent project, the
 * flat item operations, `status`/`plannedStart` metadata round-trip and
 * validation, per-project name uniqueness, the IDOR/parent-404 matrix, and the
 * soft-delete + restore round-trip incl. the top-down PARENT_DELETED invariant
 * (verified against a real PostgreSQL + Better Auth session). `plannedStart`
 * is a mandatory, non-nullable data date (ADR-0033 M1): creating a plan
 * without one 422s, and it may be moved via PATCH but never cleared (an
 * explicit `null` 422s).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Plans API (e2e)', () => {
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
    // Baselines and their snapshot rows hold `plan_id` / `baseline_id` (ADR-0025), and they are the
    // FOURTH table to fail this way — after `plan_shares`, `resource_assignments` and
    // `activity_steps` (`docs/TECH_DEBT.md` #119a). Found on 2026-09-01, when a full API run failed
    // all 45 tests in `activities.e2e-spec.ts` on `baselines_plan_id_fkey`: 25 of 33 plan-sweeping
    // specs deleted plans without deleting baselines first, so a baseline surviving in the shared
    // `app_test` poisons whichever spec sweeps next. **Which writer left it is not claimed** — the
    // log names the constraint and not the producer, and every in-suite creator sweeps (directly, or
    // via `clearDomainData`), so the residue came from outside this run: an earlier aborted run or a
    // Playwright journey against the same database, exactly as #119a's 2026-08-28 entry describes.
    // Diagnosed the same day only because `scripts/e2e-local.sh` tees the whole log to a file — the
    // observer piped the command through `tail` exactly as that row warns them not to, and the
    // mechanism caught what the habit lost. That is ADR-0058 working as advertised.
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
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

  /** Set up an admin org with a client + project, returning the project id. */
  async function setup(): Promise<{ actor: Actor; orgId: string; projectId: string }> {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    return { actor, orgId, projectId };
  }

  it('creates a plan with a mandatory start (ADR-0033 M1), gets and lists it', async () => {
    const { actor, projectId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-01' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      name: 'Baseline',
      projectId,
      status: 'DRAFT',
      plannedStart: '2026-01-01',
      version: 1,
    });
    const id = res.body.data.id as string;

    const got = await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(200);
    expect(got.body.data).toMatchObject({
      name: 'Baseline',
      projectId,
      status: 'DRAFT',
      plannedStart: '2026-01-01',
    });

    const list = await actor.agent
      .get(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('defaults ignoreExternalRelationships to false and round-trips it via PATCH (ADR-0043)', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Programme', plannedStart: '2026-01-01' })
      .expect(201);
    expect(created.body.data).toMatchObject({ ignoreExternalRelationships: false });
    const id = created.body.data.id as string;

    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ ignoreExternalRelationships: true, version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ ignoreExternalRelationships: true, version: 2 });

    const got = await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(200);
    expect(got.body.data).toMatchObject({ ignoreExternalRelationships: true });
  });

  it('rejects a plan created without a start date (422, ADR-0033 M1)', async () => {
    const { actor, projectId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'No start' })
      .expect(422);
    expect(res.body.error).toBeDefined();

    const list = await actor.agent
      .get(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('round-trips status and moves plannedStart, but forbids clearing it (date-only, no TZ drift)', async () => {
    const { actor, projectId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Metadata', status: 'ACTIVE', plannedStart: '2026-05-01' })
      .expect(201);
    expect(res.body.data).toMatchObject({ status: 'ACTIVE', plannedStart: '2026-05-01' });
    const id = res.body.data.id as string;

    // An explicit null is rejected — the mandatory data date can be moved, never cleared.
    const rejected = await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ status: 'ARCHIVED', plannedStart: null, version: 1 })
      .expect(422);
    expect(rejected.body.error).toBeDefined();

    // The rejected PATCH must not have applied any part of the request (still v1, still ACTIVE).
    const unchanged = await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(200);
    expect(unchanged.body.data).toMatchObject({
      status: 'ACTIVE',
      plannedStart: '2026-05-01',
      version: 1,
    });

    // Moving it to a new day (and changing status) still works.
    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ status: 'ARCHIVED', plannedStart: '2026-06-15', version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({
      status: 'ARCHIVED',
      plannedStart: '2026-06-15',
      version: 2,
    });
  });

  it('defaults a new plan to the org Standard calendar and lets a Planner reassign/clear it', async () => {
    const { actor, projectId } = await setup();
    // The org was seeded a Standard calendar; a new plan defaults to it (ADR-0024).
    const cals = await actor.agent.get('/api/v1/organizations/acme/calendars').expect(200);
    const standardId = (cals.body.data as { id: string; name: string }[]).find(
      (c) => c.name === 'Standard',
    )?.id;
    expect(standardId).toBeDefined();

    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Scheduled', plannedStart: '2026-01-01' })
      .expect(201);
    expect(created.body.data.calendarId).toBe(standardId);
    const id = created.body.data.id as string;

    // Reassign to another calendar in the same org.
    const other = await actor.agent
      .post('/api/v1/organizations/acme/calendars')
      .send({ name: 'Site 7-day', workingWeekdays: 127 })
      .expect(201);
    const otherId = other.body.data.id as string;
    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ calendarId: otherId, version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ calendarId: otherId, version: 2 });

    // Clear it (null) → all-days-work.
    const cleared = await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ calendarId: null, version: 2 })
      .expect(200);
    expect(cleared.body.data.calendarId).toBeNull();
  });

  it('rejects assigning a foreign (other-org) or unknown calendar to a plan (404, anti-IDOR)', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Guarded', plannedStart: '2026-01-01' })
      .expect(201);
    const id = created.body.data.id as string;

    // A well-formed UUID that is no calendar at all → 404 (indistinguishable from foreign).
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ calendarId: '00000000-0000-0000-0000-000000000000', version: 1 })
      .expect(404);

    // A REAL, active calendar that belongs to a DIFFERENT org → 404 (never leaks it).
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const otherCals = await outsider.agent.get('/api/v1/organizations/other/calendars').expect(200);
    const otherCalId = otherCals.body.data[0].id as string;
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ calendarId: otherCalId, version: 1 })
      .expect(404);
  });

  it('rejects an invalid status or plannedStart (422)', async () => {
    const { actor, projectId } = await setup();
    const base = `/api/v1/organizations/acme/projects/${projectId}/plans`;
    await actor.agent
      .post(base)
      .send({ name: 'A', status: 'WIP', plannedStart: '2026-01-01' })
      .expect(422);
    await actor.agent.post(base).send({ name: 'B', plannedStart: '2026-02-30' }).expect(422);
    await actor.agent.post(base).send({ name: 'C', plannedStart: '01/05/2026' }).expect(422);
  });

  it('allows the same plan name under different projects, but not within one', async () => {
    const { actor, projectId } = await setup();
    const clientId = await createClient(actor, 'Second');
    const otherProject = await createProject(actor, clientId, 'Otherside');
    const a = `/api/v1/organizations/acme/projects/${projectId}/plans`;
    const b = `/api/v1/organizations/acme/projects/${otherProject}/plans`;

    await actor.agent.post(a).send({ name: 'Dup', plannedStart: '2026-01-01' }).expect(201);
    await actor.agent.post(b).send({ name: 'Dup', plannedStart: '2026-01-01' }).expect(201); // different project: allowed
    await actor.agent.post(a).send({ name: 'Dup', plannedStart: '2026-01-01' }).expect(409); // same project: conflict
  });

  it('updates with optimistic locking (stale version → 409)', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Lock', plannedStart: '2026-01-01' })
      .expect(201);
    const id = created.body.data.id as string;

    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ name: 'Lock v2', version: 1 })
      .expect(200);
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ name: 'Again', version: 1 })
      .expect(409);
  });

  it('soft-deletes and restores a plan', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Temp', plannedStart: '2026-01-01' })
      .expect(201);
    const id = created.body.data.id as string;

    await actor.agent.delete(`/api/v1/organizations/acme/plans/${id}`).expect(204);
    await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(404);
    const list = await actor.agent
      .get(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);

    await actor.agent.post(`/api/v1/organizations/acme/plans/${id}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(200);
  });

  it('refuses to restore a plan whose parent project is still deleted (409)', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Child', plannedStart: '2026-01-01' })
      .expect(201);
    const id = created.body.data.id as string;

    // Deleting the project cascades the plan into the project's batch.
    await actor.agent.delete(`/api/v1/organizations/acme/projects/${projectId}`).expect(204);

    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${id}/restore`)
      .expect(409);
    expect(res.body.error?.details?.reason).toBe('PARENT_DELETED');

    // Restoring the project brings the whole batch (incl. the plan) back.
    await actor.agent.post(`/api/v1/organizations/acme/projects/${projectId}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(200);
  });

  it('404s a foreign/deleted parent project and hides plans from non-members', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Hidden', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = created.body.data.id as string;

    const unknownProject = '00000000-0000-7000-8000-000000000000';
    await actor.agent
      .get(`/api/v1/organizations/acme/projects/${unknownProject}/plans`)
      .expect(404);
    await actor.agent
      .post(`/api/v1/organizations/acme/projects/${unknownProject}/plans`)
      .send({ name: 'Nope', plannedStart: '2026-01-01' })
      .expect(404);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(`/api/v1/organizations/acme/plans/${planId}`).expect(404);
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/plans/${planId}`).expect(404);
  });

  it('forbids a Viewer from creating a plan but allows reading (403 / 200)', async () => {
    const { orgId, projectId } = await setup();
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });

    await viewer.agent.get(`/api/v1/organizations/acme/projects/${projectId}/plans`).expect(200);
    await viewer.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Nope', plannedStart: '2026-01-01' })
      .expect(403);
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/projects/00000000-0000-7000-8000-000000000000/plans')
      .expect(401);
  });
});
