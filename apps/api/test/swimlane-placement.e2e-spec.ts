import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * Swimlane placement over the activity API (swimlanes M1-T3): the plan's source and level, an
 * activity's `swimlaneId`, the positions batch's `swimlane` lane with a SERVER-derived basis, and the
 * `swimlaneLanes` every activity response carries. Run with the pen enforced, because every one of
 * these writes is structural (spec §2, Permissions).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface LaneRow {
  basis: string;
  swimlaneId: string | null;
  summaryActivityId: string | null;
  wbsLevel: number | null;
  laneIndex: number;
  updatedAt: string;
}

interface ActivityBody {
  id: string;
  version: number;
  laneIndex: number;
  swimlaneId: string | null;
  swimlaneLanes: LaneRow[];
}

describe.skipIf(!hasDatabase)('Swimlane placement (e2e, pen enforced)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let priorEnforced: string | undefined;

  beforeAll(async () => {
    priorEnforced = process.env.PLAN_EDIT_LOCK_ENFORCED;
    process.env.PLAN_EDIT_LOCK_ENFORCED = 'true';
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
    // Leave no swimlane behind: a sibling spec whose reset deletes plans directly would meet the
    // swimlanes' RESTRICT foreign key.
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
    if (priorEnforced === undefined) delete process.env.PLAN_EDIT_LOCK_ENFORCED;
    else process.env.PLAN_EDIT_LOCK_ENFORCED = priorEnforced;
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();
  const base = (org = 'acme') => `/api/v1/organizations/${org}`;
  const planUrl = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}`;
  const lanesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/swimlanes`;
  const activitiesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/activities`;
  const positionsUrl = (planId: string, org = 'acme') => `${activitiesUrl(planId, org)}/positions`;
  const lockUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/edit-lock`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** A plan with the pen taken: every write under test is structural. */
  async function makePlan(actor: Actor, org: string, planName: string): Promise<string> {
    const client = await actor.agent
      .post(`${base(org)}/clients`)
      .send({ name: `Client ${planName}` })
      .expect(201);
    const project = await actor.agent
      .post(`${base(org)}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    const plan = await actor.agent
      .post(`${base(org)}/projects/${project.body.data.id}/plans`)
      .send({ name: planName, plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent.post(lockUrl(planId, org)).send({}).expect(200);
    return planId;
  }

  /** An admin org with a plan, the pen taken. */
  async function setup(): Promise<{ actor: Actor; orgId: string; planId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const planId = await makePlan(actor, 'acme', 'Plan');
    return { actor, orgId: res.body.data.id as string, planId };
  }

  async function addMember(
    orgId: string,
    role: 'VIEWER' | 'CONTRIBUTOR' | 'PLANNER',
    email: string,
  ): Promise<Actor> {
    const member = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: member.userId, role } });
    return member;
  }

  async function createSwimlane(
    actor: Actor,
    planId: string,
    name: string,
    org = 'acme',
  ): Promise<string> {
    const res = await actor.agent.post(lanesUrl(planId, org)).send({ name }).expect(201);
    return res.body.data.id as string;
  }

  async function createActivity(
    actor: Actor,
    planId: string,
    body: Record<string, unknown>,
  ): Promise<ActivityBody> {
    const res = await actor.agent.post(activitiesUrl(planId)).send(body).expect(201);
    return res.body.data as ActivityBody;
  }

  async function getActivity(actor: Actor, id: string): Promise<ActivityBody> {
    const res = await actor.agent.get(`${base()}/activities/${id}`).expect(200);
    return res.body.data as ActivityBody;
  }

  async function setSource(
    actor: Actor,
    planId: string,
    body: { swimlaneSource?: string; swimlaneWbsLevel?: number | null },
  ) {
    const current = await actor.agent.get(planUrl(planId)).expect(200);
    return actor.agent.patch(planUrl(planId)).send({ ...body, version: current.body.data.version });
  }

  /** The stable part of a lane row: `updatedAt` moves on every write, the rest identifies it. */
  const shape = (lanes: LaneRow[]) =>
    lanes
      .map(({ updatedAt: _updatedAt, ...rest }) => rest)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  describe('the plan source and level', () => {
    it('defaults to NONE, and moves to MANUAL with a version bump', async () => {
      const { actor, planId } = await setup();
      const before = await actor.agent.get(planUrl(planId)).expect(200);
      expect(before.body.data).toMatchObject({ swimlaneSource: 'NONE', swimlaneWbsLevel: null });

      const res = await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        swimlaneSource: 'MANUAL',
        swimlaneWbsLevel: null,
        version: before.body.data.version + 1,
      });
    });

    it('takes WBS with a level, and clears the level when the source leaves WBS', async () => {
      const { actor, planId } = await setup();
      const wbs = await setSource(actor, planId, { swimlaneSource: 'WBS', swimlaneWbsLevel: 2 });
      expect(wbs.status).toBe(200);
      expect(wbs.body.data).toMatchObject({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2 });

      const level = await setSource(actor, planId, { swimlaneWbsLevel: 3 });
      expect(level.body.data).toMatchObject({ swimlaneSource: 'WBS', swimlaneWbsLevel: 3 });

      const manual = await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      expect(manual.status).toBe(200);
      expect(manual.body.data).toMatchObject({ swimlaneSource: 'MANUAL', swimlaneWbsLevel: null });
    });

    it.each([
      ['WBS without a level', { swimlaneSource: 'WBS' }],
      ['a level beside MANUAL', { swimlaneSource: 'MANUAL', swimlaneWbsLevel: 2 }],
      ['a level on a plan that is not WBS', { swimlaneWbsLevel: 1 }],
      ['level 0', { swimlaneSource: 'WBS', swimlaneWbsLevel: 0 }],
      ['level 4', { swimlaneSource: 'WBS', swimlaneWbsLevel: 4 }],
      ['an unknown source', { swimlaneSource: 'GRID' }],
      // In the database enum before any plan can hold it (P6 activity codes migration A).
      ['ACTIVITY_CODE, which no plan can hold yet', { swimlaneSource: 'ACTIVITY_CODE' }],
    ])('refuses %s with 422', async (_label, body) => {
      const { actor, planId } = await setup();
      const res = await setSource(actor, planId, body);
      expect(res.status).toBe(422);
      const after = await actor.agent.get(planUrl(planId)).expect(200);
      expect(after.body.data).toMatchObject({ swimlaneSource: 'NONE', swimlaneWbsLevel: null });
    });

    it('answers 409 for a stale version and changes nothing', async () => {
      const { actor, planId } = await setup();
      await actor.agent
        .patch(planUrl(planId))
        .send({ swimlaneSource: 'MANUAL', version: 99 })
        .expect(409);
      const after = await actor.agent.get(planUrl(planId)).expect(200);
      expect(after.body.data.swimlaneSource).toBe('NONE');
    });

    it('is not a scheduling input: the plan does not read as edited since calculated', async () => {
      const { actor, planId } = await setup();
      await createActivity(actor, planId, { name: 'Dig' });
      await actor.agent
        .post(`${planUrl(planId)}/schedule/recalculate`)
        .send({})
        .expect(200);
      const res = await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      expect(res.body.data.editedSinceCalculated).toBe(false);
    });

    it('needs the pen for the source, and not for a rename', async () => {
      const { actor, planId } = await setup();
      await actor.agent.delete(lockUrl(planId)).expect(204);
      const res = await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      expect(res.status).toBe(423);
      const renamed = await actor.agent.get(planUrl(planId)).expect(200);
      await actor.agent
        .patch(planUrl(planId))
        .send({ name: 'Renamed', version: renamed.body.data.version })
        .expect(200);
      const after = await actor.agent.get(planUrl(planId)).expect(200);
      expect(after.body.data.swimlaneSource).toBe('NONE');
    });

    it('refuses a Viewer and a Contributor (403) and an outsider (404)', async () => {
      const { orgId, planId } = await setup();
      for (const role of ['VIEWER', 'CONTRIBUTOR'] as const) {
        const member = await addMember(orgId, role, `${role.toLowerCase()}@example.com`);
        await member.agent
          .patch(planUrl(planId))
          .send({ swimlaneSource: 'MANUAL', version: 1 })
          .expect(403);
      }
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
      await outsider.agent
        .patch(planUrl(planId, 'other'))
        .send({ swimlaneSource: 'MANUAL', version: 1 })
        .expect(404);
      await outsider.agent
        .patch(planUrl(planId))
        .send({ swimlaneSource: 'MANUAL', version: 1 })
        .expect(404);
    });
  });

  describe('an activity swimlaneId', () => {
    it('is filed at create and on update, and clears with null', async () => {
      const { actor, planId } = await setup();
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      const civil = await createSwimlane(actor, planId, 'Civil');
      const mech = await createSwimlane(actor, planId, 'Mechanical');

      const a = await createActivity(actor, planId, { name: 'Dig', swimlaneId: civil });
      expect(a).toMatchObject({ swimlaneId: civil, swimlaneLanes: [] });
      const none = await createActivity(actor, planId, { name: 'Loose' });
      expect(none.swimlaneId).toBeNull();

      const moved = await actor.agent
        .patch(`${base()}/activities/${a.id}`)
        .send({ version: a.version, swimlaneId: mech })
        .expect(200);
      expect(moved.body.data).toMatchObject({ swimlaneId: mech, version: a.version + 1 });
      const cleared = await actor.agent
        .patch(`${base()}/activities/${a.id}`)
        .send({ version: a.version + 1, swimlaneId: null })
        .expect(200);
      expect(cleared.body.data.swimlaneId).toBeNull();

      const list = await actor.agent.get(activitiesUrl(planId)).expect(200);
      expect(list.body.data).toHaveLength(2);
      for (const row of list.body.data as ActivityBody[]) {
        expect(row.swimlaneLanes).toEqual([]);
      }
    });

    it('answers 404 to a swimlane that is unknown, deleted, of another plan or of another org', async () => {
      const { actor, planId } = await setup();
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      const otherPlan = await makePlan(actor, 'acme', 'Other plan');
      const foreign = await createSwimlane(actor, otherPlan, 'Foreign');
      const gone = await createSwimlane(actor, planId, 'Gone');
      await actor.agent.delete(`${lanesUrl(planId)}/${gone}`).expect(204);
      const stranger = await signUp('stranger@example.com');
      await stranger.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
      const otherOrgPlan = await makePlan(stranger, 'other', 'Their plan');
      const theirs = await createSwimlane(stranger, otherOrgPlan, 'Theirs', 'other');

      const a = await createActivity(actor, planId, { name: 'Dig' });
      for (const swimlaneId of [foreign, gone, theirs, '00000000-0000-4000-8000-000000000000']) {
        await actor.agent.post(activitiesUrl(planId)).send({ name: 'X', swimlaneId }).expect(404);
        await actor.agent
          .patch(`${base()}/activities/${a.id}`)
          .send({ version: a.version, swimlaneId })
          .expect(404);
      }
      expect((await getActivity(actor, a.id)).swimlaneId).toBeNull();
      const stored = await prisma.activity.findMany({ where: { planId } });
      expect(stored).toHaveLength(1);
    });

    it('is refused with 422 SWIMLANE_SOURCE_IS_WBS while the swimlanes come from the WBS', async () => {
      const { actor, planId } = await setup();
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      const civil = await createSwimlane(actor, planId, 'Civil');
      const a = await createActivity(actor, planId, { name: 'Dig', swimlaneId: civil });
      await setSource(actor, planId, { swimlaneSource: 'WBS', swimlaneWbsLevel: 1 });

      const create = await actor.agent
        .post(activitiesUrl(planId))
        .send({ name: 'X', swimlaneId: civil })
        .expect(422);
      expect(create.body.error.details).toMatchObject({ reason: 'SWIMLANE_SOURCE_IS_WBS' });
      const update = await actor.agent
        .patch(`${base()}/activities/${a.id}`)
        .send({ version: a.version, swimlaneId: null })
        .expect(422);
      expect(update.body.error.details).toMatchObject({ reason: 'SWIMLANE_SOURCE_IS_WBS' });

      // The hand-made membership is kept, and a form that resends it is not told it wrote one.
      await actor.agent
        .patch(`${base()}/activities/${a.id}`)
        .send({ version: a.version, name: 'Dig deep', swimlaneId: civil })
        .expect(200);
      expect((await getActivity(actor, a.id)).swimlaneId).toBe(civil);
    });

    it('needs the pen and a Planner', async () => {
      const { actor, orgId, planId } = await setup();
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      const civil = await createSwimlane(actor, planId, 'Civil');
      const a = await createActivity(actor, planId, { name: 'Dig' });
      const viewer = await addMember(orgId, 'VIEWER', 'viewer@example.com');
      await viewer.agent
        .patch(`${base()}/activities/${a.id}`)
        .send({ version: a.version, swimlaneId: civil })
        .expect(403);
      await actor.agent.delete(lockUrl(planId)).expect(204);
      await actor.agent
        .patch(`${base()}/activities/${a.id}`)
        .send({ version: a.version, swimlaneId: civil })
        .expect(423);
      await actor.agent
        .post(activitiesUrl(planId))
        .send({ name: 'X', swimlaneId: civil })
        .expect(423);
    });

    it('records a swimlane move in the activity history, naming the swimlane', async () => {
      const { actor, planId } = await setup();
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      const civil = await createSwimlane(actor, planId, 'Civil');
      const a = await createActivity(actor, planId, { name: 'Dig' });
      await actor.agent
        .patch(`${base()}/activities/${a.id}`)
        .send({ version: a.version, swimlaneId: civil })
        .expect(200);
      const entries = await prisma.activityHistoryEntry.findMany({ where: { activityId: a.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.changes).toMatchObject({
        swimlaneId: { from: null, to: { id: civil, name: 'Civil' } },
      });
    });

    it('is admitted back onto a swimlane that was deleted meanwhile (schema D7)', async () => {
      const { actor, planId } = await setup();
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      const civil = await createSwimlane(actor, planId, 'Civil');
      const a = await createActivity(actor, planId, { name: 'Dig', swimlaneId: civil });

      await actor.agent.delete(`${base()}/activities/${a.id}`).expect(200);
      await actor.agent.delete(`${lanesUrl(planId)}/${civil}`).expect(204);

      await actor.agent.post(`${base()}/activities/${a.id}/restore`).expect(200);
      const restored = await getActivity(actor, a.id);
      expect(restored.swimlaneId).toBe(civil);
      const swimlane = await prisma.swimlane.findUniqueOrThrow({ where: { id: civil } });
      expect(swimlane.deletedAt).not.toBeNull();
    });
  });

  describe('the positions batch', () => {
    /** MANUAL plan with two swimlanes and three activities (the third has no swimlane). */
    async function manualPlan() {
      const ctx = await setup();
      await setSource(ctx.actor, ctx.planId, { swimlaneSource: 'MANUAL' });
      const civil = await createSwimlane(ctx.actor, ctx.planId, 'Civil');
      const mech = await createSwimlane(ctx.actor, ctx.planId, 'Mechanical');
      const a = await createActivity(ctx.actor, ctx.planId, { name: 'A', laneIndex: 0 });
      const b = await createActivity(ctx.actor, ctx.planId, { name: 'B', laneIndex: 1 });
      const c = await createActivity(ctx.actor, ctx.planId, { name: 'C', laneIndex: 2 });
      return { ...ctx, civil, mech, a, b, c };
    }

    const position = (a: ActivityBody, swimlane?: Record<string, unknown>, laneIndex?: number) => ({
      id: a.id,
      version: a.version,
      ...(laneIndex !== undefined ? { laneIndex } : {}),
      ...(swimlane ? { swimlane } : {}),
    });

    const send = (actor: Actor, planId: string, positions: unknown[]) =>
      actor.agent.patch(positionsUrl(planId)).send({ positions });

    it('still accepts every pre-swimlane body, on a plan with no swimlane source', async () => {
      const { actor, planId } = await setup();
      const a = await createActivity(actor, planId, { name: 'A' });
      const res = await send(actor, planId, [{ id: a.id, laneIndex: 4, version: a.version }]);
      expect(res.status).toBe(200);
      expect(res.body.data[0]).toMatchObject({ laneIndex: 4, swimlaneId: null, swimlaneLanes: [] });
    });

    it('refuses a row with neither laneIndex nor swimlane, a null swimlane and a client basis (422)', async () => {
      const { actor, planId, a } = await manualPlan();
      await send(actor, planId, [{ id: a.id, version: a.version }]).expect(422);
      await send(actor, planId, [
        { id: a.id, laneIndex: 1, version: a.version, swimlane: null },
      ]).expect(422);
      await send(actor, planId, [
        { id: a.id, version: a.version, swimlane: { laneIndex: 1, basis: 'WBS_SUMMARY' } },
      ]).expect(422);
    });

    it('answers 422 SWIMLANE_SOURCE_NONE to a lane write on a plan with no source', async () => {
      const { actor, planId } = await setup();
      const a = await createActivity(actor, planId, { name: 'A' });
      const res = await send(actor, planId, [position(a, { laneIndex: 1 })]);
      expect(res.status).toBe(422);
      expect(res.body.error.details).toMatchObject({ reason: 'SWIMLANE_SOURCE_NONE' });
      expect(await prisma.activitySwimlaneLane.count()).toBe(0);
    });

    it('files an activity in a swimlane and stores its lane against that swimlane', async () => {
      const { actor, orgId, planId, civil, a } = await manualPlan();
      const res = await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]);
      expect(res.status).toBe(200);
      const body = res.body.data[0] as ActivityBody;
      // The swimlane-free layout is untouched by a swimlane write.
      expect(body).toMatchObject({ swimlaneId: civil, laneIndex: 0, version: a.version + 1 });
      expect(body.swimlaneLanes).toHaveLength(1);
      expect(body.swimlaneLanes[0]).toMatchObject({
        basis: 'SWIMLANE',
        swimlaneId: civil,
        summaryActivityId: null,
        wbsLevel: null,
        laneIndex: 3,
      });
      const stored = await prisma.activitySwimlaneLane.findMany({ where: { activityId: a.id } });
      expect(stored).toHaveLength(1);
      // Copied from the activity, never from the request.
      expect(stored[0]?.organizationId).toBe(orgId);
    });

    it('overwrites the lane of a basis in place, and remembers it when the activity leaves and returns', async () => {
      const { actor, planId, civil, mech, a } = await manualPlan();
      let current = a;
      const write = async (swimlane: Record<string, unknown>) => {
        const res = await send(actor, planId, [position(current, swimlane)]).expect(200);
        current = res.body.data[0] as ActivityBody;
        return current;
      };
      await write({ swimlaneId: civil, laneIndex: 3 });
      await write({ laneIndex: 5 }); // inside the swimlane it is already in
      expect(await prisma.activitySwimlaneLane.count()).toBe(1);

      const inMech = await write({ swimlaneId: mech, laneIndex: 1 });
      expect(inMech.swimlaneLanes.map((l) => [l.swimlaneId, l.laneIndex]).sort()).toEqual(
        [
          [civil, 5],
          [mech, 1],
        ].sort(),
      );
      // Back to Civil: its own lane row is the one that was written there.
      const back = await write({ swimlaneId: civil, laneIndex: 6 });
      expect(back.swimlaneLanes).toHaveLength(2);
      expect(back.swimlaneLanes.find((l) => l.swimlaneId === mech)?.laneIndex).toBe(1);
      expect(back.swimlaneLanes.find((l) => l.swimlaneId === civil)?.laneIndex).toBe(6);
    });

    it('stores No swimlane as its own basis for an activity that is in none', async () => {
      const { actor, planId, c } = await manualPlan();
      const res = await send(actor, planId, [position(c, { laneIndex: 4 })]).expect(200);
      expect((res.body.data[0] as ActivityBody).swimlaneLanes).toEqual([
        expect.objectContaining({
          basis: 'NO_SWIMLANE',
          swimlaneId: null,
          summaryActivityId: null,
          wbsLevel: null,
          laneIndex: 4,
        }),
      ]);
    });

    it('carries both a swimlane-free lane and a swimlane lane in one row', async () => {
      const { actor, planId, civil, a } = await manualPlan();
      const res = await send(actor, planId, [
        position(a, { swimlaneId: civil, laneIndex: 2 }, 7),
      ]).expect(200);
      expect(res.body.data[0]).toMatchObject({ laneIndex: 7, swimlaneId: civil });
    });

    it('answers 404 for a swimlane that is deleted, of another plan or unknown, and writes nothing', async () => {
      const { actor, planId, civil, a, b } = await manualPlan();
      const gone = await createSwimlane(actor, planId, 'Gone');
      await actor.agent.delete(`${lanesUrl(planId)}/${gone}`).expect(204);
      const otherPlan = await makePlan(actor, 'acme', 'Other plan');
      const foreign = await createSwimlane(actor, otherPlan, 'Foreign');

      for (const swimlaneId of [gone, foreign, '00000000-0000-4000-8000-000000000000']) {
        // The good row would have landed; the batch is all or nothing.
        await send(actor, planId, [
          position(a, { swimlaneId: civil, laneIndex: 1 }),
          position(b, { swimlaneId, laneIndex: 1 }),
        ]).expect(404);
      }
      expect(await prisma.activitySwimlaneLane.count()).toBe(0);
      expect((await getActivity(actor, a.id)).version).toBe(a.version);
      expect((await getActivity(actor, a.id)).swimlaneId).toBeNull();
    });

    it('clears a membership with a null swimlaneId and stores the lane as No swimlane', async () => {
      const { actor, planId, civil, a } = await manualPlan();
      const filed = (
        await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200)
      ).body.data[0] as ActivityBody;
      const res = await send(actor, planId, [
        position(filed, { swimlaneId: null, laneIndex: 6 }),
      ]).expect(200);
      const body = res.body.data[0] as ActivityBody;
      expect(body.swimlaneId).toBeNull();
      // Both bases are kept: Civil's lane is remembered, and No swimlane gains its own.
      expect(shape(body.swimlaneLanes)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ basis: 'SWIMLANE', swimlaneId: civil, laneIndex: 3 }),
          expect.objectContaining({ basis: 'NO_SWIMLANE', swimlaneId: null, laneIndex: 6 }),
        ]),
      );
      expect(body.swimlaneLanes).toHaveLength(2);
    });

    it('leaves the membership alone when swimlaneId is omitted', async () => {
      const { actor, planId, civil, a } = await manualPlan();
      const filed = (
        await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200)
      ).body.data[0] as ActivityBody;
      const res = await send(actor, planId, [position(filed, { laneIndex: 5 })]).expect(200);
      const body = res.body.data[0] as ActivityBody;
      expect(body.swimlaneId).toBe(civil);
      expect(body.swimlaneLanes).toEqual([
        expect.objectContaining({ basis: 'SWIMLANE', swimlaneId: civil, laneIndex: 5 }),
      ]);
    });

    it('records the clear in the history, naming the swimlane it left', async () => {
      const { actor, planId, civil, a } = await manualPlan();
      const filed = (
        await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200)
      ).body.data[0] as ActivityBody;
      await send(actor, planId, [position(filed, { swimlaneId: null, laneIndex: 1 })]).expect(200);
      const entries = await prisma.activityHistoryEntry.findMany({
        where: { activityId: a.id },
        orderBy: { lastRecordedAt: 'asc' },
      });
      const last = entries[entries.length - 1];
      expect(last?.changes).toMatchObject({
        swimlaneId: { from: { id: civil, name: 'Civil' }, to: null },
      });
      // And through the route a reader uses, where `to: null` must survive serialisation.
      const read = await actor.agent.get(`${base()}/activities/${a.id}/history`).expect(200);
      expect(read.body.data[0].changes.swimlaneId).toEqual({
        from: { id: civil, name: 'Civil' },
        to: null,
      });
    });

    it('writes a No swimlane lane for a member of a deleted swimlane and keeps its swimlane_id', async () => {
      const { actor, planId, civil, a, b } = await manualPlan();
      const filed = (
        await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200)
      ).body.data[0] as ActivityBody;
      await actor.agent.delete(`${lanesUrl(planId)}/${civil}`).expect(204);
      const member = await getActivity(actor, a.id);

      // The batch holds a second, ordinary row: the deleted membership must not 404 the whole of it.
      const res = await send(actor, planId, [
        position(member, { laneIndex: 7 }),
        position(b, { laneIndex: 2 }),
      ]).expect(200);
      const moved = (res.body.data as ActivityBody[]).find((r) => r.id === a.id)!;
      expect(moved.swimlaneId).toBe(civil);
      expect(moved.swimlaneLanes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ basis: 'NO_SWIMLANE', swimlaneId: null, laneIndex: 7 }),
          expect.objectContaining({ basis: 'SWIMLANE', swimlaneId: civil, laneIndex: 3 }),
        ]),
      );
      expect(filed.swimlaneId).toBe(civil);
      expect((await prisma.activity.findUniqueOrThrow({ where: { id: a.id } })).swimlaneId).toBe(
        civil,
      );
      // Undo of the delete returns the member to the lane it remembered.
      await actor.agent.post(`${lanesUrl(planId)}/${civil}/restore`).expect(200);
      expect((await getActivity(actor, a.id)).swimlaneId).toBe(civil);
    });

    it('moves a member of a deleted swimlane into an active one with an explicit id, bumping its version', async () => {
      const { actor, planId, civil, mech, a } = await manualPlan();
      await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200);
      await actor.agent.delete(`${lanesUrl(planId)}/${civil}`).expect(204);
      const member = await getActivity(actor, a.id);
      const res = await send(actor, planId, [
        position(member, { swimlaneId: mech, laneIndex: 2 }),
      ]).expect(200);
      const body = res.body.data[0] as ActivityBody;
      expect(body).toMatchObject({ swimlaneId: mech, version: member.version + 1 });
      expect(body.swimlaneLanes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ basis: 'SWIMLANE', swimlaneId: mech, laneIndex: 2 }),
        ]),
      );
    });

    it('bumps the version of a cleared row and of a kept-deleted row like any position write', async () => {
      const { actor, planId, civil, a, b } = await manualPlan();
      await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200);
      await actor.agent.delete(`${lanesUrl(planId)}/${civil}`).expect(204);
      const member = await getActivity(actor, a.id);
      const kept = await send(actor, planId, [position(member, { laneIndex: 1 })]).expect(200);
      expect((kept.body.data[0] as ActivityBody).version).toBe(member.version + 1);
      const cleared = await send(actor, planId, [
        position(b, { swimlaneId: null, laneIndex: 1 }),
      ]).expect(200);
      expect((cleared.body.data[0] as ActivityBody).version).toBe(b.version + 1);
    });

    it('refuses a foreign swimlane beside a kept-deleted member (404) and rolls the batch back', async () => {
      const { actor, planId, civil, a, b } = await manualPlan();
      await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200);
      await actor.agent.delete(`${lanesUrl(planId)}/${civil}`).expect(204);
      const member = await getActivity(actor, a.id);
      const otherPlan = await makePlan(actor, 'acme', 'Other plan');
      const foreign = await createSwimlane(actor, otherPlan, 'Foreign');
      const lanesBefore = await prisma.activitySwimlaneLane.count();
      await send(actor, planId, [
        position(member, { laneIndex: 7 }),
        position(b, { swimlaneId: foreign, laneIndex: 1 }),
      ]).expect(404);
      expect(await prisma.activitySwimlaneLane.count()).toBe(lanesBefore);
      const after = await getActivity(actor, a.id);
      expect(after.version).toBe(member.version);
      expect(after.swimlaneId).toBe(civil);
      expect((await getActivity(actor, b.id)).swimlaneId).toBeNull();
    });

    it('still refuses an explicit deleted swimlaneId for a member of a deleted swimlane (404)', async () => {
      const { actor, planId, civil, a } = await manualPlan();
      const filed = (
        await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200)
      ).body.data[0] as ActivityBody;
      await actor.agent.delete(`${lanesUrl(planId)}/${civil}`).expect(204);
      await send(actor, planId, [
        position(await getActivity(actor, filed.id), { swimlaneId: civil, laneIndex: 1 }),
      ]).expect(404);
    });

    it('answers 404 for an activity of another plan', async () => {
      const { actor, planId, civil } = await manualPlan();
      const otherPlan = await makePlan(actor, 'acme', 'Other plan');
      const foreign = await createActivity(actor, otherPlan, { name: 'Foreign' });
      await send(actor, planId, [position(foreign, { swimlaneId: civil, laneIndex: 1 })]).expect(
        404,
      );
      expect(await prisma.activitySwimlaneLane.count()).toBe(0);
    });

    it('answers 409 for a stale version and writes neither the activity nor any lane row', async () => {
      const { actor, planId, civil, a, b } = await manualPlan();
      await send(actor, planId, [
        position(a, { swimlaneId: civil, laneIndex: 1 }),
        { ...position(b, { swimlaneId: civil, laneIndex: 2 }), version: b.version + 5 },
      ]).expect(409);
      expect(await prisma.activitySwimlaneLane.count()).toBe(0);
      expect((await getActivity(actor, a.id)).swimlaneId).toBeNull();
    });

    it('answers 422 SWIMLANE_SOURCE_IS_WBS to a named swimlane in WBS mode, and writes nothing', async () => {
      const { actor, planId, civil, a } = await manualPlan();
      await setSource(actor, planId, { swimlaneSource: 'WBS', swimlaneWbsLevel: 1 });
      const res = await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 1 })]);
      expect(res.status).toBe(422);
      expect(res.body.error.details).toMatchObject({ reason: 'SWIMLANE_SOURCE_IS_WBS' });
      expect(await prisma.activitySwimlaneLane.count()).toBe(0);
    });

    it('derives the WBS basis on the server: the level-L summary, or No WBS group at that level', async () => {
      const { actor, planId } = await setup();
      const works = await createActivity(actor, planId, { name: 'Works', type: 'WBS_SUMMARY' });
      const under = await createActivity(actor, planId, { name: 'Under', parentId: works.id });
      const loose = await createActivity(actor, planId, { name: 'Loose' });
      await setSource(actor, planId, { swimlaneSource: 'WBS', swimlaneWbsLevel: 1 });

      const res = await send(actor, planId, [
        position(under, { laneIndex: 2 }),
        position(loose, { laneIndex: 3 }),
      ]).expect(200);
      const byId = new Map((res.body.data as ActivityBody[]).map((r) => [r.id, r]));
      expect(byId.get(under.id)?.swimlaneLanes).toEqual([
        expect.objectContaining({
          basis: 'WBS_SUMMARY',
          swimlaneId: null,
          summaryActivityId: works.id,
          wbsLevel: null,
          laneIndex: 2,
        }),
      ]);
      expect(byId.get(loose.id)?.swimlaneLanes).toEqual([
        expect.objectContaining({
          basis: 'NO_WBS_SUMMARY',
          swimlaneId: null,
          summaryActivityId: null,
          wbsLevel: 1,
          laneIndex: 3,
        }),
      ]);
    });

    it('gives the same rows after switching source and back (a lane per basis)', async () => {
      const { actor, planId, civil, a } = await manualPlan();
      const works = await createActivity(actor, planId, { name: 'Works', type: 'WBS_SUMMARY' });
      const member = await createActivity(actor, planId, { name: 'Member', parentId: works.id });

      // MANUAL: a is in Civil at lane 3.
      await send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 3 })]).expect(200);
      // WBS: the member is in Works at lane 8.
      await setSource(actor, planId, { swimlaneSource: 'WBS', swimlaneWbsLevel: 1 });
      const fresh = await getActivity(actor, member.id);
      await send(actor, planId, [position(fresh, { laneIndex: 8 })]).expect(200);
      const wbsRows = shape((await getActivity(actor, member.id)).swimlaneLanes);

      // Back to MANUAL and WBS again: nothing was lost, and nothing was written by switching.
      const before = await prisma.activitySwimlaneLane.findMany({ orderBy: { id: 'asc' } });
      await setSource(actor, planId, { swimlaneSource: 'MANUAL' });
      expect(shape((await getActivity(actor, a.id)).swimlaneLanes)).toEqual([
        expect.objectContaining({ basis: 'SWIMLANE', swimlaneId: civil, laneIndex: 3 }),
      ]);
      await setSource(actor, planId, { swimlaneSource: 'WBS', swimlaneWbsLevel: 1 });
      expect(shape((await getActivity(actor, member.id)).swimlaneLanes)).toEqual(wbsRows);
      const after = await prisma.activitySwimlaneLane.findMany({ orderBy: { id: 'asc' } });
      expect(after).toEqual(before);
    });

    it('lets a Planner who holds the pen write, and refuses a Viewer, a Contributor and a missing pen', async () => {
      const { actor, orgId, planId, civil, a } = await manualPlan();
      for (const role of ['VIEWER', 'CONTRIBUTOR'] as const) {
        const member = await addMember(orgId, role, `${role.toLowerCase()}@example.com`);
        await send(member, planId, [position(a, { swimlaneId: civil, laneIndex: 1 })]).expect(403);
      }
      const planner = await addMember(orgId, 'PLANNER', 'planner@example.com');
      await send(planner, planId, [position(a, { swimlaneId: civil, laneIndex: 1 })]).expect(423);
      await actor.agent.delete(lockUrl(planId)).expect(204);
      await planner.agent.post(lockUrl(planId)).send({}).expect(200);
      await send(planner, planId, [position(a, { swimlaneId: civil, laneIndex: 1 })]).expect(200);
    });

    it('answers 404 to a caller outside the organisation', async () => {
      const { planId, civil, a } = await manualPlan();
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
      await send(outsider, planId, [position(a, { swimlaneId: civil, laneIndex: 1 })]).expect(404);
    });

    it('records a move into another swimlane in the history, and a lane inside one swimlane in none', async () => {
      const { actor, planId, civil, a } = await manualPlan();
      const res = await send(actor, planId, [
        position(a, { swimlaneId: civil, laneIndex: 3 }),
      ]).expect(200);
      const current = res.body.data[0] as ActivityBody;
      await send(actor, planId, [position(current, { laneIndex: 4 })]).expect(200);
      const entries = await prisma.activityHistoryEntry.findMany({ where: { activityId: a.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ scope: 'PLACEMENT' });
      expect(entries[0]?.changes).toMatchObject({
        swimlaneId: { from: null, to: { id: civil, name: 'Civil' } },
      });
      // A swimlane-free lane write is no decision either, and still makes no entry.
      await send(actor, planId, [{ id: a.id, laneIndex: 9, version: current.version + 1 }]).expect(
        200,
      );
      expect(await prisma.activityHistoryEntry.count({ where: { activityId: a.id } })).toBe(1);
    });

    describe('under concurrency (schema-design §5)', () => {
      it('never deadlocks two overlapping batches that name the same activities in opposite order', async () => {
        const { actor, planId, civil, mech, a, b, c } = await manualPlan();
        const forward = [a, b, c].map((x) => position(x, { swimlaneId: civil, laneIndex: 1 }));
        const backward = [c, b, a].map((x) => position(x, { swimlaneId: mech, laneIndex: 2 }));
        const results = await Promise.all([
          send(actor, planId, forward),
          send(actor, planId, backward),
        ]);
        // One lands and the other is told its versions are stale: a deadlock would be a 500.
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      });

      it('settles a batch racing the delete of the swimlane it names without a server error', async () => {
        const { actor, planId, civil, a } = await manualPlan();
        const [assigned, deleted] = await Promise.all([
          send(actor, planId, [position(a, { swimlaneId: civil, laneIndex: 1 })]),
          actor.agent.delete(`${lanesUrl(planId)}/${civil}`),
        ]);
        expect([200, 404]).toContain(assigned.status);
        expect(deleted.status).toBe(204);
        // Whichever won, a lane row never names a swimlane that was deleted BEFORE it was written.
        if (assigned.status === 404) {
          expect(await prisma.activitySwimlaneLane.count()).toBe(0);
          expect((await getActivity(actor, a.id)).swimlaneId).toBeNull();
        }
      });
    });
  });
});
