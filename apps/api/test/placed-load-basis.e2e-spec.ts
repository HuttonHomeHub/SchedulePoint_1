import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { HISTOGRAM_UNPLACED_GOLDEN } from './fixtures/placed-load-histogram-golden';

/**
 * **M0 of `docs/specs/placed-load-basis/` (TECH_DEBT #413): the product-level red cases and the
 * "nothing changes" reference results**, recorded before any behaviour change.
 *
 * Every plan is built through the public REST API (ADR-0066): the engine suites prove the arithmetic
 * and cannot see a DTO, a write path or a read serialisation. The resource histogram and levelling
 * both read where the bar is drawn (the histogram from `visualEffectiveStart`/`Finish`, falling back
 * to the early pair as a whole).
 *
 * H1 and H3 assert the PLACED behaviour; they were `it.fails` until M2 flipped them, as M1 did LV1. docs/TESTING.md forbids a skipped test and `main` cannot carry a red one. Each is
 * paired with a plain precondition asserting the placed and network dates differ (ADR-0093), so a
 * case cannot be satisfied by a fixture in which the two happen to agree.
 *
 * H2, LV1's unplaced twin and LV2 were green before M1 and stay green: they are literals recorded
 * against the code at the head of this commit's parent, not derived from anything M1/M2 will change.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const DAY = 1440;

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface HistogramBody {
  granularity: string;
  buckets: { start: string; end: string }[];
  series: { resourceId: string; values: number[]; total: number }[];
  total: number;
  hasMore: boolean;
  curveNormalisedCount: number;
}

/**
 * LV2's reference: the metric-12 row for `seedLevelledPlanWithPlacedCarrier`, recorded against the
 * code before any #413 change (`e83fc56`) by writing the response to a scratch file and pasting it
 * here, with the three random activity ids replaced by their names. The carrier is C, drawn at
 * 2026-01-11 but measured on the NETWORK: the control completion is 2026-01-10 (B levelled behind A,
 * then C after it), not the 2026-01-14 the bar is drawn at. Q2 keeps it that way.
 *
 * **Two dates moved when levelling began to follow the links** (`docs/specs/logic-aware-levelling/`
 * M2): the golden recorded 2026-01-07 and 2027-08-30, which were C's EARLY finishes, because C held no
 * resource and so had no levelled position behind the delayed B. C is now levelled to start where B's
 * levelled finish puts it, three days later in both runs. The verdict, the carrier and the 600-day
 * movement are unchanged, which is what this case is for.
 */
const CRITICAL_PATH_TEST_PLACED_CARRIER_GOLDEN = {
  id: 'CRITICAL_PATH_TEST',
  ordinal: 12,
  name: 'Critical Path Test',
  verdict: 'PASS',
  reason: null,
  measured: { count: null, denominator: null, percent: null, ratio: 1 },
  threshold: null,
  detail: {
    injectedDays: 600,
    deltaDays: 600,
    toleranceDays: 5,
    perturbedActivityId: 'B',
    perturbedActivityCode: null,
    perturbedActivityName: 'B',
    completionActivityId: 'C',
    completionActivityName: 'C',
    controlCompletionFinish: '2026-01-10',
    perturbedCompletionFinish: '2027-09-02',
  },
  offenderCount: 0,
  offendersTruncated: false,
  offenders: [],
};

