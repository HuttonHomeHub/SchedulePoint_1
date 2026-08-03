import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { STANDARD_WEEKDAYS_MASK } from '@repo/types';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the CALENDAR SCOPE TIER (M1 of the library-scoping epic, ADR-0053),
 * against a real PostgreSQL + Better Auth session:
 *
 *  - create/list at each tier, and the org list's behaviour-preserving `scope=org` default;
 *  - the per-tier partial uniques (same name in two projects OK; twice in one project 409);
 *  - the fail-closed `ck_calendars_scope_parent` CHECK, exercised from RAW SQL so the DB is
 *    proven to be the last line of defence even if the service were bypassed;
 *  - one reject-path test per WRITE SEAM (`plan.calendarId`, `activity.calendarId`,
 *    `resource.calendarId`) plus its cross-org 404, so the shared `assertCalendarUsableBy`
 *    guard is proven wired at each of them;
 *  - promote (always allowed) and narrow (409 `CALENDAR_SCOPE_NARROWING_BLOCKED` with counts);
 *  - the project-delete cascade + restore, including the invariant that a shared ORG calendar
 *    is never swept.
 *
 * NOT covered here: a 403 for a missing `calendar:manage_org`. Both roles that hold
 * `calendar:create` (Planner, Org Admin) also hold `calendar:manage_org` by design — that is
 * the "zero capability regression" property of ADR-0053 §2 — so no role can produce the 403
 * over HTTP. The gate itself is proven in `calendars.service.spec.ts`, and the grant matrix in
 * `org-permissions.spec.ts`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface Fixture {
  actor: Actor;
  orgId: string;
  /** Two sibling projects under one client — the whole point of the tier. */
  projectA: string;
  projectB: string;
  planA: string;
  planB: string;
}

