import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * A restore never brings work back onto a deleted calendar (ADR-0200, TECH_DEBT #519), against a real
 * PostgreSQL + Better Auth.
 *
 * Every refusal here is written to fail against the restore this replaces — an `updateMany` by
 * `delete_batch_id` that looked at no calendar — and each also asserts that **nothing was written**:
 * the rows stay deleted and no `*.restored` audit event exists. Fixtures are built through the public
 * API; the only direct writes are the legacy-data fixture in `library-restore.e2e-spec.ts`.
 *
 * Not here: the concurrency guarantees (`hierarchy-parent-lock-race.e2e-spec.ts`).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface BinItem {
  kind: string;
  id: string;
  canRestore: boolean;
  blockedBy: {
    kind: string;
    relation: string;
    id: string;
    name: string;
    deleteBatchId: string | null;
  } | null;
}

describe.skipIf(!hasDatabase)('Restore onto a deleted calendar (e2e)', () => {
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

  async function createCalendar(
    actor: Actor,
    name: string,
    over: Record<string, unknown> = {},
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`${API}/calendars`)
      .send({ name, workingWeekdays: 31, ...over })
      .expect(201);
    return res.body.data as { id: string; version: number };
  }

  interface World {
    actor: Actor;
    clientId: string;
    projectId: string;
    planId: string;
    /** The plan's calendar (ORG tier). */
    calendarId: string;
    /** Take the pen: every activity write and restore is pen-gated. */
    pen: () => Promise<void>;
    bin: () => Promise<BinItem[]>;
  }

  /** A client → project → plan on an ORG calendar "Mon-Wed". */
  async function world(): Promise<World> {
    const actor = await signUp('admin@example.com');
    await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent.post(`${API}/clients`).send({ name: 'Northgate' }).expect(201);
    const clientId = client.body.data.id as string;
    const project = await actor.agent
      .post(`${API}/clients/${clientId}/projects`)
      .send({ name: 'Tower' })
      .expect(201);
    const projectId = project.body.data.id as string;
    const calendar = await createCalendar(actor, 'Mon-Wed', { workingWeekdays: 7 });
    const plan = await actor.agent
      .post(`${API}/projects/${projectId}/plans`)
      .send({ name: 'Plan', plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent
      .patch(`${API}/plans/${planId}`)
      .send({ calendarId: calendar.id, version: plan.body.data.version })
      .expect(200);
    const pen = async (): Promise<void> => {
      await actor.agent.post(`${API}/plans/${planId}/edit-lock`).send({}).expect(200);
    };
    const bin = async (): Promise<BinItem[]> =>
      (await actor.agent.get(`${API}/deleted`).query({ limit: 100 }).expect(200)).body
        .data as BinItem[];
    return { actor, clientId, projectId, planId, calendarId: calendar.id, pen, bin };
  }

  async function addActivity(w: World, name: string, calendarId?: string): Promise<{ id: string }> {
    await w.pen();
    const res = await w.actor.agent
      .post(`${API}/plans/${w.planId}/activities`)
      .send({ name, durationDays: 5, ...(calendarId ? { calendarId } : {}) })
      .expect(201);
    return res.body.data as { id: string };
  }

  const deleteCalendar = (w: World, id: string) =>
    w.actor.agent.delete(`${API}/calendars/${id}`).expect(204);
  const restoreCalendar = (w: World, id: string) =>
    w.actor.agent.post(`${API}/calendars/${id}/restore`).expect(200);

  const auditCount = (action: string) => prisma.auditEvent.count({ where: { action } });

  /** The 409 every refusal below shares. */
  function expectCalendarDeleted(res: request.Response, calendarId: string, name: string): void {
    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({
      reason: 'CALENDAR_DELETED',
      calendar: { id: calendarId, name },
    });
  }

  // ---------------------------------------------------------------------------------------------
  describe('plan restore', () => {
    it('refuses a plan whose calendar was deleted after it, then restores once the calendar is back', async () => {
      // A restore with no calendar check passes the first expectation with a 200: this is #519.
      const w = await world();
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      await deleteCalendar(w, w.calendarId);

      const refused = await w.actor.agent.post(`${API}/plans/${w.planId}/restore`);
      expectCalendarDeleted(refused, w.calendarId, 'Mon-Wed');
      expect(refused.body.error.details.calendar.deleteBatchId).toEqual(expect.any(String));
      // Nothing was written: still deleted, no audit row.
      expect((await prisma.plan.findUniqueOrThrow({ where: { id: w.planId } })).deletedAt).not.toBe(
        null,
      );
      expect(await auditCount('plan.restored')).toBe(0);

      await restoreCalendar(w, w.calendarId);
      await w.actor.agent.post(`${API}/plans/${w.planId}/restore`).expect(200);
      expect((await prisma.plan.findUniqueOrThrow({ where: { id: w.planId } })).calendarId).toBe(
        w.calendarId,
      );
    });

    it('refuses a plan when one of its ACTIVITIES has its own deleted calendar (E2)', async () => {
      // The plan's own calendar is fine; only a naive check of `plan.calendar_id` passes this.
      const w = await world();
      const own = await createCalendar(w.actor, 'Own hours');
      await addActivity(w, 'Pour slab', own.id);
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      await deleteCalendar(w, own.id);

      expectCalendarDeleted(
        await w.actor.agent.post(`${API}/plans/${w.planId}/restore`),
        own.id,
        'Own hours',
      );
      expect(await auditCount('plan.restored')).toBe(0);
    });

    it('allows an ARCHIVED calendar: archived bindings stay live (E5)', async () => {
      const w = await world();
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      const { version } = await prisma.calendar.findUniqueOrThrow({ where: { id: w.calendarId } });
      await w.actor.agent
        .post(`${API}/calendars/${w.calendarId}/archive`)
        .send({ version })
        .expect(204);
      await w.actor.agent.post(`${API}/plans/${w.planId}/restore`).expect(200);
    });

    it('names the lowest calendar id first, and the next one after it is restored (E7)', async () => {
      const w = await world();
      const other = await createCalendar(w.actor, 'Other hours');
      await addActivity(w, 'Pour slab', other.id);
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      await deleteCalendar(w, w.calendarId);
      await deleteCalendar(w, other.id);
      const [first, second] = [w.calendarId, other.id].sort();

      const one = await w.actor.agent.post(`${API}/plans/${w.planId}/restore`);
      expect(one.body.error.details.calendar.id).toBe(first);
      await restoreCalendar(w, first!);
      const two = await w.actor.agent.post(`${API}/plans/${w.planId}/restore`);
      expect(two.body.error.details.calendar.id).toBe(second);
      await restoreCalendar(w, second!);
      await w.actor.agent.post(`${API}/plans/${w.planId}/restore`).expect(200);
    });

    it('reports a still-deleted PARENT before a deleted calendar', async () => {
      const w = await world();
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      await deleteCalendar(w, w.calendarId);
      await w.actor.agent.delete(`${API}/projects/${w.projectId}`).expect(204);

      const res = await w.actor.agent.post(`${API}/plans/${w.planId}/restore`);
      expect(res.status).toBe(409);
      expect(res.body.error.details.reason).toBe('PARENT_DELETED');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('project and client restore', () => {
    it('refuses a project whose plan uses an ORG calendar deleted afterwards', async () => {
      const w = await world();
      await w.actor.agent.delete(`${API}/projects/${w.projectId}`).expect(204);
      await deleteCalendar(w, w.calendarId);

      expectCalendarDeleted(
        await w.actor.agent.post(`${API}/projects/${w.projectId}/restore`),
        w.calendarId,
        'Mon-Wed',
      );
      expect(await auditCount('project.restored')).toBe(0);

      await restoreCalendar(w, w.calendarId);
      await w.actor.agent.post(`${API}/projects/${w.projectId}/restore`).expect(200);
    });

    it('refuses a client whose plan uses an ORG calendar deleted afterwards', async () => {
      const w = await world();
      await w.actor.agent.delete(`${API}/clients/${w.clientId}`).expect(204);
      await deleteCalendar(w, w.calendarId);

      expectCalendarDeleted(
        await w.actor.agent.post(`${API}/clients/${w.clientId}/restore`),
        w.calendarId,
        'Mon-Wed',
      );
      expect(await auditCount('client.restored')).toBe(0);

      await restoreCalendar(w, w.calendarId);
      await w.actor.agent.post(`${API}/clients/${w.clientId}/restore`).expect(200);
    });

    it('still restores a project together with its OWN calendars, swept in the same batch (E3)', async () => {
      // Without the same-batch exemption the guard refuses every project that owns a calendar its
      // plan uses, which would make the project permanently unrestorable.
      const w = await world();
      const own = await createCalendar(w.actor, 'Site hours', {
        scope: 'PROJECT',
        projectId: w.projectId,
      });
      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: w.planId } });
      await w.actor.agent
        .patch(`${API}/plans/${w.planId}`)
        .send({ calendarId: own.id, version: plan.version })
        .expect(200);
      await w.actor.agent.delete(`${API}/projects/${w.projectId}`).expect(204);
      expect(
        (await prisma.calendar.findUniqueOrThrow({ where: { id: own.id } })).deletedAt,
      ).not.toBe(null);

      await w.actor.agent.post(`${API}/projects/${w.projectId}/restore`).expect(200);
      expect((await prisma.calendar.findUniqueOrThrow({ where: { id: own.id } })).deletedAt).toBe(
        null,
      );
    });

    it('refuses a plan whose PROJECT calendar was deleted on its own after the plan (E4)', async () => {
      const w = await world();
      const own = await createCalendar(w.actor, 'Site hours', {
        scope: 'PROJECT',
        projectId: w.projectId,
      });
      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: w.planId } });
      await w.actor.agent
        .patch(`${API}/plans/${w.planId}`)
        .send({ calendarId: own.id, version: plan.version })
        .expect(200);
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      await deleteCalendar(w, own.id);

      expectCalendarDeleted(
        await w.actor.agent.post(`${API}/plans/${w.planId}/restore`),
        own.id,
        'Site hours',
      );
      // The cure is available: the project is active, so the calendar restores on its own.
      await restoreCalendar(w, own.id);
      await w.actor.agent.post(`${API}/plans/${w.planId}/restore`).expect(200);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('activity restore', () => {
    it('refuses a single-activity restore and the batch restore undo uses, and writes nothing (E6)', async () => {
      const w = await world();
      const own = await createCalendar(w.actor, 'Own hours');
      const activity = await addActivity(w, 'Pour slab', own.id);
      const deleted = await w.actor.agent.delete(`${API}/activities/${activity.id}`).expect(200);
      const batchId = deleted.body.data.deleteBatchId as string;
      await deleteCalendar(w, own.id);
      await w.pen();

      expectCalendarDeleted(
        await w.actor.agent.post(`${API}/activities/${activity.id}/restore`),
        own.id,
        'Own hours',
      );
      expectCalendarDeleted(
        await w.actor.agent.post(`${API}/plans/${w.planId}/activities/restore-batch/${batchId}`),
        own.id,
        'Own hours',
      );
      expect(
        (await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } })).deletedAt,
      ).not.toBe(null);
      expect(await auditCount('activity.restored')).toBe(0);

      // The cure, then the retry that undo offers: same id, same calendar.
      await restoreCalendar(w, own.id);
      await w.actor.agent
        .post(`${API}/plans/${w.planId}/activities/restore-batch/${batchId}`)
        .expect(200);
      expect(
        (await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } })).calendarId,
      ).toBe(own.id);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Recently deleted shows the blocker in advance (ADR-0200 D2)', () => {
    it.each(['plan', 'project', 'client'] as const)(
      'names the deleted calendar on a %s row and withholds Restore',
      async (kind) => {
        const w = await world();
        const rootId = { plan: w.planId, project: w.projectId, client: w.clientId }[kind];
        const url = { plan: 'plans', project: 'projects', client: 'clients' }[kind];
        await w.actor.agent.delete(`${API}/${url}/${rootId}`).expect(204);
        await deleteCalendar(w, w.calendarId);

        const row = (await w.bin()).find((item) => item.kind === kind && item.id === rootId);
        expect(row).toMatchObject({
          canRestore: false,
          blockedBy: { kind: 'calendar', relation: 'calendar', id: w.calendarId, name: 'Mon-Wed' },
        });

        // Restoring the blocker lifts it, and the row becomes restorable.
        await restoreCalendar(w, w.calendarId);
        expect((await w.bin()).find((item) => item.id === rootId)).toMatchObject({
          canRestore: true,
          blockedBy: null,
        });
      },
    );

    it('does not name a calendar that comes back with the row’s own batch', async () => {
      const w = await world();
      const own = await createCalendar(w.actor, 'Site hours', {
        scope: 'PROJECT',
        projectId: w.projectId,
      });
      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: w.planId } });
      await w.actor.agent
        .patch(`${API}/plans/${w.planId}`)
        .send({ calendarId: own.id, version: plan.version })
        .expect(200);
      await w.actor.agent.delete(`${API}/projects/${w.projectId}`).expect(204);

      const row = (await w.bin()).find((item) => item.id === w.projectId);
      expect(row).toMatchObject({ canRestore: true, blockedBy: null });
    });

    it('names a deleted parent, not the calendar, when both block a plan', async () => {
      const w = await world();
      await w.actor.agent.delete(`${API}/plans/${w.planId}`).expect(204);
      await deleteCalendar(w, w.calendarId);
      await w.actor.agent.delete(`${API}/projects/${w.projectId}`).expect(204);

      const row = (await w.bin()).find((item) => item.id === w.planId);
      expect(row?.blockedBy).toMatchObject({ kind: 'project', relation: 'parent' });
    });
  });
});
