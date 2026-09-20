import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { clearBaselineTree } from './clear-baseline-tree';

/**
 * **The staff diagnostics route, against a real migrated Postgres (ADR-0140).**
 *
 * This suite is not optional and it lands in the same milestone as the route, for a reason this
 * repository has already paid for once: ADR-0086's M2 shipped a staff route **unable to complete a
 * single request** with 1,589 unit tests green, because every unit test mocks Prisma. Everything
 * that can go wrong here is invisible to a mock — whether the SQL parses, whether the columns are
 * named what the repository thinks, whether `count(*)`'s `bigint` survives `JSON.stringify`, and
 * whether the response survives the real `TransformInterceptor` rather than being double-wrapped.
 *
 * **The fixture discriminates both predicates in both directions**, which is the whole point. A
 * diagnostic that returns a plausible number is worse than one that fails, because somebody pastes
 * it into a measurement record. So the plan below contains, deliberately, one activity that answers
 * each question, one that answers neither, and — the case a reviewer would rightly question — one
 * that looks like it should answer D-A and must not.
 *
 * Built through the public REST API throughout (the ADR-0066 rule): a fixture assembled below the
 * write path would reuse the assembly the counts are about and would agree with itself.
 *
 * `STAFF_EMAILS` is set before `AppModule` is imported and restored in `afterAll` —
 * `vitest.e2e.config.mts` sets `fileParallelism: false`, so every suite shares one `process.env`
 * and a leaked value would silently make an address staff in every later suite.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const STAFF_EMAIL = 'ops@schedulepoint.test';

interface Actor {
  agent: ReturnType<typeof request.agent>;
}

interface DiagnosticRow {
  id: string;
  label: string;
  nature: string;
  examined: number;
  affected: number;
  affectedPlans: number;
  affectedOrganizations: number;
  elapsedMs: number;
}

describe.skipIf(!hasDatabase)('Staff diagnostics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let originalStaffEmails: string | undefined;
  let throttlerStorage: ThrottlerStorage;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    originalStaffEmails = process.env.STAFF_EMAILS;
    process.env.STAFF_EMAILS = STAFF_EMAIL;

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
    if (originalStaffEmails === undefined) delete process.env.STAFF_EMAILS;
    else process.env.STAFF_EMAILS = originalStaffEmails;
  });

  beforeEach(async () => {
    // Per-handler throttle counters are shared mutable state across tests in one 60 s window —
    // `docs/TESTING.md` forbids that in as many words. The product bound is untouched.
    (throttlerStorage as ThrottlerStorageService).storage.clear();
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const org = '/api/v1/organizations/acme';

  async function adminWithOrg(): Promise<Actor> {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { agent };
  }

  async function signedInStaff(): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Ops', email: STAFF_EMAIL, password: PASSWORD })
      .expect(200);
    await prisma.user.updateMany({ where: { email: STAFF_EMAIL }, data: { emailVerified: true } });
    return agent;
  }

  /** A calendar working every day, `hours` long — so the day length is the only variable. */
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

  async function planOn(actor: Actor, calendarId: string, name: string): Promise<string> {
    const client = await actor.agent
      .post(`${org}/clients`)
      .send({ name: `C-${name}` })
      .expect(201);
    const project = await actor.agent
      .post(`${org}/clients/${client.body.data.id}/projects`)
      .send({ name: `P-${name}` })
      .expect(201);
    const plan = await actor.agent
      .post(`${org}/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent.patch(`${org}/plans/${planId}`).send({ calendarId, version: 1 }).expect(200);
    return planId;
  }

  async function drive(actor: Actor, activityId: string, resourceId: string): Promise<void> {
    await actor.agent
      .post(`${org}/activities/${activityId}/assignments`)
      .send({ resourceId, budgetedUnits: 1, isDriving: true })
      .expect(201);
  }

  /** An assignment that is NOT the driver — the witness for `ra.is_driving = true`. */
  async function assignNonDriving(
    actor: Actor,
    activityId: string,
    resourceId: string,
  ): Promise<void> {
    await actor.agent
      .post(`${org}/activities/${activityId}/assignments`)
      .send({ resourceId, budgetedUnits: 1, isDriving: false })
      .expect(201);
  }

  /**
   * The discriminating fixture. Five activities across two plans in one organisation:
   *
   * | # | Activity            | Shape                                              | D-A | D-B |
   * | - | ------------------- | -------------------------------------------------- | --- | --- |
   * | 1 | Inheriting task     | TASK, no own calendar, 8 h plan                    | no  | YES |
   * | 2 | Crane lift          | RD, driven by a 24 h crane, 8 h plan               | YES | no  |
   * | 3 | Own calendar task   | TASK naming the 8 h calendar explicitly            | no  | no  |
   * | 4 | Inherit-driver lift | RD, driven by a resource with **no** calendar      | no  | YES |
   * | 5 | Round the clock     | TASK on a 24 h plan                                | no  | no  |
   * | 6 | Task with driver    | TASK driven by the 24 h crane                      | no  | YES |
   * | 7 | Twin-calendar lift  | RD, driven onto a DIFFERENT calendar of equal hours | no  | no  |
   *
   * **Rows 3 to 7 are the ones worth the setup cost, and rows 6 and 7 exist because the fixture
   * failed without them.** Each predicate clause was removed in turn and the suite re-run: with
   * five rows, two D-A mutations stayed green — dropping the `RESOURCE_DEPENDENT` filter from the
   * numerator, and comparing calendar **ids** instead of day lengths. Both are wrong and neither
   * had a witness.
   *
   * - Row 6 is the A5500 contrast: `effectiveOf` ignores a driver entirely for any type but
   *   `RESOURCE_DEPENDENT`, so a driven TASK keeps its own calendar and nothing changed meaning.
   *   It is D-B, though — it reaches the inherit sentinel like any other inheriting activity, which
   *   is also what exercises D-B's own restriction of the driver join to `RESOURCE_DEPENDENT`.
   * - Row 7 separates "a different calendar" from "a different day length". Only the second one
   *   changes a number; an id comparison would count this and be wrong.
   * - Row 4 looks like D-A and must not be counted: with no driver calendar, `effectiveOf` falls
   *   back to the activity's own, so the two coincide.
   * - Row 5 is the 24-hour plan, where the old fallback constant and the correct answer agree.
   * - Row 3 named its own calendar, so it never reached the inherit sentinel at all.
   *
   * **Rows 8 to 10 were added by the M4 test review, which found the diagnostic's own PREMISE
   * unwitnessed.** Every `drive()` call hard-codes `isDriving: true` and nothing was ever
   * reassigned, so `ra.is_driving = true` and `ra.deleted_at IS NULL` — the two clauses that make
   * this "the DRIVING resource's calendar" rather than "any resource's" — could both be deleted
   * with the suite green. And no `RESOURCE_DEPENDENT` activity named a calendar of its own, so the
   * middle rung of both `COALESCE` chains was never reached: their argument order could be swapped
   * and nothing would notice.
   *
   * | #  | Activity            | Shape                                                    | D-A | D-B |
   * | -- | ------------------- | -------------------------------------------------------- | --- | --- |
   * | 8  | Passenger lift      | RD on a 24 h crane held NON-driving, no driver at all     | no  | YES |
   * | 9  | Reassigned lift     | RD whose crane assignment was UNASSIGNED, then re-driven  | no  | YES |
   * | 10 | Own-calendar lift   | RD naming a 24 h calendar itself, driver has none         | no  | no  |
   * | 11 | Unassigned lift     | RD whose only crane assignment was unassigned, no driver  | no  | YES |
   *
   * Row 8 has a live assignment to a diverging resource that is not the driver: drop
   * `is_driving = true` and D-A counts it. Row 9 had its crane assignment unassigned and was then
   * driven by a resource with no calendar: drop `ra.deleted_at IS NULL` and the stale 24-hour row
   * makes D-A count it. Row 10 resolves `oc` through its **own** calendar rather than
   * the plan's, which is the rung nothing else reaches.
   *
   * **Row 10 is a NEGATIVE witness, and that is the point of it** — the first draft of this table
   * said `D-A: YES` and was wrong. With the activity naming 24 h and its driver naming nothing,
   * `oc` and `sc` both resolve to that same 24 h calendar, so it is correctly not counted. Swap
   * `oc`'s `COALESCE` to plan-before-activity and it resolves to 8 h while `sc` stays 24 h: the row
   * turns positive and the count moves. A rung is witnessed by a row whose answer CHANGES when the
   * rung changes, not by one that happens to be affected.
   */
  async function seedEstate(actor: Actor): Promise<void> {
    const eightHourDay = await calendar(actor, 'Crew (8h)', 8);
    const roundTheClock = await calendar(actor, 'Crane (24h)', 24);

    const planA = await planOn(actor, eightHourDay, 'Eight hour plan');
    const planB = await planOn(actor, roundTheClock, 'Round the clock plan');

    const crane = await actor.agent
      .post(`${org}/resources`)
      .send({ name: 'Crane', kind: 'EQUIPMENT', calendarId: roundTheClock })
      .expect(201);
    const gang = await actor.agent
      .post(`${org}/resources`)
      .send({ name: 'Gang (inherits)', kind: 'LABOUR' })
      .expect(201);

    await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Inheriting task', durationDays: 5 })
      .expect(201);

    const lift = await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Crane lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);
    await drive(actor, lift.body.data.id as string, crane.body.data.id as string);

    await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Own calendar task', durationDays: 5, calendarId: eightHourDay })
      .expect(201);

    const inheritDriver = await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Inherit-driver lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);
    await drive(actor, inheritDriver.body.data.id as string, gang.body.data.id as string);

    await actor.agent
      .post(`${org}/plans/${planB}/activities`)
      .send({ name: 'Round the clock', durationDays: 5 })
      .expect(201);

    const drivenTask = await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Task with driver', durationDays: 5 })
      .expect(201);
    await drive(actor, drivenTask.body.data.id as string, crane.body.data.id as string);

    const otherEightHourDay = await calendar(actor, 'Subcontractor (8h)', 8);
    const twin = await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Twin-calendar lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);
    const subcontractor = await actor.agent
      .post(`${org}/resources`)
      .send({ name: 'Subcontractor', kind: 'LABOUR', calendarId: otherEightHourDay })
      .expect(201);
    await drive(actor, twin.body.data.id as string, subcontractor.body.data.id as string);

    // Row 8 — the `is_driving` witness. A live assignment to the 24 h crane that is NOT the
    // driver, so the activity falls back to the plan's day exactly as if the crane were not there.
    const passenger = await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Passenger lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);
    await assignNonDriving(actor, passenger.body.data.id as string, crane.body.data.id as string);

    // Row 9 — the `ra.deleted_at` witness, and it took two attempts to build.
    //
    // The obvious construction is "drive it with the crane, then drive it with the gang", on the
    // assumption that a second driving assignment supersedes the first. It does not: the service
    // calls `clearDrivingForActivity`, which sets `is_driving = false` on the live row and deletes
    // nothing (`resource-assignment.repository.ts:150-163`). So that shape is row 8 again, and
    // dropping `ra.deleted_at IS NULL` stayed green against it — the witness witnessed nothing,
    // which only running the mutation showed.
    //
    // The crane assignment is therefore UNASSIGNED, which is the one path that soft-deletes
    // (`softDelete`, `:184-195`), leaving a row with `is_driving = true` AND `deleted_at` set. The
    // gang then drives it and inherits, so the activity is correctly not D-A; the stale 24 h row is
    // exactly what a missing `deleted_at IS NULL` picks up.
    const reassigned = await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Reassigned lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);
    const reassignedId = reassigned.body.data.id as string;
    const craneAssignment = await actor.agent
      .post(`${org}/activities/${reassignedId}/assignments`)
      .send({ resourceId: crane.body.data.id, budgetedUnits: 1, isDriving: true })
      .expect(201);
    await actor.agent
      .delete(`${org}/assignments/${craneAssignment.body.data.id as string}`)
      .expect(204);
    await drive(actor, reassignedId, gang.body.data.id as string);

    // Row 10 — the activity-calendar rung of both COALESCE chains, which nothing else reaches: an
    // RD activity naming a 24 h calendar of its own, driven by a resource that has none. `oc`
    // resolves through `a.calendar_id`, and `sc` falls through the driver to the same place.
    const ownCalendarLift = await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({
        name: 'Own-calendar lift',
        durationDays: 5,
        type: 'RESOURCE_DEPENDENT',
        calendarId: roundTheClock,
      })
      .expect(201);
    await drive(actor, ownCalendarLift.body.data.id as string, gang.body.data.id as string);

    // Row 11 — D-B's OWN copy of the `ra.deleted_at` clause, which row 9 does not reach.
    //
    // Row 9 has both a stale crane row and a live gang row, so under D-B's `count(*)` the activity
    // is counted once either way: dropping the filter adds a second joined row that the
    // `r.calendar_id IS NULL` test then throws away, and the live one still qualifies. The clause
    // can only change an answer where the stale row is the ONLY one — so here the crane assignment
    // is unassigned and never replaced. With the filter the activity inherits and is D-B; without
    // it, the stale 24 h crane row makes `r.calendar_id` non-null and the activity vanishes from
    // the count the diagnostic exists to produce.
    const unassigned = await actor.agent
      .post(`${org}/plans/${planA}/activities`)
      .send({ name: 'Unassigned lift', durationDays: 5, type: 'RESOURCE_DEPENDENT' })
      .expect(201);
    const orphaned = await actor.agent
      .post(`${org}/activities/${unassigned.body.data.id as string}/assignments`)
      .send({ resourceId: crane.body.data.id, budgetedUnits: 1, isDriving: true })
      .expect(201);
    await actor.agent.delete(`${org}/assignments/${orphaned.body.data.id as string}`).expect(204);
  }

  // -------------------------------------------------------------------------------------------
  // The one-planning-surface readings (M0). A second estate, deliberately separate from
  // `seedEstate` above: that fixture is tuned to make the two day-factor questions discriminate,
  // and folding placements and constraints into it would make both tables harder to read and each
  // one's counts depend on the other's rows.
  // -------------------------------------------------------------------------------------------

  async function activityOn(
    actor: Actor,
    planId: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const res = await actor.agent
      .post(`${org}/plans/${planId}/activities`)
      .send({ durationDays: 5, ...body })
      .expect(201);
    return res.body.data.id as string;
  }

  async function recalculate(actor: Actor, planId: string): Promise<void> {
    await actor.agent.post(`${org}/plans/${planId}/schedule/recalculate`).expect(200);
  }

  /**
   * **The placement estate. Three plans, and the SNET half is the part worth the setup cost.**
   *
   * The four SNET classes are read off `early_start` against `constraint_date`, because an SNET
   * applies as `Math.max(logicEarlyStart, constraint.startAbs)` and provenance is unrecoverable —
   * a drag and the activity editor write the identical row, and the PATCH route is unaudited.
   *
   * | Plan          | Activity     | Shape                                         | Class        |
   * | ------------- | ------------ | --------------------------------------------- | ------------ |
   * | Placed        | Placed A     | `visual_start` set                            | —            |
   * | Placed        | Placed B     | `visual_start` set                            | —            |
   * | Placed        | Unplaced     | nothing                                       | —            |
   * | Constrained   | Anchor       | 10 d from the data date, no constraint        | —            |
   * | Constrained   | Binding      | SNET after the data date, then recalculated   | binding      |
   * | Constrained   | Inert        | successor of Anchor, SNET BEFORE Anchor ends  | inert        |
   * | Constrained   | Stale        | recalculated, THEN its constraint moved later | unclassified |
   * | Never touched | Unscheduled  | SNET, plan never recalculated                 | unclassified |
   *
   * **`Stale` is the row the implementation plan did not have, and it is why this is four classes
   * and not three.** That plan called its binding / inert / unscheduled split "exhaustive and
   * disjoint". It is not: setting a constraint does not recalculate the plan, so the stored
   * schedule can predate it and leave `early_start < constraint_date` — a state the `max(...)`
   * makes unreachable in a FRESH schedule and which is perfectly reachable in a stored one. This
   * row reaches it through the public API in three ordinary calls, so it is a fact about the
   * product rather than a hypothesis about it. Such a row is neither binding nor inert, and a
   * migration cannot know where its bar would land, so it is counted and touched by nothing.
   *
   * Two baselines are captured, over DIFFERENT plans, and that separation is load-bearing: one
   * over `Placed` (which is what `baselines-over-placed-plans` counts) and one over `Constrained`
   * (which is what `snet-full-baseline-coverage` counts). A fixture with a single baseline over a
   * plan that had both would let either query be wrong in the other's direction and stay green.
   */
  async function seedPlacementEstate(actor: Actor): Promise<void> {
    const allDay = await calendar(actor, 'Round the clock (placements)', 24);

    // --- Plan 1: placements, and the baseline that covers them -------------------------------
    const placed = await planOn(actor, allDay, 'Placed');
    const placedA = await activityOn(actor, placed, { name: 'Placed A' });
    const placedB = await activityOn(actor, placed, { name: 'Placed B' });
    await activityOn(actor, placed, { name: 'Unplaced' });
    for (const id of [placedA, placedB]) {
      await actor.agent
        .patch(`${org}/activities/${id}`)
        .send({ visualStart: '2026-03-02', version: 1 })
        .expect(200);
    }
    await recalculate(actor, placed);
    await actor.agent.post(`${org}/plans/${placed}/baselines`).send({ name: 'Over placements' });

    // --- Plan 1b: a placement on a plan that IS in Visual mode --------------------------------
    // The negative witness for D-D2, and without it that entry's `scheduling_mode = 'EARLY'`
    // clause has no test at all: with every placement sitting on an EARLY plan, D-D and D-D2
    // return identical numbers and the clause could be deleted with the suite green. This row is
    // counted by D-D and NOT by D-D2, which is the only thing that separates them.
    const visual = await planOn(actor, allDay, 'Already visual');
    const visualA = await activityOn(actor, visual, { name: 'Visual placement' });
    await actor.agent
      .patch(`${org}/activities/${visualA}`)
      .send({ visualStart: '2026-04-01', version: 1 })
      .expect(200);
    // **Written straight to the column, and that is the only way left** (one-planning-surface
    // M-F-T4). `schedulingMode` is gone from `UpdatePlanDto`, so a PATCH naming it now yields 422 —
    // the fixture cannot ask the API for this state because the product no longer offers it.
    //
    // Departing from this suite's own "built through the public REST API throughout" rule is the
    // point rather than a corner cut: D-D2 exists to SIZE a population the product can no longer
    // create, on plans written before the collapse, and a diagnostic about legacy rows is tested
    // against legacy rows or against nothing. The column survives until the epic's migration
    // milestone, which is what keeps this reachable at all.
    await prisma.plan.update({ where: { id: visual }, data: { schedulingMode: 'VISUAL' } });

    // --- Plan 2: the three readable SNET classes ----------------------------------------------
    const constrained = await planOn(actor, allDay, 'Constrained');
    const anchor = await activityOn(actor, constrained, { name: 'Anchor', durationDays: 10 });
    await activityOn(actor, constrained, {
      name: 'Binding',
      constraintType: 'SNET',
      constraintDate: '2026-02-01',
    });
    const inert = await activityOn(actor, constrained, {
      name: 'Inert',
      constraintType: 'SNET',
      constraintDate: '2026-01-02',
    });
    await actor.agent
      .post(`${org}/plans/${constrained}/dependencies`)
      .send({ predecessorId: anchor, successorId: inert })
      .expect(201);
    const stale = await activityOn(actor, constrained, {
      name: 'Stale',
      constraintType: 'SNET',
      constraintDate: '2026-01-05',
    });
    await recalculate(actor, constrained);
    await actor.agent.post(`${org}/plans/${constrained}/baselines`).send({ name: 'Over SNETs' });
    // AFTER the recalculation, and deliberately without another: this is the whole point of the
    // row. The stored schedule now predates the constraint it is compared against.
    const staleNow = await actor.agent.get(`${org}/activities/${stale}`).expect(200);
    await actor.agent
      .patch(`${org}/activities/${stale}`)
      .send({
        constraintType: 'SNET',
        constraintDate: '2026-06-01',
        version: staleNow.body.data.version,
      })
      .expect(200);

    // --- Plan 3: an SNET on a plan nothing has ever scheduled ---------------------------------
    const untouched = await planOn(actor, allDay, 'Never touched');
    await activityOn(actor, untouched, {
      name: 'Unscheduled',
      constraintType: 'SNET',
      constraintDate: '2026-03-01',
    });
  }

  async function readDiagnostics(
    agent: ReturnType<typeof request.agent>,
  ): Promise<Map<string, DiagnosticRow>> {
    const response = await agent.get('/api/v1/staff/diagnostics').set('Origin', ORIGIN).expect(200);
    const rows = (response.body.data as { diagnostics: DiagnosticRow[] }).diagnostics;
    return new Map(rows.map((row) => [row.id, row]));
  }

  it('counts each question over a fixture that discriminates it in both directions', async () => {
    const actor = await adminWithOrg();
    await seedEstate(actor);
    const staff = await signedInStaff();

    const byId = await readDiagnostics(staff);

    // D-A — the driving-resource half, `api-v0.62.0`. Only the crane lift: the inherit-driver lift
    // resolves to the SAME calendar it would have used anyway, so nothing about it changed meaning.
    expect(byId.get('day-factor-divergence')).toMatchObject({
      examined: 7, // every RESOURCE_DEPENDENT activity was asked
      affected: 1,
      affectedPlans: 1,
      affectedOrganizations: 1,
    });

    // D-B — the inherited-plan-calendar half, `api-v0.63.0`. The inheriting task AND the
    // inherit-driver lift; not the one naming its own calendar, and not the 24 h plan.
    expect(byId.get('inherited-day-factor')).toMatchObject({
      examined: 11, // every activity in the estate
      affected: 6,
      affectedPlans: 1,
      affectedOrganizations: 1,
    });
  });

  it('counts placements and baselines over them, at both grains (M0, one planning surface)', async () => {
    const actor = await adminWithOrg();
    await seedPlacementEstate(actor);
    const staff = await signedInStaff();

    const byId = await readDiagnostics(staff);

    // Three plans exist; one carries placements. The plan-grain and activity-grain questions are
    // separate entries precisely because these two numbers diverge, and the fixture makes them.
    expect(byId.get('visual-placement-plans')).toMatchObject({
      examined: 4,
      affected: 2,
      affectedPlans: 2,
      affectedOrganizations: 1,
    });
    expect(byId.get('visual-placement-activities')).toMatchObject({
      examined: 9,
      affected: 3,
      affectedPlans: 2,
      affectedOrganizations: 1,
    });

    /**
     * **D-J / D-K — the conflict split, and what is asserted here is the DENOMINATOR.**
     *
     * The affected counts are zero on this estate, and saying so is worth little on its own: a
     * query with a mis-typed enum literal reports zero just as cheerfully. What discriminates is
     * the population each is measured against, which is the decision these entries make — a
     * conflict is a property of a PLACEMENT, so the denominator is the placed set (3, the
     * `affected` figure above) and not every activity (9, the `examined` one). Counting out of
     * every activity would report a rate that falls purely because somebody added unplaced work.
     *
     * So this case pins the two entries to a number that is on this very page under a different
     * name, and a query that quietly widened its denominator would fail here rather than merely
     * look smaller.
     */
    for (const id of ['visual-conflict-earlier-than-logic', 'visual-conflict-later-than-bound']) {
      expect(byId.get(id), id).toMatchObject({ examined: 3, affected: 0, affectedPlans: 0 });
    }

    // D-D2 — two of the three, and the gap is the point. `Placed` is still in `EARLY` (the schema
    // default) while `Already visual` is not, and `visualStart` is accepted regardless of mode. So
    // the two on the EARLY plan are the bars that move on the day the mode collapses, for a
    // planner who did nothing; the third already renders where it sits.
    expect(byId.get('placement-on-early-plan')).toMatchObject({
      examined: 9,
      affected: 2,
      affectedPlans: 1,
      affectedOrganizations: 1,
    });

    // Two baselines, over different plans. Counting both would mean the placement predicate was
    // dropped; counting neither would mean the join lost its rows.
    expect(byId.get('baselines-over-placed-plans')).toMatchObject({
      examined: 2,
      affected: 1,
      affectedPlans: 1,
      affectedOrganizations: 1,
    });
  });

  it('splits the SNET population by effect, exhaustively (M0, one planning surface)', async () => {
    const actor = await adminWithOrg();
    await seedPlacementEstate(actor);
    const staff = await signedInStaff();

    const byId = await readDiagnostics(staff);

    const binding = byId.get('snet-binding');
    const inert = byId.get('snet-inert');
    const unclassified = byId.get('snet-unclassified');

    expect(binding).toMatchObject({ examined: 4, affected: 1, affectedPlans: 1 });
    expect(inert).toMatchObject({ examined: 4, affected: 1, affectedPlans: 1 });
    // Two rows, in two plans: the never-scheduled one and the one whose schedule predates its
    // constraint. `affectedPlans: 2` is what separates them from a single-cause miscount.
    expect(unclassified).toMatchObject({ examined: 4, affected: 2, affectedPlans: 2 });

    // **The cheapest possible guard against a mis-written WHERE**, and the reason the three share
    // one denominator. A class that overlapped another, or a fourth state nobody had noticed,
    // shows up here as arithmetic rather than as a judgement about SQL.
    expect(
      (binding?.affected ?? 0) + (inert?.affected ?? 0) + (unclassified?.affected ?? 0),
      'the three classes must partition the SNET population exactly',
    ).toBe(binding?.examined);
  });

  it('sizes what a FULL baseline could restore (M0, one planning surface)', async () => {
    const actor = await adminWithOrg();
    await seedPlacementEstate(actor);
    const staff = await signedInStaff();

    const byId = await readDiagnostics(staff);

    // The denominator is the BINDING set, not every SNET — the only class a strip would touch.
    // The `Constrained` baseline covers it, and the `Placed` one is over a different plan, so a
    // query that lost its `b.plan_id = a.plan_id` clause would still report 1 here and be wrong
    // for the wrong reason. That is what the second baseline is for.
    expect(byId.get('snet-full-baseline-coverage')).toMatchObject({
      examined: 1,
      affected: 1,
      affectedPlans: 1,
      affectedOrganizations: 1,
    });
  });

  it('carries each entry’s nature, read from the registry rather than hard-coded', async () => {
    // TypeScript stops the field being DROPPED — it is non-optional on the DTO — and stops nothing
    // if a producer writes the wrong literal. Both entries are retrospective today, so this cannot
    // catch a hard-coded `'retrospective'`; what it does assert is that the value survives the
    // whole path and lands inside the closed vocabulary, which is what the panel branches on to
    // tell a reader whether a count means "broken now" or "who to tell". Said plainly rather than
    // left to look stronger than it is.
    const staff = await signedInStaff();

    const byId = await readDiagnostics(staff);

    for (const [id, row] of byId) {
      expect(['retrospective', 'prospective'], `${id} must carry a known nature`).toContain(
        row.nature,
      );
    }
    expect(byId.get('day-factor-divergence')?.nature).toBe('retrospective');
    expect(byId.get('inherited-day-factor')?.nature).toBe('retrospective');
  });

  it('reports zeroes on an empty estate rather than omitting the rows', async () => {
    // A zero is the strongest possible answer to `docs/TECH_DEBT.md` #86's M0-T3 and must not be
    // left unstated — the plan task that owes it says so in as many words. An omitted row would be
    // indistinguishable from a diagnostic that failed.
    const staff = await signedInStaff();

    const byId = await readDiagnostics(staff);

    expect([...byId.keys()]).toEqual([
      'day-factor-divergence',
      'inherited-day-factor',
      'visual-placement-plans',
      'visual-placement-activities',
      'placement-on-early-plan',
      'baselines-over-placed-plans',
      'snet-binding',
      'snet-inert',
      'snet-unclassified',
      'snet-full-baseline-coverage',
      'visual-conflict-earlier-than-logic',
      'visual-conflict-later-than-bound',
    ]);
    for (const row of byId.values()) {
      expect(row).toMatchObject({ examined: 0, affected: 0, affectedPlans: 0 });
    }
  });

  it('survives the real interceptor and the bigint boundary', async () => {
    // Two things a mocked Prisma cannot reach. `count(*)` returns a `bigint` and `JSON.stringify`
    // throws on one, so an unconverted count is a 500 on every call; and returning an envelope from
    // the handler would double-wrap it, which only a suite running the real interceptor can catch.
    const staff = await signedInStaff();

    const response = await staff.get('/api/v1/staff/diagnostics').set('Origin', ORIGIN).expect(200);

    expect(Object.keys(response.body)).toEqual(['data']);
    expect(response.body.data).not.toHaveProperty('data');
    expect(typeof response.body.data.takenAt).toBe('string');
    expect(typeof response.body.data.apiVersion).toBe('string');
    for (const row of response.body.data.diagnostics as DiagnosticRow[]) {
      for (const key of ['examined', 'affected', 'affectedPlans', 'affectedOrganizations']) {
        expect(typeof row[key as keyof DiagnosticRow]).toBe('number');
      }
    }
  });

  it('returns only numbers and the registry literals — never a name, an id or a date', async () => {
    // Clause 1 of the narrowing, asserted over the WHOLE payload rather than over the fields
    // somebody remembered to check. The fixture above names its plans, clients and activities
    // distinctively for exactly this: if any of them can appear, this is where it shows.
    const actor = await adminWithOrg();
    await seedEstate(actor);
    const staff = await signedInStaff();

    const response = await staff.get('/api/v1/staff/diagnostics').set('Origin', ORIGIN).expect(200);
    const body = JSON.stringify(response.body);

    for (const leak of [
      'Eight hour plan',
      'Round the clock plan',
      'Crane lift',
      'Inheriting task',
      'Crew (8h)',
      'Acme',
      'admin@example.com',
    ]) {
      expect(body, `the response must not carry "${leak}"`).not.toContain(leak);
    }

    // And no UUID anywhere — an id is the whole disclosure ADR-0086 D6 protects.
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('writes one audit row naming the panel and never its contents', async () => {
    const staff = await signedInStaff();
    const before = await prisma.auditEvent.count({ where: { actorType: 'STAFF' } });

    await staff.get('/api/v1/staff/diagnostics').set('Origin', ORIGIN).expect(200);

    expect(await prisma.auditEvent.count({ where: { actorType: 'STAFF' } })).toBe(before + 1);
    const row = await prisma.auditEvent.findFirst({
      where: { actorType: 'STAFF' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(row?.action).toBe('staff.panel_read');
    expect(row?.subjectLabel).toBe('diagnostics');
    // A staff act belongs to no organisation, even one whose rows it just counted.
    expect(row?.organizationId).toBeNull();
    expect(row?.changes).toBeNull();
  });

  it('refuses an authenticated non-staff member with 404, not 403', async () => {
    const actor = await adminWithOrg();

    await actor.agent.get('/api/v1/staff/diagnostics').set('Origin', ORIGIN).expect(404);
  });

  it('ignores a query string entirely — there is no question to vary', async () => {
    // The runtime companion to the structural gate that refuses an input decorator. Nest would
    // simply drop an undeclared parameter, and that is the assertion: a caller who tries to scope
    // the count gets the same installation-wide answer, so the endpoint cannot be differenced.
    const actor = await adminWithOrg();
    await seedEstate(actor);
    const staff = await signedInStaff();

    const plain = await readDiagnostics(staff);
    const probed = await staff
      .get('/api/v1/staff/diagnostics?organizationId=acme&planId=1&limit=1')
      .set('Origin', ORIGIN)
      .expect(200);

    const probedRows = (probed.body.data as { diagnostics: DiagnosticRow[] }).diagnostics;
    for (const row of probedRows) {
      expect(row.affected).toBe(plain.get(row.id)!.affected);
      expect(row.examined).toBe(plain.get(row.id)!.examined);
    }
  });
});
