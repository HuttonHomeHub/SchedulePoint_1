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
 * ## INVERTED on 2026-09-13, exactly as the paragraph it replaces used to promise
 *
 * This opened as characterisation: every expectation pinned what the product did **today**,
 * including the wrong read, and this paragraph said that when M2 landed the expectations would
 * invert and a green run would stop meaning "the defect is still present". M2 landed and that is
 * what happened, so a green run here now means the defect is **gone**.
 *
 * The paragraph is rewritten rather than deleted because leaving it would have been the drift this
 * epic exists to remove: a file whose own docblock tells the reader a green result means the
 * opposite of what it means. Its web sibling
 * (`apps/web/src/lib/day-factor-divergence.characterisation.test.ts`) inverted the same way.
 *
 * **What did NOT change is the dates.** The engine always scheduled the driven activity on its
 * driving resource's calendar; M2 fixed the two rules that disagreed with it — the read-out and the
 * update write. So the date assertions below are load-bearing in both directions: they were correct
 * before M2 and are correct after it, which is what makes them the control for everything else.
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
    // **This was the defect and M2 fixed the read half**: a planner asked for five days of crane
    // time and the programme reserves less than two. Until 2026-09-13 every read-out still said
    // `5d`, because `minutesToDays(2400, 480)` returned 5 on the way back out; it now converts on
    // the crane's calendar and says `2d`, which is what the dates below have always shown.
    // The dates themselves are unchanged by M2 and are asserted here for exactly that reason.
    expect(byName.get('Crane lift')?.earlyFinish).toBe('2026-01-02');
    expect(byName.get('Crane lift')?.earlyFinish).not.toBe(byName.get('Task twin')?.earlyFinish);
  });

  /**
   * A plan holding a `Task twin` (TASK) and a `Crane lift` (RESOURCE_DEPENDENT, driven by a
   * 24-hour crane) on an 8-hour plan calendar. Returns both ids.
   *
   * Extracted for the write-path cases below rather than copied into each: the whole subject here
   * is two rules agreeing, and a fixture assembled twice is the one thing that can make them
   * disagree for a reason that is not the product's.
   */
  async function drivenFixture(actor: Actor): Promise<{
    planId: string;
    drivenId: string;
    taskId: string;
  }> {
    const eightHourDay = await calendar(actor, 'Crew (8h)', 8);
    const roundTheClock = await calendar(actor, 'Crane (24h)', 24);
    const planId = await planOn(actor, eightHourDay);

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

    return { planId, drivenId, taskId: task.body.data.id as string };
  }

  /**
   * **The M5 test-engineer review's finding #5, and the sharpest of the coverage gaps it named.**
   *
   * The census classifies the UPDATE site as `scheduling` and CREATE as `own`, and until this case
   * existed nothing executed the difference: the e2e suite covered CREATE and GET only, so the one
   * site whose rule M2 actually CHANGED was the one site with no test. Swapping it back would have
   * been green everywhere.
   *
   * The asymmetry is real and is not a bug: at CREATE no assignment exists yet, so there is no
   * driver to defer to and both rules give 2,400. At UPDATE the crane is assigned, so the same
   * typed `5` is five days of CRANE time — 7,200 minutes.
   */
  it('converts an UPDATED duration on the driver’s calendar, where CREATE could not', async () => {
    const actor = await adminWithOrg();
    const { planId, drivenId, taskId } = await drivenFixture(actor);

    const before = await actor.agent.get(`${org}/activities/${drivenId}`).expect(200);
    // Written before the crane existed: 5 × 8 × 60, and correctly so.
    expect(before.body.data.durationMinutes).toBe(2400);

    const updated = await actor.agent
      .patch(`${org}/activities/${drivenId}`)
      .send({ durationDays: 5, version: before.body.data.version })
      .expect(200);

    // 5 × 24 × 60. The planner typed the same number and meant the same thing — five days of the
    // work this activity schedules — and the work happens on the crane's calendar.
    expect(updated.body.data.durationMinutes).toBe(7200);
    expect(updated.body.data.durationDays).toBe(5);

    // The control, on the same plan and the same request shape. A TASK has no driver, so its
    // update converts on the plan's 8 h day and is unmoved by this epic. Without it, a build that
    // resolved 24 h for EVERY activity would pass the assertion above.
    const taskBefore = await actor.agent.get(`${org}/activities/${taskId}`).expect(200);
    const taskUpdated = await actor.agent
      .patch(`${org}/activities/${taskId}`)
      .send({ durationDays: 5, version: taskBefore.body.data.version })
      .expect(200);
    expect(taskUpdated.body.data.durationMinutes).toBe(2400);

    // And the round trip closes: five days in, five days back, on both — which is the property a
    // planner actually experiences and the one the old code broke for the driven row only.
    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);
    const list = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const byName = new Map(
      (list.body.data as { name: string; durationDays: number }[]).map((a) => [a.name, a]),
    );
    expect(byName.get('Crane lift')?.durationDays).toBe(5);
    expect(byName.get('Task twin')?.durationDays).toBe(5);
  });

  /**
   * The review's finding #5, second half: `remainingDurationDays` on the progress route.
   *
   * A remainder scales with the duration it is a remainder of, so it takes the same rule. It is a
   * separate site from the duration write and was separately untested — and progress is
   * deliberately NOT pen-gated (ADR-0060), so it is reachable by a Contributor who cannot touch the
   * duration at all.
   */
  it('converts a reported REMAINING duration on the driver’s calendar too', async () => {
    const actor = await adminWithOrg();
    const { drivenId } = await drivenFixture(actor);

    const before = await actor.agent.get(`${org}/activities/${drivenId}`).expect(200);
    const progressed = await actor.agent
      .patch(`${org}/activities/${drivenId}/progress`)
      .send({ remainingDurationDays: 2, version: before.body.data.version })
      .expect(200);

    // 2 × 24 × 60, not 2 × 8 × 60. Two more days of crane time.
    expect(progressed.body.data.remainingDurationMinutes).toBe(2880);
    expect(progressed.body.data.remainingDurationDays).toBe(2);
  });

  /**
   * The review's finding #2: the relationship-lag write, which had no executing test at all.
   *
   * `dependencies.service.spec.ts` mocks `findHoursPerDayMinutes` to an empty Map, so every factor
   * it sees is the 1440 fallback and it cannot discriminate these two rules even in principle —
   * which is why this had to come here rather than there.
   *
   * A `PREDECESSOR` lag measures the work at the predecessor's end (ADR-0070 §5), and that end is
   * the crane's, so one day of lag is 1,440 minutes rather than 480.
   */
  it('converts a PREDECESSOR lag on the driven endpoint’s driving calendar', async () => {
    const actor = await adminWithOrg();
    const { planId, drivenId, taskId } = await drivenFixture(actor);

    const link = await actor.agent
      .post(`${org}/plans/${planId}/dependencies`)
      .send({
        predecessorId: drivenId,
        successorId: taskId,
        type: 'FS',
        lagDays: 1,
        lagCalendar: 'PREDECESSOR',
      })
      .expect(201);

    expect(link.body.data.lagMinutes).toBe(1440);
    expect(link.body.data.lagDays).toBe(1);

    // The update site is a second, separate call site — the census lists them as one row because
    // they share a resolver, and this proves they share its ANSWER and not just its name.
    const updated = await actor.agent
      .patch(`${org}/dependencies/${link.body.data.id}`)
      .send({ lagDays: 2, version: link.body.data.version })
      .expect(200);
    expect(updated.body.data.lagMinutes).toBe(2880);
    expect(updated.body.data.lagDays).toBe(2);

    // The control: the SUCCESSOR end is the plain task, so the same typed lag converts on the
    // plan's 8 h day. Same request, same plan, different endpoint — so a build that resolved the
    // crane for every lag would fail here.
    const onSuccessor = await actor.agent
      .patch(`${org}/dependencies/${link.body.data.id}`)
      .send({ lagDays: 1, lagCalendar: 'SUCCESSOR', version: updated.body.data.version })
      .expect(200);
    expect(onSuccessor.body.data.lagMinutes).toBe(480);
  });

  /**
   * **The review's finding #4, and it executes a decision rather than a mechanism: CQ-4.**
   *
   * A guest adopts the corrected factor. That was argued rather than tested — the guest decoration
   * had zero coverage of any kind — and it is the one place the two halves of ADR-0051 pull in
   * opposite directions: a guest must not learn that a resource exists, and a duration is a
   * property of the work, so withholding the correction would have a guest and a member read
   * different numbers off the same bar.
   *
   * So this asserts BOTH halves. The number agrees with the member's, and the field naming the
   * calendar it came from is absent — which is what makes "only the frame changes" a fact.
   */
  it('gives a guest the member’s duration, and still tells them nothing about the resource', async () => {
    const actor = await adminWithOrg();
    const { planId, drivenId } = await drivenFixture(actor);

    // Update through the member path so the stored minutes are the driver-framed 7,200 — the value
    // a guest could most easily be shown wrongly, since 7,200 at the plan's 8 h day reads as 15.
    const before = await actor.agent.get(`${org}/activities/${drivenId}`).expect(200);
    await actor.agent
      .patch(`${org}/activities/${drivenId}`)
      .send({ durationDays: 5, version: before.body.data.version })
      .expect(200);

    const share = await actor.agent
      .post(`${org}/plans/${planId}/shares`)
      .send({ label: 'QS' })
      .expect(201);
    const token = (share.body.data.url as string).split('#')[1];
    expect(token).toBeTruthy();

    const guest = await request(server())
      .get('/api/v1/share/activities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const lift = (guest.body.data as { name: string; durationDays: number }[]).find(
      (a) => a.name === 'Crane lift',
    );

    // The member reads 5. So does the guest — not the 15 the plan's calendar would have produced.
    expect(lift?.durationDays).toBe(5);

    // **Blind spot, measured rather than assumed.** This case catches a break in the GUEST read
    // alone (verified: it reports 15). It does NOT catch the rule being collapsed on both sides at
    // once — the write then stores 2,400 and the read divides by 480, and 5 comes back out. That
    // self-consistency is the exact property that hid #86 for a year, so it is worth naming here:
    // the cases above are what catch a symmetric regression, and this one is what catches a guest
    // drifting away from a member.

    // And the frame is all that changed: the resource is still invisible. `drivingResourceCalendarId`
    // is carried on the internal row to resolve the factor and is deliberately absent from the
    // guest DTO (ADR-0051 §4), which the shared forbidden-key gate also pins.
    expect(lift).not.toHaveProperty('drivingResourceCalendarId');
    expect(lift).not.toHaveProperty('dayFactorMinutes');
  });

  /**
   * **The review's finding #3: the DCMA health check's wiring, and the worst consequence in the
   * epic.**
   *
   * `compute-health.output.spec.ts` already proves metric 8 discriminates on `dayFactorMinutes`.
   * What nothing proved is which factor `schedule.service.ts` hands it — and that is the whole
   * question, because the metric's input is exactly the value this epic changed.
   *
   * The stake is higher than a wrong read-out. Twenty-one days of crane time is a perfectly
   * ordinary activity; the same 30,240 minutes measured against the crew's eight-hour day is 63,
   * which clears the 44-day threshold. A wrong frame here does not merely print a wrong number —
   * it reports a **compliant plan as failing an assessment**, which ADR-0116 names as the one
   * thing a health check must never do. A planner would go looking for a duration that is not
   * there.
   */
  it('judges metric 8 on the driver’s day length, so a compliant plan is not reported as failing', async () => {
    const actor = await adminWithOrg();
    const { planId, drivenId } = await drivenFixture(actor);

    // 21 days of crane time = 30,240 minutes. On the crew's 8 h day that same figure reads 63.
    const before = await actor.agent.get(`${org}/activities/${drivenId}`).expect(200);
    const updated = await actor.agent
      .patch(`${org}/activities/${drivenId}`)
      .send({ durationDays: 21, version: before.body.data.version })
      .expect(200);
    expect(updated.body.data.durationMinutes).toBe(30_240);

    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);
    const report = await actor.agent
      .get(`${org}/plans/${planId}/schedule/health-check`)
      .expect(200);

    const metric = (report.body.data.metrics as { id: string }[]).find(
      (m) => m.id === 'HIGH_DURATION',
    ) as unknown as { measured: { count: number | null } | null };

    // Zero offenders. At the own-calendar factor this is 1, and the plan reads as failing.
    expect(metric.measured?.count).toBe(0);

    // The pinned counter-fact: a plan CAN fail this metric, so a count of 0 above is a judgement
    // and not an inert metric. The crew twin is given a duration that is over the threshold on the
    // calendar it really does schedule on, so this offender is correct in either frame.
    const twin = await actor.agent.get(`${org}/plans/${planId}/activities`).expect(200);
    const taskRow = (twin.body.data as { id: string; name: string; version: number }[]).find(
      (a) => a.name === 'Task twin',
    );
    await actor.agent
      .patch(`${org}/activities/${taskRow!.id}`)
      .send({ durationDays: 63, version: taskRow!.version })
      .expect(200);
    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);
    const after = await actor.agent.get(`${org}/plans/${planId}/schedule/health-check`).expect(200);
    const afterMetric = (after.body.data.metrics as { id: string }[]).find(
      (m) => m.id === 'HIGH_DURATION',
    ) as unknown as { measured: { count: number | null } | null };
    expect(afterMetric.measured?.count).toBe(1);
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

    // The driven activity. `totalFloat` was ALREADY driver-aware — the recalculation resolves each
    // activity's scheduling calendar (ADR-0039 §4) — which is why it reads 8 here both before and
    // after M2, and why it was never the half that needed fixing.
    expect(byName.get('Crane lift')?.totalFloat).toBe(8);

    // **This number changed at M2, and the change is the point (CQ-1, accepted 2026-09-13).**
    // It read `5` until then, because the duration was converted on the activity's OWN 8 h calendar
    // while the work is done on the crane's 24 h one. 2,400 minutes at 1440 is 1.67 days, which
    // rounds to 2 — so the read-out now says what the programme actually reserves instead of
    // repeating the number that was typed before the crane existed.
    //
    // No stored minute moved and no date moved: `durationMinutes` is still 2,400 and `earlyFinish`
    // is still 2 Jan. Only the day-denominated READ-OUT changed, from a wrong number to a right one.
    expect(byName.get('Crane lift')?.durationMinutes).toBe(2400);
    expect(byName.get('Crane lift')?.durationDays).toBe(2);
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
