import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { OrganizationRole } from '../src/common/auth/principal';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * Removing a project's unused calendars (ADR-0208 D5, M2), against a real PostgreSQL + Better Auth:
 * `GET …/projects/:id/calendars/unused` and `POST …/calendars/bulk-delete`.
 *
 * The properties that matter, each written to fail against the obvious implementation:
 * - the list is the single delete's own predicate (a calendar a live plan uses is absent), with the
 *   binned referencers counted, so a calendar only a deleted plan uses is listed but flagged;
 * - the delete is **all or nothing**, so one used or foreign id leaves every other calendar alone;
 * - **each calendar has its own delete batch**, because a shared batch makes a Recently-deleted group
 *   whose Restore brings back one calendar while the group implies all of them (spec F10).
 *
 * Not covered here, deliberately: a 403 for a missing `calendar:manage_org` (both roles holding
 * `calendar:delete` also hold it — proven in `calendars.service.spec.ts`).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';
const NIL = '00000000-0000-4000-8000-000000000000';
const WEEKDAYS = 31;

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Remove unused calendars (e2e)', () => {
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
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(app.getHttpServer());
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

  async function addMember(orgId: string, email: string, role: OrganizationRole): Promise<Actor> {
    const user = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: user.userId, role } });
    return user;
  }

  async function makeProject(actor: Actor, name = 'Riverside'): Promise<string> {
    const client = await actor.agent
      .post(`${API}/clients`)
      .send({ name: `${name} Holdings` })
      .expect(201);
    const project = await actor.agent
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name })
      .expect(201);
    return project.body.data.id as string;
  }

  async function makeCalendar(
    actor: Actor,
    name: string,
    where: { projectId: string } | 'ORG',
  ): Promise<string> {
    const res = await actor.agent
      .post(`${API}/calendars`)
      .send({
        name,
        workingWeekdays: WEEKDAYS,
        ...(where === 'ORG' ? {} : { scope: 'PROJECT', projectId: where.projectId }),
      })
      .expect(201);
    return res.body.data.id as string;
  }

  /** A plan bound to `calendarId`, written directly: the HTTP path is not what these tests are about. */
  async function planOn(projectId: string, calendarId: string, name: string, deleted = false) {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    return prisma.plan.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        name,
        calendarId,
        plannedStart: new Date('2026-01-05'),
        ...(deleted ? { deletedAt: new Date() } : {}),
      },
    });
  }

  const unusedUrl = (projectId: string) => `${API}/projects/${projectId}/calendars/unused`;
  const bulkUrl = `${API}/calendars/bulk-delete`;

  describe('GET …/calendars/unused', () => {
    it('lists unused project calendars, archived ones included, and leaves out used and shared ones', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const used = await makeCalendar(actor, 'Used', { projectId });
      const free = await makeCalendar(actor, 'Free', { projectId });
      const archived = await makeCalendar(actor, 'Archived', { projectId });
      await makeCalendar(actor, 'Shared', 'ORG');
      await planOn(projectId, used, 'Live plan');
      await prisma.calendar.update({ where: { id: archived }, data: { archivedAt: new Date() } });

      const res = await actor.agent.get(unusedUrl(projectId)).expect(200);

      const rows = res.body.data as { id: string; name: string; archived: boolean }[];
      expect(rows.map((r) => r.name).sort()).toEqual(['Archived', 'Free']);
      expect(rows.find((r) => r.id === free)).toMatchObject({
        archived: false,
        deletedReferencers: { plans: 0, activities: 0 },
      });
      expect(rows.find((r) => r.id === archived)?.archived).toBe(true);
    });

    it('lists a calendar only a deleted plan uses, and counts the deleted plan', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const binned = await makeCalendar(actor, 'Binned only', { projectId });
      await planOn(projectId, binned, 'Old revision', true);

      const res = await actor.agent.get(unusedUrl(projectId)).expect(200);

      expect(res.body.data).toEqual([
        expect.objectContaining({
          id: binned,
          deletedReferencers: { plans: 1, activities: 0 },
        }),
      ]);
    });

    it('does not list a calendar an active resource uses', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const calendarId = await makeCalendar(actor, 'Crew calendar', { projectId });
      await prisma.resource.create({
        data: { organizationId: orgId, name: 'Crew', kind: 'LABOUR', calendarId },
      });

      const res = await actor.agent.get(unusedUrl(projectId)).expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('pages with a cursor, oldest first', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const ids: string[] = [];
      for (const name of ['One', 'Two', 'Three']) {
        ids.push(await makeCalendar(actor, name, { projectId }));
      }

      const first = await actor.agent.get(`${unusedUrl(projectId)}?limit=2`).expect(200);
      expect((first.body.data as { id: string }[]).map((r) => r.id)).toEqual(ids.slice(0, 2));
      expect(first.body.meta.hasMore).toBe(true);
      const second = await actor.agent
        .get(`${unusedUrl(projectId)}?limit=2&cursor=${first.body.meta.nextCursor as string}`)
        .expect(200);
      expect((second.body.data as { id: string }[]).map((r) => r.id)).toEqual(ids.slice(2));
      expect(second.body.meta.hasMore).toBe(false);
    });

    it('is readable by a Viewer, and 404s a foreign, deleted or unknown project', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const viewer = await addMember(orgId, 'viewer@example.com', 'VIEWER');
      await viewer.agent.get(unusedUrl(projectId)).expect(200);

      await actor.agent.get(unusedUrl(NIL)).expect(404);
      await prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
      await actor.agent.get(unusedUrl(projectId)).expect(404);

      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Elsewhere' }).expect(201);
      await outsider.agent.get(unusedUrl(projectId)).expect(404);
    });
  });

  describe('POST …/calendars/bulk-delete', () => {
    it('deletes each calendar under its own batch, writes one audit row each, and restores them one at a time', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const a = await makeCalendar(actor, 'Copy A', { projectId });
      const b = await makeCalendar(actor, 'Copy B', { projectId });
      await actor.agent
        .post(`${API}/calendars/${a}/exceptions`)
        .send({ date: '2026-12-25' })
        .expect(201);

      const res = await actor.agent
        .post(bulkUrl)
        .send({ ids: [a, b] })
        .expect(200);

      const deleted = res.body.data.deleted as { id: string; deleteBatchId: string }[];
      expect(deleted.map((d) => d.id).sort()).toEqual([a, b].sort());
      expect(new Set(deleted.map((d) => d.deleteBatchId)).size).toBe(2);
      const rows = await prisma.calendar.findMany({ where: { id: { in: [a, b] } } });
      expect(rows.every((r) => r.deletedAt !== null)).toBe(true);
      expect(new Set(rows.map((r) => r.deleteBatchId)).size).toBe(2);
      expect(await prisma.auditEvent.count({ where: { action: 'calendar.deleted' } })).toBe(2);
      expect(
        await prisma.calendarException.count({
          where: { calendarId: a, deletedAt: { not: null } },
        }),
      ).toBe(1);

      // Each one comes back alone, with its exception, and the other stays in the bin.
      await actor.agent.post(`${API}/calendars/${a}/restore`).expect(200);
      expect((await prisma.calendar.findUniqueOrThrow({ where: { id: a } })).deletedAt).toBeNull();
      expect(
        await prisma.calendarException.count({ where: { calendarId: a, deletedAt: null } }),
      ).toBe(1);
      expect(
        (await prisma.calendar.findUniqueOrThrow({ where: { id: b } })).deletedAt,
      ).not.toBeNull();
    });

    it('deletes nothing, and names the calendar, when one is used by an active plan', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const free = await makeCalendar(actor, 'Free', { projectId });
      const used = await makeCalendar(actor, 'Used', { projectId });
      await planOn(projectId, used, 'Live plan');

      const res = await actor.agent
        .post(bulkUrl)
        .send({ ids: [free, used] })
        .expect(409);

      expect(res.body.error.details).toMatchObject({
        reason: 'CALENDAR_IN_USE',
        calendars: [{ id: used, name: 'Used', plans: 1, activities: 0, resources: 0 }],
      });
      expect(await prisma.calendar.count({ where: { deletedAt: { not: null } } })).toBe(0);
      expect(await prisma.auditEvent.count({ where: { action: 'calendar.deleted' } })).toBe(0);
    });

    it('deletes nothing when one id belongs to another organisation (404, no oracle)', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const mine = await makeCalendar(actor, 'Mine', { projectId });

      const other = await signUp('other@example.com');
      const otherOrg = await other.agent
        .post('/api/v1/organizations')
        .send({ name: 'Other' })
        .expect(201);
      const foreign = (
        await other.agent
          .post(`/api/v1/organizations/${otherOrg.body.data.slug as string}/calendars`)
          .send({ name: 'Theirs', workingWeekdays: WEEKDAYS })
          .expect(201)
      ).body.data.id as string;

      await actor.agent
        .post(bulkUrl)
        .send({ ids: [mine, foreign] })
        .expect(404);
      await actor.agent
        .post(bulkUrl)
        .send({ ids: [mine, NIL] })
        .expect(404);

      expect(await prisma.calendar.count({ where: { deletedAt: { not: null } } })).toBe(0);
    });

    it('refuses a Contributor and a Viewer, and deletes nothing', async () => {
      const { actor, orgId } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const id = await makeCalendar(actor, 'Keep', { projectId });
      for (const role of ['CONTRIBUTOR', 'VIEWER'] as const) {
        const member = await addMember(orgId, `${role.toLowerCase()}@example.com`, role);
        await member.agent
          .post(bulkUrl)
          .send({ ids: [id] })
          .expect(403);
      }
      expect((await prisma.calendar.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
    });

    it('accepts a shared-library calendar for a holder of calendar:manage_org', async () => {
      const { actor } = await adminWithOrg();
      const shared = await makeCalendar(actor, 'Shared', 'ORG');
      await actor.agent
        .post(bulkUrl)
        .send({ ids: [shared] })
        .expect(200);
      expect(
        (await prisma.calendar.findUniqueOrThrow({ where: { id: shared } })).deletedAt,
      ).not.toBeNull();
    });

    it('validates the body: empty, over 200, duplicated and non-UUID ids are 422', async () => {
      const { actor } = await adminWithOrg();
      const id = NIL.replace(/0$/, '1');
      await actor.agent.post(bulkUrl).send({ ids: [] }).expect(422);
      await actor.agent
        .post(bulkUrl)
        .send({ ids: [id, id] })
        .expect(422);
      await actor.agent
        .post(bulkUrl)
        .send({ ids: ['not-a-uuid'] })
        .expect(422);
      await actor.agent.post(bulkUrl).send({}).expect(422);
      const many = Array.from(
        { length: 201 },
        (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      );
      await actor.agent.post(bulkUrl).send({ ids: many }).expect(422);
    });

    it('lets a calendar used only by a deleted plan go, and refuses that plan’s restore until the calendar returns', async () => {
      const { actor } = await adminWithOrg();
      const projectId = await makeProject(actor);
      const binned = await makeCalendar(actor, 'Binned only', { projectId });
      const plan = await planOn(projectId, binned, 'Old revision', true);

      await actor.agent
        .post(bulkUrl)
        .send({ ids: [binned] })
        .expect(200);

      const res = await actor.agent.post(`${API}/plans/${plan.id}/restore`);
      expect(res.status).toBe(409);
      await actor.agent.post(`${API}/calendars/${binned}/restore`).expect(200);
      await actor.agent.post(`${API}/plans/${plan.id}/restore`).expect(200);
    });
  });
});