describe.skipIf(!hasDatabase)('Placed load basis — reference results and red cases (e2e)', () => {
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

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await app?.close();
  });

  const orgBase = '/api/v1/organizations/acme';
  const planUrl = (planId: string, tail: string) => `${orgBase}/plans/${planId}/${tail}`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /**
   * A plan on an all-days-work calendar (the org's default Standard calendar is cleared), so a day
   * offset is a calendar day and every date below reads straight off the arithmetic. The data date is
   * the planned start.
   */
  async function makePlan(
    actor: Actor,
    plannedStart: string,
  ): Promise<{ planId: string; planVersion: number }> {
    await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent
      .post(`${orgBase}/clients`)
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`${orgBase}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`${orgBase}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Placed load', plannedStart })
      .expect(201);
    const planId = plan.body.data.id as string;
    const patched = await actor.agent
      .patch(`${orgBase}/plans/${planId}`)
      .send({ calendarId: null, version: 1 })
      .expect(200);
    return { planId, planVersion: patched.body.data.version as number };
  }

  async function addActivity(
    actor: Actor,
    planId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent.post(planUrl(planId, 'activities')).send(body).expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  async function addResource(actor: Actor, body: Record<string, unknown>): Promise<string> {
    const res = await actor.agent.post(`${orgBase}/resources`).send(body).expect(201);
    return res.body.data.id as string;
  }

  async function assign(
    actor: Actor,
    activityId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await actor.agent
      .post(`${orgBase}/activities/${activityId}/assignments`)
      .send(body)
      .expect(201);
  }

  const recalculate = (actor: Actor, planId: string) =>
    actor.agent.post(planUrl(planId, 'schedule/recalculate')).send({}).expect(200);

  const histogram = async (
    actor: Actor,
    planId: string,
    granularity: 'DAY' | 'WEEK' = 'DAY',
  ): Promise<HistogramBody> => {
    const res = await actor.agent
      .get(`${planUrl(planId, 'schedule/resource-histogram')}?granularity=${granularity}`)
      .expect(200);
    // The series page in `data`; the shared axis and the counters ride in `meta` (controller docblock).
    return { ...(res.body.meta as Omit<HistogramBody, 'series'>), series: res.body.data };
  };

  const ymd = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;

  /** The days on which a series carries load, as `YYYY-MM-DD` keyed by the bucket start. */
  const loadedDays = (h: HistogramBody, resourceId: string): Record<string, number> => {
    const series = h.series.find((s) => s.resourceId === resourceId)!;
    return Object.fromEntries(
      h.buckets.flatMap((b, i) => (series.values[i]! > 0 ? [[b.start, series.values[i]!]] : [])),
    );
  };

  // ── H1 / H3: the histogram follows a drag ───────────────────────────────────────────────────────

  /** A (5 days, 10 units, UNIFORM) dragged to D+10. Data date D = 2026-01-01. */
  async function seedDraggedActivity() {
    const actor = await signUp('h1@example.com');
    const { planId } = await makePlan(actor, '2026-01-01');
    const a = await addActivity(actor, planId, {
      name: 'A',
      durationDays: 5,
      visualStart: '2026-01-11',
    });
    const crew = await addResource(actor, { name: 'Crew', kind: 'LABOUR' });
    await assign(actor, a.id, { resourceId: crew, budgetedUnits: 10, curveType: 'UNIFORM' });
    await recalculate(actor, planId);
    return { actor, planId, activityId: a.id, crew };
  }

  // The histogram spreads `[start, finish)` and the row carries the INCLUSIVE display finish, so the
  // service hands it the boundary that closes the last day: a 5-day bar carries its 10 units as 2 a day
  // over all five days (#423). Until 2026-09-30 it counted four days at 2.5 and none on the fifth; the
  // spec's H1 always said five days at 2 (m0-measurement.md records the convention it was found in).
  const EARLY_SPAN = {
    '2026-01-01': 2,
    '2026-01-02': 2,
    '2026-01-03': 2,
    '2026-01-04': 2,
    '2026-01-05': 2,
  };
  const PLACED_SPAN = {
    '2026-01-11': 2,
    '2026-01-12': 2,
    '2026-01-13': 2,
    '2026-01-14': 2,
    '2026-01-15': 2,
  };

  it('H1 precondition: A is drawn 10 days after its network start', async () => {
    const { activityId } = await seedDraggedActivity();
    const row = await prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
      select: { earlyStart: true, visualEffectiveStart: true, visualEffectiveFinish: true },
    });
    expect(ymd(row.earlyStart)).toBe('2026-01-01');
    expect(ymd(row.visualEffectiveStart)).toBe('2026-01-11');
    expect(ymd(row.visualEffectiveFinish)).toBe('2026-01-15');
  });

  // Red before #413 M2: the histogram was built from `earlyStart`/`earlyFinish`, so the load sat on
  // D..D+3 (recorded: EARLY_SPAN) while the bar is drawn from D+10. It now follows the bar and the
  // total is still 10 (units are conserved).
  it('H1: the load sits where the bar is drawn, and the total is still 10', async () => {
    const { actor, planId, crew } = await seedDraggedActivity();
    const h = await histogram(actor, planId);
    expect(loadedDays(h, crew)).toEqual(PLACED_SPAN);
    expect(h.series.find((s) => s.resourceId === crew)!.total).toBe(10);
  });

  // Red before M2 for the same reason as H1 (its first assertion). Once the placed half holds, nulling
  // either end of the pair must send the WHOLE span back to the network dates, never half on each
  // (US-1 pair fallback).
  it('H3: a null placed pair falls back to the network span as a whole', async () => {
    const { actor, planId, activityId, crew } = await seedDraggedActivity();
    expect(loadedDays(await histogram(actor, planId), crew)).toEqual(PLACED_SPAN);
    await prisma.activity.update({
      where: { id: activityId },
      data: { visualEffectiveStart: null },
    });
    expect(loadedDays(await histogram(actor, planId), crew)).toEqual(EARLY_SPAN);
    await prisma.activity.update({
      where: { id: activityId },
      data: { visualEffectiveStart: new Date('2026-01-11'), visualEffectiveFinish: null },
    });
    expect(loadedDays(await histogram(actor, planId), crew)).toEqual(EARLY_SPAN);
  });

  // ── H2: the unplaced histogram, recorded ────────────────────────────────────────────────────────

  /**
   * A plan with NO placement: plain tasks, an assignment with a join lag, a BELL curve, a started task
   * (actual start before the data date) and a complete task with no successor. Recorded, whole, against
   * the code before any #413 change.
   */
  async function seedUnplacedPlan() {
    const actor = await signUp('h2@example.com');
    const { planId } = await makePlan(actor, '2026-01-05');
    const t1 = await addActivity(actor, planId, { name: 'T1', durationDays: 4 });
    const t2 = await addActivity(actor, planId, { name: 'T2', durationDays: 6 });
    const t3 = await addActivity(actor, planId, { name: 'T3', durationDays: 5 });
    const started = await addActivity(actor, planId, { name: 'Started', durationDays: 4 });
    const done = await addActivity(actor, planId, { name: 'Done', durationDays: 4 });
    await actor.agent
      .post(planUrl(planId, 'dependencies'))
      .send({ predecessorId: t1.id, successorId: t2.id, type: 'FS' })
      .expect(201);

    const crew = await addResource(actor, { name: 'Crew', kind: 'LABOUR' });
    const crane = await addResource(actor, { name: 'Crane', kind: 'EQUIPMENT' });
    const rig = await addResource(actor, { name: 'Rig', kind: 'EQUIPMENT' });
    await assign(actor, t1.id, { resourceId: crew, budgetedUnits: 8 });
    await assign(actor, t2.id, { resourceId: crane, budgetedUnits: 12, lagMinutes: 2 * DAY });
    await assign(actor, t3.id, { resourceId: rig, budgetedUnits: 20, curveType: 'BELL' });
    await assign(actor, started.id, { resourceId: crew, budgetedUnits: 16 });
    await assign(actor, done.id, { resourceId: crane, budgetedUnits: 6 });

    await actor.agent
      .patch(`${orgBase}/activities/${started.id}/progress`)
      .send({ percentComplete: 50, actualStart: '2026-01-02', version: started.version })
      .expect(200);
    await actor.agent
      .patch(`${orgBase}/activities/${done.id}/progress`)
      .send({
        percentComplete: 100,
        actualStart: '2026-01-02',
        actualFinish: '2026-01-03',
        version: done.version,
      })
      .expect(200);
    await recalculate(actor, planId);
    return {
      actor,
      planId,
      names: new Map([
        [crew, 'Crew'],
        [crane, 'Crane'],
        [rig, 'Rig'],
      ]),
    };
  }

  it('H2: an unplaced plan reads exactly as it did before the placed basis', async () => {
    const { actor, planId, names } = await seedUnplacedPlan();
    const rows = await prisma.activity.findMany({
      where: { planId },
      select: { name: true, earlyStart: true, visualEffectiveStart: true },
    });
    // The fixture is only worth its shape: nothing is placed, so the two bases agree everywhere.
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(ymd(r.visualEffectiveStart), r.name).toBe(ymd(r.earlyStart));

    const read = async (granularity: 'DAY' | 'WEEK') => {
      const h = await histogram(actor, planId, granularity);
      return {
        ...h,
        series: h.series
          .map((s) => ({ ...s, resourceId: names.get(s.resourceId)! }))
          .sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
      };
    };
    expect({ day: await read('DAY'), week: await read('WEEK') }).toEqual(HISTOGRAM_UNPLACED_GOLDEN);
  });

  // ── LV1 / LV2: levelling and metric 12 ──────────────────────────────────────────────────────────

  /**
   * A and B, 3 days each, both on one capacity-1 crane, no logic; A has priority. With `placeB` B is
   * dragged to D+5 (2026-01-06), so as drawn they no longer overlap. Levelling is switched on last
   * (the plan is at the version `makePlan` left it), as the schedule suite does.
   */
  async function seedLevelledPair(placeB: boolean) {
    const actor = await signUp(`lv1-${placeB ? 'placed' : 'unplaced'}@example.com`);
    const { planId, planVersion } = await makePlan(actor, '2026-01-01');
    const a = await addActivity(actor, planId, { name: 'A', durationDays: 3, levelingPriority: 1 });
    const b = await addActivity(actor, planId, {
      name: 'B',
      durationDays: 3,
      levelingPriority: 2,
      ...(placeB ? { visualStart: '2026-01-06' } : {}),
    });
    const crane = await addResource(actor, {
      name: 'Crane',
      kind: 'EQUIPMENT',
      maxUnitsPerHour: 1,
    });
    for (const id of [a.id, b.id]) await assign(actor, id, { resourceId: crane, unitsPerHour: 1 });
    await actor.agent
      .patch(`${orgBase}/plans/${planId}`)
      .send({ levelResources: true, version: planVersion })
      .expect(200);
    await recalculate(actor, planId);
    const read = async (id: string) =>
      prisma.activity.findUniqueOrThrow({
        where: { id },
        select: {
          earlyStart: true,
          visualEffectiveStart: true,
          leveledStart: true,
          leveledFinish: true,
          levelingDelayMinutes: true,
        },
      });
    return { a: await read(a.id), b: await read(b.id) };
  }

  it('LV1 precondition: B is drawn 5 days after its network start, clear of A', async () => {
    const { b } = await seedLevelledPair(true);
    expect(ymd(b.earlyStart)).toBe('2026-01-01');
    expect(ymd(b.visualEffectiveStart)).toBe('2026-01-06');
  });

  // Red before #413 M1: levelling read B's network start, saw a clash with A, and delayed B behind it
  // (recorded: leveledStart 2026-01-04, levelingDelayMinutes 3 * 1440). Now B stays where it is drawn:
  // no delay, and the levelled start is the drawn start.
  it('LV1: a clash the planner separated by hand is not levelled again', async () => {
    const { a, b } = await seedLevelledPair(true);
    expect(a.levelingDelayMinutes).toBe(0);
    expect(b.levelingDelayMinutes).toBe(0);
    expect(ymd(b.leveledStart)).toBe('2026-01-06');
  });

  // Gate C at the product: with no placement the two bases agree, so levelling reads the same after
  // M1 as it does today. Green today; must stay green.
  it('LV1 unplaced twin: with nothing placed, B is levelled behind A exactly as before', async () => {
    const { a, b } = await seedLevelledPair(false);
    expect(ymd(a.leveledStart)).toBe('2026-01-01');
    expect(a.levelingDelayMinutes).toBe(0);
    expect(ymd(b.earlyStart)).toBe('2026-01-01');
    expect(ymd(b.visualEffectiveStart)).toBe('2026-01-01');
    expect(ymd(b.leveledStart)).toBe('2026-01-04');
    expect(ymd(b.leveledFinish)).toBe('2026-01-06');
    expect(b.levelingDelayMinutes).toBe(3 * DAY);
  });

  /**
   * LV2 (Q2: metric 12 stays network-anchored). A levelled plan whose completion carrier is placed:
   * A and B clash on the crane, C follows B and is dragged to D+10.
   */
  async function seedLevelledPlanWithPlacedCarrier() {
    const actor = await signUp('lv2@example.com');
    const { planId, planVersion } = await makePlan(actor, '2026-01-01');
    const a = await addActivity(actor, planId, { name: 'A', durationDays: 3, levelingPriority: 1 });
    const b = await addActivity(actor, planId, { name: 'B', durationDays: 3, levelingPriority: 2 });
    const c = await addActivity(actor, planId, {
      name: 'C',
      durationDays: 4,
      visualStart: '2026-01-11',
    });
    await actor.agent
      .post(planUrl(planId, 'dependencies'))
      .send({ predecessorId: b.id, successorId: c.id, type: 'FS' })
      .expect(201);
    const crane = await addResource(actor, {
      name: 'Crane',
      kind: 'EQUIPMENT',
      maxUnitsPerHour: 1,
    });
    for (const id of [a.id, b.id]) await assign(actor, id, { resourceId: crane, unitsPerHour: 1 });
    await actor.agent
      .patch(`${orgBase}/plans/${planId}`)
      .send({ levelResources: true, version: planVersion })
      .expect(200);
    await recalculate(actor, planId);
    return {
      actor,
      planId,
      names: new Map([
        [a.id, 'A'],
        [b.id, 'B'],
        [c.id, 'C'],
      ]),
    };
  }

  it('LV2: the critical-path test on a levelled plan with a placed carrier reads as it did', async () => {
    const { actor, planId, names } = await seedLevelledPlanWithPlacedCarrier();
    const c = await prisma.activity.findFirstOrThrow({
      where: { planId, name: 'C' },
      select: { earlyStart: true, visualEffectiveStart: true },
    });
    expect(ymd(c.earlyStart)).not.toBe(ymd(c.visualEffectiveStart));

    const res = await actor.agent
      .get(planUrl(planId, 'schedule/health-check/critical-path-test'))
      .expect(200);
    // Activity ids are random: name them so the literal is comparable across runs.
    const named = JSON.parse(JSON.stringify(res.body.data), (_key, value: unknown) =>
      typeof value === 'string' && names.has(value) ? names.get(value) : value,
    );
    expect(named).toEqual(CRITICAL_PATH_TEST_PLACED_CARRIER_GOLDEN);
  });
});
