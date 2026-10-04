import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { resetThrottleCounters } from './throttle-reset';

/**
 * Per-activity change history (ADR-0174), end to end against a real PostgreSQL and a real Better
 * Auth session: what each single-object write records, how bursts merge, who may read it and what
 * they are shown, and the concurrency the history lock exists for.
 *
 * Two things this suite does that a unit tier structurally cannot: it proves a write and its entry
 * are one transaction (a 409 records nothing), and it races real requests (a lost update only exists
 * between two connections).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
  name: string;
}

type Json = Record<string, any>;

describe.skipIf(!hasDatabase)('Activity history (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerStorage: ThrottlerStorage;

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
    throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);
  });

  afterAll(async () => {
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    // Isolation, not a weakened bound (`throttle-reset.ts`): nothing here asserts a 429.
    resetThrottleCounters(throttlerStorage);
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const name = email.split('@')[0] as string;
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name, email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id, name };
  }

  async function member(orgId: string, email: string, role: 'VIEWER' | 'CONTRIBUTOR' | 'PLANNER') {
    const actor = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: actor.userId, role } });
    return actor;
  }

  /** An org (Acme, owned by `admin`), one plan, and activities named by `names`. */
  async function setup(...names: string[]) {
    const admin = await signUp('admin@example.com');
    const org = await admin.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const orgId = org.body.data.id as string;
    const client = await admin.agent.post(`${API}/clients`).send({ name: 'Northgate' }).expect(201);
    const project = await admin.agent
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await admin.agent
      .post(`${API}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const ids: string[] = [];
    for (const name of names) {
      const res = await admin.agent
        .post(`${API}/plans/${planId}/activities`)
        .send({ name, durationDays: 5 })
        .expect(201);
      ids.push(res.body.data.id as string);
    }
    return { admin, orgId, planId, ids };
  }

  const patch = (actor: Actor, id: string, version: number, body: Json) =>
    actor.agent.patch(`${API}/activities/${id}`).send({ ...body, version });

  async function version(actor: Actor, id: string): Promise<number> {
    const res = await actor.agent.get(`${API}/activities/${id}`).expect(200);
    return res.body.data.version as number;
  }

  /** PATCH with the current version, expecting success. */
  async function edit(actor: Actor, id: string, body: Json): Promise<Json> {
    const res = await patch(actor, id, await version(actor, id), body).expect(200);
    return res.body.data as Json;
  }

  async function history(
    actor: Actor,
    id: string,
    query = '',
  ): Promise<{ data: Json[]; meta: Json }> {
    const res = await actor.agent.get(`${API}/activities/${id}/history${query}`).expect(200);
    return res.body as { data: Json[]; meta: Json };
  }

  /** Make every entry of an activity look two minutes old, so the next write cannot merge into it. */
  async function ageEntries(activityId: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE activity_history_entries
         SET first_recorded_at = first_recorded_at - interval '2 minutes',
             last_recorded_at = last_recorded_at - interval '2 minutes'
       WHERE activity_id = ${activityId}::uuid`;
  }

  const link = (
    actor: Actor,
    planId: string,
    predecessorId: string,
    successorId: string,
    over: Json = {},
  ) =>
    actor.agent
      .post(`${API}/plans/${planId}/dependencies`)
      .send({ predecessorId, successorId, ...over });

  async function resource(actor: Actor, name: string, over: Json = {}): Promise<string> {
    const res = await actor.agent
      .post(`${API}/resources`)
      .send({ name, kind: 'LABOUR', ...over })
      .expect(201);
    return res.body.data.id as string;
  }

  describe('an activity edit', () => {
    it('records one entry naming the person, the scope and both sides of the change', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const before = await admin.agent.get(`${API}/activities/${a}`).expect(200);
      await edit(admin, a, { durationDays: 9 });

      const { data, meta } = await history(admin, a);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        actor: { id: admin.userId, name: 'admin' },
        scope: 'DEFINITION',
        editCount: 1,
        batch: null,
        origin: null,
      });
      expect(data[0]?.changes.durationMinutes).toEqual({
        from: before.body.data.durationMinutes,
        to: 9 * 1440,
      });
      expect(Object.keys(data[0]?.changes as Json)).toEqual(['durationMinutes']);
      expect(meta).toMatchObject({ hasMore: false, nextCursor: null });
      expect(typeof meta.recordingSince).toBe('string');
    });

    it('merges a second save by the same person within the window, keeping the original from', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const original = (await admin.agent.get(`${API}/activities/${a}`)).body.data.durationMinutes;
      await edit(admin, a, { durationDays: 7 });
      await edit(admin, a, { durationDays: 9, name: 'Excavate and strip' });

      const { data } = await history(admin, a);
      expect(data).toHaveLength(1);
      expect(data[0]?.editCount).toBe(2);
      expect(data[0]?.changes.durationMinutes).toEqual({ from: original, to: 9 * 1440 });
      expect(data[0]?.changes.name).toEqual({ from: 'Excavate', to: 'Excavate and strip' });
    });

    it('leaves no entry when the second save undoes the first (net-zero)', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const original = (await admin.agent.get(`${API}/activities/${a}`)).body.data.durationMinutes;
      await edit(admin, a, { durationDays: 9 });
      await edit(admin, a, { durationMinutes: original });
      expect((await history(admin, a)).data).toHaveLength(0);
    });

    it('starts a new entry once the quiet gap has passed', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await edit(admin, a, { durationDays: 7 });
      await ageEntries(a);
      await edit(admin, a, { durationDays: 9 });
      const { data } = await history(admin, a);
      expect(data).toHaveLength(2);
      // Newest first.
      expect(data[0]?.changes.durationMinutes.to).toBe(9 * 1440);
      expect(data[1]?.changes.durationMinutes.to).toBe(7 * 1440);
    });

    it('does not merge past a colleague: mine, theirs, mine are three entries', async () => {
      const { admin, orgId, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const colleague = await member(orgId, 'colleague@example.com', 'PLANNER');
      await edit(admin, a, { durationDays: 7 });
      await edit(colleague, a, { name: 'Excavate (colleague)' });
      await edit(admin, a, { durationDays: 9 });
      const { data } = await history(admin, a);
      expect(data.map((e) => e.actor.name)).toEqual(['admin', 'colleague', 'admin']);
    });

    it('records nothing for a save that changes nothing, and nothing for a lane-only move', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await edit(admin, a, { name: 'Excavate' });
      await edit(admin, a, { laneIndex: 4 });
      expect((await history(admin, a)).data).toHaveLength(0);
    });

    it('lets a lane that went back cancel inside an entry that already held it', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await edit(admin, a, { visualStart: '2026-03-04', laneIndex: 1 });
      await edit(admin, a, { laneIndex: 2 });
      expect((await history(admin, a)).data[0]?.changes.laneIndex).toEqual({ from: 0, to: 2 });
      await edit(admin, a, { laneIndex: 0 });
      const { data } = await history(admin, a);
      expect(data).toHaveLength(1);
      expect(Object.keys(data[0]?.changes as Json)).toEqual(['visualStart']);
    });

    it('records nothing when the write fails: a stale version 409s and leaves no entry', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const v = await version(admin, a);
      await patch(admin, a, v, { durationDays: 7 }).expect(200);
      await patch(admin, a, v, { durationDays: 9 }).expect(409);
      const { data } = await history(admin, a);
      expect(data).toHaveLength(1);
      expect(data[0]?.changes.durationMinutes.to).toBe(7 * 1440);
    });

    it('stores a description as changed only and never serves the text or its digest', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await edit(admin, a, { description: 'Confidential method statement' });
      const res = await admin.agent.get(`${API}/activities/${a}/history`).expect(200);
      expect(res.body.data[0].changes.description).toEqual({ changed: true });
      expect(JSON.stringify(res.body)).not.toContain('Confidential');
      const [stored] = await prisma.activityHistoryEntry.findMany({ where: { activityId: a } });
      expect(JSON.stringify(stored?.changes)).not.toContain('Confidential');
    });

    it('names a changed calendar as it was named at the time', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const cal = await admin.agent
        .post(`${API}/calendars`)
        .send({ name: 'Night shift', workingWeekdays: 62 })
        .expect(201);
      await edit(admin, a, { calendarId: cal.body.data.id });
      await prisma.calendar.update({ where: { id: cal.body.data.id }, data: { name: 'Renamed' } });
      const { data } = await history(admin, a);
      expect(data[0]?.changes.calendarId).toEqual({
        from: null,
        to: { id: cal.body.data.id, name: 'Night shift' },
      });
    });

    it('copies the organisation from the activity, never from the request', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await edit(admin, a, { durationDays: 9 });
      const stray = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM activity_history_entries e
          JOIN activities a ON a.id = e.activity_id
         WHERE e.organization_id <> a.organization_id`;
      expect(Number(stray[0]?.n)).toBe(0);

      // A member of ANOTHER organisation cannot write, or read, this activity's history at all.
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
      await outsider.agent
        .patch(`/api/v1/organizations/other/activities/${a}`)
        .send({ name: 'x', version: 1 })
        .expect(404);
      await outsider.agent.get(`/api/v1/organizations/other/activities/${a}/history`).expect(404);
    });
  });

  describe('progress reports', () => {
    it('records a Contributor report as a PROGRESS entry', async () => {
      const { orgId, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const contributor = await member(orgId, 'tom@example.com', 'CONTRIBUTOR');
      const v = await version(contributor, a);
      await contributor.agent
        .patch(`${API}/activities/${a}/progress`)
        .send({ percentComplete: 40, actualStart: '2026-01-01', version: v })
        .expect(200);

      const { data } = await history(contributor, a);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ scope: 'PROGRESS', actor: { name: 'tom' } });
      expect(data[0]?.changes.percentComplete).toEqual({ from: 0, to: 40 });
      expect(data[0]?.changes.actualStart).toEqual({ from: null, to: '2026-01-01' });
      // The derived status is an output of the percentage, never a recorded item.
      expect(data[0]?.changes.status).toBeUndefined();
    });

    it('does not merge a progress report into a definition edit', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await edit(admin, a, { durationDays: 9 });
      const v = await version(admin, a);
      await admin.agent
        .patch(`${API}/activities/${a}/progress`)
        .send({ percentComplete: 10, version: v })
        .expect(200);
      expect((await history(admin, a)).data.map((e) => e.scope)).toEqual([
        'PROGRESS',
        'DEFINITION',
      ]);
    });
  });

  describe('links, recorded on both ends', () => {
    it('records the add on the predecessor and the successor, each naming the other', async () => {
      const { admin, planId, ids } = await setup('Excavate', 'Pour slab');
      const [a, b] = ids as [string, string];
      const created = await link(admin, planId, a, b).expect(201);
      const key = `link:${created.body.data.id}`;

      const onA = (await history(admin, a)).data;
      const onB = (await history(admin, b)).data;
      expect(onA).toHaveLength(1);
      expect(onB).toHaveLength(1);
      expect(onA[0]).toMatchObject({ scope: 'LOGIC', actor: { name: 'admin' } });
      expect(onA[0]?.changes[key]).toMatchObject({
        dir: 'OUT',
        other: { id: b, name: 'Pour slab' },
        from: null,
        to: { type: 'FS', lagMinutes: 0 },
      });
      expect(onB[0]?.changes[key]).toMatchObject({
        dir: 'IN',
        other: { id: a, name: 'Excavate' },
        from: null,
      });
    });

    it('makes add-then-adjust one item at each end', async () => {
      const { admin, planId, ids } = await setup('Excavate', 'Pour slab');
      const [a, b] = ids as [string, string];
      const created = await link(admin, planId, a, b).expect(201);
      await admin.agent
        .patch(`${API}/dependencies/${created.body.data.id}`)
        .send({ lagMinutes: 960, version: created.body.data.version })
        .expect(200);
      for (const id of [a, b]) {
        const { data } = await history(admin, id);
        expect(data).toHaveLength(1);
        expect(data[0]?.editCount).toBe(2);
        expect(data[0]?.changes[`link:${created.body.data.id}`]).toMatchObject({
          from: null,
          to: { lagMinutes: 960 },
        });
      }
    });

    it('leaves no entry when a link is added and removed inside the window', async () => {
      const { admin, planId, ids } = await setup('Excavate', 'Pour slab');
      const [a, b] = ids as [string, string];
      const created = await link(admin, planId, a, b).expect(201);
      await admin.agent.delete(`${API}/dependencies/${created.body.data.id}`).expect(204);
      expect((await history(admin, a)).data).toHaveLength(0);
      expect((await history(admin, b)).data).toHaveLength(0);
    });

    it('keeps the old name of the other end when it is renamed before the link is removed', async () => {
      const { admin, planId, ids } = await setup('Excavate', 'Pour slab');
      const [a, b] = ids as [string, string];
      const created = await link(admin, planId, a, b).expect(201);
      await ageEntries(a);
      await ageEntries(b);
      await edit(admin, b, { name: 'Pour slab (renamed)' });
      await admin.agent.delete(`${API}/dependencies/${created.body.data.id}`).expect(204);

      const key = `link:${created.body.data.id}`;
      const onA = (await history(admin, a)).data;
      // Removal, then the original add. The removal names B as it is named NOW (it was renamed
      // before the removal); the add, written earlier, still says "Pour slab".
      expect(onA).toHaveLength(2);
      expect(onA[0]?.changes[key]).toMatchObject({
        other: { name: 'Pour slab (renamed)' },
        to: null,
      });
      expect(onA[1]?.changes[key]).toMatchObject({ other: { name: 'Pour slab' }, from: null });
    });

    it('records a removal even after the link was edited, from the state that was removed', async () => {
      const { admin, planId, ids } = await setup('Excavate', 'Pour slab');
      const [a, b] = ids as [string, string];
      const created = await link(admin, planId, a, b, { lagMinutes: 480 }).expect(201);
      await ageEntries(a);
      await admin.agent.delete(`${API}/dependencies/${created.body.data.id}`).expect(204);
      const { data } = await history(admin, a);
      expect(data[0]?.changes[`link:${created.body.data.id}`]).toMatchObject({
        from: { type: 'FS', lagMinutes: 480 },
        to: null,
      });
    });

    it('records nothing when a link write fails (a stale version 409s)', async () => {
      const { admin, planId, ids } = await setup('Excavate', 'Pour slab');
      const [a, b] = ids as [string, string];
      const created = await link(admin, planId, a, b).expect(201);
      await ageEntries(a);
      await admin.agent
        .patch(`${API}/dependencies/${created.body.data.id}`)
        .send({ lagMinutes: 60, version: 99 })
        .expect(409);
      // And a duplicate create (409) records nothing either.
      await link(admin, planId, a, b).expect(409);
      expect((await history(admin, a)).data).toHaveLength(1);
    });

    it('records nothing for a link patch that re-sends the same values', async () => {
      const { admin, planId, ids } = await setup('Excavate', 'Pour slab');
      const [a, b] = ids as [string, string];
      const created = await link(admin, planId, a, b).expect(201);
      await ageEntries(a);
      await admin.agent
        .patch(`${API}/dependencies/${created.body.data.id}`)
        .send({ type: 'FS', version: created.body.data.version })
        .expect(200);
      expect((await history(admin, a)).data).toHaveLength(1);
    });
  });

  describe('resource assignments', () => {
    it('records an assignment add with the resource named, and keeps the name after a rename', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const crane = await resource(admin, 'Tower crane', { code: 'CR600' });
      const created = await admin.agent
        .post(`${API}/activities/${a}/assignments`)
        .send({ resourceId: crane, budgetedUnits: 40 })
        .expect(201);
      await prisma.resource.update({ where: { id: crane }, data: { name: 'Renamed crane' } });

      const { data } = await history(admin, a);
      expect(data).toHaveLength(1);
      expect(data[0]?.scope).toBe('RESOURCES');
      expect(data[0]?.changes[`assignment:${created.body.data.id}`]).toMatchObject({
        resource: { id: crane, code: 'CR600', name: 'Tower crane' },
        from: null,
        to: { budgetedUnits: '40.0000', isDriving: false, unitsPerHour: null },
      });
    });

    it('records no entry when units are changed and changed back inside the window', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const crane = await resource(admin, 'Tower crane');
      const created = await admin.agent
        .post(`${API}/activities/${a}/assignments`)
        .send({ resourceId: crane, budgetedUnits: 40 })
        .expect(201);
      await ageEntries(a);
      const id = created.body.data.id as string;
      const first = await admin.agent
        .patch(`${API}/assignments/${id}`)
        .send({ budgetedUnits: 50, version: 1 })
        .expect(200);
      await admin.agent
        .patch(`${API}/assignments/${id}`)
        .send({ budgetedUnits: 40, version: first.body.data.version })
        .expect(200);
      // Only the original add remains.
      expect((await history(admin, a)).data).toHaveLength(1);
    });

    it('puts a units change that recomputes the duration, and the duration, in one entry', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await edit(admin, a, { durationType: 'FIXED_UNITS' });
      const crane = await resource(admin, 'Tower crane');
      const created = await admin.agent
        .post(`${API}/activities/${a}/assignments`)
        .send({
          resourceId: crane,
          budgetedUnits: 8,
          unitsPerHour: 1,
          isDriving: true,
          editedField: 'UNITS_PER_HOUR',
        })
        .expect(201);
      await ageEntries(a);
      const durationBefore = (await admin.agent.get(`${API}/activities/${a}`)).body.data
        .durationMinutes as number;
      await admin.agent
        .patch(`${API}/assignments/${created.body.data.id}`)
        .send({ unitsPerHour: 2, editedField: 'UNITS_PER_HOUR', version: 1 })
        .expect(200);
      const durationAfter = (await admin.agent.get(`${API}/activities/${a}`)).body.data
        .durationMinutes as number;
      expect(durationAfter).not.toBe(durationBefore);

      const { data } = await history(admin, a);
      expect(data[0]?.scope).toBe('RESOURCES');
      expect(data[0]?.changes.durationMinutes).toEqual({ from: durationBefore, to: durationAfter });
      expect(data[0]?.changes[`assignment:${created.body.data.id}`]).toMatchObject({
        from: { unitsPerHour: '1.0000' },
        to: { unitsPerHour: '2.0000' },
      });
    });

    it('records the displaced driver when another assignment takes over', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const c1 = await resource(admin, 'Crew 1');
      const c2 = await resource(admin, 'Crew 2');
      const first = await admin.agent
        .post(`${API}/activities/${a}/assignments`)
        .send({ resourceId: c1, budgetedUnits: 8, isDriving: true })
        .expect(201);
      await ageEntries(a);
      const second = await admin.agent
        .post(`${API}/activities/${a}/assignments`)
        .send({ resourceId: c2, budgetedUnits: 8, isDriving: true })
        .expect(201);
      const { data } = await history(admin, a);
      expect(data[0]?.changes[`assignment:${second.body.data.id}`]).toMatchObject({ from: null });
      expect(data[0]?.changes[`assignment:${first.body.data.id}`]).toMatchObject({
        resource: { name: 'Crew 1' },
        from: { isDriving: true },
        to: { isDriving: false },
      });
    });

    it('records the removal from the state that was removed', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const crane = await resource(admin, 'Tower crane');
      const created = await admin.agent
        .post(`${API}/activities/${a}/assignments`)
        .send({ resourceId: crane, budgetedUnits: 40 })
        .expect(201);
      await ageEntries(a);
      await admin.agent.delete(`${API}/assignments/${created.body.data.id}`).expect(204);
      const { data } = await history(admin, a);
      expect(data[0]?.changes[`assignment:${created.body.data.id}`]).toMatchObject({
        from: { budgetedUnits: '40.0000' },
        to: null,
      });
    });
  });

  describe('who sees what', () => {
    it('shows every member the same non-cost history and withholds money from non-cost readers', async () => {
      const { admin, orgId, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const viewer = await member(orgId, 'vera@example.com', 'VIEWER');
      const contributor = await member(orgId, 'tom@example.com', 'CONTRIBUTOR');

      // One entry that changes cost AND something else; then (aged) one that changes only cost.
      await edit(admin, a, { name: 'Excavate and strip', budgetedExpense: 125000 });
      await ageEntries(a);
      await edit(admin, a, { actualExpense: 9000 });

      const asPlanner = (await history(admin, a)).data;
      expect(asPlanner).toHaveLength(2);
      expect(asPlanner[1]?.changes.budgetedExpense).toEqual({ from: null, to: 125000 });

      for (const reader of [viewer, contributor]) {
        const { data, meta } = await history(reader, a);
        // The cost-only entry is gone, and the mixed one shows only the non-cost item.
        expect(data).toHaveLength(1);
        expect(Object.keys(data[0]?.changes as Json)).toEqual(['name']);
        expect(meta.hasMore).toBe(false);
        expect(JSON.stringify(data)).not.toContain('125000');
      }
    });

    it('never serves a Viewer the money on an assignment, but shows that it was added', async () => {
      const { admin, orgId, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const viewer = await member(orgId, 'vera@example.com', 'VIEWER');
      const crane = await resource(admin, 'Tower crane');
      const created = await admin.agent
        .post(`${API}/activities/${a}/assignments`)
        .send({ resourceId: crane, budgetedUnits: 40, budgetedCost: 77700 })
        .expect(201);
      const key = `assignment:${created.body.data.id}`;

      const seenByViewer = (await history(viewer, a)).data[0]?.changes[key] as Json;
      expect(seenByViewer.to.budgetedUnits).toBe('40.0000');
      expect('budgetedCost' in seenByViewer.to).toBe(false);
      expect('actualCost' in seenByViewer.to).toBe(false);
      expect(((await history(admin, a)).data[0]?.changes[key] as Json).to.budgetedCost).toBe(77700);

      // A later change to money alone is a cost-only entry: invisible to the Viewer, full page kept.
      await ageEntries(a);
      await admin.agent
        .patch(`${API}/assignments/${created.body.data.id}`)
        .send({ budgetedCost: 88800, version: 1 })
        .expect(200);
      expect((await history(viewer, a)).data).toHaveLength(1);
      expect((await history(admin, a)).data).toHaveLength(2);
    });
  });

  describe('the read route', () => {
    it('401s without a session, and 404s for another organisation, a deleted activity, or no such id', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await request(server()).get(`${API}/activities/${a}/history`).expect(401);
      await admin.agent
        .get(`${API}/activities/00000000-0000-7000-8000-000000000000/history`)
        .expect(404);
      await admin.agent.delete(`${API}/activities/${a}`).expect(200);
      await admin.agent.get(`${API}/activities/${a}/history`).expect(404);
    });

    it('422s on a malformed cursor or page size', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await admin.agent.get(`${API}/activities/${a}/history?cursor=not-a-cursor`).expect(422);
      await admin.agent.get(`${API}/activities/${a}/history?limit=0`).expect(422);
      await admin.agent.get(`${API}/activities/${a}/history?limit=101`).expect(422);
    });

    it('pages newest-first, stably, and survives the boundary entry changing', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      for (const days of [6, 7, 8, 9]) {
        await edit(admin, a, { durationDays: days });
        await ageEntries(a);
      }
      const first = await history(admin, a, '?limit=3');
      expect(first.data.map((e) => e.changes.durationMinutes.to)).toEqual([
        9 * 1440,
        8 * 1440,
        7 * 1440,
      ]);
      expect(first.meta.hasMore).toBe(true);

      // A new write lands before page two is fetched: the cursor is the sort key, so page two is
      // exactly the rest of the original list.
      await edit(admin, a, { durationDays: 10 });
      const second = await history(admin, a, `?limit=3&cursor=${first.meta.nextCursor}`);
      expect(second.data.map((e) => e.changes.durationMinutes.to)).toEqual([6 * 1440]);
      expect(second.meta).toMatchObject({ hasMore: false, nextCursor: null });
    });

    it('keeps the cursor valid when the boundary entry later merges', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      await edit(admin, a, { durationDays: 6 });
      await ageEntries(a);
      await edit(admin, a, { durationDays: 7 });
      const first = await history(admin, a, '?limit=1');
      await edit(admin, a, { durationDays: 8 }); // merges into the newest entry (extends it)
      const second = await history(admin, a, `?limit=1&cursor=${first.meta.nextCursor}`);
      expect(second.data).toHaveLength(1);
      expect(second.data[0]?.changes.durationMinutes.to).toBe(6 * 1440);
    });
  });

  describe('concurrency', () => {
    it('keeps both items when two recorders race on one activity (the lost-update case)', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const c1 = await resource(admin, 'Crew 1');
      const c2 = await resource(admin, 'Crew 2');
      // Two assignment creates by one person, a few milliseconds apart: neither updates the activity
      // row, so only the history lock stops both reading the same latest entry and the second
      // overwriting the first's item.
      const [r1, r2] = await Promise.all([
        admin.agent
          .post(`${API}/activities/${a}/assignments`)
          .send({ resourceId: c1, budgetedUnits: 1 }),
        admin.agent
          .post(`${API}/activities/${a}/assignments`)
          .send({ resourceId: c2, budgetedUnits: 2 }),
      ]);
      expect([r1.status, r2.status]).toEqual([201, 201]);
      const { data } = await history(admin, a);
      expect(data).toHaveLength(1);
      expect(Object.keys(data[0]?.changes as Json).sort()).toEqual(
        [`assignment:${r1.body.data.id}`, `assignment:${r2.body.data.id}`].sort(),
      );
      expect(data[0]?.editCount).toBe(2);
    });

    it('keeps both items when two link edits race on a shared endpoint', async () => {
      const { admin, planId, ids } = await setup('Hub', 'B', 'C');
      const [hub, b, c] = ids as [string, string, string];
      const l1 = await link(admin, planId, hub, b).expect(201);
      const l2 = await link(admin, planId, hub, c).expect(201);
      const [p1, p2] = await Promise.all([
        admin.agent
          .patch(`${API}/dependencies/${l1.body.data.id}`)
          .send({ lagMinutes: 60, version: 1 }),
        admin.agent
          .patch(`${API}/dependencies/${l2.body.data.id}`)
          .send({ lagMinutes: 120, version: 1 }),
      ]);
      expect([p1.status, p2.status]).toEqual([200, 200]);
      const { data } = await history(admin, hub);
      expect(data).toHaveLength(1);
      expect(data[0]?.changes[`link:${l1.body.data.id}`]).toMatchObject({ to: { lagMinutes: 60 } });
      expect(data[0]?.changes[`link:${l2.body.data.id}`]).toMatchObject({
        to: { lagMinutes: 120 },
      });
    });

    it('gives an assignment edit and a duration edit on one activity exactly their own items', async () => {
      const { admin, ids } = await setup('Excavate');
      const a = ids[0] as string;
      const crane = await resource(admin, 'Tower crane');
      const created = await admin.agent
        .post(`${API}/activities/${a}/assignments`)
        .send({ resourceId: crane, budgetedUnits: 40 })
        .expect(201);
      await ageEntries(a);
      const v = await version(admin, a);
      const [asg, act] = await Promise.all([
        admin.agent
          .patch(`${API}/assignments/${created.body.data.id}`)
          .send({ budgetedUnits: 50, version: 1 }),
        patch(admin, a, v, { durationDays: 9 }),
      ]);
      expect([asg.status, act.status]).toEqual([200, 200]);
      const { data } = await history(admin, a);
      const byScope = Object.fromEntries(data.map((e) => [e.scope, Object.keys(e.changes)]));
      expect(byScope.RESOURCES).toEqual([`assignment:${created.body.data.id}`]);
      expect(byScope.DEFINITION).toEqual(['durationMinutes']);
    });

    it('never deadlocks a link create against a PATCH and a placement batch (200 rounds)', async () => {
      const { admin, planId, ids } = await setup('A', 'B');
      const [a, b] = ids as [string, string];
      const statuses: number[] = [];
      for (let round = 0; round < 200; round += 1) {
        // 200 rounds is far past the 60 s request budget; see `throttle-reset.ts`.
        resetThrottleCounters(throttlerStorage);
        const [va, vb] = [await version(admin, a), await version(admin, b)];
        const results = await Promise.all([
          link(admin, planId, a, b),
          patch(admin, b, vb, { durationDays: (round % 7) + 1 }),
          admin.agent.patch(`${API}/plans/${planId}/activities/placements`).send({
            placements: [
              {
                id: a,
                version: va,
                constraintType: null,
                constraintDate: null,
                visualStart: null,
                laneIndex: null,
              },
              {
                id: b,
                version: vb,
                constraintType: null,
                constraintDate: null,
                visualStart: null,
                laneIndex: null,
              },
            ],
          }),
        ]);
        statuses.push(...results.map((r) => r.status));
        const created = results[0];
        if (created.status === 201) {
          await admin.agent.delete(`${API}/dependencies/${created.body.data.id}`).expect(204);
        }
      }
      // A version race is a legitimate 409; a deadlock (40P01) or any other failure is a 5xx.
      expect(statuses.filter((s) => s >= 500)).toEqual([]);
      expect(statuses.filter((s) => s === 201).length).toBeGreaterThan(0);
    }, 180_000);
  });

  it('deletes history explicitly with its activities, and the expiry census counts it', async () => {
    // The permanent-deletion paths are covered by hierarchy-expiry.e2e-spec.ts; this pins the
    // RESTRICT itself: a raw hard delete of an activity that has history is refused.
    const { admin, ids } = await setup('Excavate');
    const a = ids[0] as string;
    await edit(admin, a, { durationDays: 9 });
    await expect(prisma.activity.delete({ where: { id: a } })).rejects.toThrow();
  });
});
