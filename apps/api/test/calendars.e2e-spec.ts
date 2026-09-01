import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ALL_WEEKDAYS_MASK, STANDARD_WEEKDAYS_MASK } from '@repo/types';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the working-day calendar library: CRUD, the weekday-mask
 * validation, name uniqueness, the exception editor (add/remove + duplicate
 * guard + parent-version bump), the soft-delete cascade over exceptions, and the
 * RBAC / IDOR matrix (verified against a real PostgreSQL + Better Auth session).
 *
 * Calendars are the one entity no other e2e spec cleans up, so this spec resets
 * them in `beforeEach` AND leaves a clean database in `afterAll` (children before
 * parents) — otherwise a later spec's `organization.deleteMany()` would trip the
 * calendars → organizations FK (the shared-DB discipline from the M6 slice).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Calendars API (e2e)', () => {
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
    await prisma.calendarException.deleteMany();
    // Plans reference calendars (plans.calendar_id FK, RESTRICT, since Task C1), so
    // delete plans BEFORE calendars — the delete-in-use test leaves a plan pointing at
    // a calendar.
    // Both link tables and `activities` first, even though this spec creates none of them.
    // `activities` is the link tables' FK target and `plans` is its own, so ANY row left in the
    // shared local database — by a sibling spec, or by a Playwright journey run against the same
    // `app_test` — makes the `plan.deleteMany()` below a foreign-key violation, and every test in
    // this file then fails in `beforeEach` naming a table the spec never touches.
    //
    // This order was missing from NINE specs and present in the rest, so each of them passed or
    // failed on the order the files happened to run in. Adding one new e2e file was enough to
    // change that order and break them (`docs/TECH_DEBT.md` #119).
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    // Notes hold `activity_id`/`plan_id` FKs, so they must go before what they annotate. The
    // e2e database is shared with the Playwright run and `apps/web/e2e-notes` leaves notes
    // behind, so without this the failure lands in a spec that has never heard of notes — the
    // same way `plan_shares` did, one table along.
    await prisma.note.deleteMany();
    // Resource assignments hold `activity_id` FKs and resources are organisation-scoped, so both
    // are swept here for the same shared-database reason as the link tables above
    // (docs/TECH_DEBT.md #119): a leftover row from a sibling suite or a Playwright run against
    // the same `app_test` otherwise fails a spec that never touches resources — which happened
    // on 2026-08-28, in `beforeEach`, to every test in the file at once.
    // Weighted steps hold `activity_id` (ADR-0044 §33), and they are the THIRD table to fail this
    // way — after `plan_shares` and `resource_assignments` (`docs/TECH_DEBT.md` #119a). Found the
    // same way and recorded here rather than in one file: a full API run on 2026-08-31 failed 282
    // tests across 10 files in `beforeEach` on `activity_steps_activity_id_fkey`, and by the time
    // anyone looked the database was clean, because a later suite in the same run had swept it.
    // The log was kept, which is the only reason this was diagnosable at all.
    // Baselines and their snapshot rows hold `plan_id` / `baseline_id` (ADR-0025), and they are the
    // FOURTH table to fail this way — after `plan_shares`, `resource_assignments` and
    // `activity_steps` (`docs/TECH_DEBT.md` #119a). Found on 2026-09-01, when a full API run failed
    // all 45 tests in `activities.e2e-spec.ts` on `baselines_plan_id_fkey`: 25 of 33 plan-sweeping
    // specs deleted plans without deleting baselines first, so a baseline surviving in the shared
    // `app_test` poisons whichever spec sweeps next. **Which writer left it is not claimed** — the
    // log names the constraint and not the producer, and every in-suite creator sweeps (directly, or
    // via `clearDomainData`), so the residue came from outside this run: an earlier aborted run or a
    // Playwright journey against the same database, exactly as #119a's 2026-08-28 entry describes.
    // Diagnosed the same day only because `scripts/e2e-local.sh` tees the whole log to a file — the
    // observer piped the command through `tail` exactly as that row warns them not to, and the
    // mechanism caught what the habit lost. That is ADR-0058 working as advertised.
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  afterAll(async () => {
    // Leave a clean DB so later specs / Playwright don't hit the calendars FK.
    await resetDatabase().catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const base = '/api/v1/organizations/acme/calendars';

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** An admin (Planner privileges included) who owns an org 'acme'. */
  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  async function createCalendar(
    actor: Actor,
    name: string,
    workingWeekdays = STANDARD_WEEKDAYS_MASK,
  ): Promise<string> {
    const res = await actor.agent.post(base).send({ name, workingWeekdays }).expect(201);
    expect(res.body.data).toMatchObject({ name, workingWeekdays, version: 1, exceptions: [] });
    return res.body.data.id as string;
  }

  it('seeds a Standard (Mon–Fri) calendar for a new organisation', async () => {
    const { actor } = await adminWithOrg();
    const list = await actor.agent.get(base).expect(200);
    // Org create seeds exactly one Standard calendar (M5, ADR-0024).
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      name: 'Standard',
      workingWeekdays: STANDARD_WEEKDAYS_MASK,
    });
  });

  /**
   * TECH_DEBT #80. ADR-0036 shipped intraday shift patterns in the engine and in storage, and no
   * write path could create one: the repository derived every calendar's shifts from a 7-bit
   * weekday mask, so every calendar in every database was a whole-day calendar and the
   * minute-granular machinery underneath was exercised only by unit tests.
   */
  describe('authorable shift patterns (TECH_DEBT #80)', () => {
    it('authors a split shift and reads the windows back exactly', async () => {
      const { actor } = await adminWithOrg();
      const res = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({
          name: 'Two shifts',
          // 08:00–12:00 and 13:00–17:00 on Monday — a lunch break, which a mask cannot express.
          shifts: [
            { weekday: 0, startMinute: 480, endMinute: 720 },
            { weekday: 0, startMinute: 780, endMinute: 1020 },
          ],
        })
        .expect(201);
      expect(res.body.data.shifts).toEqual([
        { weekday: 0, startMinute: 480, endMinute: 720 },
        { weekday: 0, startMinute: 780, endMinute: 1020 },
      ]);
      // Derived, and lossy on purpose: the mask can only say Monday works.
      expect(res.body.data.workingWeekdays).toBe(1);
    });

    it('authors a night shift as two adjacent-day windows, not a wrap', async () => {
      const { actor } = await adminWithOrg();
      const res = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({
          name: 'Nights',
          shifts: [
            { weekday: 0, startMinute: 1200, endMinute: 1440 }, // Mon 20:00–24:00
            { weekday: 1, startMinute: 0, endMinute: 360 }, // Tue 00:00–06:00
          ],
        })
        .expect(201);
      expect(res.body.data.shifts).toHaveLength(2);
    });

    it('replaces the whole week on update, whichever form the patch uses', async () => {
      const { actor } = await adminWithOrg();
      const created = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Replaceable', workingWeekdays: STANDARD_WEEKDAYS_MASK })
        .expect(201);
      const res = await actor.agent
        .patch(`/api/v1/organizations/acme/calendars/${created.body.data.id as string}`)
        .send({
          shifts: [{ weekday: 4, startMinute: 480, endMinute: 720 }], // half-day Friday only
          version: created.body.data.version,
        })
        .expect(200);
      // The five full-day rows the mask created must be gone — the two fields are two spellings
      // of one value, so a patch naming one cannot leave rows the other put there.
      expect(res.body.data.shifts).toEqual([{ weekday: 4, startMinute: 480, endMinute: 720 }]);
      expect(res.body.data.workingWeekdays).toBe(0b0010000);
    });

    it('refuses overlapping, unsorted, or inverted windows at the boundary', async () => {
      const { actor } = await adminWithOrg();
      const base = '/api/v1/organizations/acme/calendars';
      const bad = (shifts: unknown) => actor.agent.post(base).send({ name: 'Bad', shifts });
      // Overlapping: 08:00–12:00 and 11:00–17:00.
      await bad([
        { weekday: 0, startMinute: 480, endMinute: 720 },
        { weekday: 0, startMinute: 660, endMinute: 1020 },
      ]).expect(422);
      // Unsorted — rejected rather than quietly reordered.
      await bad([
        { weekday: 0, startMinute: 780, endMinute: 1020 },
        { weekday: 0, startMinute: 480, endMinute: 720 },
      ]).expect(422);
      // Inverted, which is what a wrapped night shift looks like if authored as one window.
      await bad([{ weekday: 0, startMinute: 1200, endMinute: 360 }]).expect(422);
    });

    it('refuses both spellings of the week at once, and neither', async () => {
      const { actor } = await adminWithOrg();
      const base = '/api/v1/organizations/acme/calendars';
      await actor.agent
        .post(base)
        .send({
          name: 'Both',
          workingWeekdays: STANDARD_WEEKDAYS_MASK,
          shifts: [{ weekday: 0, startMinute: 480, endMinute: 720 }],
        })
        .expect(422);
      await actor.agent.post(base).send({ name: 'Neither' }).expect(422);
    });
  });

  /**
   * TECH_DEBT #79. ADR-0036 §2 made a window-only base week valid — every weekday non-working,
   * all working time from dated exception windows (a plant turnaround, a shutdown programme) —
   * and said the old "mask must be non-zero" guard was replaced by the engine's
   * `buildWorkingTimeCalendar` check. The DTO's `@Min(1)` was never relaxed to match, so for a
   * year the engine supported the shape and the API answered 422. (There is no DB CHECK behind
   * the mask, and no `working_weekdays` column either — the same rework moved the weekly pattern
   * into `calendar_shifts`. An earlier draft of this comment claimed one and sent the first
   * reader looking for a migration to write.)
   */
  describe('window-only calendars (TECH_DEBT #79)', () => {
    it('accepts a zero mask — the turnaround shape the engine already supports', async () => {
      const { actor } = await adminWithOrg();
      const res = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Turnaround', workingWeekdays: 0 })
        .expect(201);
      expect(res.body.data).toMatchObject({ name: 'Turnaround', workingWeekdays: 0 });
    });

    it('lets an existing calendar be narrowed to window-only', async () => {
      const { actor } = await adminWithOrg();
      const created = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Shutdown', workingWeekdays: STANDARD_WEEKDAYS_MASK })
        .expect(201);
      const res = await actor.agent
        .patch(`/api/v1/organizations/acme/calendars/${created.body.data.id as string}`)
        .send({ workingWeekdays: 0, version: created.body.data.version })
        .expect(200);
      expect(res.body.data.workingWeekdays).toBe(0);
    });

    it('still refuses a mask outside the week', async () => {
      const { actor } = await adminWithOrg();
      await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Impossible', workingWeekdays: 128 })
        .expect(422);
      await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Negative', workingWeekdays: -1 })
        .expect(422);
    });
  });

  /**
   * TECH_DEBT #80, the exceptions half. `createException` derived a day's windows from the
   * `isWorking` boolean — the exact mirror of the mask→full-day-shift derivation the weekly half
   * replaced — so a worked exception was always a WHOLE worked day. A half-day before a holiday,
   * a short-crew shutdown day, and the working hours a window-only calendar exists to carry were
   * all unauthorable, while `calendar_exception_windows` sat in the schema and the engine read it.
   */
  describe('authorable exception windows (TECH_DEBT #80)', () => {
    const exceptionsOf = async (actor: Actor, calendarId: string) =>
      (await actor.agent.get(`${base}/${calendarId}`).expect(200)).body.data.exceptions as {
        date: string;
        endDate: string;
        isWorking: boolean;
        windows: { startMinute: number; endMinute: number }[];
      }[];

    it('stores explicit windows and reads them back', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Half-day Christmas Eve');

      await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({
          date: '2026-12-24',
          label: 'Christmas Eve — morning only',
          windows: [{ startMinute: 480, endMinute: 720 }],
        })
        .expect(201);

      const [exception] = await exceptionsOf(actor, id);
      expect(exception).toMatchObject({
        date: '2026-12-24',
        // Derived: the day has a window, so it works — but only `windows` says for how long.
        isWorking: true,
        windows: [{ startMinute: 480, endMinute: 720 }],
      });
    });

    it('stores a split shift on one exception day', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Split shutdown day');

      await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({
          date: '2026-07-01',
          windows: [
            { startMinute: 360, endMinute: 720 },
            { startMinute: 780, endMinute: 1200 },
          ],
        })
        .expect(201);

      const [exception] = await exceptionsOf(actor, id);
      expect(exception?.windows).toEqual([
        { startMinute: 360, endMinute: 720 },
        { startMinute: 780, endMinute: 1200 },
      ]);
    });

    it('keeps `isWorking` shorthand working — a whole worked day is one full-day window', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Worked Saturday');

      await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({ date: '2026-08-01', isWorking: true })
        .expect(201);

      const [exception] = await exceptionsOf(actor, id);
      expect(exception).toMatchObject({
        isWorking: true,
        windows: [{ startMinute: 0, endMinute: 1440 }],
      });
    });

    it('reads a holiday as no windows at all', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Bank holiday');

      await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({ date: '2026-08-31', label: 'Summer bank holiday' })
        .expect(201);

      const [exception] = await exceptionsOf(actor, id);
      expect(exception).toMatchObject({ isWorking: false, windows: [] });
    });

    it('exposes `endDate` so the stored range is never silently dropped', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Range visible');

      await actor.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-05-04' }).expect(201);

      const [exception] = await exceptionsOf(actor, id);
      // A date sent on its own is still one day; that a span can now DIFFER is covered by the
      // range block below.
      expect(exception).toMatchObject({ date: '2026-05-04', endDate: '2026-05-04' });
    });

    it('refuses `windows` and `isWorking` together — two answers to one question', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Contradiction');

      await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({
          date: '2026-09-01',
          isWorking: true,
          windows: [{ startMinute: 480, endMinute: 720 }],
        })
        .expect(422);

      // `isWorking: false` beside windows is the contradiction that matters most — it says
      // "holiday" and "these hours" at once. `null`/absent is not a value, so it stays allowed.
      await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({
          date: '2026-09-01',
          isWorking: false,
          windows: [{ startMinute: 480, endMinute: 720 }],
        })
        .expect(422);
    });

    it('refuses an empty `windows` array — a holiday has exactly one spelling', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Empty set');

      await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({ date: '2026-09-02', windows: [] })
        .expect(422);
    });

    it('refuses overlapping, unsorted or inverted windows at the boundary', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Bad windows');
      const post = (windows: unknown) =>
        actor.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-10-01', windows });

      // Overlap — the engine asserts this too, but at RECALCULATION time, which surfaces a
      // calendar mistake as a failed schedule run pointing at the plan.
      await post([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 600, endMinute: 900 },
      ]).expect(422);
      // Unsorted: rejected rather than quietly sorted — storage is order-sensitive, and
      // reordering the author's input hides which pair they got wrong.
      await post([
        { startMinute: 780, endMinute: 1200 },
        { startMinute: 360, endMinute: 720 },
      ]).expect(422);
      // Inverted and empty spans.
      await post([{ startMinute: 720, endMinute: 480 }]).expect(422);
      await post([{ startMinute: 480, endMinute: 480 }]).expect(422);
      // Outside the day.
      await post([{ startMinute: 0, endMinute: 1441 }]).expect(422);
      await post([{ startMinute: -1, endMinute: 480 }]).expect(422);
    });

    // The proof that the ENGINE reads what was authored — rather than the API merely storing
    // it — lives in `schedule.e2e-spec.ts`, where the plan/activity/recalculate harness already
    // is. Storing a window nothing schedules on would be exactly the defect this closes.
  });

  /**
   * An exception spanning more than one day (surface audit F2).
   *
   * `calendar_exceptions` has held `start_date`/`end_date` with a GiST exclusion constraint over
   * `daterange(start_date, end_date, '[]')` since the table was created, the read DTO has always
   * returned `endDate`, and `plan-calendar.ts` has always fed the engine the whole span. Only the
   * write paths collapsed it, so a Christmas fortnight or a plant shutdown had to be entered as ten
   * to fourteen separate one-day exceptions — on a schema, a constraint and a read model that all
   * described the range the planner actually meant.
   */
  describe('exceptions spanning a range (surface audit F2)', () => {
    const addException = async (actor: Actor, calendarId: string, body: object) =>
      (await actor.agent.post(`${base}/${calendarId}/exceptions`).send(body).expect(201)).body
        .data as { id: string; version: number; date: string; endDate: string };

    it('creates one exception covering a shutdown, not fourteen', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Shutdown range');

      const created = await addException(actor, id, {
        date: '2026-12-24',
        endDate: '2027-01-02',
        label: 'Christmas shutdown',
      });
      expect(created).toMatchObject({ date: '2026-12-24', endDate: '2027-01-02' });

      const { body } = await actor.agent.get(`${base}/${id}`).expect(200);
      // ONE row, not ten. That is the whole finding.
      expect(body.data.exceptions).toHaveLength(1);
    });

    it('treats an omitted `endDate` as a single day — what `date` alone has always meant', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Single day');

      const created = await addException(actor, id, { date: '2026-05-04' });
      expect(created).toMatchObject({ date: '2026-05-04', endDate: '2026-05-04' });
    });

    it('refuses a range that ends before it starts (N-shaped boundary)', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Backwards range');

      const res = await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({ date: '2027-01-02', endDate: '2026-12-24' })
        .expect(422);
      // An empty range is the one shape the DB's exclusion constraint cannot express — it overlaps
      // nothing — so the service owns this check and names both dates.
      expect(res.body.error.details).toMatchObject({ reason: 'EXCEPTION_RANGE_INVERTED' });
    });

    it('rejects a second exception overlapping an existing span', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Overlapping spans');
      await addException(actor, id, { date: '2026-12-24', endDate: '2027-01-02' });

      // Inside the shutdown, on a day the first exception already covers.
      const res = await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({ date: '2026-12-28' })
        .expect(409);
      expect(res.body.error.details).toMatchObject({ reason: 'DUPLICATE_EXCEPTION' });
    });

    it('extends a shutdown in place, keeping the same row', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Extendable');
      const created = await addException(actor, id, { date: '2026-12-24', endDate: '2027-01-02' });

      const res = await actor.agent
        .patch(`${base}/${id}/exceptions/${created.id}`)
        .send({ endDate: '2027-01-05', version: created.version })
        .expect(200);
      // Same id: extending a shutdown is an edit, not a delete-and-recreate — which is exactly the
      // window in which a holiday briefly becomes an ordinary working day.
      expect(res.body.data).toMatchObject({
        id: created.id,
        date: '2026-12-24',
        endDate: '2027-01-05',
      });
    });

    it('collapses a range back to one day when `endDate` equals the first day', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Collapsible');
      const created = await addException(actor, id, { date: '2026-12-24', endDate: '2027-01-02' });

      const res = await actor.agent
        .patch(`${base}/${id}/exceptions/${created.id}`)
        .send({ endDate: '2026-12-24', version: created.version })
        .expect(200);
      expect(res.body.data).toMatchObject({ date: '2026-12-24', endDate: '2026-12-24' });
    });

    it('refuses an edit that would end the exception before its first day', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Backwards edit');
      const created = await addException(actor, id, { date: '2026-12-24', endDate: '2027-01-02' });

      const res = await actor.agent
        .patch(`${base}/${id}/exceptions/${created.id}`)
        .send({ endDate: '2026-12-01', version: created.version })
        .expect(422);
      // Measured against the row's OWN first day: this endpoint cannot move an exception, so there
      // is no sibling field to compare with.
      expect(res.body.error.details).toMatchObject({ reason: 'EXCEPTION_RANGE_INVERTED' });
    });

    it('reports an extension that collides with the next exception as a 409', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Colliding extension');
      const first = await addException(actor, id, { date: '2026-12-24', endDate: '2026-12-28' });
      await addException(actor, id, { date: '2027-01-02' });

      // Extending the shutdown across New Year would swallow the second exception's day. The
      // exclusion constraint catches it; the service turns it into the same 409 create reports,
      // because it is the same conflict.
      const res = await actor.agent
        .patch(`${base}/${id}/exceptions/${first.id}`)
        .send({ endDate: '2027-01-05', version: first.version })
        .expect(409);
      expect(res.body.error.details).toMatchObject({ reason: 'DUPLICATE_EXCEPTION' });
    });

    it('refuses a span beyond the ceiling — a typo, and an unbounded engine build', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Century shutdown');

      // The year typed as 2226 rather than 2026. Storing it would also make every recalculation
      // walk 73,000 days building this calendar, because the engine expands each exception once.
      const res = await actor.agent
        .post(`${base}/${id}/exceptions`)
        .send({ date: '2026-12-24', endDate: '2226-01-02' })
        .expect(422);
      expect(res.body.error.details).toMatchObject({ reason: 'EXCEPTION_RANGE_TOO_LONG' });
    });

    it('leaves the span alone when `endDate` is omitted from an edit', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Untouched span');
      const created = await addException(actor, id, { date: '2026-12-24', endDate: '2027-01-02' });

      const res = await actor.agent
        .patch(`${base}/${id}/exceptions/${created.id}`)
        .send({ label: 'Renamed', version: created.version })
        .expect(200);
      expect(res.body.data).toMatchObject({
        date: '2026-12-24',
        endDate: '2027-01-02',
        label: 'Renamed',
      });
    });
  });

  /**
   * Before this endpoint an exception could be created and deleted, never edited. Correcting a
   * day's hours meant delete-then-recreate: two writes, a new id, and a window in which a holiday
   * had become an ordinary working day — one a recalculation landing between them would have
   * scheduled work on. `CalendarException.version` existed, was returned on read, and was never
   * used for a write.
   */
  describe('editing an exception (spec Q1)', () => {
    const addException = async (actor: Actor, calendarId: string, body: object) =>
      (await actor.agent.post(`${base}/${calendarId}/exceptions`).send(body).expect(201)).body
        .data as { id: string; version: number };

    const exceptionsOf = async (actor: Actor, calendarId: string) =>
      (await actor.agent.get(`${base}/${calendarId}`).expect(200)).body.data.exceptions as {
        id: string;
        isWorking: boolean;
        label: string | null;
        windows: { startMinute: number; endMinute: number }[];
      }[];

    it('replaces the day’s windows as a set', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Editable');
      const exception = await addException(actor, id, {
        date: '2026-04-01',
        windows: [
          { startMinute: 480, endMinute: 720 },
          { startMinute: 780, endMinute: 1020 },
        ],
      });

      const res = await actor.agent
        .patch(`${base}/${id}/exceptions/${exception.id}`)
        .send({ windows: [{ startMinute: 540, endMinute: 660 }], version: exception.version })
        .expect(200);

      // A set, not a merge: the two windows it replaces are gone, not kept alongside.
      expect(res.body.data.windows).toEqual([{ startMinute: 540, endMinute: 660 }]);
      const [stored] = await exceptionsOf(actor, id);
      expect(stored?.windows).toEqual([{ startMinute: 540, endMinute: 660 }]);
    });

    it('turns a holiday into a worked day and back, keeping the same row', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Flip');
      const exception = await addException(actor, id, { date: '2026-04-02' });

      const worked = await actor.agent
        .patch(`${base}/${id}/exceptions/${exception.id}`)
        .send({ isWorking: true, version: exception.version })
        .expect(200);
      expect(worked.body.data).toMatchObject({
        id: exception.id,
        isWorking: true,
        windows: [{ startMinute: 0, endMinute: 1440 }],
      });

      const holiday = await actor.agent
        .patch(`${base}/${id}/exceptions/${exception.id}`)
        .send({ isWorking: false, version: worked.body.data.version as number })
        .expect(200);
      // The id is stable across both edits — the whole reason this endpoint exists rather than
      // delete-and-recreate.
      expect(holiday.body.data).toMatchObject({ id: exception.id, isWorking: false, windows: [] });
    });

    it('edits only the label when neither `windows` nor `isWorking` is sent', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Label only');
      const exception = await addException(actor, id, {
        date: '2026-04-03',
        windows: [{ startMinute: 480, endMinute: 720 }],
        label: 'Half day',
      });

      const res = await actor.agent
        .patch(`${base}/${id}/exceptions/${exception.id}`)
        .send({ label: 'Half day (revised)', version: exception.version })
        .expect(200);

      // The hours survive an edit that never mentioned them — the label-only case is the one most
      // likely to quietly clear them, since "absent" and "empty" are easy to conflate.
      expect(res.body.data).toMatchObject({
        label: 'Half day (revised)',
        windows: [{ startMinute: 480, endMinute: 720 }],
      });
    });

    it('rejects a stale version with a 409', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Stale');
      const exception = await addException(actor, id, { date: '2026-04-04' });

      await actor.agent
        .patch(`${base}/${id}/exceptions/${exception.id}`)
        .send({ isWorking: true, version: exception.version })
        .expect(200);
      // The same version again — the row has moved on.
      await actor.agent
        .patch(`${base}/${id}/exceptions/${exception.id}`)
        .send({ isWorking: false, version: exception.version })
        .expect(409);
    });

    it('bumps the parent calendar’s version, as create and delete do', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Parent bump');
      const exception = await addException(actor, id, { date: '2026-04-05' });
      const before = (await actor.agent.get(`${base}/${id}`).expect(200)).body.data
        .version as number;

      await actor.agent
        .patch(`${base}/${id}/exceptions/${exception.id}`)
        .send({ isWorking: true, version: exception.version })
        .expect(200);

      const after = (await actor.agent.get(`${base}/${id}`).expect(200)).body.data
        .version as number;
      expect(after).toBe(before + 1);
    });

    it('refuses the same contradictions the create refuses', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Bad edits');
      const exception = await addException(actor, id, { date: '2026-04-06' });
      const patch = (body: object) =>
        actor.agent.patch(`${base}/${id}/exceptions/${exception.id}`).send(body);

      await patch({ isWorking: true, windows: [{ startMinute: 0, endMinute: 60 }], version: 1 })
        // Two answers to one question, exactly as on create.
        .expect(422);
      await patch({ windows: [], version: 1 }).expect(422);
      await patch({
        windows: [
          { startMinute: 480, endMinute: 720 },
          { startMinute: 600, endMinute: 900 },
        ],
        version: 1,
      }).expect(422);
      await patch({ windows: [{ startMinute: 720, endMinute: 480 }], version: 1 }).expect(422);
      // `version` is required — an edit that cannot conflict is an edit that can clobber.
      await patch({ isWorking: true }).expect(422);
    });

    it('is 404 for an exception belonging to another calendar (anti-IDOR)', async () => {
      const { actor } = await adminWithOrg();
      const mine = await createCalendar(actor, 'Mine');
      const other = await createCalendar(actor, 'Other');
      const exception = await addException(actor, other, { date: '2026-04-07' });

      // A real exception id, a real calendar id the caller may write to — but they are not related.
      // The lookup requires BOTH, so the calendar in the path can never be decoration.
      await actor.agent
        .patch(`${base}/${mine}/exceptions/${exception.id}`)
        .send({ isWorking: true, version: exception.version })
        .expect(404);
    });

    it('is 404 across organisations, not 403', async () => {
      const { actor } = await adminWithOrg();
      const id = await createCalendar(actor, 'Theirs');
      const exception = await addException(actor, id, { date: '2026-04-08' });

      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);
      await outsider.agent
        .patch(`${base}/${id}/exceptions/${exception.id}`)
        .send({ isWorking: true, version: exception.version })
        .expect(404);
    });
  });

  it('creates, gets and lists calendars', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Project Calendar');

    const got = await actor.agent.get(`${base}/${id}`).expect(200);
    expect(got.body.data).toMatchObject({
      name: 'Project Calendar',
      workingWeekdays: STANDARD_WEEKDAYS_MASK,
    });
    expect(got.body.data.exceptions).toEqual([]);

    const list = await actor.agent.get(base).expect(200);
    // The seeded Standard plus the one just created.
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.map((c: { name: string }) => c.name).sort()).toEqual([
      'Project Calendar',
      'Standard',
    ]);
    expect(list.body.meta).toMatchObject({ hasMore: false });
    // The list shape is the summary — no embedded exceptions.
    expect(list.body.data[0]).not.toHaveProperty('exceptions');
  });

  it('rejects an invalid working-weekday mask (422)', async () => {
    const { actor } = await adminWithOrg();
    // `workingWeekdays: 0` was asserted here as a 422 and is now a 201 — see the window-only
    // describe block below. It moved rather than being deleted: the shape is valid (ADR-0036 §2),
    // so the case is still worth a test, just with the opposite expectation.
    await actor.agent.post(base).send({ name: 'TooWide', workingWeekdays: 128 }).expect(422);
    await actor.agent.post(base).send({ name: 'NoPattern' }).expect(422);
  });

  it('rejects a duplicate active name (409) but allows reuse after delete', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Dup');
    await actor.agent
      .post(base)
      .send({ name: 'Dup', workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(409);

    await actor.agent.delete(`${base}/${id}`).expect(204);
    // Same name is free once the holder is soft-deleted.
    await createCalendar(actor, 'Dup');
  });

  it('updates with optimistic locking (stale version → 409) and changes the pattern', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Renamed');

    const ok = await actor.agent
      .patch(`${base}/${id}`)
      .send({ name: 'Renamed 7-day', workingWeekdays: ALL_WEEKDAYS_MASK, version: 1 })
      .expect(200);
    expect(ok.body.data).toMatchObject({
      name: 'Renamed 7-day',
      workingWeekdays: ALL_WEEKDAYS_MASK,
      version: 2,
    });

    await actor.agent.patch(`${base}/${id}`).send({ name: 'Again', version: 1 }).expect(409);
  });

  it('adds, lists and removes exceptions; bumps the calendar version; blocks duplicates', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Holidays');

    const added = await actor.agent
      .post(`${base}/${id}/exceptions`)
      .send({ date: '2026-12-25', label: 'Christmas Day' })
      .expect(201);
    expect(added.body.data).toMatchObject({
      date: '2026-12-25',
      isWorking: false,
      label: 'Christmas Day',
    });
    const exceptionId = added.body.data.id as string;

    // A worked Saturday (isWorking: true).
    await actor.agent
      .post(`${base}/${id}/exceptions`)
      .send({ date: '2026-01-17', isWorking: true })
      .expect(201);

    // Duplicate date on the same calendar → 409.
    await actor.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(409);

    // Adding exceptions bumped the calendar version (1 → 3 after two adds).
    const got = await actor.agent.get(`${base}/${id}`).expect(200);
    expect(got.body.data.version).toBe(3);
    expect(got.body.data.exceptions).toHaveLength(2);
    // Exceptions are returned date-ordered.
    expect(got.body.data.exceptions.map((e: { date: string }) => e.date)).toEqual([
      '2026-01-17',
      '2026-12-25',
    ]);

    await actor.agent.delete(`${base}/${id}/exceptions/${exceptionId}`).expect(204);
    const afterRemove = await actor.agent.get(`${base}/${id}`).expect(200);
    expect(afterRemove.body.data.exceptions).toHaveLength(1);
    expect(afterRemove.body.data.version).toBe(4);
    // The removed date is free to re-add (partial unique ignores soft-deleted rows).
    await actor.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(201);
  });

  it('soft-deletes a calendar and its exceptions together', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Cascade');
    await actor.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(201);

    await actor.agent.delete(`${base}/${id}`).expect(204);

    // The calendar is gone from the active list (the seeded Standard remains)...
    const list = await actor.agent.get(base).expect(200);
    expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(id);
    // ...and its exceptions were soft-deleted in the same batch.
    const cal = await prisma.calendar.findUniqueOrThrow({ where: { id } });
    const exceptions = await prisma.calendarException.findMany({ where: { calendarId: id } });
    expect(cal.deletedAt).not.toBeNull();
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.deletedAt).not.toBeNull();
    expect(exceptions[0]?.deleteBatchId).toBe(cal.deleteBatchId);
  });

  it('refuses to delete a calendar in use by an active plan (409 CALENDAR_IN_USE)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const calId = await createCalendar(actor, 'In Use');

    // Seed a client → project → plan referencing the calendar directly (the plan
    // calendar picker is a web concern; here we assert the service guard).
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: 'C', createdBy: actor.userId },
    });
    const project = await prisma.project.create({
      data: { organizationId: orgId, clientId: client.id, name: 'P', createdBy: actor.userId },
    });
    const plan = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        name: 'Pl',
        plannedStart: new Date('2026-01-01T00:00:00.000Z'),
        calendarId: calId,
        createdBy: actor.userId,
      },
    });

    const res = await actor.agent.delete(`${base}/${calId}`).expect(409);
    expect(res.body.error?.details?.reason).toBe('CALENDAR_IN_USE');
    // Still active — the delete was refused.
    await actor.agent.get(`${base}/${calId}`).expect(200);

    // Once the plan is soft-deleted it no longer counts, so the calendar can be deleted.
    await prisma.plan.update({ where: { id: plan.id }, data: { deletedAt: new Date() } });
    await actor.agent.delete(`${base}/${calId}`).expect(204);
  });

  it('404s a foreign/unknown calendar id and hides calendars from non-members', async () => {
    const { actor } = await adminWithOrg();
    const id = await createCalendar(actor, 'Secret');

    const missingExceptionId = '00000000-0000-0000-0000-000000000000';
    const outsider = await signUp('outsider@example.com');
    // Non-member: the org is invisible (404, not 403) on every route, read or write.
    await outsider.agent.get(base).expect(404);
    await outsider.agent.get(`${base}/${id}`).expect(404);
    await outsider.agent.patch(`${base}/${id}`).send({ name: 'X', version: 1 }).expect(404);
    await outsider.agent.delete(`${base}/${id}`).expect(404);
    await outsider.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(404);
    await outsider.agent.delete(`${base}/${id}/exceptions/${missingExceptionId}`).expect(404);

    // A member of a *different* org cannot reach this org's calendar on ANY route —
    // scope resolves to 'other', then the scoped calendar load 404s (anti-IDOR).
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const other = '/api/v1/organizations/other/calendars';
    await outsider.agent.get(`${other}/${id}`).expect(404);
    await outsider.agent.patch(`${other}/${id}`).send({ name: 'X', version: 1 }).expect(404);
    await outsider.agent.delete(`${other}/${id}`).expect(404);
    await outsider.agent.post(`${other}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(404);
    await outsider.agent.delete(`${other}/${id}/exceptions/${missingExceptionId}`).expect(404);
  });

  it('forbids Viewer and Contributor writes but allows reading (403 / 200)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const id = await createCalendar(actor, 'Visible');

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });

    const missingExceptionId = '00000000-0000-0000-0000-000000000000';
    for (const member of [viewer, contributor]) {
      await member.agent.get(base).expect(200);
      await member.agent.get(`${base}/${id}`).expect(200);
      await member.agent
        .post(base)
        .send({ name: 'Nope', workingWeekdays: STANDARD_WEEKDAYS_MASK })
        .expect(403);
      await member.agent.patch(`${base}/${id}`).send({ name: 'Nope', version: 1 }).expect(403);
      await member.agent.post(`${base}/${id}/exceptions`).send({ date: '2026-12-25' }).expect(403);
      // removeException denies on calendar:update before it ever loads the exception.
      await member.agent.delete(`${base}/${id}/exceptions/${missingExceptionId}`).expect(403);
      await member.agent.delete(`${base}/${id}`).expect(403);
    }
  });

  it('401s without a session', async () => {
    await request(server()).get(base).expect(401);
  });
});
