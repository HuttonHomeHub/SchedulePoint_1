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

    expect([...byId.keys()]).toEqual(['day-factor-divergence', 'inherited-day-factor']);
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
