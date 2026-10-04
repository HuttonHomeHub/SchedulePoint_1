import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { ActivityHistoryRecorder } from '../src/modules/activity-history/activity-history.recorder';
import { PrismaService, TRANSACTION_TIMEOUT_MS } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { resetThrottleCounters } from './throttle-reset';

/**
 * **The history's statement budget** (ADR-0174 D4, implementation-plan M1-T7).
 *
 * Recording costs round trips, not database work: measured on 2026-10-04, over 90 % of the added
 * write cost was the per-statement trip through Prisma's interactive transaction (a floor of about
 * 0.45 ms p50 for `SELECT 1`), and the product owner's bar is stated in those terms — a
 * single-object save adds at most **three** statements for the recorder. That is a count, so it is
 * checked as one: it does not drift with the machine the way a millisecond figure does, and a fourth
 * statement (a name lookup that slipped back out of the probe, a second entry write) fails here
 * rather than in a measurement nobody re-runs.
 *
 * The three are the history lock, the probe (latest entry, organisation, clock and every name the
 * entry carries) and ONE write for every entry of the call — a link's two ends included. A save with
 * nothing to record issues none.
 *
 * Statements are counted from Prisma's own `query` events and attributed to the recorder by WHEN they
 * run, not by what they say: every event between entering and leaving `ActivityHistoryRecorder.record`
 * on the transaction is one of its statements, whatever table it names. (Matching the text instead
 * missed a name lookup that read `resources` or `calendars`, which is exactly the statement the
 * budget exists to keep out.) The builders that precede `record` take no transaction, so they cannot
 * issue one.
 *
 * The second half is the feature's own reads: the version-gated update returns the row it wrote, so
 * the transaction holds no re-read of it (ADR-0022 keeps the one read BEFORE).
 *
 * **The batch paths are bounded the same way, whatever the row count** (milestone M2): a group move,
 * a re-parent, a dissolve, a delete or restore that takes links from survivors, and a cross-plan
 * link each issue the same three recorder statements for one row and for forty. A statement per row
 * is the failure this exists to catch — at 2,000 rows it is a second of round trips inside a
 * transaction that holds the plan lock.
 */
const SINGLE_OBJECT_RECORDER_STATEMENTS = 3;
const LINK_RECORDER_STATEMENTS = 3;

// What each write's transaction issues besides the recorder, measured 2026-10-04: an activity save is
// the plan and calendar reads, the read BEFORE, the gated update and the driving-assignment read; an
// assignment save is the read BEFORE and the gated update (the old "after" read is gone); a link
// create is the plan lock, the edge load, the insert, its re-read with both endpoints, and the audit
// row. A change that adds one is a decision to make here, not a drift to wave through.
const OWN_ACTIVITY_PATCH = 5;
const OWN_ASSIGNMENT_PATCH = 2;
const OWN_LINK_CREATE = 7;
const OWN_LINK_EDIT = 3;
const OWN_LINK_REMOVE = 3;
// The batch paths' own statements, measured 2026-10-04 with forty rows and independent of that
// number: the placements route is one read (which now also carries the before-values) and one
// UPDATE; the re-parent reads the plan's tree once; the rest are each route's existing cascade.
const OWN_PLACEMENTS = 2;
const OWN_PARENTS = 5;
const OWN_DISSOLVE = 11;
const OWN_DELETE = 6;
const OWN_RESTORE = 19;
const OWN_BULK_DELETE = 8;
const OWN_BATCH_RESTORE = 20;
const BATCH_RECORDER_STATEMENTS = 3;
const CROSS_PLAN_RECORDER_STATEMENTS = 3;

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const API = '/api/v1/organizations/acme';
const hasDatabase = Boolean(process.env.DATABASE_URL);

type Json = Record<string, any>;

