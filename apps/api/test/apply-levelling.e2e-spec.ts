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
 * **`docs/specs/apply-levelled-dates/`: the API cases A1-A4 for `GET …/schedule/levelling-application`.**
 *
 * Written in M0 as `it.fails` while the route did not exist (docs/TESTING.md forbids a skipped test and
 * `main` cannot carry a red one); M1 added the route and flipped them to plain `it`, with no assertion
 * changed.
 *
 * **Each case opens with a positive assertion on the route** (a Planner gets 200), so none can pass
 * for the wrong reason: a missing route answers 404 to everyone, which would otherwise satisfy A3's
 * "another organisation's plan is 404" on its own (ADR-0110).
 *
 * Every plan is built through the public REST API (ADR-0066). It is the `capability-levelling` shape
 * (three 3-day lifts on one crane, priorities 1 to 3) on an all-days-work calendar, so a day offset is
 * a calendar day and the expected dates read straight off the arithmetic.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface Ref {
  id: string;
  version: number;
}

interface PlacementRow {
  id: string;
  version: number;
  constraintType: string | null;
  constraintDate: string | null;
  visualStart: string | null;
  laneIndex: number | null;
}

describe.skipIf(!hasDatabase)('Apply levelled dates — the preview read (e2e)', () => {
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

  beforeEach(async () => {
    // The preview route is throttled to 10 per 60 s; this file reads it more often than that. Emptying
    // the store is isolation, not a weakened bound (`throttle-reset.ts`): nothing here asserts a 429.
    resetThrottleCounters(throttlerStorage);
    await clearDomainData(prisma);
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await app?.close();
  });

  const orgBase = '/api/v1/organizations/acme';
  const previewUrl = (planId: string, org = 'acme') =>
    `/api/v1/organizations/${org}/plans/${planId}/schedule/levelling-application`;
  const placementsUrl = (planId: string) => `${orgBase}/plans/${planId}/activities/placements`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  interface Lift {
    name: string;
    days: number;
    priority: number;
    resource: 'Crane' | 'Pump';
    constraint?: { type: string; date: string };
  }

  /** Three 3-day lifts on one crane, levelling on. `bConstraint` is carried by the second lift. */
  function seedLevelledPlan(bConstraint?: { type: string; date: string }, levelResources = true) {
    const lifts: Lift[] = ['A', 'B', 'C'].map((name, index) => ({
      name,
      days: 3,
      priority: index + 1,
      resource: 'Crane',
      ...(name === 'B' && bConstraint ? { constraint: bConstraint } : {}),
    }));
    return seedPlan(lifts, [], levelResources);
  }

  /**
   * The lifts on a crane and a pump, each resource capped at one unit, levelling per `levelResources`.
   * `links` are finish-to-start pairs of lift names. `refs` is in lift order; `byName` finds one by name.
   */
  async function seedPlan(
    lifts: readonly Lift[],
    links: readonly (readonly [string, string])[],
    levelResources: boolean,
  ) {
    const actor = await signUp('planner@example.com');
    const org = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent
      .post(`${orgBase}/clients`)
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`${orgBase}/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`${orgBase}/projects/${project.body.data.id as string}/plans`)
      .send({ name: 'Levelled', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent
      .patch(`${orgBase}/plans/${planId}`)
      .send({ calendarId: null, version: 1 })
      .expect(200);
    const resourceIds = new Map<string, string>();
    for (const name of new Set(lifts.map((l) => l.resource))) {
      const created = await actor.agent
        .post(`${orgBase}/resources`)
        .send({ name, kind: 'EQUIPMENT', maxUnitsPerHour: 1 })
        .expect(201);
      resourceIds.set(name, created.body.data.id as string);
    }
    const refs: Ref[] = [];
    const byName = new Map<string, Ref>();
    for (const lift of lifts) {
      const extra = lift.constraint
        ? { constraintType: lift.constraint.type, constraintDate: lift.constraint.date }
        : {};
      const created = await actor.agent
        .post(`${orgBase}/plans/${planId}/activities`)
        .send({
          name: lift.name,
          durationDays: lift.days,
          levelingPriority: lift.priority,
          ...extra,
        })
        .expect(201);
      const id = created.body.data.id as string;
      await actor.agent
        .post(`${orgBase}/activities/${id}/assignments`)
        .send({ resourceId: resourceIds.get(lift.resource)!, unitsPerHour: 1 })
        .expect(201);
      const ref = { id, version: created.body.data.version as number };
      refs.push(ref);
      byName.set(lift.name, ref);
    }
    for (const [from, to] of links) {
      await actor.agent
        .post(`${orgBase}/plans/${planId}/dependencies`)
        .send({ predecessorId: byName.get(from)!.id, successorId: byName.get(to)!.id, type: 'FS' })
        .expect(201);
    }
    if (levelResources) await setLevelling(actor, planId, true);
    await actor.agent.post(`${orgBase}/plans/${planId}/schedule/recalculate`).send({}).expect(200);
    return { actor, orgId: org.body.data.id as string, planId, refs, byName };
  }

  async function setLevelling(actor: Actor, planId: string, levelResources: boolean) {
    const current = await actor.agent.get(`${orgBase}/plans/${planId}`).expect(200);
    await actor.agent
      .patch(`${orgBase}/plans/${planId}`)
      .send({ levelResources, version: current.body.data.version as number })
      .expect(200);
  }

  it('A1: the rows the preview returns, written and recalculated, leave what it predicted', async () => {
    const { actor, planId, refs } = await seedLevelledPlan();
    const preview = await actor.agent.get(previewUrl(planId)).expect(200);
    const { rows, remainingAfterApply } = preview.body.data as {
      rows: PlacementRow[];
      remainingAfterApply: number;
    };
    // The plan starts Thursday 1 January on an all-days calendar; the three lifts take three days each
    // in priority order, so B is freed on the 4th and C on the 7th. A is first and never moves (P5).
    expect(rows.map((r) => [r.id, r.visualStart])).toEqual([
      [refs[1]!.id, '2026-01-04'],
      [refs[2]!.id, '2026-01-07'],
    ]);
    expect(rows.map((r) => r.id)).not.toContain(refs[0]!.id);
    expect(remainingAfterApply).toBe(0);
    await actor.agent.patch(placementsUrl(planId)).send({ placements: rows }).expect(200);
    const recalculated = await actor.agent
      .post(`${orgBase}/plans/${planId}/schedule/recalculate`)
      .send({})
      .expect(200);
    expect(recalculated.body.data.leveledActivityCount).toBe(remainingAfterApply);
  });

  it('A1b: a preview that leaves a clash says so, and the recalculation agrees', async () => {
    // Q and P share the crane, R, S and T the pump, and S follows P. P is levelled to day 3 and finishes
    // on day 6, which is later than S's own ghost (day 4), so S is left to its logic: it then runs on
    // day 6 and pushes T, which the apply wrote on day 6, back again. One lift is still levelled.
    const lift = (name: string, days: number, priority: number, resource: 'Crane' | 'Pump') => ({
      name,
      days,
      priority,
      resource,
    });
    const { actor, planId, byName } = await seedPlan(
      [
        lift('Q', 3, 1, 'Crane'),
        lift('P', 3, 2, 'Crane'),
        lift('R', 4, 1, 'Pump'),
        lift('S', 2, 2, 'Pump'),
        lift('T', 2, 3, 'Pump'),
      ],
      [['P', 'S']],
      true,
    );
    const preview = await actor.agent.get(previewUrl(planId)).expect(200);
    const { rows, remainingAfterApply, leftToLogic } = preview.body.data as {
      rows: PlacementRow[];
      remainingAfterApply: number;
      leftToLogic: { id: string; name: string }[];
    };
    expect(rows.map((r) => [r.id, r.visualStart])).toEqual([
      [byName.get('P')!.id, '2026-01-04'],
      [byName.get('T')!.id, '2026-01-07'],
    ]);
    expect(leftToLogic).toEqual([{ id: byName.get('S')!.id, name: 'S' }]);
    expect(remainingAfterApply).toBe(1);
    await actor.agent.patch(placementsUrl(planId)).send({ placements: rows }).expect(200);
    const recalculated = await actor.agent
      .post(`${orgBase}/plans/${planId}/schedule/recalculate`)
      .send({})
      .expect(200);
    expect(recalculated.body.data.leveledActivityCount).toBe(1);
    expect(recalculated.body.data.leveledActivityCount).toBe(remainingAfterApply);
  });

  it('A2: the preview writes nothing', async () => {
    const { actor, planId, refs } = await seedLevelledPlan();
    const read = () =>
      prisma.activity.findMany({
        where: { id: { in: refs.map((r) => r.id) } },
        orderBy: { id: 'asc' },
        select: { id: true, version: true, visualStart: true, updatedAt: true },
      });
    const before = await read();
    await actor.agent.get(previewUrl(planId)).expect(200);
    expect(await read()).toEqual(before);
  });

  it('A3: a Planner may read it; a Contributor and a Viewer may not; another organisation cannot', async () => {
    const { actor, orgId, planId } = await seedLevelledPlan();
    await actor.agent.get(previewUrl(planId)).expect(200);

    const contributor = await signUp('contrib@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.get(previewUrl(planId)).expect(403);

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(previewUrl(planId)).expect(403);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(previewUrl(planId, 'other')).expect(404);
  });

  it('A4: a row carries the activity constraint unchanged, and none where there is none', async () => {
    const { actor, planId, refs } = await seedLevelledPlan({ type: 'SNET', date: '2026-01-02' });
    const preview = await actor.agent.get(previewUrl(planId)).expect(200);
    const rows = (preview.body.data as { rows: PlacementRow[] }).rows;
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(refs[1]!.id)).toMatchObject({
      constraintType: 'SNET',
      constraintDate: '2026-01-02',
    });
    // A is first in line and never moves, so it has no row; C is delayed and has no constraint to carry.
    expect(byId.has(refs[0]!.id)).toBe(false);
    expect(byId.get(refs[2]!.id)).toMatchObject({ constraintType: null, constraintDate: null });
    await actor.agent.patch(placementsUrl(planId)).send({ placements: rows }).expect(200);
    const stored = await prisma.activity.findUniqueOrThrow({
      where: { id: refs[1]!.id },
      select: { constraintType: true },
    });
    expect(stored.constraintType).toBe('SNET');
  });

  it('a plan that does not level answers 200 with nothing to apply, and rows once it does', async () => {
    const { actor, planId } = await seedLevelledPlan(undefined, false);
    const off = await actor.agent.get(previewUrl(planId)).expect(200);
    expect(off.body.data).toMatchObject({ rows: [], items: [], remainingAfterApply: 0 });

    await setLevelling(actor, planId, true);
    const on = await actor.agent.get(previewUrl(planId)).expect(200);
    expect((on.body.data as { rows: unknown[] }).rows).toHaveLength(2);
  });

  it('a request with no session is 401, where a Planner gets 200', async () => {
    const { actor, planId } = await seedLevelledPlan();
    await actor.agent.get(previewUrl(planId)).expect(200);
    await request(app.getHttpServer()).get(previewUrl(planId)).expect(401);
  });

  it('P7: applying the rows leaves a second preview with nothing to apply', async () => {
    const { actor, planId } = await seedLevelledPlan();
    const first = await actor.agent.get(previewUrl(planId)).expect(200);
    const { rows } = first.body.data as { rows: PlacementRow[] };
    expect(rows).toHaveLength(2);
    await actor.agent.patch(placementsUrl(planId)).send({ placements: rows }).expect(200);
    const second = await actor.agent.get(previewUrl(planId)).expect(200);
    expect(second.body.data).toMatchObject({ rows: [], items: [], remainingAfterApply: 0 });
  });

  // A plan with no start date answers 422 PLAN_START_REQUIRED, and is not tested here: `plans.planned_start`
  // is NOT NULL since ADR-0033 M1, so no plan without one can be built through the API or the database.
  // `schedule.service.levelling-application.spec.ts` covers the guard with a mocked plan.
});
