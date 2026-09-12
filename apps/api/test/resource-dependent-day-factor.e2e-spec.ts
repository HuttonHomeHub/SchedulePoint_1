import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { clearBaselineTree } from './clear-baseline-tree';

/**
 * **M0-T1 of `docs/specs/resource-dependent-day-factor/` — the engine half, executed.**
 *
 * `docs/TECH_DEBT.md` #86 said for a year that this defect is display-only: _"the API stores
 * minutes, and the engine reschedules on the correct calendar regardless"_. That sentence kept the
 * row a low priority, and it is false. The web-side half is pinned in
 * `apps/web/src/lib/day-factor-divergence.characterisation.test.ts`; **this file is the half that
 * needs a real database**, because it is a fact about two server rules disagreeing and no unit tier
 * can reach it.
 *
 * ## The two rules
 *
 * `activities/day-factor.ts:19-24` converts a written `durationDays` on
 * `activityCalendarId ?? planCalendarId` — the activity's **own** calendar.
 * `schedule.service.ts:1277-1287` schedules a `RESOURCE_DEPENDENT` activity on its **driving
 * resource's** calendar. Both are correct in isolation and both claim to name "the activity's
 * effective calendar". Where the two calendars have different working hours, the quantity written
 * and the calendar it is spent on disagree.
 *
 * ## This is CHARACTERISATION, not desired behaviour
 *
 * Every expectation pins what the product does **today**, including the wrong finish. When M2 of the
 * spec lands, the resource-dependent activity finishes level with its task twin and these
 * expectations invert. A reader who finds this file green has learnt the defect is
 * still present, which is the opposite of what a green test usually means.
 *
 * ## Why the fixture is hand-built
 *
 * The seed catalogue cannot supply it: **every calendar it builds has `hoursPerDay: null`**
 * (`packages/seed/src/{fixture,pairwise,scale,negative}`), so no seeded plan can exhibit this
 * divergence at all. `docs/TEST_PLAYBOOK.md`'s `plan:capability-resources` row watches the right
 * distinction — "the resource-dependent one schedules on its driving resource's calendar" — on
 * calendars whose day lengths are equal, which is exactly the case where the defect is invisible.
 *
 * Built through the public REST API throughout (the ADR-0066 rule): a fixture assembled below the
 * write path reuses the assembly the defect lives in, and would agree with itself.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('RESOURCE_DEPENDENT day factor (e2e, characterisation)', () => {
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

  async function resetDatabase(): Promise<void> {
    await clearBaselineTree(prisma);
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.updateMany({ data: { parentId: null } });
    await clearDomainData(prisma);
  }

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const org = '/api/v1/organizations/acme';

  async function adminWithOrg(): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /**
   * A calendar working every day, `hours` long. Every weekday is authored, so no computed date can
   * land on a non-working day and the finish is a pure function of the day length — which is the
   * one variable under test.
   */
  async function calendar(actor: Actor, name: string, hours: number): Promise<string> {
    const res = await actor.agent
      .post(`${org}/calendars`)
      .send({
        name,
        shifts: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startMinute: 0,
          endMinute: hours * 60,
        })),
      })
      .expect(201);
    expect(res.body.data.hoursPerDay).toBe(hours);
    return res.body.data.id as string;
  }

  async function planOn(actor: Actor, calendarId: string): Promise<string> {
    const client = await actor.agent.post(`${org}/clients`).send({ name: 'C' }).expect(201);
    const project = await actor.agent
      .post(`${org}/clients/${client.body.data.id}/projects`)
      .send({ name: 'P' })
      .expect(201);
    const plan = await actor.agent
      .post(`${org}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Pl', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent.patch(`${org}/plans/${planId}`).send({ calendarId, version: 1 }).expect(200);
    return planId;
  }

  it('spends a 5-day resource-dependent activity on the DRIVER’s day length, not the one it was written on', async () => {
    const actor = await adminWithOrg();
    const eightHourDay = await calendar(actor, 'Crew (8h)', 8);
    const roundTheClock = await calendar(actor, 'Crane (24h)', 24);
    const planId = await planOn(actor, eightHourDay);

    // The control, created first so a failure cannot be blamed on ordering: an ordinary TASK with
    // the same written duration on the same plan. It has no driver, so both rules agree about it.
    const task = await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name: 'Task twin', durationDays: 5 })
      .expect(201);

    const driven = await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name: 'Crane lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);
    const drivenId = driven.body.data.id as string;

    const crane = await actor.agent
      .post(`${org}/resources`)
      .send({ name: 'Crane', kind: 'EQUIPMENT', calendarId: roundTheClock })
      .expect(201);
    await actor.agent
      .post(`${org}/activities/${drivenId}/assignments`)
      .send({ resourceId: crane.body.data.id, budgetedUnits: 1, isDriving: true })
      .expect(201);

    // ── The write. Both activities were written `durationDays: 5` on the plan's 8 h calendar, so
    //    `day-factor.ts` stores 5 × 8 × 60 for BOTH — the driver is not consulted on the way in.
    expect(task.body.data.durationMinutes).toBe(2400);
    expect(driven.body.data.durationMinutes).toBe(2400);

    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);

    const list = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const byName = new Map(
      (list.body.data as { name: string; earlyFinish: string | null }[]).map((a) => [a.name, a]),
    );

    // ── The read. The task spends 2,400 minutes at 8 h/day: five days, 1–5 January.
    expect(byName.get('Task twin')?.earlyFinish).toBe('2026-01-05');

    // And the resource-dependent one spends the SAME 2,400 minutes at 24 h/day — under two days.
    // **This is the defect, and it is the number M2 has to change**: a planner asked for five days
    // of crane time and the programme reserves less than two, with every read-out still saying `5d`
    // because `minutesToDays(2400, 480)` returns 5 on the way back out.
    expect(byName.get('Crane lift')?.earlyFinish).toBe('2026-01-02');
    expect(byName.get('Crane lift')?.earlyFinish).not.toBe(byName.get('Task twin')?.earlyFinish);
  });

  it('agrees when the two calendars agree — so a green run cannot mean the fixture stopped discriminating', async () => {
    // Without this the case above passes equally against a build where the driving calendar is
    // never resolved at all, which is a different defect wearing the same result.
    const actor = await adminWithOrg();
    const eightHourDay = await calendar(actor, 'Crew (8h)', 8);
    const alsoEight = await calendar(actor, 'Second crew (8h)', 8);
    const planId = await planOn(actor, eightHourDay);

    await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name: 'Task twin', durationDays: 5 })
      .expect(201);
    const driven = await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ name: 'Crane lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);

    const crew = await actor.agent
      .post(`${org}/resources`)
      .send({ name: 'Crew B', kind: 'LABOUR', calendarId: alsoEight })
      .expect(201);
    await actor.agent
      .post(`${org}/activities/${driven.body.data.id}/assignments`)
      .send({ resourceId: crew.body.data.id, budgetedUnits: 1, isDriving: true })
      .expect(201);

    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);

    const list = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const byName = new Map(
      (list.body.data as { name: string; earlyFinish: string | null }[]).map((a) => [a.name, a]),
    );
    expect(byName.get('Crane lift')?.earlyFinish).toBe(byName.get('Task twin')?.earlyFinish);
  });

  /**
   * **M0-T2 — duration days and float days are not on the same day length, and a driver is not
   * required for it.**
   *
   * `schedule.repository.ts:756-759` states the property this pins, in its own comment: the float
   * columns are converted _"on the activity's OWN calendar … Same factor as its duration, so '3 days
   * of work with 1 day of float' is one consistent statement."_ Measured, it is not one statement.
   *
   * ## What was observed, at the storage layer
   *
   * With the plan on an 8 h calendar (`hours_per_day_minutes = 480`) and `Task twin` an ORDINARY
   * task with no resource, no driver and no calendar of its own:
   *
   * | column                  | value  |
   * | ----------------------- | ------ |
   * | `duration_minutes`      | 2400   |
   * | `total_float`           | **2**  |
   * | plan `hours_per_day`    | 480    |
   * | early finish → late finish | 2026-01-05 → 2026-01-10 (**5 days**) |
   *
   * `durationDays` reads back as **5** (2400 / 480). The slack window is **5 days**. So on the
   * activity's own 480-minute day the float should read 5 and reads 2; 2 is what 1440 gives
   * (2400 / 1440 = 1.67, rounded). **The pair "5 days of duration, 2 days of float" is not
   * expressible on any single day length** — on 480 the float is 5, on 1440 the duration is 1.67.
   *
   * ## What this does NOT establish, stated rather than implied
   *
   * It does not identify the mechanism. Two readings fit the numbers: the float minutes are 2,400
   * and were divided by 1440, or the engine measured the slack on a 24-hour axis and divided
   * coherently by 1440 — in which case the field is correct in its own terms and simply reported in
   * a different unit from its neighbour. **The observable defect is the same either way** (one DTO,
   * two day lengths), and which one it is decides M1's shape, so it is left to M1 rather than
   * guessed here.
   *
   * ## Why it widens `docs/TECH_DEBT.md` #86
   *
   * That row, and this spec, attribute the duration/float disagreement to the **driving resource's**
   * calendar — `schedule.service.ts:428` passing the driver-aware `graph.calIdByActivity`. `Task
   * twin` has no assignment at all, so whatever is happening here needs no driver. #86's scope is
   * wider than it says.
   *
   * `Crane lift` is included because it is the case the spec predicts, and its float is
   * **factor-invariant in this fixture** (8 days of slack reads 8 on both 480 and 1440), so it
   * cannot discriminate — which is precisely why the plain task is the assertion that matters. Left
   * in and labelled, rather than dropped, so a later reader does not re-derive it.
   */
  it('reports duration days and float days on different day lengths — with no resource involved', async () => {
    const actor = await adminWithOrg();
    const eightHourDay = await calendar(actor, 'Crew (8h)', 8);
    const roundTheClock = await calendar(actor, 'Crane (24h)', 24);
    const planId = await planOn(actor, eightHourDay);

    const make = async (name: string, days: number, type?: string): Promise<string> =>
      (
        await actor.agent
          .post(`${org}/plans/${planId}/activities`)
          .send({ name, durationDays: days, ...(type ? { type } : {}) })
          .expect(201)
      ).body.data.id as string;

    // `Long pole` sets the project finish, so everything else has slack. Without it the floats are
    // all zero and every assertion below is vacuously satisfied (the ADR-0093 shape).
    const longPole = await make('Long pole', 10);
    const task = await make('Task twin', 5);
    const driven = await make('Crane lift', 5, 'RESOURCE_DEPENDENT');
    const finish = await make('Finish', 1);

    const crane = await actor.agent
      .post(`${org}/resources`)
      .send({ name: 'Crane', kind: 'EQUIPMENT', calendarId: roundTheClock })
      .expect(201);
    await actor.agent
      .post(`${org}/activities/${driven}/assignments`)
      .send({ resourceId: crane.body.data.id, budgetedUnits: 1, isDriving: true })
      .expect(201);

    for (const predecessorId of [longPole, task, driven]) {
      await actor.agent
        .post(`${org}/plans/${planId}/dependencies`)
        .send({ predecessorId, successorId: finish, type: 'FS' })
        .expect(201);
    }

    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);

    const list = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const byName = new Map(
      (
        list.body.data as {
          name: string;
          durationDays: number;
          durationMinutes: number;
          totalFloat: number | null;
          earlyFinish: string | null;
          lateFinish: string | null;
        }[]
      ).map((a) => [a.name, a]),
    );

    const twin = byName.get('Task twin');
    // **Float first, and not zero** — the plan's own stated risk for this task. A zero-float
    // fixture makes everything below true for the wrong reason.
    expect(twin?.totalFloat).toBeGreaterThan(0);

    // The slack window is five days of an all-days calendar: 5 Jan to 10 Jan.
    expect(twin?.earlyFinish).toBe('2026-01-05');
    expect(twin?.lateFinish).toBe('2026-01-10');

    // Duration is converted on the plan's 8 h day: 2,400 / 480 = 5.
    expect(twin?.durationMinutes).toBe(2400);
    expect(twin?.durationDays).toBe(5);

    // And the float over that same five-day window reads 2, which 480 cannot produce.
    // **Characterisation, not desired behaviour**: on the activity's own day length this is 5, and
    // that is the number M1/M2 have to change.
    expect(twin?.totalFloat).toBe(2);

    // The incoherence, as one statement a reader can check: the float, taken at the duration's own
    // factor, does not describe the window the dates show.
    const twinFloatMinutesAtOwnFactor = (twin?.totalFloat ?? 0) * 480;
    expect(twinFloatMinutesAtOwnFactor).toBe(960);
    expect(twinFloatMinutesAtOwnFactor).not.toBe(2400); // the five-day window at 480

    // The driven activity, for completeness and labelled as non-discriminating: 8 days of slack
    // reads 8 on either factor, so this pins the spec's predicted case without proving it.
    expect(byName.get('Crane lift')?.totalFloat).toBe(8);
    expect(byName.get('Crane lift')?.durationDays).toBe(5);
  });

  /**
   * **The discriminator M0-T2 left open, answered by experiment rather than by reading.**
   *
   * `m0-measurements.md` records two readings that both fit `Task twin` reading `2`: the float
   * minutes are 2,400 and were divided by **1440**, or the engine measured the slack on a 24-hour
   * axis and divided coherently. It says the discriminator "is which factor `resolveDayFactors`
   * actually received", and deliberately does not guess.
   *
   * This asks the product instead of the source. The fixture is `Task twin`'s, with ONE difference:
   * a second task carries the plan's own 8 h calendar **explicitly** on the activity rather than
   * inheriting it. Nothing else changes — same duration, same predecessor shape, same window — so
   * the two differ only in whether `activities.calendar_id` is set.
   *
   * The three outcomes are distinct and were written down before the run:
   *
   * - explicit reads **5** → the engine's slack really is 2,400 minutes, the explicit activity was
   *   divided by 480, and the inheriting one was therefore divided by **1440**. The factor is the
   *   defect, and it reaches an activity with no resource, no driver and no calendar of its own.
   * - explicit reads **2** as well → the factor is NOT what separates them, and the 24-hour-axis
   *   reading survives.
   * - explicit reads **15** → the slack is 7,200 minutes, i.e. measured on a 24-hour axis.
   *
   * **Characterisation, not desired behaviour** — like its sibling above. Whatever it records is
   * today's output, and the number M1 has to change.
   */
  it('discriminates the factor: the same task with the plan calendar set EXPLICITLY', async () => {
    const actor = await adminWithOrg();
    const eightHourDay = await calendar(actor, 'Crew (8h)', 8);
    const planId = await planOn(actor, eightHourDay);

    const make = async (name: string, days: number, calendarId?: string): Promise<string> =>
      (
        await actor.agent
          .post(`${org}/plans/${planId}/activities`)
          .send({ name, durationDays: days, ...(calendarId ? { calendarId } : {}) })
          .expect(201)
      ).body.data.id as string;

    // Same shape as the case above: a long pole so nothing has zero float (the ADR-0093 trap).
    const longPole = await make('Long pole', 10);
    const inheriting = await make('Inheriting twin', 5);
    const explicit = await make('Explicit twin', 5, eightHourDay);
    const finish = await make('Finish', 1);

    for (const predecessorId of [longPole, inheriting, explicit]) {
      await actor.agent
        .post(`${org}/plans/${planId}/dependencies`)
        .send({ predecessorId, successorId: finish, type: 'FS' })
        .expect(201);
    }

    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);

    const list = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const byName = new Map(
      (
        list.body.data as {
          name: string;
          durationDays: number;
          durationMinutes: number;
          totalFloat: number | null;
          earlyFinish: string | null;
          lateFinish: string | null;
        }[]
      ).map((a) => [a.name, a]),
    );

    const inh = byName.get('Inheriting twin');
    const exp = byName.get('Explicit twin');

    // Non-vacuity FIRST: both must have real float over the same window, or the comparison below
    // is between two zeroes and says nothing.
    expect(inh?.totalFloat).toBeGreaterThan(0);
    expect(exp?.totalFloat).toBeGreaterThan(0);
    expect(inh?.earlyFinish).toBe(exp?.earlyFinish);
    expect(inh?.lateFinish).toBe(exp?.lateFinish);

    // And both are five days of work on the plan's 8 h day, so any difference in float is not a
    // difference in duration.
    expect(inh?.durationMinutes).toBe(2400);
    expect(exp?.durationMinutes).toBe(2400);
    expect(inh?.durationDays).toBe(5);
    expect(exp?.durationDays).toBe(5);

    // The observation. See the docblock for what each value would mean.
    expect(inh?.totalFloat).toBe(2);
    expect(exp?.totalFloat).toBe(5);
  });
});
