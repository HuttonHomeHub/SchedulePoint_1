import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the resource library + resource-assignment API (M7.1, ADR-0039):
 * resource CRUD, the assignment lifecycle (assign / update units+driver / unassign), the
 * same-org / N14 / duplicate / RESOURCE_IN_USE / driver-uniqueness / MATERIAL-cannot-drive
 * invariants, and the RBAC / IDOR matrix (verified against a real PostgreSQL + Better Auth
 * session). Activities are seeded directly via Prisma (their write path is edit-lock-gated,
 * a separate concern) so the assignment endpoints can be exercised against real rows.
 *
 * resetDatabase deletes resourceAssignment → resource before activity → calendar so the FKs
 * never bite; it also leaves a clean DB in `afterAll` (the shared-DB discipline).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '00000000-0000-0000-0000-000000000000';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Resources API (e2e)', () => {
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
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
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
  const base = '/api/v1/organizations/acme/resources';

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

  /** Seed a client → project → plan → activity directly (the write path is edit-lock-gated). */
  async function seedActivity(orgId: string, userId: string): Promise<string> {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: 'C', createdBy: userId },
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
    const activity = await prisma.activity.create({
      data: {
        organizationId: orgId,
        planId: plan.id,
        name: 'A',
        durationMinutes: 1440,
        createdBy: userId,
      },
    });
    return activity.id;
  }

  async function createResource(
    actor: Actor,
    body: Record<string, unknown>,
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent.post(base).send(body).expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  it('creates, gets, lists, updates and deletes a resource', async () => {
    const { actor } = await adminWithOrg();
    const { id } = await createResource(actor, { name: 'Crew A', code: 'CREW-A', kind: 'LABOUR' });

    const got = await actor.agent.get(`${base}/${id}`).expect(200);
    expect(got.body.data).toMatchObject({
      name: 'Crew A',
      code: 'CREW-A',
      kind: 'LABOUR',
      version: 1,
    });

    const list = await actor.agent.get(base).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ hasMore: false });

    const patched = await actor.agent
      .patch(`${base}/${id}`)
      .send({ name: 'Crew A (day)', version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ name: 'Crew A (day)', version: 2 });

    // Stale version → 409.
    await actor.agent.patch(`${base}/${id}`).send({ name: 'X', version: 1 }).expect(409);

    await actor.agent.delete(`${base}/${id}`).expect(204);
    await actor.agent.get(`${base}/${id}`).expect(404);
  });

  it('rejects a resource with no kind (422) and a duplicate name (409, reusable after delete)', async () => {
    const { actor } = await adminWithOrg();
    await actor.agent.post(base).send({ name: 'No Kind' }).expect(422);

    const { id } = await createResource(actor, { name: 'Dup', kind: 'EQUIPMENT' });
    await actor.agent.post(base).send({ name: 'Dup', kind: 'EQUIPMENT' }).expect(409);
    await actor.agent.delete(`${base}/${id}`).expect(204);
    // The name is free once the holder is soft-deleted.
    await createResource(actor, { name: 'Dup', kind: 'EQUIPMENT' });
  });

  it('validates a resource calendarId is an active calendar in the same org (404 otherwise)', async () => {
    const { actor } = await adminWithOrg();
    // The org seeds a Standard calendar — assign it.
    const cals = await actor.agent.get('/api/v1/organizations/acme/calendars').expect(200);
    const standardId = (cals.body.data as { id: string; name: string }[]).find(
      (c) => c.name === 'Standard',
    )!.id;
    const ok = await actor.agent
      .post(base)
      .send({ name: 'Crane', kind: 'EQUIPMENT', calendarId: standardId })
      .expect(201);
    expect(ok.body.data.calendarId).toBe(standardId);

    // An unknown calendar id → 404 (a foreign/deleted id is indistinguishable).
    await actor.agent
      .post(base)
      .send({ name: 'Bad', kind: 'EQUIPMENT', calendarId: MISSING_ID })
      .expect(404);
  });

  it('refuses to delete a calendar in use by an active resource (CALENDAR_IN_USE)', async () => {
    const { actor } = await adminWithOrg();
    const cals = await actor.agent.get('/api/v1/organizations/acme/calendars').expect(200);
    const standardId = (cals.body.data as { id: string; name: string }[]).find(
      (c) => c.name === 'Standard',
    )!.id;
    await createResource(actor, { name: 'On Cal', kind: 'EQUIPMENT', calendarId: standardId });

    const res = await actor.agent
      .delete(`/api/v1/organizations/acme/calendars/${standardId}`)
      .expect(409);
    expect(res.body.error?.details?.reason).toBe('CALENDAR_IN_USE');
    expect(res.body.error?.details?.resources).toBe(1);
  });

  describe('assignments', () => {
    const assignmentsUrl = (activityId: string) =>
      `/api/v1/organizations/acme/activities/${activityId}/assignments`;
    const assignmentUrl = (id: string) => `/api/v1/organizations/acme/assignments/${id}`;

    it('assigns, lists, updates and unassigns a resource', async () => {
      const { actor, orgId } = await adminWithOrg();
      const activityId = await seedActivity(orgId, actor.userId);
      const { id: resourceId } = await createResource(actor, { name: 'Crew', kind: 'LABOUR' });

      const assigned = await actor.agent
        .post(assignmentsUrl(activityId))
        .send({ resourceId, budgetedUnits: 40 })
        .expect(201);
      expect(assigned.body.data).toMatchObject({
        activityId,
        resourceId,
        budgetedUnits: 40,
        isDriving: false,
        version: 1,
      });
      const assignmentId = assigned.body.data.id as string;

      const list = await actor.agent.get(assignmentsUrl(activityId)).expect(200);
      expect(list.body.data).toHaveLength(1);

      const patched = await actor.agent
        .patch(assignmentUrl(assignmentId))
        .send({ budgetedUnits: 80, version: 1 })
        .expect(200);
      expect(patched.body.data).toMatchObject({ budgetedUnits: 80, version: 2 });

      await actor.agent.delete(assignmentUrl(assignmentId)).expect(204);
      const empty = await actor.agent.get(assignmentsUrl(activityId)).expect(200);
      expect(empty.body.data).toHaveLength(0);
    });

    it('rejects negative budgetedUnits (422, N14)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const activityId = await seedActivity(orgId, actor.userId);
      const { id: resourceId } = await createResource(actor, { name: 'Crew', kind: 'LABOUR' });
      await actor.agent
        .post(assignmentsUrl(activityId))
        .send({ resourceId, budgetedUnits: -1 })
        .expect(422);
    });

    it('rejects a duplicate (activity, resource) assignment (409 DUPLICATE_ASSIGNMENT)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const activityId = await seedActivity(orgId, actor.userId);
      const { id: resourceId } = await createResource(actor, { name: 'Crew', kind: 'LABOUR' });
      await actor.agent.post(assignmentsUrl(activityId)).send({ resourceId }).expect(201);
      const dup = await actor.agent
        .post(assignmentsUrl(activityId))
        .send({ resourceId })
        .expect(409);
      expect(dup.body.error?.details?.reason).toBe('DUPLICATE_ASSIGNMENT');
    });

    it('refuses to delete a resource assigned to an active activity (409 RESOURCE_IN_USE)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const activityId = await seedActivity(orgId, actor.userId);
      const { id: resourceId } = await createResource(actor, { name: 'Crew', kind: 'LABOUR' });
      await actor.agent.post(assignmentsUrl(activityId)).send({ resourceId }).expect(201);

      const res = await actor.agent.delete(`${base}/${resourceId}`).expect(409);
      expect(res.body.error?.details?.reason).toBe('RESOURCE_IN_USE');

      // Once the assignment is removed, the resource can be deleted.
      const list = await actor.agent.get(assignmentsUrl(activityId)).expect(200);
      await actor.agent.delete(assignmentUrl(list.body.data[0].id)).expect(204);
      await actor.agent.delete(`${base}/${resourceId}`).expect(204);
    });

    it('enforces ≤1 driver per activity: setting a second driver MOVES it', async () => {
      const { actor, orgId } = await adminWithOrg();
      const activityId = await seedActivity(orgId, actor.userId);
      const { id: crewId } = await createResource(actor, { name: 'Crew', kind: 'LABOUR' });
      const { id: craneId } = await createResource(actor, { name: 'Crane', kind: 'EQUIPMENT' });

      const first = await actor.agent
        .post(assignmentsUrl(activityId))
        .send({ resourceId: crewId, isDriving: true })
        .expect(201);
      const firstId = first.body.data.id as string;

      // A second driving assignment on the same activity — succeeds (a move, not a P2002).
      const second = await actor.agent
        .post(assignmentsUrl(activityId))
        .send({ resourceId: craneId, isDriving: true })
        .expect(201);
      expect(second.body.data.isDriving).toBe(true);

      // The first assignment's driver flag was cleared — exactly one driver remains.
      const list = await actor.agent.get(assignmentsUrl(activityId)).expect(200);
      const drivers = (list.body.data as { id: string; isDriving: boolean }[]).filter(
        (a) => a.isDriving,
      );
      expect(drivers).toHaveLength(1);
      expect(drivers[0]?.id).toBe(second.body.data.id);
      expect((list.body.data as { id: string }[]).find((a) => a.id === firstId)).toMatchObject({
        isDriving: false,
      });
    });

    it('rejects a MATERIAL resource set as the driver (422 MATERIAL_CANNOT_DRIVE)', async () => {
      const { actor, orgId } = await adminWithOrg();
      const activityId = await seedActivity(orgId, actor.userId);
      const { id: concreteId } = await createResource(actor, {
        name: 'Concrete',
        kind: 'MATERIAL',
      });

      const res = await actor.agent
        .post(assignmentsUrl(activityId))
        .send({ resourceId: concreteId, isDriving: true })
        .expect(422);
      expect(res.body.error?.details?.reason).toBe('MATERIAL_CANNOT_DRIVE');

      // A MATERIAL may be assigned as a NON-driver, then cannot be promoted to driver.
      const assigned = await actor.agent
        .post(assignmentsUrl(activityId))
        .send({ resourceId: concreteId })
        .expect(201);
      await actor.agent
        .patch(assignmentUrl(assigned.body.data.id))
        .send({ isDriving: true, version: 1 })
        .expect(422);
    });

    it('404s assigning to a foreign/unknown activity or an unknown resource', async () => {
      const { actor, orgId } = await adminWithOrg();
      const activityId = await seedActivity(orgId, actor.userId);
      const { id: resourceId } = await createResource(actor, { name: 'Crew', kind: 'LABOUR' });
      // Unknown activity.
      await actor.agent.post(assignmentsUrl(MISSING_ID)).send({ resourceId }).expect(404);
      // Unknown resource.
      await actor.agent
        .post(assignmentsUrl(activityId))
        .send({ resourceId: MISSING_ID })
        .expect(404);
    });
  });

  it('404s a foreign/unknown resource id and hides resources from non-members', async () => {
    const { actor } = await adminWithOrg();
    const { id } = await createResource(actor, { name: 'Secret', kind: 'LABOUR' });

    const outsider = await signUp('outsider@example.com');
    // Non-member: the org is invisible (404, not 403) on every route.
    await outsider.agent.get(base).expect(404);
    await outsider.agent.get(`${base}/${id}`).expect(404);
    await outsider.agent.patch(`${base}/${id}`).send({ name: 'X', version: 1 }).expect(404);
    await outsider.agent.delete(`${base}/${id}`).expect(404);

    // A member of a DIFFERENT org cannot reach this org's resource (anti-IDOR).
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const other = '/api/v1/organizations/other/resources';
    await outsider.agent.get(`${other}/${id}`).expect(404);
    await outsider.agent.patch(`${other}/${id}`).send({ name: 'X', version: 1 }).expect(404);
    await outsider.agent.delete(`${other}/${id}`).expect(404);
  });

  it('forbids Viewer and Contributor writes but allows reading (403 / 200)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const activityId = await seedActivity(orgId, actor.userId);
    const { id } = await createResource(actor, { name: 'Visible', kind: 'LABOUR' });

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });

    const assignmentsUrl = `/api/v1/organizations/acme/activities/${activityId}/assignments`;
    for (const member of [viewer, contributor]) {
      // Reads are allowed for every member.
      await member.agent.get(base).expect(200);
      await member.agent.get(`${base}/${id}`).expect(200);
      await member.agent.get(assignmentsUrl).expect(200);
      // Writes (resource + assignment) are Planner+ only.
      await member.agent.post(base).send({ name: 'Nope', kind: 'LABOUR' }).expect(403);
      await member.agent.patch(`${base}/${id}`).send({ name: 'Nope', version: 1 }).expect(403);
      await member.agent.delete(`${base}/${id}`).expect(403);
      await member.agent.post(assignmentsUrl).send({ resourceId: id }).expect(403);
    }
  });

  it('401s without a session', async () => {
    await request(server()).get(base).expect(401);
  });
});
