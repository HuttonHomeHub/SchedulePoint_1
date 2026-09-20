import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **FC-7 Part B — the PRODUCT half of the placed-basis parity claim**
 * (`docs/specs/one-planning-surface/`, M-P-T3).
 *
 * FC-11 asserts the same invariant at `computeSchedule`, and the two deliberately do not substitute
 * for each other: ADR-0066 exists because all 117 capability keys were proven at the engine and none
 * at the application, and the two defects that motivated it were green at the engine and wrong in
 * the product. So this builds the plan through the **public REST API** — the real DTOs, the real
 * guards, the real write path, the real recalculation and the real read serialisation — and asserts
 * over the response a client actually receives.
 *
 * **The claim:** on a plan carrying progress, a Level of Effort and a WBS summary, and **no
 * placement anywhere**, every activity's `visualEffectiveStart`/`visualEffectiveFinish` equals its
 * `earlyStart`/`earlyFinish`.
 *
 * **What it looked like before M-P** (`m-p/red-run.md` at the engine,
 * `m-p/progress-parity.md` here): an in-progress activity's placed bar ignored its frozen actual
 * start and ran at full duration; a completed one ignored both actuals; an LOE and a summary each
 * collapsed to a **point**. A planner with progress reported saw two different pictures of the same
 * activity depending on which basis the view read — and M-F makes the placed basis the only one.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface Row {
  code: string;
  type: string;
  earlyStart: string | null;
  earlyFinish: string | null;
  visualEffectiveStart: string | null;
  visualEffectiveFinish: string | null;
}