describe.skipIf(!hasDatabase)('Activity history statement budget (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient<{ log: [{ emit: 'event'; level: 'query' }] }>;
  let throttlerStorage: ThrottlerStorage;
  let captured: string[] = [];
  let recorded: string[] = [];

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    prisma = new PrismaClient({
      log: [{ emit: 'event', level: 'query' }],
      transactionOptions: { timeout: TRANSACTION_TIMEOUT_MS },
    });
    prisma.$on('query', (event) => {
      captured.push(event.query);
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);

    // Attribute by time: whatever the connection reports while `record` runs is the recorder's.
    const recorder = app.get(ActivityHistoryRecorder);
    const record = recorder.record.bind(recorder);
    // Prisma delivers a query event a tick after the statement's promise resolves, so both edges of
    // the window wait for the events of the statement before them.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
    recorder.record = async (tx, input) => {
      await settle();
      const from = captured.length;
      try {
        await record(tx, input);
      } finally {
        await settle();
        recorded.push(...captured.slice(from));
      }
    };
  });

  afterAll(async () => {
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    resetThrottleCounters(throttlerStorage);
    await clearDomainData(prisma);
  });

  const agent = () => request.agent(app.getHttpServer());

  /** Run one request and return the statements the recorder issued for it. */
  async function recorderStatements(run: () => PromiseLike<unknown>): Promise<string[]> {
    captured = [];
    recorded = [];
    await run();
    return recorded;
  }

  /**
   * The statements the write transaction issues that are NOT the recorder's. Pinned per path: the
   * recorder's own count is taken by time, so a name lookup added beside it in a service (or a
   * re-read of the row just written) would not move that count, but it moves this one.
   */
  const serviceOwn = (): number => transaction().length - recorded.length;

  /** The statements of the request's one write transaction, between its BEGIN and COMMIT. */
  const transaction = (): string[] => {
    const begin = captured.indexOf('BEGIN');
    const commit = captured.indexOf('COMMIT', begin);
    return captured.slice(begin + 1, commit);
  };

  async function setup() {
    const admin = agent();
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
    const plan = await admin
      .post(`${API}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const make = async (name: string): Promise<Json> =>
      (
        await admin
          .post(`${API}/plans/${planId}/activities`)
          .send({ name, durationDays: 5 })
          .expect(201)
      ).body.data as Json;
    return { admin, planId, a: await make('Excavate'), b: await make('Pour slab') };
  }

  const inserts = (statements: string[]) =>
    statements.filter((s) => s.includes('INSERT INTO activity_history_entries'));

  it('an activity save issues three recorder statements, for a new entry and for a merge', async () => {
    const { admin, a } = await setup();
    const first = await recorderStatements(() =>
      admin
        .patch(`${API}/activities/${a.id}`)
        .send({ durationDays: 9, version: a.version })
        .expect(200),
    );
    expect(first, first.join('\n---\n')).toHaveLength(SINGLE_OBJECT_RECORDER_STATEMENTS);
    expect(serviceOwn(), 'own statements, new entry').toBe(OWN_ACTIVITY_PATCH);

    const current = (await admin.get(`${API}/activities/${a.id}`).expect(200)).body.data as Json;
    const merged = await recorderStatements(() =>
      admin
        .patch(`${API}/activities/${a.id}`)
        .send({ durationDays: 11, version: current.version })
        .expect(200),
    );
    expect(merged, merged.join('\n---\n')).toHaveLength(SINGLE_OBJECT_RECORDER_STATEMENTS);
    expect(serviceOwn(), 'own statements, merge').toBe(OWN_ACTIVITY_PATCH);
  });

  it('an activity save that names a calendar still issues three: the name rides on the probe', async () => {
    const { admin, a } = await setup();
    const calendar = await admin
      .post(`${API}/calendars`)
      .send({ name: 'Night shift', workingWeekdays: 62 })
      .expect(201);
    const statements = await recorderStatements(() =>
      admin
        .patch(`${API}/activities/${a.id}`)
        .send({ calendarId: calendar.body.data.id, version: a.version })
        .expect(200),
    );
    expect(statements, statements.join('\n---\n')).toHaveLength(SINGLE_OBJECT_RECORDER_STATEMENTS);
  });

  it('an assignment save issues three recorder statements, the resource name included', async () => {
    const { admin, a } = await setup();
    const resource = (
      await admin.post(`${API}/resources`).send({ name: 'Tower crane', kind: 'LABOUR' }).expect(201)
    ).body.data as Json;
    const created = await admin
      .post(`${API}/activities/${a.id}/assignments`)
      .send({ resourceId: resource.id, budgetedUnits: 40 })
      .expect(201);
    const updated = await recorderStatements(() =>
      admin
        .patch(`${API}/assignments/${created.body.data.id}`)
        .send({ budgetedUnits: 50, version: created.body.data.version })
        .expect(200),
    );
    expect(updated, updated.join('\n---\n')).toHaveLength(SINGLE_OBJECT_RECORDER_STATEMENTS);
    expect(serviceOwn(), 'own statements').toBe(OWN_ASSIGNMENT_PATCH);
  });

  it('a link create, edit and removal each issue three, with both ends written by ONE statement', async () => {
    const { admin, planId, a, b } = await setup();
    const created = await (async () => {
      let body: Json = {};
      const statements = await recorderStatements(async () => {
        const res = await admin
          .post(`${API}/plans/${planId}/dependencies`)
          .send({ predecessorId: a.id, successorId: b.id })
          .expect(201);
        body = res.body.data as Json;
      });
      return { statements, body };
    })();
    expect(created.statements, created.statements.join('\n---\n')).toHaveLength(
      LINK_RECORDER_STATEMENTS,
    );
    expect(serviceOwn(), 'own statements, link create').toBe(OWN_LINK_CREATE);
    expect(inserts(created.statements)).toHaveLength(1);
    expect(await prisma.activityHistoryEntry.count()).toBe(2);

    const edited = await recorderStatements(() =>
      admin
        .patch(`${API}/dependencies/${created.body.id}`)
        .send({ lagMinutes: 960, version: created.body.version })
        .expect(200),
    );
    expect(edited, edited.join('\n---\n')).toHaveLength(LINK_RECORDER_STATEMENTS);
    expect(serviceOwn(), 'own statements, link edit').toBe(OWN_LINK_EDIT);

    const removed = await recorderStatements(() =>
      admin.delete(`${API}/dependencies/${created.body.id}`).expect(204),
    );
    expect(removed, removed.join('\n---\n')).toHaveLength(LINK_RECORDER_STATEMENTS);
    expect(serviceOwn(), 'own statements, link removal').toBe(OWN_LINK_REMOVE);
  });

  it('a save does not re-read the row its version-gated update just wrote', async () => {
    const { admin, a } = await setup();
    const calendar = await admin
      .post(`${API}/calendars`)
      .send({ name: 'Night shift', workingWeekdays: 62 })
      .expect(201);
    await recorderStatements(() =>
      admin
        .patch(`${API}/activities/${a.id}`)
        .send({ calendarId: calendar.body.data.id, version: a.version })
        .expect(200),
    );
    const reads = transaction().filter((q) => /^SELECT .* FROM "public"."activities"/.test(q));
    expect(reads, 'only the read BEFORE the update (ADR-0022)').toHaveLength(1);

    const resource = (
      await admin.post(`${API}/resources`).send({ name: 'Tower crane', kind: 'LABOUR' }).expect(201)
    ).body.data as Json;
    const created = await admin
      .post(`${API}/activities/${a.id}/assignments`)
      .send({ resourceId: resource.id, budgetedUnits: 40 })
      .expect(201);
    await recorderStatements(() =>
      admin
        .patch(`${API}/assignments/${created.body.data.id}`)
        .send({ budgetedUnits: 50, version: created.body.data.version })
        .expect(200),
    );
    const own = transaction().filter((q) => q.includes('"public"."resource_assignments"'));
    expect(own, 'the read before, then the update that returns the row').toHaveLength(2);
    expect(own[1]).toMatch(/^UPDATE /);
  });

  it('a save with nothing to record issues no recorder statement at all', async () => {
    const { admin, a } = await setup();
    const statements = await recorderStatements(() =>
      admin
        .patch(`${API}/activities/${a.id}`)
        .send({ durationDays: 5, version: a.version })
        .expect(200),
    );
    expect(statements, statements.join('\n---\n')).toEqual([]);
  });

  /** `count` activities in `planId`, created straight into the table: an API call each would be the test. */
  async function seedActivities(planId: string, count: number, prefix: string): Promise<Json[]> {
    const plan = await prisma.plan.findFirstOrThrow({ where: { id: planId } });
    await prisma.activity.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        organizationId: plan.organizationId,
        planId,
        name: `${prefix} ${i}`,
        durationMinutes: 7200,
      })),
    });
    return prisma.activity.findMany({
      where: { planId, name: { startsWith: `${prefix} ` } },
      orderBy: { name: 'asc' },
    });
  }

  const placement = (a: Json, day: string) => ({
    id: a.id,
    version: a.version,
    constraintType: 'SNET',
    constraintDate: day,
    visualStart: day,
    laneIndex: null,
  });

  it.each([1, 40])(
    'a group move of %i activities issues three recorder statements, however many rows',
    async (count) => {
      const { admin, planId } = await setup();
      const rows = await seedActivities(planId, count, 'Bar');
      const statements = await recorderStatements(() =>
        admin
          .patch(`${API}/plans/${planId}/activities/placements`)
          .send({ placements: rows.map((r) => placement(r, '2026-02-02')) })
          .expect(200),
      );
      expect(statements, statements.join('\n---\n')).toHaveLength(BATCH_RECORDER_STATEMENTS);
      expect(inserts(statements)).toHaveLength(1);
      expect(await prisma.activityHistoryEntry.count()).toBe(count);
      expect(serviceOwn(), 'own statements, placements').toBe(OWN_PLACEMENTS);
    },
  );

  it.each([1, 40])(
    'a batch re-parent of %i activities issues three recorder statements',
    async (count) => {
      const { admin, planId } = await setup();
      const summary = (
        await admin
          .post(`${API}/plans/${planId}/activities`)
          .send({ name: 'Phase', type: 'WBS_SUMMARY' })
          .expect(201)
      ).body.data as Json;
      const rows = await seedActivities(planId, count, 'Bar');
      const statements = await recorderStatements(() =>
        admin
          .patch(`${API}/plans/${planId}/activities/parents`)
          .send({
            parents: rows.map((r) => ({ id: r.id, parentId: summary.id, version: r.version })),
          })
          .expect(200),
      );
      expect(statements, statements.join('\n---\n')).toHaveLength(BATCH_RECORDER_STATEMENTS);
      expect(await prisma.activityHistoryEntry.count()).toBe(count);
      expect(serviceOwn(), 'own statements, parents').toBe(OWN_PARENTS);
    },
  );

  it('a dissolve issues three recorder statements for all its promoted children', async () => {
    const { admin, planId } = await setup();
    const summary = (
      await admin
        .post(`${API}/plans/${planId}/activities`)
        .send({ name: 'Phase', type: 'WBS_SUMMARY' })
        .expect(201)
    ).body.data as Json;
    const rows = await seedActivities(planId, 40, 'Bar');
    await admin
      .patch(`${API}/plans/${planId}/activities/parents`)
      .send({ parents: rows.map((r) => ({ id: r.id, parentId: summary.id, version: r.version })) })
      .expect(200);
    await prisma.activityHistoryEntry.deleteMany();
    const statements = await recorderStatements(() =>
      admin.post(`${API}/activities/${summary.id}/dissolve`).expect(200),
    );
    expect(statements, statements.join('\n---\n')).toHaveLength(BATCH_RECORDER_STATEMENTS);
    expect(await prisma.activityHistoryEntry.count()).toBe(40);
    expect(serviceOwn(), 'own statements, dissolve').toBe(OWN_DISSOLVE);
  });

  it('a delete and its restore each issue three recorder statements for every survivor', async () => {
    const { admin, planId, a } = await setup();
    const survivors = await seedActivities(planId, 40, 'Survivor');
    await prisma.activityDependency.createMany({
      data: survivors.map((sv) => ({
        organizationId: sv.organizationId,
        planId,
        predecessorId: a.id,
        successorId: sv.id,
      })),
    });
    const removed = await recorderStatements(() =>
      admin.delete(`${API}/activities/${a.id}`).expect(200),
    );
    expect(removed, removed.join('\n---\n')).toHaveLength(BATCH_RECORDER_STATEMENTS);
    expect(await prisma.activityHistoryEntry.count()).toBe(40);
    expect(serviceOwn(), 'own statements, delete').toBe(OWN_DELETE);

    const restored = await recorderStatements(() =>
      admin.post(`${API}/activities/${a.id}/restore`).expect(200),
    );
    expect(restored, restored.join('\n---\n')).toHaveLength(BATCH_RECORDER_STATEMENTS);
    expect(await prisma.activityHistoryEntry.count()).toBe(80);
    expect(serviceOwn(), 'own statements, restore').toBe(OWN_RESTORE);
  });

  it('a bulk delete and its batch restore issue three recorder statements each', async () => {
    const { admin, planId, a, b } = await setup();
    const doomed = await seedActivities(planId, 40, 'Doomed');
    await prisma.activityDependency.createMany({
      data: doomed.map((d) => ({
        organizationId: d.organizationId,
        planId,
        predecessorId: d.id,
        successorId: b.id,
      })),
    });
    const deleted = { id: '' };
    const removed = await recorderStatements(async () => {
      const res = await admin
        .post(`${API}/plans/${planId}/activities/bulk-delete`)
        .send({ activities: doomed.map((d) => ({ id: d.id, version: d.version })) })
        .expect(200);
      deleted.id = res.body.data.deleteBatchId as string;
    });
    expect(removed, removed.join('\n---\n')).toHaveLength(BATCH_RECORDER_STATEMENTS);
    expect(await prisma.activityHistoryEntry.count({ where: { activityId: b.id } })).toBe(3);
    expect(serviceOwn(), 'own statements, bulk delete').toBe(OWN_BULK_DELETE);
    expect(a.id).toBeTruthy();

    const restored = await recorderStatements(() =>
      admin.post(`${API}/plans/${planId}/activities/restore-batch/${deleted.id}`).expect(200),
    );
    expect(restored, restored.join('\n---\n')).toHaveLength(BATCH_RECORDER_STATEMENTS);
    expect(serviceOwn(), 'own statements, batch restore').toBe(OWN_BATCH_RESTORE);
  });

  it('a cross-plan link create and delete issue three recorder statements, both plans included', async () => {
    const { admin, planId, a } = await setup();
    const project = await prisma.plan.findFirstOrThrow({ where: { id: planId } });
    const other = await admin
      .post(`${API}/projects/${project.projectId}/plans`)
      .send({ name: 'Phase 2', plannedStart: '2026-03-01' })
      .expect(201);
    const downstream = (
      await admin
        .post(`${API}/plans/${other.body.data.id}/activities`)
        .send({ name: 'Fit out', durationDays: 3 })
        .expect(201)
    ).body.data as Json;
    let linkId = '';
    const created = await recorderStatements(async () => {
      const res = await admin
        .post(`${API}/cross-plan-dependencies`)
        .send({ predecessorActivityId: a.id, successorActivityId: downstream.id })
        .expect(201);
      linkId = res.body.data.id as string;
    });
    expect(created, created.join('\n---\n')).toHaveLength(CROSS_PLAN_RECORDER_STATEMENTS);
    expect(inserts(created)).toHaveLength(1);
    expect(await prisma.activityHistoryEntry.count()).toBe(2);
    const removed = await recorderStatements(() =>
      admin.delete(`${API}/cross-plan-dependencies/${linkId}`).expect(204),
    );
    expect(removed, removed.join('\n---\n')).toHaveLength(CROSS_PLAN_RECORDER_STATEMENTS);
  });
});
