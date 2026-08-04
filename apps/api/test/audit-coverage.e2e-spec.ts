import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * ADR-0073 C3 — the mutation-coverage producers, against a real database.
 *
 * **These cannot be unit-tested and that is the point.** Every one of them fires inside a real
 * transaction, after a real `assertHoldsPen`, and its whole contract is about the ROW: one per
 * user action however large the cascade, none at all when the transaction rolls back or the pen
 * refuses. A mocked `AuditService` can only prove a mock was called — the four properties that
 * matter are all properties of the database.
 *
 * The pen is **enforced** here (`PLAN_EDIT_LOCK_ENFORCED=true`, set before the app boots), because
 * "a refused write records nothing" is one of the four and is untestable with the gate inert.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface AuditRow {
  action: string;
  outcome: string;
  subjectType: string;
  subjectId: string | null;
  subjectLabel: string | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
}

/**
 * A minimal, parseable XER: one project, two tasks and one relationship. Deliberately built inline
 * rather than shared with `interchange.e2e-spec.ts` — this spec asserts what the AUDIT ROW says
 * about an import, so it wants a file whose counts it states outright.
 */
function smallXer(projectName: string): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    `%R\tP1\t${projectName}\t2026-01-05 00:00\t2026-01-04 00:00`,
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tA1000\tMobilise\tTT_Task\t40',
    '%R\tT2\tP1\tA1010\tDesign\tTT_Task\t80',
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\tR1\tT2\tT1\tPR_FS\t0',
    '%E',
  ].join('\n');
}