describe.skipIf(!hasDatabase)('Placed-basis parity where nothing is placed (e2e)', () => {
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

  /**
   * A plan that exercises all three branches Pass 1 has and Pass 2 did not, plus plain tasks as the
   * control. **No `visualStart` is sent anywhere** — that is the condition, and a placement would
   * make a difference legitimate and the assertion meaningless.
   *
   * The calendar is left at the plan default deliberately: this is a parity claim between two
   * readings of the SAME schedule, so any calendar makes it, and pinning one would suggest the
   * result depends on working days when it does not.
   */
  async function seedProgressedPlan(): Promise<{ actor: Actor; planId: string; rows: Row[] }> {
    const actor = await signUp('parity-admin@example.com');
    await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Parity', plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;

    const create = async (body: object): Promise<{ id: string; version: number }> => {
      const res = await actor.agent.post(base).send(body).expect(201);
      return { id: res.body.data.id as string, version: res.body.data.version as number };
    };

    // The control: two plain unprogressed tasks, which agreed on both bases before M-P too. Without
    // them a run that returned no rows at all would pass, and a run in which EVERYTHING was broken
    // would look the same as one in which nothing was.
    const spine = await create({ name: 'Spine', code: 'SPINE', durationDays: 3 });
    const tail = await create({ name: 'Tail', code: 'TAIL', durationDays: 2 });

    // A summary over a child that starts AFTER the data date. The late start is the point: with the
    // child at the data date, Pass 2's bare data-date answer and Pass 1's rolled-up start coincide,
    // and this case passes over a summary that renders at the data date whatever its children do.
    const summary = await create({ name: 'Structure', code: 'SUMMARY', type: 'WBS_SUMMARY' });
    const lead = await create({ name: 'Lead-in', code: 'LEAD', durationDays: 5 });
    const child = await create({
      name: 'Frame',
      code: 'CHILD',
      durationDays: 4,
      parentId: summary.id,
    });

    // A Level of Effort hammocking the spine: SS from it, FF to the tail. Its span is DERIVED and
    // its input duration is zero, which is what made it collapse.
    const loe = await create({ name: 'Supervision', code: 'LOE', type: 'LEVEL_OF_EFFORT' });

    // A started activity and a completed one. Their actuals sit **BEFORE** the data date, which is
    // exactly where the data-date-anchored offset mapping Pass 2 used is lossy — and it is not
    // incidental: the first draft reported both actuals ON the data date, and the two bases then
    // agreed about the START of both rows while disagreeing about their finishes. A fixture whose
    // actuals coincide with the data date cannot exhibit half the defect it is written for.
    const started = await create({ name: 'Excavate', code: 'STARTED', durationDays: 4 });
    const done = await create({ name: 'Survey', code: 'DONE', durationDays: 4 });

    const link = async (predecessorId: string, successorId: string, type: string) =>
      actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId, successorId, type })
        .expect(201);
    await link(spine.id, tail.id, 'FS');
    await link(spine.id, loe.id, 'SS');
    await link(loe.id, tail.id, 'FF');
    await link(lead.id, child.id, 'FS');

    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${started.id}/progress`)
      .send({ percentComplete: 50, actualStart: '2026-01-02', version: started.version })
      .expect(200);
    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${done.id}/progress`)
      .send({
        percentComplete: 100,
        actualStart: '2026-01-02',
        actualFinish: '2026-01-03',
        version: done.version,
      })
      .expect(200);

    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
      .send({})
      .expect(200);

    const list = await actor.agent.get(`${base}?limit=100`).expect(200);
    const rows = (list.body.data as Row[]).map((r) => ({
      code: r.code,
      type: r.type,
      earlyStart: r.earlyStart,
      earlyFinish: r.earlyFinish,
      visualEffectiveStart: r.visualEffectiveStart,
      visualEffectiveFinish: r.visualEffectiveFinish,
    }));
    return { actor, planId, rows };
  }

  it('renders every activity identically on both bases, through the public read', async () => {
    const { rows } = await seedProgressedPlan();

    // The fixture is only worth what it contains: assert the shapes are present before comparing
    // them, or a seeding change that quietly dropped the LOE would leave this green (ADR-0093).
    expect(rows.map((r) => r.code).sort()).toEqual(
      ['CHILD', 'DONE', 'LEAD', 'LOE', 'SPINE', 'STARTED', 'SUMMARY', 'TAIL'].sort(),
    );
    expect(rows.some((r) => r.type === 'WBS_SUMMARY')).toBe(true);
    expect(rows.some((r) => r.type === 'LEVEL_OF_EFFORT')).toBe(true);
    // A schedule that never computed would have nulls throughout and compare equal to itself.
    expect(rows.every((r) => r.earlyStart !== null && r.earlyFinish !== null)).toBe(true);

    // One whole-map comparison, so a failure names EVERY diverging activity rather than stopping at
    // the first — the class is what matters here, not the first member of it.
    const placed = Object.fromEntries(
      rows.map((r) => [r.code, { s: r.visualEffectiveStart, f: r.visualEffectiveFinish }]),
    );
    const early = Object.fromEntries(
      rows.map((r) => [r.code, { s: r.earlyStart, f: r.earlyFinish }]),
    );
    expect(placed).toEqual(early);
  });

  it('the derived-span rows really are derived, so the comparison above is not vacuous', async () => {
    const { rows } = await seedProgressedPlan();
    const by = (code: string) => rows.find((r) => r.code === code)!;

    // A summary and an LOE that had collapsed to a point would still satisfy the equality above if
    // Pass 1 had collapsed them too. It has not, and these assert that: both span more than a day,
    // and the summary does NOT begin at the data date.
    expect(by('SUMMARY').earlyStart).not.toBe(by('SUMMARY').earlyFinish);
    expect(by('SUMMARY').earlyStart).not.toBe('2026-01-05');
    expect(by('LOE').earlyStart).not.toBe(by('LOE').earlyFinish);
    // The started activity's early start is its frozen actual, and it precedes the data date —
    // the condition under which Pass 2's offset mapping was lossy.
    expect(by('STARTED').earlyStart).toBe('2026-01-02');
    expect(by('DONE').earlyStart).toBe('2026-01-02');
    expect(by('DONE').earlyFinish).toBe('2026-01-03');
  });
  /**
   * **FC-4 — remaining float, over the real route, where the naive derivation is wrong** (M-D).
   *
   * `schedule.repository.day-factor.spec.ts` pins the arithmetic and states in its own docblock what
   * it cannot see: it mocks `$executeRaw`, so **deleting the column from the `UPDATE SET` leaves it
   * green** while the computed value reaches no column at all. Measured, not assumed — three
   * mutations were run there and that one does not discriminate. This closes it by reading the value
   * back over the public route from a real database.
   *
   * **The fixture is chosen so the two forms disagree**, because one where they agree passes against
   * both implementations — the ADR-0139 shape. Eight-hour days; a four-hour predecessor so the
   * successor's early start lands half a day in; the successor placed two days out. Drift is then
   * `2 × 480 − 240 = 720` working minutes, total float 0, and:
   *
   * - naive (what a client can compute): `round(0/480) − round(720/480)` = `0 − 2` = **−2**
   * - correct (one rounding): `round((0 − 720)/480)` = `round(−1.5)` = **−1**
   *
   * A planner nudging a critical bar a day and a half is told it is one day past its float, not two.
   */
  describe('remaining float over the public route (FC-4)', () => {
    it('reports the single-rounding value, which the two day columns cannot produce', async () => {
      const actor = await signUp('fc4-admin@example.com');
      await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);

      // An eight-hour working day, Monday–Friday. Authored through the real calendar route, so the
      // hours-per-day factor is derived the way ADR-0068 derives it and not asserted here.
      const shifts = [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      }));
      const calendar = await actor.agent
        .post('/api/v1/organizations/acme/calendars')
        .send({ name: 'Eight hours', shifts })
        .expect(201);

      const client = await actor.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await actor.agent
        .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
        .send({ name: 'Riverside' })
        .expect(201);
      // Monday 2026-01-05, so the first working day is the data date itself.
      const plan = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
        .send({ name: 'Eight-hour plan', plannedStart: '2026-01-05' })
        .expect(201);
      const planId = plan.body.data.id as string;
      await actor.agent
        .patch(`/api/v1/organizations/acme/plans/${planId}`)
        .send({ calendarId: calendar.body.data.id, version: plan.body.data.version })
        .expect(200);

      const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
      // Four HOURS, not days — this is what makes the successor's early start non-day-aligned, and
      // without it the drift is a whole multiple of the factor and the two forms agree identically.
      const lift = await actor.agent
        .post(base)
        .send({ name: 'Crane lift', code: 'LIFT', durationMinutes: 240 })
        .expect(201);
      const pour = await actor.agent
        .post(base)
        .send({ name: 'Pour', code: 'POUR', durationDays: 1, visualStart: '2026-01-07' })
        .expect(201);
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: lift.body.data.id, successorId: pour.body.data.id, type: 'FS' })
        .expect(201);

      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
        .send({})
        .expect(200);

      const rows = (await actor.agent.get(`${base}?limit=100`).expect(200)).body.data as {
        code: string;
        totalFloat: number | null;
        visualDriftDays: number | null;
        remainingFloat: number | null;
      }[];
      const placed = rows.find((r) => r.code === 'POUR')!;

      // The fixture is only worth anything if the two forms disagree on it — assert that FIRST, or a
      // change to the calendar or the durations could quietly make this case prove nothing.
      const naive = (placed.totalFloat ?? 0) - (placed.visualDriftDays ?? 0);
      expect(placed.visualDriftDays, 'the placement must have a sub-day-aligned drift').not.toBe(0);
      expect(
        placed.remainingFloat,
        'the value must not be null — the plan was recalculated',
      ).not.toBe(null);
      expect(
        naive,
        'the fixture must make the naive and correct forms disagree, or it tests nothing',
      ).not.toBe(placed.remainingFloat);
      expect(placed.remainingFloat).toBe(-1);
      expect(naive).toBe(-2);
    });

    it('equals total float on an activity nobody placed', async () => {
      // The other half, and it is not filler: it is the identity M-D's engine field claims, and
      // without it a build that wrote null (or zero) everywhere would satisfy the case above by
      // accident of sign.
      const actor = await signUp('fc4-unplaced@example.com');
      await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
      const client = await actor.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await actor.agent
        .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
        .send({ name: 'Riverside' })
        .expect(201);
      const plan = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
        .send({ name: 'Unplaced', plannedStart: '2026-01-05' })
        .expect(201);
      const planId = plan.body.data.id as string;
      const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
      const a = await actor.agent
        .post(base)
        .send({ name: 'Long', code: 'LONG', durationDays: 2 })
        .expect(201);
      const b = await actor.agent
        .post(base)
        .send({ name: 'Short', code: 'SHORT', durationDays: 1 })
        .expect(201);
      const c = await actor.agent
        .post(base)
        .send({ name: 'Join', code: 'JOIN', durationDays: 1 })
        .expect(201);
      for (const pred of [a, b]) {
        await actor.agent
          .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
          .send({ predecessorId: pred.body.data.id, successorId: c.body.data.id, type: 'FS' })
          .expect(201);
      }
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
        .send({})
        .expect(200);

      const rows = (await actor.agent.get(`${base}?limit=100`).expect(200)).body.data as {
        code: string;
        totalFloat: number | null;
        remainingFloat: number | null;
      }[];
      // A float-bearing row must exist, or "they are equal" is true of nothing interesting.
      expect(
        rows.some((r) => (r.totalFloat ?? 0) > 0),
        'the fixture needs real float',
      ).toBe(true);
      for (const r of rows) {
        expect(r.remainingFloat, `${r.code} remaining float`).toBe(r.totalFloat);
      }
    });
  });

  /**
   * **M-C-T1 — a capture freezes the placement, and on an unplaced plan it freezes the early span.**
   *
   * This is the same parity claim as the suite's first case, one layer down: there it is asserted
   * over the live read, here over what a baseline wrote. It is separate rather than folded in
   * because it can fail on its own — the capture could read the right columns and write them to the
   * wrong ones, or write nothing at all, while the live read stayed perfect.
   *
   * **It is the case that proves the M-P dependency, which is why the fixture is this one and not a
   * plain plan.** Before M-P the effective-Visual pass had none of the pure pass's branches, so a
   * progressed activity's placed span ran at full duration from the data date, an LOE and a WBS
   * summary each collapsed to a point, and a capture taken then would have frozen all of that
   * **immutably**. A plain five-task fixture passes against that defect.
   *
   * Read through Prisma rather than a route, deliberately: M-C ships dark, so no DTO exposes these
   * columns yet and asserting over one would be asserting over something that does not exist.
   */
  describe('the baseline freezes the placement (M-C-T1)', () => {
    it('freezes the placed span as the early span when nothing is placed, and says it looked', async () => {
      const { actor, planId, rows } = await seedProgressedPlan();
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/baselines`)
        .send({ name: 'Contract' })
        .expect(201);

      const baseline = await prisma.baseline.findFirstOrThrow({
        where: { planId, deletedAt: null },
        include: { activities: { where: { deletedAt: null } } },
      });

      // The discriminator is the point of the milestone: all-null placement columns on a FULL
      // baseline mean "there genuinely were none", and the same nulls on a NONE baseline mean
      // nobody looked. Without this the assertions below are true of a capture that froze nothing.
      expect(baseline.placementSnapshotLevel).toBe('FULL');
      expect(baseline.activities).toHaveLength(rows.length);

      // Whole-map, so a failure names every diverging activity rather than the first.
      const byCode = new Map(baseline.activities.map((a) => [a.code, a]));
      const placed = Object.fromEntries(
        [...byCode].map(([code, a]) => [code, { s: a.placedStart, f: a.placedFinish }]),
      );
      const early = Object.fromEntries(
        [...byCode].map(([code, a]) => [code, { s: a.baselineStart, f: a.baselineFinish }]),
      );
      expect(placed).toEqual(early);

      // Non-vacuity, in both directions. A capture that wrote NULL to all six columns would satisfy
      // the equality above perfectly, and so would one taken on a plan whose derived-span rows had
      // collapsed to points — which is exactly the pre-M-P defect this case exists to pin.
      const summary = byCode.get('SUMMARY')!;
      const loe = byCode.get('LOE')!;
      expect(summary.placedStart).not.toBeNull();
      expect(summary.placedStart).not.toEqual(summary.placedFinish);
      expect(loe.placedStart).not.toEqual(loe.placedFinish);
      // And the planner placed nothing, which is what makes "placed equals early" the claim rather
      // than a coincidence of this fixture.
      expect(baseline.activities.every((a) => a.visualStart === null)).toBe(true);
    });

    /**
     * **The case above cannot fail against a capture that froze the EARLY span twice**, and this is
     * the one that can. On an unplaced plan the two are equal by definition, so `placedStart:
     * a.earlyStart` — a plausible slip, since both columns are right there — satisfies every
     * assertion in it. That blind spot is inherent to the claim rather than a weakness in how it is
     * written, so it is closed by a second fixture rather than by a stricter assertion.
     *
     * A plan with ONE hand-placed bar, where the placement is a fortnight past what logic allows,
     * so all three frozen columns are distinguishable from each other and from the early span.
     */
    it('freezes the placement itself, not a second copy of the early span', async () => {
      const actor = await signUp('mc-placed@example.com');
      await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
      const client = await actor.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await actor.agent
        .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
        .send({ name: 'Riverside' })
        .expect(201);
      const plan = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
        .send({ name: 'Placed', plannedStart: '2026-01-05' })
        .expect(201);
      const planId = plan.body.data.id as string;
      const base = `/api/v1/organizations/acme/plans/${planId}/activities`;

      await actor.agent
        .post(base)
        .send({ name: 'Free', code: 'FREE', durationDays: 2 })
        .expect(201);
      await actor.agent
        .post(base)
        .send({ name: 'Moved', code: 'MOVED', durationDays: 2, visualStart: '2026-01-19' })
        .expect(201);
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
        .send({})
        .expect(200);
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/baselines`)
        .send({ name: 'Contract' })
        .expect(201);

      const baseline = await prisma.baseline.findFirstOrThrow({
        where: { planId, deletedAt: null },
        include: { activities: { where: { deletedAt: null } } },
      });
      const moved = baseline.activities.find((a) => a.code === 'MOVED')!;
      const free = baseline.activities.find((a) => a.code === 'FREE')!;

      // The whole point: on the placed bar the two columns DIFFER, so freezing the early span
      // twice is now a failing state rather than an indistinguishable one.
      expect(moved.placedStart).not.toEqual(moved.baselineStart);
      expect(moved.placedStart).toEqual(moved.visualStart);
      // And the planner's own input is frozen as well as the engine's answer — the third column is
      // what separates "a planner put this here" from "the engine pushed it here", which neither of
      // the other two can say on its own.
      expect(moved.visualStart).not.toBeNull();
      expect(free.visualStart).toBeNull();
      // The unplaced neighbour still agrees, in the same capture — so the equality above is a
      // property of being unplaced rather than of the fixture.
      expect(free.placedStart).toEqual(free.baselineStart);
    });
  });

  /**
   * **M-D-T3 — the conflict reason reaches the wire, in all three states.**
   *
   * `m-d/migration-proof.md` §6 names this as the one obligation that file does not discharge: it
   * drives `writeResults` against a real database with **hand-built** `EngineResult`s, so it proves
   * the column and the `text[]`→enum cast and says nothing about whether `computeSchedule` produces
   * the right reason or whether the DTO exposes it. `compute.visual.spec.ts` proves the engine in
   * isolation. Neither crosses the seam, and the seam is four edits to one raw statement plus a DTO
   * field — exactly the shape a mocked `$executeRaw` cannot see (measured at M-D-T2).
   *
   * **All three states in one plan**, so the assertion can be a whole-map comparison and a failure
   * names every wrong row rather than the first.
   *
   * **What this case does NOT cover, stated because the obvious reading is wrong.** The array this
   * write path sends is `text[]`, and `m-d/migration-proof.md` §4 mutation (a′) measured that the
   * naive `::"VisualConflictReason"[]` cast fails on the **all-null** array and passes on a mixed
   * one — the failure is the wrong way round, so a plan that HAS a conflict writes fine while a plan
   * that has none breaks. This fixture is mixed, so it is the half that would have passed against
   * that defect. The all-null half is covered by the sibling cases above, every one of which
   * recalculates a plan with no conflicting placement anywhere.
   */
  describe('the placement conflict reason over the public route (M-D-T3)', () => {
    it('reports EARLIER_THAN_LOGIC, LATER_THAN_BOUND and null from one recalculation', async () => {
      const actor = await signUp('conflict-reason@example.com');
      await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
      const client = await actor.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await actor.agent
        .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
        .send({ name: 'Riverside' })
        .expect(201);
      // Monday 2026-01-05 is the data date, so it is also the first working day.
      const plan = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
        .send({ name: 'Conflicts', plannedStart: '2026-01-05' })
        .expect(201);
      const planId = plan.body.data.id as string;
      const base = `/api/v1/organizations/acme/plans/${planId}/activities`;

      // (1) A predecessor forcing a later earliest start, so EARLY can be placed BEFORE logic.
      const lead = await actor.agent
        .post(base)
        .send({ name: 'Lead-in', code: 'LEAD', durationDays: 5 })
        .expect(201);
      // Placed on the data date — five working days before anything its predecessor permits.
      const early = await actor.agent
        .post(base)
        .send({ name: 'Too early', code: 'EARLY', durationDays: 2, visualStart: '2026-01-05' })
        .expect(201);
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: lead.body.data.id, successorId: early.body.data.id, type: 'FS' })
        .expect(201);

      // (2) An explicit upper bound, breached by the placement. SNLT rather than a mandatory pin
      // deliberately: `upper-bound.md` §3 established that all four bound kinds behave identically
      // here, and SNLT is the one `feature-spec.md` §4.4 claimed needed no flag — so this is the
      // case that would silently report `false` if the M-D branch were dropped.
      await actor.agent
        .post(base)
        .send({
          name: 'Too late',
          code: 'LATE',
          durationDays: 2,
          constraintType: 'SNLT',
          constraintDate: '2026-01-06',
          visualStart: '2026-01-14',
        })
        .expect(201);

      // (3) A placed bar breaching nothing at all. **Placed, not unplaced** — an unplaced row reads
      // null for want of a placement, which would leave "no bound was breached" untested and the
      // null column indistinguishable from an inert one.
      await actor.agent
        .post(base)
        .send({ name: 'Fine', code: 'FINE', durationDays: 2, visualStart: '2026-01-07' })
        .expect(201);

      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
        .send({})
        .expect(200);

      const rows = (await actor.agent.get(`${base}?limit=100`).expect(200)).body.data as {
        code: string;
        visualConflict: boolean;
        visualConflictReason: string | null;
      }[];

      // Assert the fixture before asserting over it: a seeding change that dropped a row would
      // otherwise leave a narrower comparison green (ADR-0093).
      expect(rows.map((r) => r.code).sort()).toEqual(['EARLY', 'FINE', 'LATE', 'LEAD'].sort());

      // One whole-map comparison, so a failure names every wrong row rather than the first.
      expect(Object.fromEntries(rows.map((r) => [r.code, r.visualConflictReason]))).toEqual({
        LEAD: null,
        EARLY: 'EARLIER_THAN_LOGIC',
        LATE: 'LATER_THAN_BOUND',
        FINE: null,
      });

      // The boolean is DERIVED from the reason (`compute.ts`) and the database refuses any other
      // pairing (`ck_activities_visual_conflict_matches_reason`). Asserting it here is what proves
      // the two travelled together through the write and the read, rather than being written from
      // one source and serialised from another.
      for (const r of rows) {
        expect(r.visualConflict, `${r.code} flag vs reason`).toBe(r.visualConflictReason !== null);
      }
    });
  });
});
