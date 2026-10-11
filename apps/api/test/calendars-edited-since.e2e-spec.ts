import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * A calendar or resource-limit edit marks every plan that uses it "edited since calculated"
 * (`docs/TECH_DEBT.md` #449, correctness-sweep M1).
 *
 * Needs a real database for the reason `overview.e2e-spec.ts` gives: the signal rests on which
 * writes reach `plans.schedule_inputs_changed_at`, and a mocked repository agrees with whatever it
 * is handed. The plan set is the point: a plan reaches a calendar three ways (its own calendar, an
 * activity's, a resource assigned to one of its activities), and a plan on none of them must stay
 * current. The fourth plan below is that control.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)(
  'Calendar and resource edits stamp the plans using them (e2e)',
  () => {
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

    interface World {
      actor: Actor;
      /** Plans that reach the calendar by its own binding, an activity's, and a resource's. */
      onPlan: string;
      onActivity: string;
      onResource: string;
      /** On none of them. */
      control: string;
      calendarId: string;
      resourceId: string;
      projectId: string;
    }

    let planCount = 0;

    async function newPlan(actor: Actor, projectId: string, calendarId?: string): Promise<string> {
      planCount += 1;
      const plan = await actor.agent
        .post(`${API}/projects/${projectId}/plans`)
        .send({ name: `Plan ${planCount}`, plannedStart: '2026-01-05' })
        .expect(201);
      const id = plan.body.data.id as string;
      // The calendar is bound by a patch: plan creation does not accept one.
      if (calendarId !== undefined) {
        await actor.agent
          .patch(`${API}/plans/${id}`)
          .send({ calendarId, version: plan.body.data.version })
          .expect(200);
      }
      await actor.agent.post(`${API}/plans/${id}/edit-lock`).send({}).expect(200);
      return id;
    }

    async function activityIn(actor: Actor, planId: string, over: object = {}) {
      const res = await actor.agent
        .post(`${API}/plans/${planId}/activities`)
        .send({ name: 'Pour slab', durationDays: 5, ...over })
        .expect(201);
      return res.body.data as { id: string; version: number };
    }

    const recalculate = (actor: Actor, planId: string) =>
      actor.agent.post(`${API}/plans/${planId}/schedule/recalculate`).send({}).expect(200);

    async function edited(actor: Actor, planId: string): Promise<boolean> {
      const plan = await actor.agent.get(`${API}/plans/${planId}`).expect(200);
      return (plan.body.data as { editedSinceCalculated: boolean }).editedSinceCalculated;
    }

    async function world(): Promise<World> {
      const actor = await signUp('admin@example.com');
      await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
      const client = await actor.agent
        .post(`${API}/clients`)
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await actor.agent
        .post(`${API}/clients/${client.body.data.id}/projects`)
        .send({ name: 'Tower' })
        .expect(201);
      const projectId = project.body.data.id as string;

      const calendar = await actor.agent
        .post(`${API}/calendars`)
        .send({ name: 'Site week', workingWeekdays: 31 })
        .expect(201);
      const calendarId = calendar.body.data.id as string;
      const resource = await actor.agent
        .post(`${API}/resources`)
        .send({ name: 'Crane crew', kind: 'LABOUR', calendarId, maxUnitsPerHour: 2 })
        .expect(201);
      const resourceId = resource.body.data.id as string;

      const onPlan = await newPlan(actor, projectId, calendarId);
      await activityIn(actor, onPlan);

      const onActivity = await newPlan(actor, projectId);
      await activityIn(actor, onActivity, { calendarId });

      const onResource = await newPlan(actor, projectId);
      const driven = await activityIn(actor, onResource);
      await actor.agent
        .post(`${API}/activities/${driven.id}/assignments`)
        .send({ resourceId })
        .expect(201);

      const control = await newPlan(actor, projectId);
      await activityIn(actor, control);

      for (const planId of [onPlan, onActivity, onResource, control]) {
        await recalculate(actor, planId);
      }
      const w = {
        actor,
        onPlan,
        onActivity,
        onResource,
        control,
        calendarId,
        resourceId,
        projectId,
      };
      await expectStamped(w, { onPlan: false, onActivity: false, onResource: false });
      return w;
    }

    /** What each plan reads, and that the control plan never moves. */
    async function expectStamped(
      w: World,
      expected: { onPlan: boolean; onActivity: boolean; onResource: boolean },
    ) {
      expect(await edited(w.actor, w.onPlan), 'plan on the calendar').toBe(expected.onPlan);
      expect(await edited(w.actor, w.onActivity), 'plan with an activity on it').toBe(
        expected.onActivity,
      );
      expect(await edited(w.actor, w.onResource), 'plan with a resource on it').toBe(
        expected.onResource,
      );
      expect(await edited(w.actor, w.control), 'plan on none of it').toBe(false);
    }

    const ALL = { onPlan: true, onActivity: true, onResource: true };

    const calendarVersion = async (w: World) =>
      (await w.actor.agent.get(`${API}/calendars/${w.calendarId}`).expect(200)).body.data
        .version as number;

    it('stamps every plan using the calendar when its shifts change', async () => {
      const w = await world();
      const version = await calendarVersion(w);
      await w.actor.agent
        .patch(`${API}/calendars/${w.calendarId}`)
        .send({ workingWeekdays: 63, version })
        .expect(200);
      await expectStamped(w, ALL);
      await recalculate(w.actor, w.onPlan);
      expect(await edited(w.actor, w.onPlan)).toBe(false);
    });

    it('stamps when only the hours-per-day factor changes (it re-expresses stored float)', async () => {
      const w = await world();
      const version = await calendarVersion(w);
      await w.actor.agent
        .patch(`${API}/calendars/${w.calendarId}`)
        .send({ hoursPerDay: 7, version })
        .expect(200);
      await expectStamped(w, ALL);
    });

    it('stamps on an exception being added, edited and removed', async () => {
      const w = await world();
      const created = await w.actor.agent
        .post(`${API}/calendars/${w.calendarId}/exceptions`)
        .send({ date: '2026-02-10' })
        .expect(201);
      await expectStamped(w, ALL);

      for (const planId of [w.onPlan, w.onActivity, w.onResource]) {
        await recalculate(w.actor, planId);
      }
      await w.actor.agent
        .patch(`${API}/calendars/${w.calendarId}/exceptions/${created.body.data.id}`)
        .send({ endDate: '2026-02-11', version: created.body.data.version })
        .expect(200);
      await expectStamped(w, ALL);

      for (const planId of [w.onPlan, w.onActivity, w.onResource]) {
        await recalculate(w.actor, planId);
      }
      await w.actor.agent
        .delete(`${API}/calendars/${w.calendarId}/exceptions/${created.body.data.id}`)
        .expect(204);
      await expectStamped(w, ALL);
    });

    it('stamps nothing for a rename, a description edit or an archive', async () => {
      const w = await world();
      const version = await calendarVersion(w);
      await w.actor.agent
        .patch(`${API}/calendars/${w.calendarId}`)
        .send({ name: 'Renamed', description: 'Same hours', version })
        .expect(200);
      const afterRename = await calendarVersion(w);
      await w.actor.agent
        .post(`${API}/calendars/${w.calendarId}/archive`)
        .send({ version: afterRename })
        .expect(204);
      await expectStamped(w, { onPlan: false, onActivity: false, onResource: false });
    });

    it('stamps nothing when the version is stale and the write is refused', async () => {
      const w = await world();
      await w.actor.agent
        .patch(`${API}/calendars/${w.calendarId}`)
        .send({ workingWeekdays: 63, version: 999 })
        .expect(409);
      await expectStamped(w, { onPlan: false, onActivity: false, onResource: false });
    });

    describe('a resource edit', () => {
      const resourceVersion = async (w: World) =>
        (await w.actor.agent.get(`${API}/resources/${w.resourceId}`).expect(200)).body.data
          .version as number;

      it('stamps a levelling plan when the capacity ceiling changes, and no other', async () => {
        const w = await world();
        // Levelling is a plan setting, so turning it on stamps that plan itself; recalculate after.
        const plan = await w.actor.agent.get(`${API}/plans/${w.onResource}`).expect(200);
        await w.actor.agent
          .patch(`${API}/plans/${w.onResource}`)
          .send({ levelResources: true, version: plan.body.data.version })
          .expect(200);
        await recalculate(w.actor, w.onResource);

        const version = await resourceVersion(w);
        await w.actor.agent
          .patch(`${API}/resources/${w.resourceId}`)
          .send({ maxUnitsPerHour: 4, version })
          .expect(200);
        await expectStamped(w, { onPlan: false, onActivity: false, onResource: true });
      });

      it('does not stamp a plan that is not levelling when only the ceiling changes', async () => {
        const w = await world();
        const version = await resourceVersion(w);
        await w.actor.agent
          .patch(`${API}/resources/${w.resourceId}`)
          .send({ maxUnitsPerHour: 4, version })
          .expect(200);
        await expectStamped(w, { onPlan: false, onActivity: false, onResource: false });
      });

      it('stamps the plans using the resource when its calendar changes', async () => {
        const w = await world();
        const version = await resourceVersion(w);
        await w.actor.agent
          .patch(`${API}/resources/${w.resourceId}`)
          .send({ calendarId: null, version })
          .expect(200);
        await expectStamped(w, { onPlan: false, onActivity: false, onResource: true });
      });

      it('stamps nothing when the values sent equal the stored ones, or only the name changes', async () => {
        const w = await world();
        const version = await resourceVersion(w);
        await w.actor.agent
          .patch(`${API}/resources/${w.resourceId}`)
          .send({
            name: 'Crane crew B',
            maxUnitsPerHour: 2,
            calendarId: w.calendarId,
            version,
          })
          .expect(200);
        await expectStamped(w, { onPlan: false, onActivity: false, onResource: false });
      });
    });
  },
);