describe.skipIf(!hasDatabase)('Audit coverage — mutation producers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let priorEnforced: string | undefined;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    priorEnforced = process.env.PLAN_EDIT_LOCK_ENFORCED;
    process.env.PLAN_EDIT_LOCK_ENFORCED = 'true';
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
    if (priorEnforced === undefined) delete process.env.PLAN_EDIT_LOCK_ENFORCED;
    else process.env.PLAN_EDIT_LOCK_ENFORCED = priorEnforced;
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

  /** An admin org holding one client → project → plan, with the pen already taken. */
  async function setup(): Promise<{ actor: Actor; planId: string; projectId: string }> {
    const actor = await signUp('admin@example.com');
    await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const projectId = project.body.data.id as string;
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Baseline', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/edit-lock`)
      .send({})
      .expect(200);
    return { actor, planId, projectId };
  }

  async function addActivity(
    actor: Actor,
    planId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ durationDays: 1, ...body })
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  /** Every audit row for one action, newest first — read from the database, not the API, so a
   *  read-surface filter cannot hide a producer defect. */
  async function rows(action: string): Promise<AuditRow[]> {
    return (await prisma.auditEvent.findMany({
      where: { action },
      orderBy: { occurredAt: 'desc' },
    })) as unknown as AuditRow[];
  }

  describe('activity.deleted', () => {
    it('writes exactly ONE row for a whole subtree, carrying the flattened counts', async () => {
      const { actor, planId } = await setup();
      const summary = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const a = await addActivity(actor, planId, { name: 'Dig', parentId: summary.id });
      const b = await addActivity(actor, planId, { name: 'Pour', parentId: summary.id });
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: a.id, successorId: b.id })
        .expect(201);

      await actor.agent.delete(`/api/v1/organizations/acme/activities/${summary.id}`).expect(204);

      const written = await rows('activity.deleted');
      // ONE row, not four. The whole argument for the coverage rung is that the log records user
      // actions and not swept rows; a subtree delete is the case where the two differ most.
      expect(written).toHaveLength(1);
      const row = written[0]!;
      expect(row.subjectType).toBe('ACTIVITY');
      expect(row.subjectId).toBe(summary.id);
      expect(row.subjectLabel).toBe('Phase 1');
      expect(row.changes?.before).toMatchObject({
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        planName: 'Baseline',
        // 3 = the summary and its two children. The link between them rides the same batch.
        activityCount: 3,
        dependencyCount: 1,
      });
      expect(typeof row.changes?.before?.deleteBatchId).toBe('string');
    });

    it('writes NOTHING when the pen refuses (423)', async () => {
      const { actor, planId } = await setup();
      const activity = await addActivity(actor, planId, { name: 'Dig' });
      await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}/edit-lock`).expect(204);

      await actor.agent.delete(`/api/v1/organizations/acme/activities/${activity.id}`).expect(423);

      // Families D–G record no `DENIED` rows (spec §2.3): a 423 is an everyday concurrency
      // outcome, not an attempt to escalate.
      expect(await rows('activity.deleted')).toHaveLength(0);
    });

    it('writes NOTHING when the activity was never there (404)', async () => {
      const { actor } = await setup();
      await actor.agent
        .delete('/api/v1/organizations/acme/activities/00000000-0000-7000-8000-000000000000')
        .expect(404);
      expect(await rows('activity.deleted')).toHaveLength(0);
    });
  });

  describe('activity.restored', () => {
    it('pairs with its delete, carrying the same batch id', async () => {
      const { actor, planId } = await setup();
      const activity = await addActivity(actor, planId, { name: 'Dig', code: 'A100' });
      await actor.agent.delete(`/api/v1/organizations/acme/activities/${activity.id}`).expect(204);
      await actor.agent
        .post(`/api/v1/organizations/acme/activities/${activity.id}/restore`)
        .expect(200);

      const deleted = (await rows('activity.deleted'))[0]!;
      const restored = (await rows('activity.restored'))[0]!;
      // The pair is what makes "what happened to this activity?" answerable in one read; a restore
      // that carried a different batch would look like a different incident.
      expect(restored.changes?.after?.deleteBatchId).toBe(deleted.changes?.before?.deleteBatchId);
      expect(restored.changes?.after).toMatchObject({
        name: 'Dig',
        code: 'A100',
        activityCount: 1,
      });
    });
  });

  describe('activity.dissolved', () => {
    it('is NOT recorded as a deletion, and says how many activities were kept', async () => {
      const { actor, planId } = await setup();
      const summary = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      await addActivity(actor, planId, { name: 'Dig', parentId: summary.id });
      await addActivity(actor, planId, { name: 'Pour', parentId: summary.id });

      await actor.agent
        .post(`/api/v1/organizations/acme/activities/${summary.id}/dissolve`)
        .expect(200);

      // The distinction the action exists for: the grouping went, the work stayed. A reader
      // scanning `activity.deleted` for lost work must not find this.
      expect(await rows('activity.deleted')).toHaveLength(0);
      const written = await rows('activity.dissolved');
      expect(written).toHaveLength(1);
      expect(written[0]!.changes?.before).toMatchObject({
        name: 'Phase 1',
        promotedChildCount: 2,
      });
    });
  });

  describe('activity.reparented', () => {
    it('records ONE row for the batch, naming the destination', async () => {
      const { actor, planId } = await setup();
      const summary = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const a = await addActivity(actor, planId, { name: 'Dig' });
      const b = await addActivity(actor, planId, { name: 'Pour' });

      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}/activities/parents`)
        .send({
          parents: [
            { id: a.id, parentId: summary.id, version: a.version },
            { id: b.id, parentId: summary.id, version: b.version },
          ],
        })
        .expect(200);

      const written = await rows('activity.reparented');
      expect(written).toHaveLength(1);
      // The subject is the PLAN: there is no one activity this happened to.
      expect(written[0]!.subjectType).toBe('PLAN');
      expect(written[0]!.subjectId).toBe(planId);
      expect(written[0]!.changes?.after).toMatchObject({
        movedCount: 2,
        parentCount: 1,
        parentName: 'Phase 1',
      });
    });

    it('distinguishes a move to the top level from a move to several groups', async () => {
      const { actor, planId } = await setup();
      const one = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const two = await addActivity(actor, planId, {
        name: 'Phase 2',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const a = await addActivity(actor, planId, { name: 'Dig' });
      const b = await addActivity(actor, planId, { name: 'Pour' });

      const parents = (rowsIn: { id: string; parentId: string | null; version: number }[]) =>
        actor.agent
          .patch(`/api/v1/organizations/acme/plans/${planId}/activities/parents`)
          .send({ parents: rowsIn })
          .expect(200);

      // Two destinations in one batch. Without `parentCount` this would render exactly like the
      // top-level case below — absence a reader cannot distinguish from a fact.
      await parents([
        { id: a.id, parentId: one.id, version: a.version },
        { id: b.id, parentId: two.id, version: b.version },
      ]);
      const mixed = (await rows('activity.reparented'))[0]!;
      expect(mixed.changes?.after).toMatchObject({ movedCount: 2, parentCount: 2 });
      expect(mixed.changes?.after).not.toHaveProperty('parentName');

      await parents([
        { id: a.id, parentId: null, version: a.version + 1 },
        { id: b.id, parentId: null, version: b.version + 1 },
      ]);
      const top = (await rows('activity.reparented'))[0]!;
      expect(top.changes?.after).toMatchObject({ movedCount: 2, parentCount: 1 });
      expect(top.changes?.after).not.toHaveProperty('parentName');
    });

    it('writes NOTHING when the batch is rejected as a whole', async () => {
      const { actor, planId } = await setup();
      const summary = await addActivity(actor, planId, {
        name: 'Phase 1',
        type: 'WBS_SUMMARY',
        durationDays: 0,
      });
      const a = await addActivity(actor, planId, { name: 'Dig' });

      // A stale `version` fails the all-or-nothing count check and rolls the transaction back —
      // including the audit insert, which is the whole reason it is inside the transaction.
      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}/activities/parents`)
        .send({ parents: [{ id: a.id, parentId: summary.id, version: a.version + 99 }] })
        .expect(409);

      expect(await rows('activity.reparented')).toHaveLength(0);
    });
  });

  describe('dependency.created / dependency.deleted', () => {
    it('records the DIRECTION, predecessor first', async () => {
      const { actor, planId } = await setup();
      const dig = await addActivity(actor, planId, { name: 'Dig' });
      const pour = await addActivity(actor, planId, { name: 'Pour' });

      const link = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: dig.id, successorId: pour.id, type: 'FS', lagMinutes: 120 })
        .expect(201);

      const created = await rows('dependency.created');
      expect(created).toHaveLength(1);
      // The fact ADR-0064 found planners most often get wrong. A row that recorded only ids would
      // be unable to settle the argument it exists to settle.
      expect(created[0]!.changes?.after).toMatchObject({
        predecessorName: 'Dig',
        successorName: 'Pour',
        type: 'FS',
        lagMinutes: 120,
      });
      expect(created[0]!.subjectLabel).toBe('Dig → Pour');

      await actor.agent
        .delete(`/api/v1/organizations/acme/dependencies/${link.body.data.id as string}`)
        .expect(204);
      const deleted = await rows('dependency.deleted');
      expect(deleted).toHaveLength(1);
      expect(deleted[0]!.changes?.before).toMatchObject({
        predecessorName: 'Dig',
        successorName: 'Pour',
      });
      expect(typeof deleted[0]!.changes?.before?.deleteBatchId).toBe('string');
    });

    it('writes NOTHING when the link is refused as a cycle', async () => {
      const { actor, planId } = await setup();
      const dig = await addActivity(actor, planId, { name: 'Dig' });
      const pour = await addActivity(actor, planId, { name: 'Pour' });
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: dig.id, successorId: pour.id })
        .expect(201);

      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: pour.id, successorId: dig.id })
        .expect(409);

      // One row, from the link that actually exists. The refused one rolled back with its audit
      // insert inside the same transaction.
      expect(await rows('dependency.created')).toHaveLength(1);
    });
  });

  describe('plan.settings_changed (family E)', () => {
    it('writes NOTHING for a PATCH that changes only the name', async () => {
      const { actor, planId } = await setup();
      const plan = await actor.agent.get(`/api/v1/organizations/acme/plans/${planId}`).expect(200);
      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}`)
        .send({ name: 'Renamed', version: plan.body.data.version as number })
        .expect(200);

      // A rename changes how nothing computes, and `updated_by` already records who did it.
      // Recording it would put noise in the one feed a reader turns to when every date moved.
      expect(await rows('plan.settings_changed')).toHaveLength(0);
    });

    it('records a data-date move with that field and NO other', async () => {
      const { actor, planId } = await setup();
      const plan = await actor.agent.get(`/api/v1/organizations/acme/plans/${planId}`).expect(200);
      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}`)
        .send({
          plannedStart: '2026-03-01',
          // Resent unchanged, exactly as the settings dialog does — which is why the producer
          // diffs by VALUE. A presence check would record two changes here.
          schedulingMode: plan.body.data.schedulingMode as string,
          name: 'Baseline',
          version: plan.body.data.version as number,
        })
        .expect(200);

      const written = await rows('plan.settings_changed');
      expect(written).toHaveLength(1);
      expect(Object.keys(written[0]!.changes?.after ?? {}).sort()).toEqual([
        'planName',
        'plannedStart',
      ]);
      expect(written[0]!.subjectType).toBe('PLAN');
    });

    it('writes NOTHING when the optimistic lock refuses the write (409)', async () => {
      const { actor, planId } = await setup();
      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}`)
        .send({ plannedStart: '2026-03-01', version: 999 })
        .expect(409);
      expect(await rows('plan.settings_changed')).toHaveLength(0);
    });
  });

  describe('calendar.working_time_changed (family E)', () => {
    /** A project-scoped calendar the admin can edit, plus the project it belongs to. */
    async function calendar(actor: Actor): Promise<{ id: string; version: number }> {
      const res = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Site hours', workingWeekdays: 0b0111110 })
        .expect(201);
      return { id: res.body.data.id as string, version: res.body.data.version as number };
    }

    it('records a working-week edit, naming the KIND rather than dumping the rows', async () => {
      const { actor } = await setup();
      const cal = await calendar(actor);
      await actor.agent
        .patch(`/api/v1/organizations/acme/calendars/${cal.id}`)
        .send({ workingWeekdays: 0b0111111, version: cal.version })
        .expect(200);

      const written = await rows('calendar.working_time_changed');
      expect(written).toHaveLength(1);
      expect(written[0]!.changes?.after).toMatchObject({
        name: 'Site hours',
        changedWhat: 'shifts',
      });
      // The shift rows are not in the payload, deliberately: "the working week changed" is the
      // fact somebody needs, and a JSON dump of seven days' windows buries it.
      expect(written[0]!.changes?.after).not.toHaveProperty('shifts');
    });

    it('writes NOTHING for a rename', async () => {
      const { actor } = await setup();
      const cal = await calendar(actor);
      await actor.agent
        .patch(`/api/v1/organizations/acme/calendars/${cal.id}`)
        .send({ name: 'Renamed', version: cal.version })
        .expect(200);
      expect(await rows('calendar.working_time_changed')).toHaveLength(0);
    });

    it('folds all three exception routes into the same action', async () => {
      const { actor } = await setup();
      const cal = await calendar(actor);
      const created = await actor.agent
        .post(`/api/v1/organizations/acme/calendars/${cal.id}/exceptions`)
        .send({ date: '2026-12-25', isWorking: false, label: 'Christmas' })
        .expect(201);
      const exceptionId = created.body.data.id as string;
      await actor.agent
        .patch(`/api/v1/organizations/acme/calendars/${cal.id}/exceptions/${exceptionId}`)
        .send({ label: 'Christmas Day', version: created.body.data.version as number })
        .expect(200);
      await actor.agent
        .delete(`/api/v1/organizations/acme/calendars/${cal.id}/exceptions/${exceptionId}`)
        .expect(204);

      // Three rows, one action. An exception IS working time; splitting them would ask a reader
      // to know which control the planner used.
      const written = await rows('calendar.working_time_changed');
      expect(written).toHaveLength(3);
      for (const row of written) {
        expect(row.changes?.after).toMatchObject({ changedWhat: 'exception' });
      }
    });
  });

  describe('baseline.captured / .activated / .deleted (family E)', () => {
    /** A recalculated plan with one activity — the minimum a capture will accept. */
    async function capturable(): Promise<{ actor: Actor; planId: string }> {
      const { actor, planId } = await setup();
      await addActivity(actor, planId, { name: 'Dig' });
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
        .send({})
        .expect(200);
      return { actor, planId };
    }

    it('records a capture, an activation and a delete, each naming its plan', async () => {
      const { actor, planId } = await capturable();
      const first = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/baselines`)
        .send({ name: 'Tender' })
        .expect(201);
      const second = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/baselines`)
        .send({ name: 'Revision A' })
        .expect(201);

      expect(await rows('baseline.captured')).toHaveLength(2);
      expect((await rows('baseline.captured'))[0]!.changes?.after).toMatchObject({
        name: 'Revision A',
        planName: 'Baseline',
      });

      const secondId = second.body.data.id as string;
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/baselines/${secondId}/activate`)
        .expect(200);
      const activated = await rows('baseline.activated');
      expect(activated).toHaveLength(1);
      expect(activated[0]!.subjectLabel).toBe('Revision A');
      expect(activated[0]!.changes?.after).toMatchObject({ planName: 'Baseline' });

      await actor.agent
        .delete(
          `/api/v1/organizations/acme/plans/${planId}/baselines/${first.body.data.id as string}`,
        )
        .expect(204);
      const deleted = await rows('baseline.deleted');
      expect(deleted).toHaveLength(1);
      expect(deleted[0]!.changes?.before).toMatchObject({ name: 'Tender' });
      expect(typeof deleted[0]!.changes?.before?.deleteBatchId).toBe('string');
    });

    it('writes NOTHING when the capture is refused for want of a recalculation', async () => {
      const { actor, planId } = await setup();
      await addActivity(actor, planId, { name: 'Dig' });
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/baselines`)
        .send({ name: 'Too early' })
        .expect(422);
      expect(await rows('baseline.captured')).toHaveLength(0);
    });
  });

  describe('library governance (family F)', () => {
    async function library(actor: Actor): Promise<{ id: string; version: number }> {
      const res = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Site hours', workingWeekdays: 0b0111110 })
        .expect(201);
      return { id: res.body.data.id as string, version: res.body.data.version as number };
    }

    it('records a calendar archive and unarchive as their own pair, not as a delete', async () => {
      const { actor } = await setup();
      const cal = await library(actor);
      await actor.agent
        .post(`/api/v1/organizations/acme/calendars/${cal.id}/archive`)
        .send({ version: cal.version })
        .expect(204);
      await actor.agent
        .post(`/api/v1/organizations/acme/calendars/${cal.id}/unarchive`)
        .send({ version: cal.version + 1 })
        .expect(204);

      // Archiving is orthogonal to deleting (ADR-0053 §4). A reader looking for what was removed
      // must not find a retirement there, and vice versa.
      expect(await rows('calendar.deleted')).toHaveLength(0);
      // A new calendar lands in the SHARED library — ADR-0053's constant `DEFAULT ORG`, which is
      // what let the tier ship with no data migration. Asserted rather than assumed, because the
      // scope is the whole reason this field is on the row.
      expect((await rows('calendar.archived'))[0]!.changes?.after).toMatchObject({
        name: 'Site hours',
        scope: 'ORG',
      });
      expect(await rows('calendar.unarchived')).toHaveLength(1);
    });

    it('records a calendar delete with the tier it was in', async () => {
      const { actor } = await setup();
      const cal = await library(actor);
      await actor.agent.delete(`/api/v1/organizations/acme/calendars/${cal.id}`).expect(204);

      const written = await rows('calendar.deleted');
      expect(written).toHaveLength(1);
      // The tier survives only here: after the delete there is nothing left to ask.
      expect(written[0]!.changes?.before).toMatchObject({ name: 'Site hours', scope: 'ORG' });
      expect(typeof written[0]!.changes?.before?.deleteBatchId).toBe('string');
    });

    it('records a tier move as its OWN row, beside the working-time row', async () => {
      const { actor, projectId } = await setup();
      const cal = await library(actor);
      // Narrowing (shared → project), which is the direction with a guard on it — and the one a
      // reader most needs explained, because it takes a calendar away from every other project.
      await actor.agent
        .patch(`/api/v1/organizations/acme/calendars/${cal.id}`)
        .send({
          scope: 'PROJECT',
          projectId,
          workingWeekdays: 0b0111111,
          version: cal.version,
        })
        .expect(200);

      // Two facts, two rows, one request — the `invitation.accepted` + `member.joined` precedent.
      // Collapsing them into one action would force a reader asking "who shared this calendar?"
      // to know that the answer hides inside a working-time event.
      const scope = await rows('calendar.scope_changed');
      expect(scope).toHaveLength(1);
      expect(scope[0]!.changes?.before).toMatchObject({ scope: 'ORG' });
      expect(scope[0]!.changes?.after).toMatchObject({ scope: 'PROJECT' });
      expect(await rows('calendar.working_time_changed')).toHaveLength(1);
    });

    it('writes NOTHING for a calendar delete refused as in-use', async () => {
      const { actor, planId } = await setup();
      const cal = await library(actor);
      const plan = await actor.agent.get(`/api/v1/organizations/acme/plans/${planId}`).expect(200);
      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}`)
        .send({ calendarId: cal.id, version: plan.body.data.version as number })
        .expect(200);

      await actor.agent.delete(`/api/v1/organizations/acme/calendars/${cal.id}`).expect(409);
      expect(await rows('calendar.deleted')).toHaveLength(0);
    });

    it('records ONE row for a GROUP delete, carrying the size of the branch', async () => {
      const { actor } = await setup();
      const group = await actor.agent
        .post('/api/v1/organizations/acme/resources')
        .send({ name: 'Groundworks', kind: 'GROUP' })
        .expect(201);
      const groupId = group.body.data.id as string;
      for (const name of ['Excavator', 'Dumper']) {
        await actor.agent
          .post('/api/v1/organizations/acme/resources')
          .send({ name, kind: 'EQUIPMENT', parentId: groupId })
          .expect(201);
      }

      await actor.agent.delete(`/api/v1/organizations/acme/resources/${groupId}`).expect(204);

      // One row for the branch, never one per descendant — the same rule family D applies to a
      // WBS summary, for the same reason.
      const written = await rows('resource.deleted');
      expect(written).toHaveLength(1);
      expect(written[0]!.changes?.before).toMatchObject({
        name: 'Groundworks',
        kind: 'GROUP',
        resourceCount: 3,
      });
    });

    it('records a resource archive and unarchive', async () => {
      const { actor } = await setup();
      const res = await actor.agent
        .post('/api/v1/organizations/acme/resources')
        .send({ name: 'Crane', kind: 'EQUIPMENT' })
        .expect(201);
      const id = res.body.data.id as string;
      const version = res.body.data.version as number;
      await actor.agent
        .post(`/api/v1/organizations/acme/resources/${id}/archive`)
        .send({ version })
        .expect(204);
      await actor.agent
        .post(`/api/v1/organizations/acme/resources/${id}/unarchive`)
        .send({ version: version + 1 })
        .expect(204);

      expect((await rows('resource.archived'))[0]!.changes?.after).toMatchObject({
        name: 'Crane',
        kind: 'EQUIPMENT',
      });
      expect(await rows('resource.unarchived')).toHaveLength(1);
      expect(await rows('resource.deleted')).toHaveLength(0);
    });
  });

  describe('interchange.imported (family G)', () => {
    it('records the file, the format and the size of what arrived', async () => {
      const { actor, projectId } = await setup();

      const res = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${projectId}/interchange/commit`)
        .attach('file', Buffer.from(smallXer('Riverside Phase 2'), 'utf8'), 'p6-export.xer')
        .expect(201);
      const planId = res.body.data.planId as string;

      const written = await rows('interchange.imported');
      expect(written).toHaveLength(1);
      const row = written[0]!;
      expect(row.subjectType).toBe('PLAN');
      expect(row.subjectId).toBe(planId);
      expect(row.changes?.after).toMatchObject({
        format: 'XER',
        // The reader's only surviving route back to the source — the upload itself is not kept.
        sourceFilename: 'p6-export.xer',
        activityCount: 2,
        dependencyCount: 1,
      });
      // Scalar, not the report: a count says "go and read it" without pretending to BE it.
      expect(typeof row.changes?.after?.findingCount).toBe('number');
    });

    it('writes NOTHING for a dry-run — it reads a file and changes nothing', async () => {
      const { actor, projectId } = await setup();

      await actor.agent
        .post(`/api/v1/organizations/acme/projects/${projectId}/interchange/dry-run`)
        .attach('file', Buffer.from(smallXer('Preview'), 'utf8'), 'p6-export.xer')
        .expect(200);

      expect(await rows('interchange.imported')).toHaveLength(0);
    });

    it('writes NOTHING when the file is not a schedule (422)', async () => {
      const { actor, projectId } = await setup();

      await actor.agent
        .post(`/api/v1/organizations/acme/projects/${projectId}/interchange/commit`)
        .attach('file', Buffer.from('not a schedule at all', 'utf8'), 'notes.txt')
        .expect(422);

      expect(await rows('interchange.imported')).toHaveLength(0);
    });
  });

  describe('the family-C fix (spec §0.1)', () => {
    it('records the cascade SIZE on a plan delete, not just its batch id', async () => {
      const { actor, planId } = await setup();
      const a = await addActivity(actor, planId, { name: 'Dig' });
      const b = await addActivity(actor, planId, { name: 'Pour' });
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: a.id, successorId: b.id })
        .expect(201);

      await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);

      // The M1 shape promised `counts: CascadeCounts` and recorded nothing at all, so a delete of
      // 412 activities said only that a batch happened. Flattened scalars, because the redactor
      // reduces any non-scalar to a type marker by design.
      expect((await rows('plan.deleted'))[0]!.changes?.before).toMatchObject({
        name: 'Baseline',
        activityCount: 2,
        dependencyCount: 1,
      });
    });
  });
});
