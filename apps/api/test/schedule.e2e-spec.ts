import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the CPM recalculation endpoint (M6, ADR-0022):
 * `POST /organizations/:orgSlug/plans/:planId/schedule/recalculate`. Covers a
 * multi-path plan producing the expected critical set + summary, the
 * version/updated_by-untouched guarantee of the engine-owned write, the RBAC
 * split (Planner writes, Viewer/Contributor 403), the IDOR/cross-org 404 matrix,
 * and a performance smoke at 500 activities. Verified against a real PostgreSQL
 * + Better Auth session. (The 422 no-start path is no longer reachable through
 * the API post-ADR-0033-M1 — `plannedStart` is now mandatory — so it is
 * covered at the unit level only; see the note above the RBAC test below.)
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Schedule API (e2e)', () => {
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

  // Delete children before parents so the FK restrictions never bite.
  async function resetDatabase(): Promise<void> {
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  afterAll(async () => {
    // Leave a clean database. This file's last test seeds hundreds of activities;
    // the e2e DB is shared (with the Playwright run and, since file order isn't
    // guaranteed, with other API specs whose cleanup predates activities), so we
    // must not leave rows that a later `plan.deleteMany()` would trip over.
    await resetDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const recalcUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  /** A plan with a start date so it can be scheduled. Returns its id. */
  async function makePlan(
    actor: Actor,
    clientName: string,
    plannedStart = '2026-01-01',
  ): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: clientName })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Baseline', plannedStart })
      .expect(201);
    const planId = plan.body.data.id as string;
    // Clear the org's default Standard calendar (M5-C1) so these golden cases run on
    // all-days-work — the M6 baseline this suite pins. Calendar-aware scheduling is
    // covered by its own case below.
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({ calendarId: null, version: 1 })
      .expect(200);
    return planId;
  }

  async function makeActivity(
    actor: Actor,
    planId: string,
    name: string,
    durationDays: number,
  ): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name, durationDays })
      .expect(201);
    return res.body.data.id as string;
  }

  async function link(actor: Actor, planId: string, pred: string, succ: string): Promise<void> {
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: pred, successorId: succ })
      .expect(201);
  }

  /** GET the plan's activities, keyed by name. */
  async function activitiesByName(actor: Actor, planId: string) {
    const res = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .expect(200);
    return new Map<string, Record<string, unknown>>(
      (res.body.data as Record<string, unknown>[]).map((a) => [a.name as string, a]),
    );
  }

  it('recalculates a multi-path plan: correct critical set, summary, and dates', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    // A(3)→B(4)→D(5)→E(1); A(3)→C(2)→D(5). Critical A,B,D,E; C carries float 2.
    const a = await makeActivity(actor, planId, 'A', 3);
    const b = await makeActivity(actor, planId, 'B', 4);
    const c = await makeActivity(actor, planId, 'C', 2);
    const d = await makeActivity(actor, planId, 'D', 5);
    const e = await makeActivity(actor, planId, 'E', 1);
    await link(actor, planId, a, b);
    await link(actor, planId, a, c);
    await link(actor, planId, b, d);
    await link(actor, planId, c, d);
    await link(actor, planId, d, e);

    const res = await actor.agent.post(recalcUrl(planId)).expect(200);
    expect(res.body.data).toMatchObject({
      dataDate: '2026-01-01',
      projectFinish: '2026-01-13',
      activityCount: 5,
      criticalCount: 4,
      nearCriticalCount: 1,
      constraintViolationCount: 0,
      constraintWarningCount: 0,
    });

    const acts = await activitiesByName(actor, planId);
    expect(acts.get('A')).toMatchObject({
      earlyStart: '2026-01-01',
      earlyFinish: '2026-01-03',
      isCritical: true,
      totalFloat: 0,
      // Free float (M6-F1): A's successors start the instant it finishes, so it can't slip at all.
      freeFloat: 0,
    });
    // C carries 2 days of both total and FREE float: B drives D, so C can slip 2 days before its own
    // finish would push D's early start (free float here equals total float — C's slack is its own).
    expect(acts.get('C')).toMatchObject({
      isCritical: false,
      isNearCritical: true,
      totalFloat: 2,
      freeFloat: 2,
    });
    expect(acts.get('E')).toMatchObject({ earlyFinish: '2026-01-13', isCritical: true });

    // M3: the engine flags the driving ties on recalc, surfaced on the dependency GET.
    // D's predecessors are B (which drives D's start) and C (which has float into D),
    // so only the B→D edge is driving.
    const dPreds = await actor.agent
      .get(`/api/v1/organizations/acme/activities/${d}/predecessors`)
      .expect(200);
    const drivingByPred = new Map<string, boolean>(
      (dPreds.body.data as Array<{ predecessor: { id: string }; isDriving: boolean }>).map(
        (dep) => [dep.predecessor.id, dep.isDriving],
      ),
    );
    expect(drivingByPred.get(b)).toBe(true);
    expect(drivingByPred.get(c)).toBe(false);
  });

  it('leaves version and updated_by untouched (the engine-owned write)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await makeActivity(actor, planId, 'A', 3);
    const b = await makeActivity(actor, planId, 'B', 2);
    await link(actor, planId, a, b); // A→B, so the dependency is driving after recalc

    const before = await prisma.activity.findUniqueOrThrow({
      where: { id: a },
      select: { version: true, updatedAt: true, updatedBy: true },
    });
    const depBefore = await prisma.activityDependency.findFirstOrThrow({
      where: { planId },
      select: { id: true, version: true, updatedAt: true, updatedBy: true, isDriving: true },
    });

    await actor.agent.post(recalcUrl(planId)).expect(200);

    const after = await prisma.activity.findUniqueOrThrow({
      where: { id: a },
      select: { version: true, updatedAt: true, updatedBy: true, earlyStart: true },
    });
    expect(after.version).toBe(before.version);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.updatedBy).toBe(before.updatedBy);
    expect(after.earlyStart).not.toBeNull(); // but the schedule DID compute

    // The dependency's driving flag is engine-owned too: it changes (false → true) while
    // version/updated_at/updated_by stay put — the writeDrivingFlags invariant (ADR-0022).
    const depAfter = await prisma.activityDependency.findUniqueOrThrow({
      where: { id: depBefore.id },
      select: { version: true, updatedAt: true, updatedBy: true, isDriving: true },
    });
    expect(depBefore.isDriving).toBe(false);
    expect(depAfter.isDriving).toBe(true);
    expect(depAfter.version).toBe(depBefore.version);
    expect(depAfter.updatedAt.getTime()).toBe(depBefore.updatedAt.getTime());
    expect(depAfter.updatedBy).toBe(depBefore.updatedBy);
  });

  it('levels resources on recalc (serialises a capacity-1 clash) without touching version/updated_at', async () => {
    // Two 2-day activities both start at the data date and both demand the one capacity-1 crane. With
    // levelResources on, the levelling pass (ADR-0041) serialises them: A holds days 1–2, B is pushed
    // to days 3–4 with a 2-working-day (2 × 1440-minute) delay. The overlay is engine-owned (ADR-0022),
    // so it lands in leveled_start/leveled_finish/leveling_delay_minutes while version/updated_at stay put.
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Levelling'); // clears the calendar → all-days-work

    const makePriorityActivity = async (name: string, priority: number): Promise<string> => {
      const res = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name, durationDays: 2, levelingPriority: priority })
        .expect(201);
      return res.body.data.id as string;
    };
    const a = await makePriorityActivity('A', 1);
    const b = await makePriorityActivity('B', 2);

    // A capacity-1 crane, assigned to both activities at 1 unit/hour of demand each.
    const crane = await actor.agent
      .post('/api/v1/organizations/acme/resources')
      .send({ name: 'Crane', kind: 'EQUIPMENT', maxUnitsPerHour: 1 })
      .expect(201);
    const craneId = crane.body.data.id as string;
    for (const activityId of [a, b]) {
      await actor.agent
        .post(`/api/v1/organizations/acme/activities/${activityId}/assignments`)
        .send({ resourceId: craneId, unitsPerHour: 1 })
        .expect(201);
    }

    // Opt the plan into resource levelling (the plan is at version 2 after makePlan's calendar PATCH).
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({ levelResources: true, version: 2 })
      .expect(200);

    const before = await prisma.activity.findUniqueOrThrow({
      where: { id: b },
      select: { version: true, updatedAt: true, updatedBy: true },
    });

    await actor.agent.post(recalcUrl(planId)).expect(200);

    // A keeps its network position; B is serialised behind it and carries the delay in WORKING MINUTES.
    const aAfter = await prisma.activity.findUniqueOrThrow({
      where: { id: a },
      select: { leveledStart: true, leveledFinish: true, levelingDelayMinutes: true },
    });
    const bAfter = await prisma.activity.findUniqueOrThrow({
      where: { id: b },
      select: {
        leveledStart: true,
        leveledFinish: true,
        levelingDelayMinutes: true,
        version: true,
        updatedAt: true,
        updatedBy: true,
      },
    });
    const ymd = (d: Date | null) => d?.toISOString().slice(0, 10);
    expect(ymd(aAfter.leveledStart)).toBe('2026-01-01');
    expect(ymd(aAfter.leveledFinish)).toBe('2026-01-02');
    expect(aAfter.levelingDelayMinutes).toBe(0);
    expect(ymd(bAfter.leveledStart)).toBe('2026-01-03');
    expect(ymd(bAfter.leveledFinish)).toBe('2026-01-04');
    expect(bAfter.levelingDelayMinutes).toBe(2 * 1440); // 2 working days, in minutes

    // The levelling overlay is engine-owned: the recalc did NOT bump version/updated_at/updated_by.
    expect(bAfter.version).toBe(before.version);
    expect(bAfter.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(bAfter.updatedBy).toBe(before.updatedBy);
  });

  // NOTE: `plannedStart` is now a mandatory, non-null column (ADR-0033 M1;
  // migration `20260714130000_require_plan_planned_start`) and `POST /plans`
  // rejects a missing start with 422 — so a plan with no start date can no
  // longer be constructed through the API (see `plans.e2e-spec.ts`'s
  // "rejects a plan created without a start date (422)"). The
  // PLAN_START_REQUIRED defensive branch in `ScheduleService.recalculate` is
  // now unreachable via any real code path but is still covered directly at
  // the unit level (`schedule.service.spec.ts`, which mocks a plan with a
  // null `plannedStart` to exercise the guard).

  it('enforces RBAC: Viewer and Contributor cannot recalculate (403)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.post(recalcUrl(planId)).expect(403);

    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.post(recalcUrl(planId)).expect(403);
  });

  it('hides the plan from non-members and other orgs (404), and validates the id (422)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post(recalcUrl(planId)).expect(404); // not a member of acme
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    // A member of another org cannot reach acme's plan.
    await outsider.agent
      .post(`/api/v1/organizations/other/plans/${planId}/schedule/recalculate`)
      .expect(404);
    // A well-formed but unknown plan id → 404.
    await actor.agent.post(recalcUrl('00000000-0000-7000-8000-000000000000')).expect(404);
    // A malformed plan id → 400 (ParseUuidPipe rejects the path param).
    await actor.agent
      .post('/api/v1/organizations/acme/plans/not-a-uuid/schedule/recalculate')
      .expect(400);
  });

  it('401s without a session', async () => {
    await request(server())
      .post(
        '/api/v1/organizations/acme/plans/00000000-0000-7000-8000-000000000000/schedule/recalculate',
      )
      .expect(401);
  });

  const summaryUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/schedule/summary`;

  it('summary reflects the last recompute and reads for any member', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await makeActivity(actor, planId, 'A', 3);
    const b = await makeActivity(actor, planId, 'B', 2);
    await link(actor, planId, a, b);

    // Before any recompute: zeroed counts, null finish, but the data date is set.
    const before = await actor.agent.get(summaryUrl(planId)).expect(200);
    expect(before.body.data).toMatchObject({
      dataDate: '2026-01-01',
      projectFinish: null,
      activityCount: 2,
      criticalCount: 0,
    });

    await actor.agent.post(recalcUrl(planId)).expect(200);

    // After: the summary reflects the persisted columns.
    const after = await actor.agent.get(summaryUrl(planId)).expect(200);
    expect(after.body.data).toMatchObject({
      dataDate: '2026-01-01',
      projectFinish: '2026-01-05',
      activityCount: 2,
      criticalCount: 2,
      nearCriticalCount: 0,
      constraintViolationCount: 0,
      constraintWarningCount: 0,
    });

    // A Viewer can read the summary (schedule:read is granted to every member).
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(summaryUrl(planId)).expect(200);
  });

  it('summary hides the plan from non-members (404)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(summaryUrl(planId)).expect(404);
  });

  const floatPathsUrl = (planId: string, target: string, maxPaths?: number) =>
    `/api/v1/organizations/acme/plans/${planId}/schedule/float-paths?target=${target}` +
    (maxPaths !== undefined ? `&maxPaths=${maxPaths}` : '');

  it('returns ranked contiguous float paths into a target (ADR-0035 §19)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    // A(3)→B(4)→D(5); A(3)→C(2)→D(5). Into D: path 0 is the driving chain D←B←A (relative float 0);
    // C is a non-driving predecessor carrying 2 days of float, so it forms a branch path at +2.
    const a = await makeActivity(actor, planId, 'A', 3);
    const b = await makeActivity(actor, planId, 'B', 4);
    const c = await makeActivity(actor, planId, 'C', 2);
    const d = await makeActivity(actor, planId, 'D', 5);
    await link(actor, planId, a, b);
    await link(actor, planId, a, c);
    await link(actor, planId, b, d);
    await link(actor, planId, c, d);
    await actor.agent.post(recalcUrl(planId)).expect(200);

    const res = await actor.agent.get(floatPathsUrl(planId, d)).expect(200);
    const paths = res.body.data.paths as Array<{
      index: number;
      relativeFloat: number;
      activityIds: string[];
    }>;
    expect(res.body.data.targetActivityId).toBe(d);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    // Path 0 is the driving chain, target-first, relative float 0.
    expect(paths[0]).toMatchObject({ index: 0, relativeFloat: 0 });
    expect(paths[0]!.activityIds[0]).toBe(d);
    expect(paths[0]!.activityIds).toEqual(expect.arrayContaining([d, b, a]));
    // A branch path carries C at +2 working days of relative float.
    const branch = paths.find((p) => p.activityIds.includes(c));
    expect(branch).toBeDefined();
    expect(branch!.index).toBeGreaterThanOrEqual(1);
    expect(branch!.relativeFloat).toBe(2);

    // schedule:read — a Viewer can run the analysis.
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(floatPathsUrl(planId, d)).expect(200);
  });

  it('404s when the target activity is not in the plan', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    await makeActivity(actor, planId, 'A', 3);
    await actor.agent.post(recalcUrl(planId)).expect(200);
    await actor.agent.get(floatPathsUrl(planId, randomUUID())).expect(404);
  });

  it('422s when the target query param is missing or not a uuid', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    // A missing / malformed `target` is a DTO validation failure (FloatPathsQueryDto), which the
    // global ValidationPipe surfaces as 422 — matching every other validation error in the API
    // (docs/API.md; cf. the "validates the id (422)" case above), not a 400 malformed-request.
    await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/schedule/float-paths`)
      .expect(422);
    await actor.agent.get(floatPathsUrl(planId, 'not-a-uuid')).expect(422);
  });

  it('a mandatory pin that breaks logic is produced, flagged, and counted (ADR-0035 §7)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    // A(3) → B; B is pinned MANDATORY_START before A can finish — produced as pinned and flagged.
    const a = await makeActivity(actor, planId, 'A', 3);
    const b = await makeActivity(actor, planId, 'B', 2);
    await link(actor, planId, a, b);
    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${b}`)
      // version 1: b was just created and adding a dependency doesn't bump the activity row.
      .send({ constraintType: 'MANDATORY_START', constraintDate: '2026-01-02', version: 1 })
      .expect(200);

    const res = await actor.agent.post(recalcUrl(planId)).expect(200);
    expect(res.body.data).toMatchObject({ constraintViolationCount: 1, constraintWarningCount: 0 });

    const acts = await activitiesByName(actor, planId);
    // The pin holds (produce) and B carries the flag; A is not flagged.
    expect(acts.get('B')).toMatchObject({ earlyStart: '2026-01-02', constraintViolated: true });
    expect(acts.get('A')).toMatchObject({ constraintViolated: false });
  });

  it('recalculates on a Mon–Fri calendar with a holiday: dates skip weekends & holidays', async () => {
    const { actor } = await adminWithOrg();
    // Thu 1 Jan 2026; makePlan clears the org default, so we start from all-days-work.
    const planId = await makePlan(actor, 'CalOrg', '2026-01-01');

    const cal = await actor.agent
      .post('/api/v1/organizations/acme/calendars')
      .send({ name: 'UK 5-day', workingWeekdays: 31 })
      .expect(201);
    const calId = cal.body.data.id as string;
    await actor.agent
      .post(`/api/v1/organizations/acme/calendars/${calId}/exceptions`)
      .send({ date: '2026-01-05', isWorking: false, label: 'Bank Holiday' })
      .expect(201);
    // Assign the calendar (the plan is at version 2 after makePlan's start-date PATCH).
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({ calendarId: calId, version: 2 })
      .expect(200);

    // A single 5-working-day task from Thu 1 Jan works Thu1, Fri2, (skip Sat3/Sun4),
    // (skip holiday Mon5), Tue6, Wed7, Thu8 → inclusive finish Thu 8 Jan.
    await makeActivity(actor, planId, 'T', 5);
    const res = await actor.agent.post(recalcUrl(planId)).expect(200);
    expect(res.body.data.projectFinish).toBe('2026-01-08');

    const t = (await activitiesByName(actor, planId)).get('T')!;
    expect(t).toMatchObject({ earlyStart: '2026-01-01', earlyFinish: '2026-01-08' });
    // No computed date lands on a weekend or the holiday.
    const isWorkingDay = (d: string): boolean => {
      const day = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Sun … 6 = Sat
      return day !== 0 && day !== 6 && d !== '2026-01-05';
    };
    for (const key of ['earlyStart', 'earlyFinish', 'lateStart', 'lateFinish'] as const) {
      expect(isWorkingDay(t[key] as string)).toBe(true);
    }
  });

  it('null-calendar recalc is byte-identical to M6 (all-days regression)', async () => {
    // makePlan clears the calendar, so this is the M6 golden baseline: A(3)→B(4)→D(5)→E(1)
    // finishes 2026-01-13 all-days (proven in the first case above), unaffected by M5.
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'NullCal', '2026-01-01');
    await makeActivity(actor, planId, 'Solo', 5);
    const res = await actor.agent.post(recalcUrl(planId)).expect(200);
    // 5 all-days from Thu 1 Jan (no calendar) → Mon 5 Jan, NOT the Mon–Fri Jan 8 above.
    expect(res.body.data.projectFinish).toBe('2026-01-05');
  });

  it('scale smoke: a 500-activity chain recalculates on a real Mon–Fri calendar', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'BigCalPlan');
    // Assign the org's seeded Standard (Mon–Fri) calendar.
    const cals = await actor.agent.get('/api/v1/organizations/acme/calendars').expect(200);
    const standardId = (cals.body.data as { id: string; name: string }[]).find(
      (c) => c.name === 'Standard',
    )!.id;
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({ calendarId: standardId, version: 2 })
      .expect(200);

    const ids = Array.from({ length: 500 }, () => randomUUID());
    await prisma.activity.createMany({
      data: ids.map((id, i) => ({
        id,
        organizationId: orgId,
        planId,
        name: `A${i}`,
        durationMinutes: 1440,
      })),
    });
    await prisma.activityDependency.createMany({
      data: ids.slice(0, -1).map((id, i) => ({
        organizationId: orgId,
        planId,
        predecessorId: id,
        successorId: ids[i + 1]!,
      })),
    });

    // The calendar is built ONCE and applied O(1)/O(log H) per engine call, so a real
    // calendar computes and persists the whole 500-node plan in one recalculation.
    const res = await actor.agent.post(recalcUrl(planId)).expect(200);
    expect(res.body.data).toMatchObject({ activityCount: 500, criticalCount: 500 });
    const finish = res.body.data.projectFinish as string;
    const day = new Date(`${finish}T00:00:00Z`).getUTCDay();
    expect(day === 0 || day === 6).toBe(false); // the finish is a working day
    // Working-day scheduling pushes the finish out past the all-days answer (2027-05-15).
    expect(finish > '2027-05-15').toBe(true);
  });

  it('scale smoke: a 500-activity chain recalculates in one batched write', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'BigPlan');

    // Seed a 500-node critical chain directly (bulk insert; HTTP per-activity is
    // too slow for a fixture). Ids are plain UUIDs — any UUID is valid.
    const ids = Array.from({ length: 500 }, () => randomUUID());
    await prisma.activity.createMany({
      data: ids.map((id, i) => ({
        id,
        organizationId: orgId,
        planId,
        name: `A${i}`,
        durationMinutes: 1440,
      })),
    });
    await prisma.activityDependency.createMany({
      data: ids.slice(0, -1).map((id, i) => ({
        organizationId: orgId,
        planId,
        predecessorId: id,
        successorId: ids[i + 1]!,
      })),
    });

    // Proves the whole plan computes and persists in one recalculation. The
    // performance target itself is measured out-of-band, not asserted on a shared
    // CI runner where wall-clock is too noisy to gate on.
    const res = await actor.agent.post(recalcUrl(planId)).expect(200);

    expect(res.body.data).toMatchObject({ activityCount: 500, criticalCount: 500 });
    // Every activity on the single chain is critical, and the finish is day 500.
    expect(res.body.data.projectFinish).toBe('2027-05-15');
  });
});
