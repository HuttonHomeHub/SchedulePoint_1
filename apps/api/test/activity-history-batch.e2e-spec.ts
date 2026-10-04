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
 * Per-activity change history, second milestone (ADR-0174): what a group move, a batch re-parent, a
 * dissolve, a delete or restore that takes links from survivors, and a cross-plan link record — and
 * what they must not. The statement budget of these paths is `activity-history-statements`; this file
 * is the behaviour: who sees what on which activity, that batches never merge, that a 409 mid-batch
 * leaves nothing, and that a 2,000-row batch is one set-based write.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';

type Json = Record<string, any>;
type Agent = ReturnType<typeof request.agent>;

describe.skipIf(!hasDatabase)('Activity history — batches and knock-ons (e2e)', () => {
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
    resetThrottleCounters(throttlerStorage);
    await clearDomainData(prisma);
  });

  /** An org (Acme) with one plan and the named activities; `project` lets a test add a second plan. */
  async function setup(...names: string[]) {
    const admin: Agent = request.agent(app.getHttpServer());
    await admin
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await admin.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await admin.post(`${API}/clients`).send({ name: 'Northgate' }).expect(201);
    const project = await admin
      .post(`${API}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const projectId = project.body.data.id as string;
    const planId = await plan(admin, projectId, 'Baseline');
    const acts: Json[] = [];
    for (const name of names) acts.push(await activity(admin, planId, name));
    return { admin, projectId, planId, acts };
  }

  async function plan(admin: Agent, projectId: string, name: string): Promise<string> {
    const res = await admin
      .post(`${API}/projects/${projectId}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function activity(admin: Agent, planId: string, name: string, over: Json = {}) {
    const res = await admin
      .post(`${API}/plans/${planId}/activities`)
      .send({ name, durationDays: 5, ...over })
      .expect(201);
    return res.body.data as Json;
  }

  async function history(admin: Agent, id: string, query = ''): Promise<Json[]> {
    const res = await admin.get(`${API}/activities/${id}/history${query}`).expect(200);
    return (res.body as { data: Json[] }).data;
  }

  const placement = (a: Json, day: string, laneIndex: number | null = null) => ({
    id: a.id,
    version: a.version,
    constraintType: 'SNET',
    constraintDate: day,
    visualStart: day,
    laneIndex,
  });

  const move = (admin: Agent, planId: string, placements: Json[]) =>
    admin.patch(`${API}/plans/${planId}/activities/placements`).send({ placements });

  async function fresh(admin: Agent, id: string): Promise<Json> {
    return (await admin.get(`${API}/activities/${id}`).expect(200)).body.data as Json;
  }

  const link = (admin: Agent, planId: string, predecessorId: string, successorId: string) =>
    admin.post(`${API}/plans/${planId}/dependencies`).send({ predecessorId, successorId });

  describe('a group move', () => {
    it('records one entry per moved activity, sharing a batch, and none for a bar that stayed', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab', 'Cure');
      const [a, b, c] = acts as [Json, Json, Json];
      await move(admin, planId, [placement(a, '2026-02-02'), placement(b, '2026-02-02')]).expect(
        200,
      );

      const ea = await history(admin, a.id);
      const eb = await history(admin, b.id);
      expect(ea).toHaveLength(1);
      expect(eb).toHaveLength(1);
      expect(ea[0]).toMatchObject({
        scope: 'PLACEMENT',
        actor: { name: 'admin' },
        batch: { size: 2 },
        origin: null,
      });
      expect(ea[0]?.batch.id).toBe(eb[0]?.batch.id);
      expect(ea[0]?.changes.visualStart).toEqual({ from: null, to: '2026-02-02' });
      expect(ea[0]?.changes.constraintType).toEqual({ from: null, to: 'SNET' });
      expect(await history(admin, c.id)).toEqual([]);
    });

    it('never merges: three drags of one selection are three entries per activity', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab');
      for (const day of ['2026-02-02', '2026-02-09', '2026-02-16']) {
        const rows = await Promise.all(acts.map((x) => fresh(admin, x.id)));
        await move(
          admin,
          planId,
          rows.map((r) => placement(r, day)),
        ).expect(200);
      }
      const entries = await history(admin, (acts[0] as Json).id);
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.changes.visualStart.to)).toEqual([
        '2026-02-16',
        '2026-02-09',
        '2026-02-02',
      ]);
      expect(new Set(entries.map((e) => e.batch.id)).size).toBe(3);
    });

    it('does not let a single edit merge into a batch entry, nor a batch into a single edit', async () => {
      const { admin, planId, acts } = await setup('Excavate');
      const a = acts[0] as Json;
      const v = (await fresh(admin, a.id)).version as number;
      await admin
        .patch(`${API}/activities/${a.id}`)
        .send({ durationDays: 7, version: v })
        .expect(200);
      await move(admin, planId, [placement(await fresh(admin, a.id), '2026-02-02')]).expect(200);
      const v2 = (await fresh(admin, a.id)).version as number;
      await admin
        .patch(`${API}/activities/${a.id}`)
        .send({ durationDays: 9, version: v2 })
        .expect(200);
      const entries = await history(admin, a.id);
      expect(entries.map((e) => e.scope)).toEqual(['DEFINITION', 'PLACEMENT', 'DEFINITION']);
    });

    it('records a move that travels with a lane and keeps a lane-only batch out of the history', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab');
      const [a, b] = acts as [Json, Json];
      await move(admin, planId, [placement(a, '2026-02-02', 3), placement(b, '2026-02-02', 4)]);
      const [ea] = await history(admin, a.id);
      expect(ea?.changes.laneIndex).toEqual({ from: 0, to: 3 });

      const rows = await Promise.all(acts.map((x) => fresh(admin, x.id)));
      await move(
        admin,
        planId,
        rows.map((r) => ({ ...placement(r, '2026-02-02', 7), constraintDate: '2026-02-02' })),
      ).expect(200);
      expect(await history(admin, a.id)).toHaveLength(1);
    });

    it('leaves no entry when the batch 409s on a stale version', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab');
      const [a, b] = acts as [Json, Json];
      await move(admin, planId, [
        placement(a, '2026-02-02'),
        { ...placement(b, '2026-02-02'), version: 99 },
      ]).expect(409);
      expect(await prisma.activityHistoryEntry.count()).toBe(0);
    });

    it('records a 2,000-row move as one set-based write: a row per activity and one batch', async () => {
      const { admin, planId } = await setup();
      const plan = await prisma.plan.findFirstOrThrow({ where: { id: planId } });
      await prisma.activity.createMany({
        data: Array.from({ length: 2000 }, (_, i) => ({
          organizationId: plan.organizationId,
          planId,
          name: `Bar ${String(i).padStart(4, '0')}`,
          durationMinutes: 7200,
        })),
      });
      const rows = await prisma.activity.findMany({ where: { planId } });
      const res = await move(
        admin,
        planId,
        rows.map((r) => placement(r as unknown as Json, '2026-02-02')),
      );
      expect(res.status).toBe(200);
      expect(await prisma.activityHistoryEntry.count()).toBe(2000);
      const sizes = await prisma.$queryRaw<{ sizes: bigint; batches: bigint }[]>`
        SELECT count(DISTINCT batch_size) AS sizes, count(DISTINCT batch_id) AS batches
          FROM activity_history_entries`;
      expect(Number(sizes[0]?.sizes)).toBe(1);
      expect(Number(sizes[0]?.batches)).toBe(1);
      const [any] = await prisma.activityHistoryEntry.findMany({ take: 1 });
      expect(any?.batchSize).toBe(2000);
    }, 120_000);
  });

  describe('a batch re-parent and a dissolve', () => {
    it('records the WBS parent each activity moved to, naming it as it is now', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab');
      const phase = await activity(admin, planId, 'Phase 1', { type: 'WBS_SUMMARY' });
      const rows = await Promise.all(acts.map((x) => fresh(admin, x.id)));
      await admin
        .patch(`${API}/plans/${planId}/activities/parents`)
        .send({ parents: rows.map((r) => ({ id: r.id, parentId: phase.id, version: r.version })) })
        .expect(200);
      const [e] = await history(admin, (acts[0] as Json).id);
      expect(e).toMatchObject({ scope: 'PLACEMENT', batch: { size: 2 }, origin: null });
      expect(e?.changes.parentId).toEqual({ from: null, to: { id: phase.id, name: 'Phase 1' } });
    });

    it('records each promoted child of a dissolved summary, tagged with its cause', async () => {
      const { admin, planId } = await setup();
      const outer = await activity(admin, planId, 'Outer', { type: 'WBS_SUMMARY' });
      const inner = await activity(admin, planId, 'Inner', {
        type: 'WBS_SUMMARY',
        parentId: outer.id,
      });
      const x = await activity(admin, planId, 'Child X', { parentId: inner.id });
      const y = await activity(admin, planId, 'Child Y', { parentId: inner.id });
      await admin.post(`${API}/activities/${inner.id}/dissolve`).expect(200);

      for (const child of [x, y]) {
        const [e] = await history(admin, child.id);
        expect(e).toMatchObject({
          scope: 'PLACEMENT',
          origin: 'SUMMARY_DISSOLVED',
          batch: { size: 2 },
        });
        expect(e?.changes.parentId).toEqual({
          from: { id: inner.id, name: 'Inner' },
          to: { id: outer.id, name: 'Outer' },
        });
      }
      // The dissolved summary is the subject: no entry, and it can no longer be opened.
      await admin.get(`${API}/activities/${inner.id}/history`).expect(404);
    });
  });

  describe('deleting and restoring an activity', () => {
    it('tells each surviving activity its link went, and again when it came back', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab', 'Cure');
      const [a, b, c] = acts as [Json, Json, Json];
      await link(admin, planId, a.id, b.id).expect(201);
      await link(admin, planId, b.id, c.id).expect(201);
      await admin.delete(`${API}/activities/${b.id}`).expect(200);

      const [onA] = await history(admin, a.id);
      expect(onA).toMatchObject({
        scope: 'LOGIC',
        origin: 'ACTIVITY_DELETED',
        actor: { name: 'admin' },
      });
      const items = Object.values(onA?.changes as Json);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        dir: 'OUT',
        other: { id: b.id, name: 'Pour slab' },
        to: null,
      });
      expect(items[0].from).toMatchObject({ type: 'FS' });
      const [onC] = await history(admin, c.id);
      expect(Object.values(onC?.changes as Json)[0]).toMatchObject({ dir: 'IN', to: null });
      // The deleted activity is the subject of the audit log, not of its own history.
      await admin.get(`${API}/activities/${b.id}/history`).expect(404);

      await admin.post(`${API}/activities/${b.id}/restore`).expect(200);
      const entries = await history(admin, a.id);
      // Newest first; the oldest is the link's own creation, which carries no origin.
      expect(entries.map((e) => e.origin)).toEqual(['ACTIVITY_RESTORED', 'ACTIVITY_DELETED', null]);
      expect(Object.values(entries[0]?.changes as Json)[0]).toMatchObject({
        dir: 'OUT',
        from: null,
        to: { type: 'FS' },
        other: { name: 'Pour slab' },
      });
      // And the restored activity has no knock-on of its own: it is in the audit log.
      expect((await history(admin, b.id)).filter((e) => e.origin !== null)).toEqual([]);
    });

    it('keeps the other end named as it was when the link went, and is silent between two deleted ends', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab', 'Cure');
      const [a, b, c] = acts as [Json, Json, Json];
      await link(admin, planId, a.id, b.id).expect(201);
      await link(admin, planId, b.id, c.id).expect(201);
      await link(admin, planId, a.id, c.id).expect(201);
      // Delete A and C together: B loses both links; the A–C link has no survivor.
      const [fa, fc] = await Promise.all([fresh(admin, a.id), fresh(admin, c.id)]);
      const res = await admin
        .post(`${API}/plans/${planId}/activities/bulk-delete`)
        .send({
          activities: [
            { id: a.id, version: fa.version },
            { id: c.id, version: fc.version },
          ],
        })
        .expect(200);
      const batchId = res.body.data.deleteBatchId as string;

      const onB = (await history(admin, b.id)).filter((e) => e.origin !== null);
      expect(onB).toHaveLength(1);
      expect(onB[0]).toMatchObject({ origin: 'ACTIVITY_DELETED', batch: { size: 1 } });
      const named = Object.values(onB[0]?.changes as Json).map((i) => i.other.name);
      expect(named.sort()).toEqual(['Cure', 'Excavate']);
      // A and C are both gone, so the link between them has no survivor to tell: of the entries
      // that exist, only B's carries an origin.
      expect(await prisma.activityHistoryEntry.count({ where: { NOT: { origin: null } } })).toBe(1);

      await admin.post(`${API}/plans/${planId}/activities/restore-batch/${batchId}`).expect(200);
      const restored = (await history(admin, b.id)).filter((e) => e.origin === 'ACTIVITY_RESTORED');
      expect(restored).toHaveLength(1);
      expect(Object.keys(restored[0]?.changes as Json)).toHaveLength(2);
    });

    it('splits a survivor with more than sixteen lost links into entries of at most sixteen', async () => {
      const { admin, planId, acts } = await setup('Hub');
      const hub = acts[0] as Json;
      const plan = await prisma.plan.findFirstOrThrow({ where: { id: planId } });
      await prisma.activity.createMany({
        data: Array.from({ length: 17 }, (_, i) => ({
          organizationId: plan.organizationId,
          planId,
          name: `Feeder ${String(i).padStart(2, '0')}`,
          durationMinutes: 7200,
        })),
      });
      const feeders = await prisma.activity.findMany({
        where: { planId, name: { startsWith: 'Feeder' } },
      });
      await prisma.activityDependency.createMany({
        data: feeders.map((f) => ({
          organizationId: plan.organizationId,
          planId,
          predecessorId: f.id,
          successorId: hub.id,
        })),
      });
      await admin
        .post(`${API}/plans/${planId}/activities/bulk-delete`)
        .send({ activities: feeders.map((f) => ({ id: f.id, version: f.version })) })
        .expect(200);

      const entries = await history(admin, hub.id);
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => Object.keys(e.changes).length).sort((x, y) => x - y)).toEqual([
        1, 16,
      ]);
      expect(entries[0]?.batch.id).toBe(entries[1]?.batch.id);
      expect(entries[0]?.batch.size).toBe(2);
    });

    it('records nothing on a plan-level delete and restore, where every link goes with every end', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab');
      const [a, b] = acts as [Json, Json];
      await link(admin, planId, a.id, b.id).expect(201);
      const before = await prisma.activityHistoryEntry.count();
      await admin.delete(`${API}/plans/${planId}`).expect(204);
      await admin.post(`${API}/plans/${planId}/restore`).expect(200);
      expect(await prisma.activityHistoryEntry.count()).toBe(before);
    });
  });

  describe('a cross-plan link', () => {
    it('records both ends, each in its own plan, naming the other end and its plan', async () => {
      const { admin, projectId, acts } = await setup('Excavate');
      const a = acts[0] as Json;
      const downstreamPlan = await plan(admin, projectId, 'Phase 2');
      const b = await activity(admin, downstreamPlan, 'Fit out');
      const created = await admin
        .post(`${API}/cross-plan-dependencies`)
        .send({ predecessorActivityId: a.id, successorActivityId: b.id, type: 'FS', lagDays: 2 })
        .expect(201);

      const [onA] = await history(admin, a.id);
      const [onB] = await history(admin, b.id);
      const keyA = `xlink:${created.body.data.id as string}`;
      expect(Object.keys(onA?.changes as Json)).toEqual([keyA]);
      expect(onA?.changes[keyA]).toMatchObject({
        dir: 'OUT',
        other: { id: b.id, name: 'Fit out', planId: downstreamPlan, planName: 'Phase 2' },
        from: null,
        to: { type: 'FS' },
      });
      expect(onB?.changes[keyA]).toMatchObject({
        dir: 'IN',
        other: { id: a.id, name: 'Excavate', planName: 'Baseline' },
      });
      // Each plan's reader sees only that activity's entry.
      expect(await history(admin, a.id)).toHaveLength(1);
      expect(await history(admin, b.id)).toHaveLength(1);

      await admin.delete(`${API}/cross-plan-dependencies/${created.body.data.id}`).expect(204);
      // Added then removed inside the window cancels on both ends, like an in-plan link.
      expect(await history(admin, a.id)).toEqual([]);
      expect(await history(admin, b.id)).toEqual([]);
    });

    it('records a later removal as its own entry on both ends', async () => {
      const { admin, projectId, acts } = await setup('Excavate');
      const a = acts[0] as Json;
      const downstreamPlan = await plan(admin, projectId, 'Phase 2');
      const b = await activity(admin, downstreamPlan, 'Fit out');
      const created = await admin
        .post(`${API}/cross-plan-dependencies`)
        .send({ predecessorActivityId: a.id, successorActivityId: b.id })
        .expect(201);
      await prisma.$executeRaw`
        UPDATE activity_history_entries
           SET first_recorded_at = first_recorded_at - interval '2 minutes',
               last_recorded_at = last_recorded_at - interval '2 minutes'`;
      await admin.delete(`${API}/cross-plan-dependencies/${created.body.data.id}`).expect(204);
      for (const id of [a.id, b.id]) {
        const entries = await history(admin, id);
        expect(entries).toHaveLength(2);
        expect(Object.values(entries[0]?.changes as Json)[0]).toMatchObject({ to: null });
      }
    });
  });

  describe('concurrency', () => {
    it('completes a group move racing single edits of the same activities with no deadlock', async () => {
      const { admin, planId, acts } = await setup('Excavate', 'Pour slab');
      const [a, b] = acts as [Json, Json];
      await link(admin, planId, a.id, b.id).expect(201);
      for (let i = 0; i < 15; i += 1) {
        const [ra, rb] = await Promise.all([fresh(admin, a.id), fresh(admin, b.id)]);
        const results = await Promise.all([
          move(admin, planId, [
            placement(ra, `2026-03-${String(i + 1).padStart(2, '0')}`),
            placement(rb, '2026-03-20'),
          ]),
          admin
            .patch(`${API}/activities/${a.id}`)
            .send({ name: `Excavate ${i}`, version: ra.version }),
          admin.patch(`${API}/activities/${b.id}`).send({ name: `Pour ${i}`, version: rb.version }),
        ]);
        // A write that loses the version race 409s; a deadlock or a recorder failure would be a 500.
        for (const res of results) expect([200, 409]).toContain(res.status);
      }
    }, 120_000);
  });
});