describe.skipIf(!hasDatabase)('Calendar scope tiers (e2e)', () => {
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

  async function resetDatabase(): Promise<void> {
    // Children before parents so no FK bites (the shared-DB discipline); this spec touches
    // most of the tree, so it clears the whole of it.
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.note.deleteMany();
    await prisma.planShare.deleteMany();
    await prisma.planLock.deleteMany();
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.activityStep.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarExceptionWindow.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendarShift.deleteMany();
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
  }

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const orgCalendars = '/api/v1/organizations/acme/calendars';
  const projectCalendars = (projectId: string): string =>
    `/api/v1/organizations/acme/projects/${projectId}/calendars`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** An Org Admin owning `acme`, with two sibling projects each holding one plan. */
  async function fixture(): Promise<Fixture> {
    const actor = await signUp('admin@example.com');
    const org = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const orgId = org.body.data.id as string;
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: 'C', createdBy: actor.userId },
    });
    const make = async (name: string): Promise<{ project: string; plan: string }> => {
      const project = await prisma.project.create({
        data: { organizationId: orgId, clientId: client.id, name, createdBy: actor.userId },
      });
      const plan = await prisma.plan.create({
        data: {
          organizationId: orgId,
          projectId: project.id,
          name: `${name} plan`,
          plannedStart: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: actor.userId,
        },
      });
      return { project: project.id, plan: plan.id };
    };
    const a = await make('Northgate');
    const b = await make('Southgate');
    return { actor, orgId, projectA: a.project, projectB: b.project, planA: a.plan, planB: b.plan };
  }

  async function createCalendar(
    actor: Actor,
    name: string,
    scope?: { scope: 'ORG' | 'PROJECT'; projectId?: string },
  ): Promise<string> {
    const res = await actor.agent
      .post(orgCalendars)
      .send({ name, workingWeekdays: STANDARD_WEEKDAYS_MASK, ...scope })
      .expect(201);
    return res.body.data.id as string;
  }

  /** An activity created directly (its write path is edit-lock-gated — a separate concern). */
  async function seedActivity(orgId: string, planId: string, userId: string): Promise<string> {
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'A',
        durationMinutes: 1440,
        createdBy: userId,
      },
    });
    return activity.id;
  }

  // -------------------------------------------------------------------------
  // Create + list
  // -------------------------------------------------------------------------

  it('creates at ORG scope by default and returns the new tier fields', async () => {
    const { actor } = await fixture();
    const res = await actor.agent
      .post(orgCalendars)
      .send({ name: 'Shared', workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(201);
    expect(res.body.data).toMatchObject({ name: 'Shared', scope: 'ORG', projectId: null });
  });

  it('creates a PROJECT-scoped calendar pinned to its project', async () => {
    const { actor, projectA } = await fixture();
    const res = await actor.agent
      .post(orgCalendars)
      .send({
        name: 'Winter shutdown 25/26',
        workingWeekdays: STANDARD_WEEKDAYS_MASK,
        scope: 'PROJECT',
        projectId: projectA,
      })
      .expect(201);
    expect(res.body.data).toMatchObject({ scope: 'PROJECT', projectId: projectA });
  });

  it('rejects a mismatched scope/projectId pair at the DTO (422)', async () => {
    const { actor, projectA } = await fixture();
    // PROJECT without a project…
    await actor.agent
      .post(orgCalendars)
      .send({ name: 'X', workingWeekdays: STANDARD_WEEKDAYS_MASK, scope: 'PROJECT' })
      .expect(422);
    // …and ORG with one.
    await actor.agent
      .post(orgCalendars)
      .send({
        name: 'Y',
        workingWeekdays: STANDARD_WEEKDAYS_MASK,
        scope: 'ORG',
        projectId: projectA,
      })
      .expect(422);
  });

  it('404s a foreign or unknown owning project (no cross-tenant existence oracle)', async () => {
    const { actor } = await fixture();
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const foreignClient = await prisma.client.findFirstOrThrow({ where: { name: 'C' } });
    const otherOrg = await prisma.organization.findFirstOrThrow({ where: { slug: 'other' } });
    const foreignProject = await prisma.project.create({
      data: {
        organizationId: otherOrg.id,
        clientId: (
          await prisma.client.create({
            data: { organizationId: otherOrg.id, name: 'OC', createdBy: outsider.userId },
          })
        ).id,
        name: 'Foreign',
        createdBy: outsider.userId,
      },
    });
    expect(foreignClient.organizationId).not.toBe(otherOrg.id);

    await actor.agent
      .post(orgCalendars)
      .send({
        name: 'Sneaky',
        workingWeekdays: STANDARD_WEEKDAYS_MASK,
        scope: 'PROJECT',
        projectId: foreignProject.id,
      })
      .expect(404);
  });

  it('keeps the org list at the ORG tier by default and filters on request', async () => {
    const { actor, projectA } = await fixture();
    await createCalendar(actor, 'Shared');
    await createCalendar(actor, 'Local', { scope: 'PROJECT', projectId: projectA });

    // Default: the seeded Standard + the new shared one — a project calendar is invisible here.
    const byDefault = await actor.agent.get(orgCalendars).expect(200);
    expect(byDefault.body.data.map((c: { name: string }) => c.name).sort()).toEqual([
      'Shared',
      'Standard',
    ]);
    expect(byDefault.body.data.every((c: { scope: string }) => c.scope === 'ORG')).toBe(true);

    const onlyProject = await actor.agent.get(`${orgCalendars}?scope=project`).expect(200);
    expect(onlyProject.body.data.map((c: { name: string }) => c.name)).toEqual(['Local']);

    const all = await actor.agent.get(`${orgCalendars}?scope=all`).expect(200);
    expect(all.body.data).toHaveLength(3);
  });

  it('lists a project’s usable set: its own calendars + every org one', async () => {
    const { actor, projectA, projectB } = await fixture();
    await createCalendar(actor, 'Shared');
    await createCalendar(actor, 'A-local', { scope: 'PROJECT', projectId: projectA });
    await createCalendar(actor, 'B-local', { scope: 'PROJECT', projectId: projectB });

    const res = await actor.agent.get(projectCalendars(projectA)).expect(200);
    expect(res.body.data.map((c: { name: string }) => c.name).sort()).toEqual([
      'A-local',
      'Shared',
      'Standard',
    ]);
  });

  it('404s the project calendar list for a foreign / unknown project', async () => {
    const { actor } = await fixture();
    await actor.agent.get(projectCalendars('00000000-0000-0000-0000-000000000000')).expect(404);
  });

  // -------------------------------------------------------------------------
  // Per-tier uniqueness (the two partial uniques)
  // -------------------------------------------------------------------------

  it('scopes name uniqueness per tier', async () => {
    const { actor, projectA, projectB } = await fixture();
    await createCalendar(actor, 'Standard 5-Day');

    // The same name is free in a project (a project-local override, deliberate).
    await createCalendar(actor, 'Standard 5-Day', { scope: 'PROJECT', projectId: projectA });
    // …and free again in a DIFFERENT project.
    await createCalendar(actor, 'Standard 5-Day', { scope: 'PROJECT', projectId: projectB });

    // But not twice in the SAME project…
    const dupProject = await actor.agent
      .post(orgCalendars)
      .send({
        name: 'Standard 5-Day',
        workingWeekdays: STANDARD_WEEKDAYS_MASK,
        scope: 'PROJECT',
        projectId: projectA,
      })
      .expect(409);
    expect(dupProject.body.error?.details?.reason).toBe('DUPLICATE_CALENDAR');
    expect(dupProject.body.error?.message).toContain('project');

    // …and not twice in the shared library.
    const dupOrg = await actor.agent
      .post(orgCalendars)
      .send({ name: 'Standard 5-Day', workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(409);
    expect(dupOrg.body.error?.message).toContain('organisation library');
  });

  // -------------------------------------------------------------------------
  // The database is the last line of defence
  // -------------------------------------------------------------------------

  it('rejects a scope/project_id disagreement at the DB CHECK, bypassing the service', async () => {
    const { orgId, projectA, actor } = await fixture();
    const insert = (scope: string, projectId: string | null): Promise<unknown> =>
      prisma.$executeRawUnsafe(
        `INSERT INTO calendars (id, organization_id, name, scope, project_id, updated_at, created_by)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3::"CalendarScope", $4::uuid, now(), $5)`,
        orgId,
        `check-${scope}-${projectId ?? 'null'}`,
        scope,
        projectId,
        actor.userId,
      );

    // PROJECT without an owning project…
    await expect(insert('PROJECT', null)).rejects.toThrow(/ck_calendars_scope_parent/);
    // …and ORG with one. Both are impossible states the CHECK refuses to store.
    await expect(insert('ORG', projectA)).rejects.toThrow(/ck_calendars_scope_parent/);
    // The legal pairings are accepted.
    await expect(insert('PROJECT', projectA)).resolves.toBeDefined();
    await expect(insert('ORG', null)).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // The write seams — one reject path each (the whole point of the tier)
  // -------------------------------------------------------------------------

  it('seam plan.calendarId: accepts in-project, 422s cross-project, 404s cross-org', async () => {
    const { actor, projectA, planA, planB } = await fixture();
    const local = await createCalendar(actor, 'A-local', {
      scope: 'PROJECT',
      projectId: projectA,
    });
    const shared = await createCalendar(actor, 'Shared');

    const planUrl = (id: string): string => `/api/v1/organizations/acme/plans/${id}`;
    const version = async (id: string): Promise<number> =>
      (await prisma.plan.findUniqueOrThrow({ where: { id } })).version;

    // Its own project: allowed.
    await actor.agent
      .patch(planUrl(planA))
      .send({ calendarId: local, version: await version(planA) })
      .expect(200);
    // A sibling project: refused, and the body names the owning project.
    const wrong = await actor.agent
      .patch(planUrl(planB))
      .send({ calendarId: local, version: await version(planB) })
      .expect(422);
    expect(wrong.body.error?.details).toMatchObject({
      reason: 'CALENDAR_WRONG_SCOPE',
      projectId: projectA,
    });
    // Nothing was written.
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: planB } })).calendarId).toBeNull();

    // An ORG calendar is usable by both — today's behaviour, unchanged.
    await actor.agent
      .patch(planUrl(planB))
      .send({ calendarId: shared, version: await version(planB) })
      .expect(200);

    // A calendar from ANOTHER ORG stays a 404 — never a scope error (no existence oracle).
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const foreign = await outsider.agent
      .post('/api/v1/organizations/other/calendars')
      .send({ name: 'Foreign', workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(201);
    await actor.agent
      .patch(planUrl(planA))
      .send({ calendarId: foreign.body.data.id, version: await version(planA) })
      .expect(404);
  });

  it('seam activity.calendarId: accepts in-project, 422s cross-project, 404s cross-org', async () => {
    const { actor, orgId, projectA, planA, planB } = await fixture();
    const local = await createCalendar(actor, 'A-local', {
      scope: 'PROJECT',
      projectId: projectA,
    });
    const inA = await seedActivity(orgId, planA, actor.userId);
    const inB = await seedActivity(orgId, planB, actor.userId);
    const url = (id: string): string => `/api/v1/organizations/acme/activities/${id}`;

    await actor.agent.patch(url(inA)).send({ calendarId: local, version: 1 }).expect(200);

    const wrong = await actor.agent
      .patch(url(inB))
      .send({ calendarId: local, version: 1 })
      .expect(422);
    expect(wrong.body.error?.details).toMatchObject({
      reason: 'CALENDAR_WRONG_SCOPE',
      projectId: projectA,
    });
    expect((await prisma.activity.findUniqueOrThrow({ where: { id: inB } })).calendarId).toBeNull();

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const foreign = await outsider.agent
      .post('/api/v1/organizations/other/calendars')
      .send({ name: 'Foreign', workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(201);
    await actor.agent
      .patch(url(inB))
      .send({ calendarId: foreign.body.data.id, version: 1 })
      .expect(404);
  });

  it('seam resource.calendarId: rejects ANY project calendar (the pool is org-global)', async () => {
    const { actor, projectA } = await fixture();
    const local = await createCalendar(actor, 'A-local', {
      scope: 'PROJECT',
      projectId: projectA,
    });
    const shared = await createCalendar(actor, 'Shared');
    const resources = '/api/v1/organizations/acme/resources';

    const rejected = await actor.agent
      .post(resources)
      .send({ name: 'Crane', kind: 'EQUIPMENT', calendarId: local })
      .expect(422);
    expect(rejected.body.error?.details?.reason).toBe('RESOURCE_REQUIRES_ORG_CALENDAR');
    expect(await prisma.resource.count()).toBe(0);

    // An ORG calendar is fine — today's behaviour, unchanged.
    const created = await actor.agent
      .post(resources)
      .send({ name: 'Crane', kind: 'EQUIPMENT', calendarId: shared })
      .expect(201);

    // …and the same rule applies on update.
    const onUpdate = await actor.agent
      .patch(`${resources}/${created.body.data.id}`)
      .send({ calendarId: local, version: 1 })
      .expect(422);
    expect(onUpdate.body.error?.details?.reason).toBe('RESOURCE_REQUIRES_ORG_CALENDAR');
  });

  // -------------------------------------------------------------------------
  // Promote / narrow
  // -------------------------------------------------------------------------

  it('promotes a project calendar to the shared library, keeping its id and references', async () => {
    const { actor, projectA, planA } = await fixture();
    const local = await createCalendar(actor, 'Reusable', {
      scope: 'PROJECT',
      projectId: projectA,
    });
    await prisma.plan.update({ where: { id: planA }, data: { calendarId: local } });

    const promoted = await actor.agent
      .patch(`${orgCalendars}/${local}`)
      .send({ scope: 'ORG', version: 1 })
      .expect(200);
    expect(promoted.body.data).toMatchObject({ id: local, scope: 'ORG', projectId: null });
    // The reference is untouched — widening only grows the set of legal holders.
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: planA } })).calendarId).toBe(local);
    // It now appears in the shared library list.
    const list = await actor.agent.get(orgCalendars).expect(200);
    expect(list.body.data.map((c: { id: string }) => c.id)).toContain(local);
  });

  it('blocks a narrow while anything outside the target project still uses it (409)', async () => {
    const { actor, orgId, projectA, planA, planB } = await fixture();
    const shared = await createCalendar(actor, 'Nights');
    // One plan inside the target project (must NOT block) and one outside (must block)…
    await prisma.plan.update({ where: { id: planA }, data: { calendarId: shared } });
    await prisma.plan.update({ where: { id: planB }, data: { calendarId: shared } });
    // …plus an activity outside it and a resource (always outside — the pool is org-global).
    const outside = await seedActivity(orgId, planB, actor.userId);
    await prisma.activity.update({ where: { id: outside }, data: { calendarId: shared } });
    await prisma.resource.create({
      data: {
        organizationId: orgId,
        name: 'Crane',
        kind: 'EQUIPMENT',
        calendarId: shared,
        createdBy: actor.userId,
      },
    });

    const blocked = await actor.agent
      .patch(`${orgCalendars}/${shared}`)
      .send({ scope: 'PROJECT', projectId: projectA, version: 1 })
      .expect(409);
    expect(blocked.body.error?.details).toMatchObject({
      reason: 'CALENDAR_SCOPE_NARROWING_BLOCKED',
      plans: 1,
      activities: 1,
      resources: 1,
    });
    // Nothing changed.
    const row = await prisma.calendar.findUniqueOrThrow({ where: { id: shared } });
    expect(row).toMatchObject({ scope: 'ORG', projectId: null, version: 1 });
  });

  it('allows a narrow once only the target project uses it', async () => {
    const { actor, projectA, planA } = await fixture();
    const shared = await createCalendar(actor, 'Nights');
    await prisma.plan.update({ where: { id: planA }, data: { calendarId: shared } });

    const narrowed = await actor.agent
      .patch(`${orgCalendars}/${shared}`)
      .send({ scope: 'PROJECT', projectId: projectA, version: 1 })
      .expect(200);
    expect(narrowed.body.data).toMatchObject({ scope: 'PROJECT', projectId: projectA });
  });

  it('rides the existing optimistic-locking gate on a scope change (stale version → 409)', async () => {
    const { actor, projectA } = await fixture();
    const local = await createCalendar(actor, 'Reusable', {
      scope: 'PROJECT',
      projectId: projectA,
    });
    await actor.agent
      .patch(`${orgCalendars}/${local}`)
      .send({ scope: 'ORG', version: 1 })
      .expect(200);
    await actor.agent
      .patch(`${orgCalendars}/${local}`)
      .send({ scope: 'ORG', version: 1 })
      .expect(409);
  });

  // -------------------------------------------------------------------------
  // Project delete cascade + restore
  // -------------------------------------------------------------------------

  it('sweeps a project’s calendars (and their exceptions) with it, leaving org ones alone', async () => {
    const { actor, projectA, projectB } = await fixture();
    const local = await createCalendar(actor, 'A-local', {
      scope: 'PROJECT',
      projectId: projectA,
    });
    await actor.agent
      .post(`${orgCalendars}/${local}/exceptions`)
      .send({ date: '2026-12-25', label: 'Christmas' })
      .expect(201);
    const otherProject = await createCalendar(actor, 'B-local', {
      scope: 'PROJECT',
      projectId: projectB,
    });
    const shared = await createCalendar(actor, 'Shared');

    await actor.agent.delete(`/api/v1/organizations/acme/projects/${projectA}`).expect(204);

    const swept = await prisma.calendar.findUniqueOrThrow({ where: { id: local } });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectA } });
    expect(swept.deletedAt).not.toBeNull();
    // Same batch as the project itself — the unit of restore.
    expect(swept.deleteBatchId).toBe(project.deleteBatchId);
    const exception = await prisma.calendarException.findFirstOrThrow({
      where: { calendarId: local },
    });
    expect(exception.deleteBatchId).toBe(project.deleteBatchId);

    // The sibling project's calendar and the SHARED library are untouched.
    expect(
      (await prisma.calendar.findUniqueOrThrow({ where: { id: otherProject } })).deletedAt,
    ).toBeNull();
    expect(
      (await prisma.calendar.findUniqueOrThrow({ where: { id: shared } })).deletedAt,
    ).toBeNull();
  });

  it('restores a project’s calendars with it, and their references resolve again', async () => {
    const { actor, projectA, planA } = await fixture();
    const local = await createCalendar(actor, 'A-local', {
      scope: 'PROJECT',
      projectId: projectA,
    });
    await actor.agent
      .post(`${orgCalendars}/${local}/exceptions`)
      .send({ date: '2026-12-25' })
      .expect(201);
    await prisma.plan.update({ where: { id: planA }, data: { calendarId: local } });

    await actor.agent.delete(`/api/v1/organizations/acme/projects/${projectA}`).expect(204);
    await actor.agent.post(`/api/v1/organizations/acme/projects/${projectA}/restore`).expect(200);

    const restored = await prisma.calendar.findUniqueOrThrow({ where: { id: local } });
    expect(restored).toMatchObject({ deletedAt: null, deleteBatchId: null });
    expect(
      (await prisma.calendarException.findFirstOrThrow({ where: { calendarId: local } })).deletedAt,
    ).toBeNull();
    // The project's usable list resolves it again, and the plan's reference is live.
    const list = await actor.agent.get(projectCalendars(projectA)).expect(200);
    expect(list.body.data.map((c: { id: string }) => c.id)).toContain(local);
  });

  it('does not sweep a calendar that was already deleted on its own (a different batch)', async () => {
    const { actor, projectA } = await fixture();
    const local = await createCalendar(actor, 'A-local', {
      scope: 'PROJECT',
      projectId: projectA,
    });
    await actor.agent.delete(`${orgCalendars}/${local}`).expect(204);
    const before = await prisma.calendar.findUniqueOrThrow({ where: { id: local } });

    await actor.agent.delete(`/api/v1/organizations/acme/projects/${projectA}`).expect(204);

    const after = await prisma.calendar.findUniqueOrThrow({ where: { id: local } });
    // Its own batch id is preserved, so a project restore cannot resurrect it.
    expect(after.deleteBatchId).toBe(before.deleteBatchId);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectA } });
    expect(after.deleteBatchId).not.toBe(project.deleteBatchId);
  });
});
