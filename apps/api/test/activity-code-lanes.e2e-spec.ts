import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for code swimlane lanes (p6-activity-codes M4-T1), against a real database: the
 * positions batch and the codes write storing a lane at a server-derived `(type, value)` basis in
 * `code_swimlane_lanes`, the refusal of a hand-made `swimlaneId`, create with `codes`, and the list's
 * `codeSwimlaneLanes` (absent, not empty, with no live code type: SC-2).
 *
 * Nothing can switch a plan to a code source until T2, so the pointer is written with Prisma, as
 * `codes.e2e-spec.ts` does. Every case asserts the two tables a code lane must never touch.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface CodeRef {
  codeTypeId: string;
  codeValueId: string;
}

interface LaneRef {
  codeTypeId: string;
  codeValueId: string | null;
  laneIndex: number;
  updatedAt: string;
}

interface ActivityBody {
  id: string;
  version: number;
  laneIndex: number;
  codes?: CodeRef[];
  codeSwimlaneLanes?: LaneRef[];
  swimlaneLanes?: unknown[];
}

describe.skipIf(!hasDatabase)('Code swimlane lanes API (e2e, pen enforced)', () => {
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
  const codesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/activities/codes`;
  const typesUrl = (planId: string, org = 'acme') => `${planUrl(planId, org)}/code-types`;
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

  async function makePlan(actor: Actor, org = 'acme', planName = 'Plan'): Promise<string> {
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
    return plan.body.data.id as string;
  }

  async function setup(): Promise<{ actor: Actor; orgId: string; planId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const planId = await makePlan(actor);
    await actor.agent.post(lockUrl(planId)).send({}).expect(200);
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

  async function createActivity(actor: Actor, planId: string, name: string, extra = {}) {
    const res = await actor.agent
      .post(`${planUrl(planId)}/activities`)
      .send({ name, ...extra })
      .expect(201);
    return res.body.data as ActivityBody;
  }

  async function createType(actor: Actor, planId: string, name: string) {
    const res = await actor.agent.post(typesUrl(planId)).send({ name }).expect(201);
    return res.body.data as { id: string };
  }

  async function createValue(actor: Actor, planId: string, typeId: string, shortCode: string) {
    const res = await actor.agent
      .post(`${typesUrl(planId)}/${typeId}/values`)
      .send({ shortCode })
      .expect(201);
    return res.body.data as { id: string; version: number };
  }

  const row = (a: ActivityBody, codes: { codeTypeId: string; codeValueId: string | null }[]) => ({
    id: a.id,
    version: a.version,
    codes,
  });

  const activitiesUrl = (planId: string) => `${planUrl(planId)}/activities`;

  async function listActivities(actor: Actor, planId: string): Promise<ActivityBody[]> {
    const res = await actor.agent.get(activitiesUrl(planId)).expect(200);
    return res.body.data as ActivityBody[];
  }

  /** Area (L1, L2), Trade (MECH), three activities, the plan drawn from Area. */
  async function seed() {
    const ctx = await setup();
    const { actor, planId } = ctx;
    const area = await createType(actor, planId, 'Area');
    const trade = await createType(actor, planId, 'Trade');
    const l1 = await createValue(actor, planId, area.id, 'L1');
    const l2 = await createValue(actor, planId, area.id, 'L2');
    const mech = await createValue(actor, planId, trade.id, 'MECH');
    const a = await createActivity(actor, planId, 'Excavate');
    const b = await createActivity(actor, planId, 'Pour');
    const c = await createActivity(actor, planId, 'Cure');
    await prisma.plan.update({
      where: { id: planId },
      data: { swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: area.id },
    });
    return { ...ctx, area, trade, l1, l2, mech, a, b, c };
  }

  const codeLanes = (planId: string) =>
    prisma.codeSwimlaneLane.findMany({ where: { planId }, orderBy: { laneIndex: 'asc' } });

  /** The two places a code lane must never be written (ADR-0206 A1-A2). */
  async function expectNoHandMadeLanes(planId: string, activityIds: string[]) {
    expect(
      await prisma.activitySwimlaneLane.count({ where: { activityId: { in: activityIds } } }),
    ).toBe(0);
    const rows = await prisma.activity.findMany({ where: { id: { in: activityIds } } });
    expect(rows.every((r) => r.laneIndex === 0)).toBe(true);
    expect(planId).toBeTruthy();
  }

  async function setCode(
    actor: Actor,
    planId: string,
    a: ActivityBody,
    typeId: string,
    valueId: string | null,
  ) {
    const res = await actor.agent
      .patch(codesUrl(planId))
      .send({ activities: [row(a, [{ codeTypeId: typeId, codeValueId: valueId }])] })
      .expect(200);
    return (res.body.data as ActivityBody[])[0]!;
  }

  describe('the positions batch under a code source', () => {
    const send = (actor: Actor, planId: string, positions: unknown[]) =>
      actor.agent.patch(`${activitiesUrl(planId)}/positions`).send({ positions });

    it('stores the lane at (type, the activity’s value), upserting twice into one row', async () => {
      const { actor, planId, area, l1, a } = await seed();
      const placed = await setCode(actor, planId, a, area.id, l1.id);
      const first = await send(actor, planId, [
        { id: a.id, version: placed.version, swimlane: { laneIndex: 3 } },
      ]).expect(200);
      const v = (first.body.data as ActivityBody[])[0]!.version;
      await send(actor, planId, [{ id: a.id, version: v, swimlane: { laneIndex: 5 } }]).expect(200);
      const rows = await codeLanes(planId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ codeTypeId: area.id, codeValueId: l1.id, laneIndex: 5 });
      await expectNoHandMadeLanes(planId, [a.id]);
    });

    it('stores (type, null) for an activity with no value, and for a soft-deleted value', async () => {
      const { actor, planId, area, l2, a, b } = await seed();
      const withValue = await setCode(actor, planId, b, area.id, l2.id);
      await prisma.codeValue.update({ where: { id: l2.id }, data: { deletedAt: new Date() } });
      const res = await send(actor, planId, [
        { id: a.id, version: a.version, swimlane: { laneIndex: 1 } },
        { id: b.id, version: withValue.version, swimlane: { laneIndex: 2 } },
      ]).expect(200);
      expect(res.body.data).toHaveLength(2);
      const rows = await codeLanes(planId);
      expect(rows.map((r) => [r.codeTypeId, r.codeValueId])).toEqual([
        [area.id, null],
        [area.id, null],
      ]);
    });

    it('refuses a swimlaneId under a code source with 422 and a way forward', async () => {
      const { actor, planId, a } = await seed();
      const res = await send(actor, planId, [
        { id: a.id, version: a.version, swimlane: { swimlaneId: null, laneIndex: 1 } },
      ]).expect(422);
      expect(res.body.error.details.reason).toBe('SWIMLANE_SOURCE_IS_ACTIVITY_CODE');
      expect(res.body.error.message).toMatch(/set the activity’s code/);
      expect(await codeLanes(planId)).toHaveLength(0);
    });

    it('refuses swimlaneId on create and on the single PATCH', async () => {
      const { actor, planId, a } = await seed();
      const made = await actor.agent
        .post(activitiesUrl(planId))
        .send({ name: 'X', swimlaneId: '00000000-0000-4000-8000-000000000001' })
        .expect(422);
      expect(made.body.error.details.reason).toBe('SWIMLANE_SOURCE_IS_ACTIVITY_CODE');
      const patched = await actor.agent
        .patch(`${base()}/activities/${a.id}`)
        .send({ version: a.version, swimlaneId: '00000000-0000-4000-8000-000000000001' })
        .expect(422);
      expect(patched.body.error.details.reason).toBe('SWIMLANE_SOURCE_IS_ACTIVITY_CODE');
    });

    it('leaves MANUAL behaviour unchanged: a lane goes to activity_swimlane_lanes only', async () => {
      const { actor, planId, a } = await seed();
      await prisma.plan.update({
        where: { id: planId },
        data: { swimlaneSource: 'MANUAL', swimlaneCodeTypeId: null },
      });
      await send(actor, planId, [
        { id: a.id, version: a.version, swimlane: { laneIndex: 4 } },
      ]).expect(200);
      expect(await codeLanes(planId)).toHaveLength(0);
      expect(await prisma.activitySwimlaneLane.count({ where: { activityId: a.id } })).toBe(1);
    });
  });

  describe('the codes write with lanes', () => {
    const write = (actor: Actor, planId: string, body: object) =>
      actor.agent.patch(codesUrl(planId)).send(body);

    it('moves the mover, writes it and a lane-only neighbour at the post-write basis, bumping both', async () => {
      const { actor, planId, area, l1, l2, a, b } = await seed();
      const at = await setCode(actor, planId, b, area.id, l2.id);
      const res = await write(actor, planId, {
        activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])],
        lanes: [
          { id: a.id, version: a.version, laneIndex: 0 },
          { id: b.id, version: at.version, laneIndex: 2 },
        ],
        lanesCodeTypeId: area.id,
      }).expect(200);
      const out = res.body.data as ActivityBody[];
      expect(out).toHaveLength(2);
      expect(out.find((r) => r.id === b.id)!.version).toBe(at.version + 1);
      expect(out.find((r) => r.id === a.id)!.version).toBe(a.version + 1);
      const rows = await codeLanes(planId);
      expect(rows.map((r) => [r.activityId, r.codeValueId, r.laneIndex]).sort()).toEqual(
        [
          [a.id, l1.id, 0],
          [b.id, l2.id, 2],
        ].sort(),
      );
      // The neighbour's codes are untouched, and only the mover has a history entry.
      expect(
        await prisma.codeValueAssignment.count({ where: { activityId: b.id, codeValueId: l2.id } }),
      ).toBe(1);
      expect(out.find((r) => r.id === b.id)!.codeSwimlaneLanes).toEqual([
        expect.objectContaining({ codeTypeId: area.id, codeValueId: l2.id, laneIndex: 2 }),
      ]);
      const hist = await actor.agent.get(`${base()}/activities/${b.id}/history`).expect(200);
      expect(
        (hist.body.data as { changes: Record<string, unknown> }[]).some(
          (h) => `code:${area.id}` in h.changes,
        ),
      ).toBe(true);
      const histA = await actor.agent.get(`${base()}/activities/${a.id}/history`).expect(200);
      expect((histA.body.data as unknown[]).length).toBeGreaterThan(0);
      await expectNoHandMadeLanes(planId, [a.id, b.id]);
    });

    it('records no history for a lane-only row', async () => {
      const { actor, planId, area, l1, a, b } = await seed();
      await write(actor, planId, {
        activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])],
        lanes: [{ id: b.id, version: b.version, laneIndex: 1 }],
        lanesCodeTypeId: area.id,
      }).expect(200);
      const hist = await actor.agent.get(`${base()}/activities/${b.id}/history`).expect(200);
      expect(hist.body.data).toHaveLength(0);
      const rows = await codeLanes(planId);
      expect(rows.find((r) => r.activityId === b.id)).toMatchObject({
        codeValueId: null,
        laneIndex: 1,
      });
    });

    it('answers 409 SWIMLANE_SOURCE_CHANGED when the source is not that code, and writes nothing', async () => {
      const { actor, planId, area, trade, l1, a, b } = await seed();
      const body = (typeId: string) => ({
        activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])],
        lanes: [{ id: b.id, version: b.version, laneIndex: 1 }],
        lanesCodeTypeId: typeId,
      });
      const wrongType = await write(actor, planId, body(trade.id)).expect(409);
      expect(wrongType.body.error.details.reason).toBe('SWIMLANE_SOURCE_CHANGED');
      await prisma.plan.update({
        where: { id: planId },
        data: { swimlaneSource: 'MANUAL', swimlaneCodeTypeId: null },
      });
      await write(actor, planId, body(area.id)).expect(409);
      expect(await codeLanes(planId)).toHaveLength(0);
      expect(await prisma.codeValueAssignment.count({ where: { planId } })).toBe(0);
    });

    it('answers 409 for a stale lane-only row and writes nothing, not even the mover', async () => {
      const { actor, planId, area, l1, a, b } = await seed();
      const res = await write(actor, planId, {
        activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])],
        lanes: [{ id: b.id, version: b.version + 7, laneIndex: 1 }],
        lanesCodeTypeId: area.id,
      }).expect(409);
      expect(res.body.error.details.reason).toBe('STALE_VERSION');
      expect(await prisma.codeValueAssignment.count({ where: { planId } })).toBe(0);
      expect(await codeLanes(planId)).toHaveLength(0);
    });

    it('answers 404 for a foreign or unknown lane-only id, never told apart', async () => {
      const { actor, planId, area, l1, a } = await seed();
      const res = await write(actor, planId, {
        activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])],
        lanes: [{ id: '00000000-0000-4000-8000-000000000009', version: 1, laneIndex: 1 }],
        lanesCodeTypeId: area.id,
      }).expect(404);
      expect(res.body.error.message).toBe('Activity not found in this plan.');
    });

    it('reads another plan’s activity, as a lane-only row or a type, as missing, never told apart', async () => {
      const { actor, planId, area, l1, a } = await seed();
      const otherPlan = await makePlan(actor, 'acme', 'Second');
      await actor.agent.post(lockUrl(otherPlan)).send({}).expect(200);
      const elsewhere = await createActivity(actor, otherPlan, 'Elsewhere');
      const otherType = await createType(actor, otherPlan, 'Other Area');
      const mover = row(a, [{ codeTypeId: area.id, codeValueId: l1.id }]);
      const asLane = await write(actor, planId, {
        activities: [mover],
        lanes: [{ id: elsewhere.id, version: elsewhere.version, laneIndex: 1 }],
        lanesCodeTypeId: area.id,
      }).expect(404);
      expect(asLane.body.error.message).toBe('Activity not found in this plan.');
      // A type of another plan is not the plan's source, so it is the source-changed 409.
      await write(actor, planId, {
        activities: [mover],
        lanes: [{ id: a.id, version: a.version, laneIndex: 1 }],
        lanesCodeTypeId: otherType.id,
      }).expect(409);
      expect(await prisma.codeSwimlaneLane.count()).toBe(0);
      expect(await prisma.codeValueAssignment.count()).toBe(0);
    });

    it('reads another organisation’s activity in lanes as missing, and writes nothing', async () => {
      const { actor, planId, area, l1, a } = await seed();
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);
      const theirPlan = await makePlan(outsider, 'other-co', 'Theirs');
      await outsider.agent.post(lockUrl(theirPlan, 'other-co')).send({}).expect(200);
      const theirs = (
        await outsider.agent
          .post(`${planUrl(theirPlan, 'other-co')}/activities`)
          .send({ name: 'Theirs' })
          .expect(201)
      ).body.data as ActivityBody;
      const res = await write(actor, planId, {
        activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])],
        lanes: [{ id: theirs.id, version: theirs.version, laneIndex: 1 }],
        lanesCodeTypeId: area.id,
      }).expect(404);
      expect(res.body.error.message).toBe('Activity not found in this plan.');
      expect(await prisma.codeSwimlaneLane.count()).toBe(0);
    });

    it('refuses an id twice in lanes, lanes without a type, and an id with two versions', async () => {
      const { actor, planId, area, l1, a, b } = await seed();
      const mover = row(a, [{ codeTypeId: area.id, codeValueId: l1.id }]);
      const twice = await write(actor, planId, {
        activities: [mover],
        lanes: [
          { id: b.id, version: b.version, laneIndex: 1 },
          { id: b.id, version: b.version, laneIndex: 2 },
        ],
        lanesCodeTypeId: area.id,
      }).expect(422);
      expect(twice.body.error.details.reason).toBe('DUPLICATE_LANES_ACTIVITY_ID');
      const noType = await write(actor, planId, {
        activities: [mover],
        lanes: [{ id: b.id, version: b.version, laneIndex: 1 }],
      }).expect(422);
      expect(noType.body.error.details.reason).toBe('LANES_CODE_TYPE_REQUIRED');
      const disagree = await write(actor, planId, {
        activities: [mover],
        lanes: [{ id: a.id, version: a.version + 1, laneIndex: 1 }],
        lanesCodeTypeId: area.id,
      }).expect(422);
      expect(disagree.body.error.details.reason).toBe('LANES_VERSION_DISAGREES');
    });

    it('refuses a union of 2,001 activities with 422, before any lock', async () => {
      const { actor, planId, area, l1, a } = await seed();
      const lanes = Array.from({ length: 2000 }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        version: 1,
        laneIndex: 0,
      }));
      const res = await write(actor, planId, {
        activities: [row(a, [{ codeTypeId: area.id, codeValueId: l1.id }])],
        lanes,
        lanesCodeTypeId: area.id,
      }).expect(422);
      expect(res.body.error.details.reason).toBe('CODES_BATCH_TOO_LARGE');
    });

    it('sends no lane for a write without lanes, and records code changes only', async () => {
      const { actor, planId, area, l1, a } = await seed();
      await setCode(actor, planId, a, area.id, l1.id);
      expect(await codeLanes(planId)).toHaveLength(0);
    });
  });

  describe('create with codes', () => {
    const create = (actor: Actor, planId: string, body: object) =>
      actor.agent.post(activitiesUrl(planId)).send({ name: 'New', ...body });

    it('assigns live values in the create transaction and answers with them', async () => {
      const { actor, planId, area, trade, l1, mech } = await seed();
      const res = await create(actor, planId, {
        codes: [
          { codeTypeId: area.id, codeValueId: l1.id },
          { codeTypeId: trade.id, codeValueId: mech.id },
        ],
      }).expect(201);
      const made = res.body.data as ActivityBody;
      expect(made.codes).toHaveLength(2);
      expect(made.codeSwimlaneLanes).toEqual([]);
      expect(await prisma.codeValueAssignment.count({ where: { activityId: made.id } })).toBe(2);
      expect(await codeLanes(planId)).toHaveLength(0);
    });

    it('refuses a wrong-type value, a deleted value, a foreign type and two of one type, writing nothing', async () => {
      const { actor, planId, area, trade, l1, l2, mech } = await seed();
      const before = await prisma.activity.count({ where: { planId } });
      const wrong = await create(actor, planId, {
        codes: [{ codeTypeId: area.id, codeValueId: mech.id }],
      }).expect(422);
      expect(wrong.body.error.details.reason).toBe('CODE_VALUE_WRONG_TYPE');
      await prisma.codeValue.update({ where: { id: l2.id }, data: { deletedAt: new Date() } });
      const gone = await create(actor, planId, {
        codes: [{ codeTypeId: area.id, codeValueId: l2.id }],
      }).expect(422);
      expect(gone.body.error.details.reason).toBe('CODE_VALUE_DELETED');
      await create(actor, planId, {
        codes: [{ codeTypeId: '00000000-0000-4000-8000-000000000003', codeValueId: l1.id }],
      }).expect(404);
      const dup = await create(actor, planId, {
        codes: [
          { codeTypeId: trade.id, codeValueId: mech.id },
          { codeTypeId: trade.id, codeValueId: null },
        ],
      }).expect(422);
      expect(dup.body.error.details.reason).toBe('DUPLICATE_CODES_TYPE_ID');
      expect(await prisma.activity.count({ where: { planId } })).toBe(before);
    });

    it('answers 422 for 101 entries and treats codes: [] as no codes', async () => {
      const { actor, planId } = await seed();
      const many = Array.from({ length: 101 }, (_, i) => ({
        codeTypeId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        codeValueId: null,
      }));
      await create(actor, planId, { codes: many }).expect(422);
      await create(actor, planId, { codes: [] }).expect(201);
    });

    it('answers 404 for another plan’s type, and 403 for a Viewer', async () => {
      const { actor, orgId, planId, l1 } = await seed();
      const otherPlan = await makePlan(actor, 'acme', 'Other');
      await actor.agent
        .post(`${planUrl(otherPlan)}/edit-lock`)
        .send({})
        .expect(200);
      const foreign = await createType(actor, otherPlan, 'Elsewhere');
      await create(actor, planId, {
        codes: [{ codeTypeId: foreign.id, codeValueId: l1.id }],
      }).expect(404);
      const viewer = await addMember(orgId, 'VIEWER', 'viewer@example.com');
      await create(viewer, planId, {}).expect(403);
    });
  });

  describe('the activity list', () => {
    it('carries codeSwimlaneLanes for each live type, and omits a deleted type’s rows', async () => {
      const { actor, planId, area, trade, l1, mech, a } = await seed();
      const placed = await setCode(actor, planId, a, area.id, l1.id);
      await actor.agent
        .patch(`${activitiesUrl(planId)}/positions`)
        .send({ positions: [{ id: a.id, version: placed.version, swimlane: { laneIndex: 6 } }] })
        .expect(200);
      await prisma.codeSwimlaneLane.create({
        data: {
          organizationId: (await prisma.plan.findUniqueOrThrow({ where: { id: planId } }))
            .organizationId,
          planId,
          activityId: a.id,
          codeTypeId: trade.id,
          codeValueId: mech.id,
          laneIndex: 9,
        },
      });
      const listed = (await listActivities(actor, planId)).find((r) => r.id === a.id)!;
      expect(listed.codeSwimlaneLanes?.map((l) => [l.codeTypeId, l.laneIndex]).sort()).toEqual(
        [
          [area.id, 6],
          [trade.id, 9],
        ].sort(),
      );
      await prisma.codeType.update({ where: { id: trade.id }, data: { deletedAt: new Date() } });
      const again = (await listActivities(actor, planId)).find((r) => r.id === a.id)!;
      expect(again.codeSwimlaneLanes?.map((l) => l.codeTypeId)).toEqual([area.id]);
    });

    it('carries no codeSwimlaneLanes key at all on a plan with no live code type (SC-2)', async () => {
      const { actor, planId } = await setup();
      await createActivity(actor, planId, 'Only');
      const res = await actor.agent.get(activitiesUrl(planId)).expect(200);
      const first = (res.body.data as Record<string, unknown>[])[0]!;
      expect('codeSwimlaneLanes' in first).toBe(false);
      expect('codes' in first).toBe(false);
      expect(JSON.stringify(res.body.data)).not.toContain('codeSwimlane');
    });
  });
});
