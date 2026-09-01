import { randomUUID } from 'node:crypto';

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
 * End-to-end tests for the ARCHIVE LIFECYCLE (M4 of the library-scoping epic, ADR-0053 §4,
 * US-7), against a real PostgreSQL + Better Auth session — for BOTH shared libraries
 * (calendars and resources), which are deliberately proven identically:
 *
 *  - archive/unarchive is a 204 that flips `archivedAt` and the row's visibility in the three
 *    `?archived=` list states (`exclude` default / `include` / `only`);
 *  - archiving is explicitly NOT blocked by use — a resource with a live assignment (including
 *    one that DRIVES a live activity) and a calendar bound to a plan both archive cleanly, and
 *    every existing binding keeps working (list/read/edit) exactly as before;
 *  - only a NEW binding is refused (422 `RESOURCE_ARCHIVED` / `CALENDAR_ARCHIVED`) — the
 *    decisive case: a plan/activity/resource that already holds a now-archived calendar can
 *    still be PATCHed with that SAME calendarId (re-submitting is not "new");
 *  - unarchive restores default-list visibility and re-enables new bindings;
 *  - the action rides the existing optimistic-locking gate (stale version → 409) and the
 *    existing anti-IDOR 404 (unknown id, and a second organisation's row);
 *  - archive does NOT bypass the `RESOURCE_IN_USE` delete guard;
 *  - archiving a `GROUP` does not cascade to its subtree (children stay active/unarchived);
 *  - creating an ACTIVE row on an archived row's name (calendar) / name-or-code (resource) is a
 *    409 naming the archived row in `details`, so the UI can offer "unarchive instead";
 *  - a calendar narrow is still blocked by an ARCHIVED resource's live reference — archived is
 *    not deleted, so `CALENDAR_SCOPE_NARROWING_BLOCKED` still counts it.
 *
 * NOT covered here: the `?q=`/`?kind=`/pagination filters (see `library-search.e2e-spec.ts`),
 * and the full RBAC matrix (the archive/unarchive routes reuse `calendar:update` /
 * `resource:update` — already proven in `calendars.e2e-spec.ts` / `resources.e2e-spec.ts`).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '00000000-0000-0000-0000-000000000000';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Library archive lifecycle (e2e)', () => {
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
    // Weighted steps hold `activity_id` (ADR-0044 §33), and they are the THIRD table to fail this
    // way — after `plan_shares` and `resource_assignments` (`docs/TECH_DEBT.md` #119a). Found the
    // same way and recorded here rather than in one file: a full API run on 2026-08-31 failed 282
    // tests across 10 files in `beforeEach` on `activity_steps_activity_id_fkey`, and by the time
    // anyone looked the database was clean, because a later suite in the same run had swept it.
    // The log was kept, which is the only reason this was diagnosable at all.
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.updateMany({ data: { parentId: null } });
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    // Notes hold `activity_id`/`plan_id` FKs, so they must go before what they annotate. The
    // e2e database is shared with the Playwright run and `apps/web/e2e-notes` leaves notes
    // behind, so without this the failure lands in a spec that has never heard of notes — the
    // same way `plan_shares` did, one table along.
    await prisma.note.deleteMany();
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
  const calendarsUrl = '/api/v1/organizations/acme/calendars';
  const resourcesUrl = '/api/v1/organizations/acme/resources';

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(
    email = 'admin@example.com',
    name = 'Acme',
  ): Promise<{ actor: Actor; orgId: string; slug: string }> {
    const actor = await signUp(email);
    const res = await actor.agent.post('/api/v1/organizations').send({ name }).expect(201);
    return { actor, orgId: res.body.data.id as string, slug: res.body.data.slug as string };
  }

  async function createCalendar(
    actor: Actor,
    name: string,
    slug = 'acme',
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`/api/v1/organizations/${slug}/calendars`)
      .send({ name, workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  async function createResource(
    actor: Actor,
    body: Record<string, unknown>,
    slug = 'acme',
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`/api/v1/organizations/${slug}/resources`)
      .send(body)
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  /**
   * Seed a client → project → plan directly (plan create is not the concern under test). The
   * client name is unique per call so `seedPlan` can be invoked more than once in the same org
   * without tripping the (organization_id, name) uniqueness on clients.
   */
  async function seedPlan(
    orgId: string,
    userId: string,
  ): Promise<{ projectId: string; planId: string }> {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: `C-${randomUUID()}`, createdBy: userId },
    });
    const project = await prisma.project.create({
      data: { organizationId: orgId, clientId: client.id, name: 'P', createdBy: userId },
    });
    const plan = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        name: 'Pl',
        plannedStart: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: userId,
      },
    });
    return { projectId: project.id, planId: plan.id };
  }

  async function planVersion(planId: string): Promise<number> {
    return (await prisma.plan.findUniqueOrThrow({ where: { id: planId } })).version;
  }

  // -------------------------------------------------------------------------
  // Archive / unarchive flips visibility + archivedAt (both libraries)
  // -------------------------------------------------------------------------

  it('archives a resource: 204, vanishes from the default list, appears with include/only, archivedAt set', async () => {
    const { actor } = await adminWithOrg();
    const { id, version } = await createResource(actor, { name: 'Crew A', kind: 'LABOUR' });

    await actor.agent.post(`${resourcesUrl}/${id}/archive`).send({ version }).expect(204);

    const byDefault = await actor.agent.get(resourcesUrl).expect(200);
    expect((byDefault.body.data as { id: string }[]).map((r) => r.id)).not.toContain(id);

    const included = await actor.agent.get(`${resourcesUrl}?archived=include`).expect(200);
    expect((included.body.data as { id: string }[]).map((r) => r.id)).toContain(id);

    const onlyArchived = await actor.agent.get(`${resourcesUrl}?archived=only`).expect(200);
    const row = (onlyArchived.body.data as { id: string; archivedAt: string | null }[]).find(
      (r) => r.id === id,
    );
    expect(row?.archivedAt).not.toBeNull();

    const got = await actor.agent.get(`${resourcesUrl}/${id}`).expect(200);
    expect(got.body.data.archivedAt).not.toBeNull();
    expect(got.body.data.version).toBe(version + 1);
  });

  it('archives a calendar: 204, vanishes from the default list, appears with include/only, archivedAt set', async () => {
    const { actor } = await adminWithOrg();
    const { id, version } = await createCalendar(actor, 'Winter shutdown');

    await actor.agent.post(`${calendarsUrl}/${id}/archive`).send({ version }).expect(204);

    const byDefault = await actor.agent.get(calendarsUrl).expect(200);
    expect((byDefault.body.data as { id: string }[]).map((c) => c.id)).not.toContain(id);

    const included = await actor.agent.get(`${calendarsUrl}?archived=include`).expect(200);
    expect((included.body.data as { id: string }[]).map((c) => c.id)).toContain(id);

    const onlyArchived = await actor.agent.get(`${calendarsUrl}?archived=only`).expect(200);
    const row = (onlyArchived.body.data as { id: string; archivedAt: string | null }[]).find(
      (c) => c.id === id,
    );
    expect(row?.archivedAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Archiving is NOT blocked by use, and existing usage keeps working
  // -------------------------------------------------------------------------

  it('archives a resource that is ASSIGNED and one that DRIVES a live activity — both 204, nothing unassigned', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await seedPlan(orgId, actor.userId);
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'A',
        durationMinutes: 1440,
        createdBy: actor.userId,
      },
    });
    const { id: crewId, version: crewVersion } = await createResource(actor, {
      name: 'Crew',
      kind: 'LABOUR',
    });
    const { id: craneId, version: craneVersion } = await createResource(actor, {
      name: 'Crane',
      kind: 'EQUIPMENT',
    });
    const assignmentsUrl = `/api/v1/organizations/acme/activities/${activity.id}/assignments`;
    await actor.agent
      .post(assignmentsUrl)
      .send({ resourceId: crewId, budgetedUnits: 8 })
      .expect(201);
    await actor.agent
      .post(assignmentsUrl)
      .send({ resourceId: craneId, isDriving: true })
      .expect(201);

    await actor.agent
      .post(`${resourcesUrl}/${crewId}/archive`)
      .send({ version: crewVersion })
      .expect(204);
    await actor.agent
      .post(`${resourcesUrl}/${craneId}/archive`)
      .send({ version: craneVersion })
      .expect(204);

    // Every assignment is still live — archiving never touched resource_assignments.
    const list = await actor.agent.get(assignmentsUrl).expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(await prisma.resourceAssignment.count({ where: { deletedAt: null } })).toBe(2);
  });

  it('archives a calendar bound to a plan (what CALENDAR_IN_USE refuses to delete) — 204', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { id: calId, version: calVersion } = await createCalendar(actor, 'In Use');
    const { planId } = await seedPlan(orgId, actor.userId);
    await prisma.plan.update({ where: { id: planId }, data: { calendarId: calId } });

    await actor.agent
      .post(`${calendarsUrl}/${calId}/archive`)
      .send({ version: calVersion })
      .expect(204);

    expect(
      (await prisma.calendar.findUniqueOrThrow({ where: { id: calId } })).archivedAt,
    ).not.toBeNull();
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: planId } })).calendarId).toBe(calId);
    // Confirm the delete guard would still have refused it (archiving is a DIFFERENT lever).
    const deleteAttempt = await actor.agent.delete(`${calendarsUrl}/${calId}`).expect(409);
    expect(deleteAttempt.body.error?.details?.reason).toBe('CALENDAR_IN_USE');
  });

  it('keeps an existing assignment of an archived resource editable (budgetedUnits patch succeeds)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await seedPlan(orgId, actor.userId);
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'A',
        durationMinutes: 1440,
        createdBy: actor.userId,
      },
    });
    const { id: resourceId, version } = await createResource(actor, {
      name: 'Crew',
      kind: 'LABOUR',
    });
    const assigned = await actor.agent
      .post(`/api/v1/organizations/acme/activities/${activity.id}/assignments`)
      .send({ resourceId, budgetedUnits: 8 })
      .expect(201);

    await actor.agent.post(`${resourcesUrl}/${resourceId}/archive`).send({ version }).expect(204);

    // Editing the EXISTING assignment of the now-archived resource still works.
    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/assignments/${assigned.body.data.id}`)
      .send({ budgetedUnits: 16, version: 1 })
      .expect(200);
    expect(patched.body.data.budgetedUnits).toBe(16);
  });

  // -------------------------------------------------------------------------
  // New usage is rejected — the decisive "re-submit what I already have" case
  // -------------------------------------------------------------------------

  it('422s RESOURCE_ARCHIVED for a NEW assignment to an archived resource', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await seedPlan(orgId, actor.userId);
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'A',
        durationMinutes: 1440,
        createdBy: actor.userId,
      },
    });
    const { id: resourceId, version } = await createResource(actor, {
      name: 'Crew',
      kind: 'LABOUR',
    });
    await actor.agent.post(`${resourcesUrl}/${resourceId}/archive`).send({ version }).expect(204);

    const res = await actor.agent
      .post(`/api/v1/organizations/acme/activities/${activity.id}/assignments`)
      .send({ resourceId, budgetedUnits: 8 })
      .expect(422);
    expect(res.body.error?.details?.reason).toBe('RESOURCE_ARCHIVED');
    expect(await prisma.resourceAssignment.count()).toBe(0);
  });

  it('422s CALENDAR_ARCHIVED for a NEW binding (plan/activity/resource), but a re-submit of the SAME id succeeds', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await seedPlan(orgId, actor.userId);
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'A',
        durationMinutes: 1440,
        createdBy: actor.userId,
      },
    });
    const { id: calId, version: calVersionAtCreate } = await createCalendar(actor, 'Nights');

    // Bind the (still-active) calendar to a plan, an activity and a resource — the "existing
    // binding" each will later re-submit.
    const planUrl = `/api/v1/organizations/acme/plans/${planId}`;
    const boundPlan = await actor.agent
      .patch(planUrl)
      .send({ calendarId: calId, version: await planVersion(planId) })
      .expect(200);
    const activityUrl = `/api/v1/organizations/acme/activities/${activity.id}`;
    const boundActivity = await actor.agent
      .patch(activityUrl)
      .send({ calendarId: calId, version: 1 })
      .expect(200);
    const { id: boundResourceId, version: resourceVersion } = await createResource(actor, {
      name: 'Boundless',
      kind: 'EQUIPMENT',
      calendarId: calId,
    });

    // Archive the calendar (its version has moved from the exceptions/binds it never touched —
    // binding a calendar to a holder never bumps the calendar's own version).
    await actor.agent
      .post(`${calendarsUrl}/${calId}/archive`)
      .send({ version: calVersionAtCreate })
      .expect(204);

    // A NEW plan/activity/resource cannot bind it.
    const { planId: freshPlanId } = await seedPlan(orgId, actor.userId);
    const freshPlanReject = await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${freshPlanId}`)
      .send({ calendarId: calId, version: await planVersion(freshPlanId) })
      .expect(422);
    expect(freshPlanReject.body.error?.details?.reason).toBe('CALENDAR_ARCHIVED');

    const freshActivity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'Fresh',
        durationMinutes: 1440,
        createdBy: actor.userId,
      },
    });
    const freshActivityReject = await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${freshActivity.id}`)
      .send({ calendarId: calId, version: 1 })
      .expect(422);
    expect(freshActivityReject.body.error?.details?.reason).toBe('CALENDAR_ARCHIVED');

    const freshResourceReject = await actor.agent
      .post(resourcesUrl)
      .send({ name: 'Fresh Res', kind: 'EQUIPMENT', calendarId: calId })
      .expect(422);
    expect(freshResourceReject.body.error?.details?.reason).toBe('CALENDAR_ARCHIVED');

    // …but re-submitting the SAME calendar id on a holder that ALREADY has it succeeds — the
    // whole point of the archive rule: existing bindings stay editable.
    const rePlan = await actor.agent
      .patch(planUrl)
      .send({ calendarId: calId, version: boundPlan.body.data.version })
      .expect(200);
    expect(rePlan.body.data.calendarId).toBe(calId);

    const reActivity = await actor.agent
      .patch(activityUrl)
      .send({ calendarId: calId, version: boundActivity.body.data.version })
      .expect(200);
    expect(reActivity.body.data.calendarId).toBe(calId);

    const reResource = await actor.agent
      .patch(`${resourcesUrl}/${boundResourceId}`)
      .send({ calendarId: calId, version: resourceVersion })
      .expect(200);
    expect(reResource.body.data.calendarId).toBe(calId);
  });

  // -------------------------------------------------------------------------
  // Unarchive
  // -------------------------------------------------------------------------

  it('unarchives a resource: 204, back in the default list, archivedAt null, assignable again', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await seedPlan(orgId, actor.userId);
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'A',
        durationMinutes: 1440,
        createdBy: actor.userId,
      },
    });
    const { id, version } = await createResource(actor, { name: 'Crew', kind: 'LABOUR' });
    await actor.agent.post(`${resourcesUrl}/${id}/archive`).send({ version }).expect(204);

    await actor.agent
      .post(`${resourcesUrl}/${id}/unarchive`)
      .send({ version: version + 1 })
      .expect(204);

    const byDefault = await actor.agent.get(resourcesUrl).expect(200);
    expect((byDefault.body.data as { id: string }[]).map((r) => r.id)).toContain(id);
    const got = await actor.agent.get(`${resourcesUrl}/${id}`).expect(200);
    expect(got.body.data.archivedAt).toBeNull();

    // Assignable again.
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${activity.id}/assignments`)
      .send({ resourceId: id, budgetedUnits: 8 })
      .expect(201);
  });

  it('unarchives a calendar: 204, back in the default list, archivedAt null, bindable again', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await seedPlan(orgId, actor.userId);
    const { id, version } = await createCalendar(actor, 'Nights');
    await actor.agent.post(`${calendarsUrl}/${id}/archive`).send({ version }).expect(204);

    await actor.agent
      .post(`${calendarsUrl}/${id}/unarchive`)
      .send({ version: version + 1 })
      .expect(204);

    const byDefault = await actor.agent.get(calendarsUrl).expect(200);
    expect((byDefault.body.data as { id: string }[]).map((c) => c.id)).toContain(id);

    const bound = await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({ calendarId: id, version: await planVersion(planId) })
      .expect(200);
    expect(bound.body.data.calendarId).toBe(id);
  });

  // -------------------------------------------------------------------------
  // Optimistic locking + anti-IDOR on the archive/unarchive action itself
  // -------------------------------------------------------------------------

  it('409s a stale version on archive/unarchive (both libraries)', async () => {
    const { actor } = await adminWithOrg();
    const { id: resourceId, version: resourceVersion } = await createResource(actor, {
      name: 'Crew',
      kind: 'LABOUR',
    });
    // The first archive succeeds and bumps the version; re-archiving with the now-stale
    // (pre-bump) version is refused.
    await actor.agent
      .post(`${resourcesUrl}/${resourceId}/archive`)
      .send({ version: resourceVersion })
      .expect(204);
    await actor.agent
      .post(`${resourcesUrl}/${resourceId}/archive`)
      .send({ version: resourceVersion })
      .expect(409);

    const { id: calId, version: calVersion } = await createCalendar(actor, 'Nights');
    await actor.agent
      .post(`${calendarsUrl}/${calId}/archive`)
      .send({ version: calVersion })
      .expect(204);
    await actor.agent
      .post(`${calendarsUrl}/${calId}/archive`)
      .send({ version: calVersion })
      .expect(409);

    // A stale UNARCHIVE 409s too.
    await actor.agent
      .post(`${resourcesUrl}/${resourceId}/unarchive`)
      .send({ version: resourceVersion })
      .expect(409);
    // Still archived from the FIRST successful call — every stale write above was refused.
    expect(
      (await prisma.resource.findUniqueOrThrow({ where: { id: resourceId } })).archivedAt,
    ).not.toBeNull();
    expect(
      (await prisma.calendar.findUniqueOrThrow({ where: { id: calId } })).archivedAt,
    ).not.toBeNull();
  });

  it('404s an unknown id and a cross-org id on archive/unarchive (no existence oracle)', async () => {
    const { actor } = await adminWithOrg();
    const { id: resourceId, version: resourceVersion } = await createResource(actor, {
      name: 'Crew',
      kind: 'LABOUR',
    });
    const { id: calId, version: calVersion } = await createCalendar(actor, 'Nights');

    await actor.agent
      .post(`${resourcesUrl}/${MISSING_ID}/archive`)
      .send({ version: 1 })
      .expect(404);
    await actor.agent
      .post(`${calendarsUrl}/${MISSING_ID}/archive`)
      .send({ version: 1 })
      .expect(404);

    // A member of a DIFFERENT org cannot archive this org's rows (anti-IDOR).
    const other = await adminWithOrg('outsider@example.com', 'Other Co');
    await other.actor.agent
      .post(`/api/v1/organizations/${other.slug}/resources/${resourceId}/archive`)
      .send({ version: resourceVersion })
      .expect(404);
    await other.actor.agent
      .post(`/api/v1/organizations/${other.slug}/calendars/${calId}/archive`)
      .send({ version: calVersion })
      .expect(404);
    // Untouched.
    expect(
      (await prisma.resource.findUniqueOrThrow({ where: { id: resourceId } })).archivedAt,
    ).toBeNull();
    expect(
      (await prisma.calendar.findUniqueOrThrow({ where: { id: calId } })).archivedAt,
    ).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Archive does not bypass the delete guard
  // -------------------------------------------------------------------------

  it('still 409s RESOURCE_IN_USE deleting an ARCHIVED-but-assigned resource', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await seedPlan(orgId, actor.userId);
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'A',
        durationMinutes: 1440,
        createdBy: actor.userId,
      },
    });
    const { id: resourceId, version } = await createResource(actor, {
      name: 'Crew',
      kind: 'LABOUR',
    });
    await actor.agent
      .post(`/api/v1/organizations/acme/activities/${activity.id}/assignments`)
      .send({ resourceId, budgetedUnits: 8 })
      .expect(201);
    await actor.agent.post(`${resourcesUrl}/${resourceId}/archive`).send({ version }).expect(204);

    const res = await actor.agent.delete(`${resourcesUrl}/${resourceId}`).expect(409);
    expect(res.body.error?.details?.reason).toBe('RESOURCE_IN_USE');
  });

  // -------------------------------------------------------------------------
  // No subtree cascade on archive (unlike delete)
  // -------------------------------------------------------------------------

  it('archiving a GROUP does not archive its children', async () => {
    const { actor } = await adminWithOrg();
    const { id: groupId, version: groupVersion } = await createResource(actor, {
      name: 'Groundworks',
      kind: 'GROUP',
    });
    const { id: childId } = await createResource(actor, {
      name: 'Crew A',
      kind: 'LABOUR',
      parentId: groupId,
    });

    await actor.agent
      .post(`${resourcesUrl}/${groupId}/archive`)
      .send({ version: groupVersion })
      .expect(204);

    const group = await prisma.resource.findUniqueOrThrow({ where: { id: groupId } });
    const child = await prisma.resource.findUniqueOrThrow({ where: { id: childId } });
    expect(group.archivedAt).not.toBeNull();
    expect(child.archivedAt).toBeNull();
    expect(child.deletedAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Creating an ACTIVE row on an archived row's name/code — 409 naming the archived row
  // -------------------------------------------------------------------------

  it('409s creating an active resource on an archived one’s name OR code, naming it in details', async () => {
    const { actor } = await adminWithOrg();
    const { id, version } = await createResource(actor, {
      name: 'Crew A',
      code: 'CREW-A',
      kind: 'LABOUR',
    });
    await actor.agent.post(`${resourcesUrl}/${id}/archive`).send({ version }).expect(204);

    const byName = await actor.agent
      .post(resourcesUrl)
      .send({ name: 'Crew A', kind: 'LABOUR' })
      .expect(409);
    expect(byName.body.error?.details).toMatchObject({
      reason: 'DUPLICATE_RESOURCE',
      archivedResourceId: id,
    });

    const byCode = await actor.agent
      .post(resourcesUrl)
      .send({ name: 'Different Name', code: 'CREW-A', kind: 'LABOUR' })
      .expect(409);
    expect(byCode.body.error?.details).toMatchObject({
      reason: 'DUPLICATE_RESOURCE',
      archivedResourceId: id,
    });

    // Unarchiving frees the row up for its own name/code again (no conflict).
    await actor.agent
      .post(`${resourcesUrl}/${id}/unarchive`)
      .send({ version: version + 1 })
      .expect(204);
  });

  it('409s creating an active calendar on an archived one’s name, naming it in details', async () => {
    const { actor } = await adminWithOrg();
    const { id, version } = await createCalendar(actor, 'Standard 5-Day');
    await actor.agent.post(`${calendarsUrl}/${id}/archive`).send({ version }).expect(204);

    const dup = await actor.agent
      .post(calendarsUrl)
      .send({ name: 'Standard 5-Day', workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(409);
    expect(dup.body.error?.details).toMatchObject({
      reason: 'DUPLICATE_CALENDAR',
      archivedCalendarId: id,
    });
  });

  // -------------------------------------------------------------------------
  // Narrowing still counts an ARCHIVED resource's live reference
  // -------------------------------------------------------------------------

  it('still blocks a calendar narrow while an ARCHIVED resource references it (409 CALENDAR_SCOPE_NARROWING_BLOCKED)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { id: calId } = await createCalendar(actor, 'Shared');
    const { id: resourceId, version: resourceVersion } = await createResource(actor, {
      name: 'Crane',
      kind: 'EQUIPMENT',
      calendarId: calId,
    });
    await actor.agent
      .post(`${resourcesUrl}/${resourceId}/archive`)
      .send({ version: resourceVersion })
      .expect(204);

    const client = await prisma.client.create({
      data: { organizationId: orgId, name: 'C', createdBy: actor.userId },
    });
    const project = await prisma.project.create({
      data: { organizationId: orgId, clientId: client.id, name: 'P', createdBy: actor.userId },
    });

    const blocked = await actor.agent
      .patch(`${calendarsUrl}/${calId}`)
      .send({ scope: 'PROJECT', projectId: project.id, version: 1 })
      .expect(409);
    expect(blocked.body.error?.details).toMatchObject({
      reason: 'CALENDAR_SCOPE_NARROWING_BLOCKED',
      resources: 1,
    });
  });
  /**
   * Deny-by-default on the four new action endpoints (security review). Archive/unarchive is a
   * WRITE to a shared library, so it must sit behind exactly the permissions the ordinary edit
   * does — Planner+ — and neither a Viewer nor a Contributor may reach it. Asserted here rather
   * than in a unit test because the guard chain (session → membership → permission) only exists
   * over HTTP.
   */
  it('403s archive/unarchive for a Viewer and a Contributor on both libraries', async () => {
    const { actor, orgId } = await adminWithOrg();
    const cal = await createCalendar(actor, 'Shared');
    const res = await createResource(actor, { name: 'Crane', kind: 'EQUIPMENT' });

    for (const [email, role] of [
      ['viewer@example.com', 'VIEWER'],
      ['contributor@example.com', 'CONTRIBUTOR'],
    ] as const) {
      const member = await signUp(email);
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: member.userId, role },
      });

      // Reading the libraries stays open to every member — only the writes are gated.
      await member.agent.get(`${calendarsUrl}`).expect(200);
      await member.agent.get(`${resourcesUrl}`).expect(200);

      await member.agent
        .post(`${calendarsUrl}/${cal.id}/archive`)
        .send({ version: cal.version })
        .expect(403);
      await member.agent
        .post(`${calendarsUrl}/${cal.id}/unarchive`)
        .send({ version: cal.version })
        .expect(403);
      await member.agent
        .post(`${resourcesUrl}/${res.id}/archive`)
        .send({ version: res.version })
        .expect(403);
      await member.agent
        .post(`${resourcesUrl}/${res.id}/unarchive`)
        .send({ version: res.version })
        .expect(403);
    }

    // Nothing was archived by any of the refused calls.
    const after = await actor.agent.get(`${calendarsUrl}?archived=only`).expect(200);
    expect(after.body.data).toHaveLength(0);
  });
});
