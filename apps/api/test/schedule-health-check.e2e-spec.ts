import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the DCMA health check (health M1-T7):
 * `GET /organizations/:orgSlug/plans/:planId/schedule/health-check`.
 *
 * Every fixture is built THROUGH THE PUBLIC REST API (the ADR-0066 rule — never by writing rows),
 * including the baseline the catalogue does not capture (M0-T1 claim 3: `SELECT count(*) FROM
 * baselines` after a full seed = 0, so metrics 11/13/14 are covered nowhere else). Verified
 * against a real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Schedule health check API (e2e)', () => {
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

  // Delete children before parents so the FK restrictions never bite (the schedule.e2e order).
  async function resetDatabase(): Promise<void> {
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    // Weighted steps FK onto activities; the shared local database can hold rows a Playwright run
    // or the seed catalogue left behind (docs/TECH_DEBT.md #119's lesson, applied on day one).
    await prisma.activityStep.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planShare.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const healthUrl = (planId: string, slug = 'acme') =>
    `/api/v1/organizations/${slug}/plans/${planId}/schedule/health-check`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(name = 'Acme'): Promise<Actor> {
    const actor = await signUp(`admin-${name.toLowerCase()}@example.com`);
    await actor.agent.post('/api/v1/organizations').send({ name }).expect(201);
    return actor;
  }

  async function makePlan(actor: Actor, plannedStart = '2026-01-01'): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Health client' })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Health plan', plannedStart })
      .expect(201);
    const planId = plan.body.data.id as string;
    // All-days-work, matching schedule.e2e's baseline so date arithmetic is transparent.
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
    extra: object = {},
  ): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name, durationDays, ...extra })
      .expect(201);
    return res.body.data.id as string;
  }

  async function link(
    actor: Actor,
    planId: string,
    pred: string,
    succ: string,
    extra: object = {},
  ): Promise<void> {
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: pred, successorId: succ, ...extra })
      .expect(201);
  }

  async function recalculate(actor: Actor, planId: string): Promise<void> {
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
      .expect(200);
  }

  const metricOf = (body: { data: { metrics: { id: string }[] } }, id: string) =>
    body.data.metrics.find((m) => m.id === id) as unknown as {
      verdict: string;
      reason: string | null;
      measured: { count: number | null; denominator: number | null; ratio: number | null } | null;
      threshold: { kind: string; value: number } | null;
      detail: Record<string, unknown> | null;
      offenders: { id: string; kind: string; note: string; activityId: string }[];
      offenderCount: number;
    };

  it('is readable by a Viewer, 404 cross-org, and always fourteen rows in ordinal order', async () => {
    const admin = await adminWithOrg();
    const planId = await makePlan(admin);
    await makeActivity(admin, planId, 'Solo task', 5);

    // A member with only read rights gets the report — it writes nothing and shows no cost.
    const viewer = await signUp('viewer@example.com');
    const invite = await admin.agent
      .post('/api/v1/organizations/acme/invitations')
      .send({ email: 'viewer@example.com', role: 'VIEWER' })
      .expect(201);
    const token = new URL(invite.body.data.acceptUrl as string).searchParams.get('token');
    await viewer.agent.post('/api/v1/invitations/accept').send({ token }).expect(200);
    const res = await viewer.agent.get(healthUrl(planId)).expect(200);

    expect(res.body.data.metrics).toHaveLength(14);
    expect(res.body.data.metrics.map((m: { ordinal: number }) => m.ordinal)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1),
    );
    expect(res.body.data.offenderCap).toBe(50);
    const s = res.body.data.summary;
    expect(s.passed + s.failed + s.notAssessable + s.informational).toBe(14);
    // G4's runtime shadow: no cost-shaped key anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toMatch(/cost|budget|rate|expense/i);

    // A signed-in NON-member of this org gets 404 — no existence oracle.
    const stranger = await signUp('stranger@example.com');
    await stranger.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await stranger.agent.get(healthUrl(planId)).expect(404);
  });

  it('a never-calculated plan reports PLAN_NOT_SCHEDULED for the output metrics and still computes the definition ones', async () => {
    const admin = await adminWithOrg();
    const planId = await makePlan(admin);
    const a = await makeActivity(admin, planId, 'A', 5);
    const b = await makeActivity(admin, planId, 'B', 5);
    await link(admin, planId, a, b);
    // Deliberately NOT recalculated — the resting state of the seed catalogue's fixture and scale
    // tiers (M0-T1 finding F-M0-1), so this branch is the common case, not an edge.
    const res = await admin.agent.get(healthUrl(planId)).expect(200);

    expect(res.body.data.computedAt).toBeNull();
    expect(metricOf(res.body, 'HIGH_FLOAT')).toMatchObject({
      verdict: 'NOT_ASSESSABLE',
      reason: 'PLAN_NOT_SCHEDULED',
      measured: null,
    });
    expect(metricOf(res.body, 'NEGATIVE_FLOAT').reason).toBe('PLAN_NOT_SCHEDULED');
    // Definition metrics compute regardless: one open start + one open end = 2 offenders of 2.
    expect(metricOf(res.body, 'MISSING_LOGIC')).toMatchObject({
      verdict: 'FAIL',
      measured: { count: 2, denominator: 2 },
    });
  });

  it('judges a hostile plan: leads, lags, SF, hard constraints and the typed metric-1 rule', async () => {
    const admin = await adminWithOrg();
    const planId = await makePlan(admin);
    const start = await makeActivity(admin, planId, 'Start MS', 0, { type: 'START_MILESTONE' });
    const a = await makeActivity(admin, planId, 'Piling', 10);
    const b = await makeActivity(admin, planId, 'Caps', 10, {
      constraintType: 'SNLT',
      constraintDate: '2026-02-01',
    });
    const c = await makeActivity(admin, planId, 'Deck', 10);
    const finish = await makeActivity(admin, planId, 'Finish MS', 0, {
      type: 'FINISH_MILESTONE',
    });
    await link(admin, planId, start, a);
    await link(admin, planId, a, b, { lagDays: -1, type: 'SS' }); // a lead
    await link(admin, planId, b, c, { lagDays: 3 }); // a lag
    await link(admin, planId, c, finish, { type: 'SF' }); // the rare inverse
    await recalculate(admin, planId);

    const res = await admin.agent.get(healthUrl(planId)).expect(200);

    // Metric 1: the terminal milestones are excused by the typed rule; every task is linked.
    const m1 = metricOf(res.body, 'MISSING_LOGIC');
    expect(m1.verdict).toBe('PASS');
    expect(m1.detail).toMatchObject({ exclusionRule: 'SUMMARIES_AND_TERMINAL_MILESTONES' });

    // Metric 2: exactly the one lead, named as a relationship offender that jumps to its successor.
    const m2 = metricOf(res.body, 'LEADS');
    expect(m2).toMatchObject({ verdict: 'FAIL', measured: { count: 1 } });
    expect(m2.offenders[0]).toMatchObject({ kind: 'RELATIONSHIP', activityId: b });

    // Metric 4: 2 of 4 FS (50 %) → FAIL, with the full breakdown and SF called out.
    const m4 = metricOf(res.body, 'RELATIONSHIP_TYPES');
    expect(m4.verdict).toBe('FAIL');
    expect(m4.detail).toMatchObject({ breakdown: { fs: 2, ss: 1, ff: 0, sf: 1 } });

    // Metric 5: one SNLT of four non-summary activities... 1/5 = 20 % → FAIL.
    const m5 = metricOf(res.body, 'HARD_CONSTRAINTS');
    expect(m5.verdict).toBe('FAIL');
    expect(m5.offenders[0]).toMatchObject({ id: b, note: 'SNLT' });

    // Metric 12's placeholder — the row M6 upgrades without changing the shape.
    expect(metricOf(res.body, 'CRITICAL_PATH_TEST')).toMatchObject({
      verdict: 'NOT_ASSESSABLE',
      reason: 'REQUIRES_WHAT_IF_ANALYSIS',
      threshold: null,
    });
  });

  it('covers metrics 11, 13 and 14 with a baseline built through the API — the fixtures the catalogue does not hold', async () => {
    const admin = await adminWithOrg();
    const planId = await makePlan(admin, '2026-01-01');
    const a = await makeActivity(admin, planId, 'Early work', 5);
    const b = await makeActivity(admin, planId, 'Later work', 20);
    await link(admin, planId, a, b);
    await recalculate(admin, planId);

    // No baseline yet: 11 and 14 say so; 13 has no target and never invents one.
    let res = await admin.agent.get(healthUrl(planId)).expect(200);
    expect(metricOf(res.body, 'MISSED_ACTIVITIES').reason).toBe('NO_ACTIVE_BASELINE');
    expect(metricOf(res.body, 'BEI').reason).toBe('NO_ACTIVE_BASELINE');
    expect(metricOf(res.body, 'CPLI').reason).toBe('NO_TARGET_FINISH');

    // Capture the baseline (active on creation — the ADR-0025 first-baseline rule).
    await admin.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/baselines`)
      .send({ name: 'Rev A' })
      .expect(201);

    // Everything is baselined to finish AFTER the data date → nothing due yet, honestly stated.
    res = await admin.agent.get(healthUrl(planId)).expect(200);
    expect(metricOf(res.body, 'BEI').reason).toBe('NOTHING_DUE');
    // CPLI now has its baseline target and a real ratio.
    const cpli = metricOf(res.body, 'CPLI');
    expect(cpli.verdict).toBe('PASS');
    expect(cpli.measured?.ratio).toBeCloseTo(1, 2);
    expect(cpli.detail).toMatchObject({ targetSource: 'ACTIVE_BASELINE' });

    // Move the data date past activity A's baseline finish: A falls due. Complete it on time.
    const planRow = await admin.agent.get(`/api/v1/organizations/acme/plans/${planId}`).expect(200);
    await admin.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({ plannedStart: '2026-01-10', version: planRow.body.data.version })
      .expect(200);
    const aRow = await admin.agent.get(`/api/v1/organizations/acme/activities/${a}`).expect(200);
    await admin.agent
      .patch(`/api/v1/organizations/acme/activities/${a}/progress`)
      .send({
        percentComplete: 100,
        actualStart: '2026-01-01',
        actualFinish: '2026-01-05',
        version: aRow.body.data.version,
      })
      .expect(200);
    await recalculate(admin, planId);

    res = await admin.agent.get(healthUrl(planId)).expect(200);
    // BEI: 1 due, 1 complete → 1.0 PASS, with the arithmetic in the detail.
    const bei = metricOf(res.body, 'BEI');
    expect(bei.verdict).toBe('PASS');
    expect(bei.measured?.ratio).toBe(1);
    expect(bei.detail).toMatchObject({ completedCount: 1, dueCount: 1 });
    // Metric 11: A finished on 01-05 against a baseline finish of 01-05 (5 days from 01-01,
    // engine-computed) — not later, so nothing is missed.
    const m11 = metricOf(res.body, 'MISSED_ACTIVITIES');
    expect(m11.verdict).toBe('PASS');
    expect(m11.detail).toMatchObject({ dueCount: 1 });
  });

  // ── M6: the critical-path what-if ────────────────────────────────────────────────────────────

  const cptUrl = (planId: string, slug = 'acme') =>
    `/api/v1/organizations/${slug}/plans/${planId}/schedule/health-check/critical-path-test`;

  /** Every engine-owned column the recalculation persists, ordered — the non-mutation oracle. */
  async function engineOwnedSnapshot(planId: string) {
    const activities = await prisma.activity.findMany({
      where: { planId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        earlyStart: true,
        earlyFinish: true,
        lateStart: true,
        lateFinish: true,
        totalFloat: true,
        freeFloat: true,
        isCritical: true,
        isNearCritical: true,
        constraintViolated: true,
        version: true,
        updatedAt: true,
      },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { id: planId },
      select: { scheduleComputedAt: true, version: true, updatedAt: true },
    });
    return { activities, plan };
  }

  it('M6: the what-if judges the plan and PERSISTS NOTHING — every engine-owned column unchanged', async () => {
    const admin = await adminWithOrg();
    const planId = await makePlan(admin);
    const a = await makeActivity(admin, planId, 'Groundworks', 10);
    const b = await makeActivity(admin, planId, 'Frame', 10);
    await link(admin, planId, a, b);
    await recalculate(admin, planId);

    // The claim "it persists nothing" is PROVED, not asserted (ADR-0116 D7): snapshot every
    // engine-owned column the recalculation writes, run the what-if, snapshot again, compare
    // whole objects. Verified red by making the route persist once deliberately — the diff then
    // NAMES the columns that moved rather than reporting a bare inequality.
    const before = await engineOwnedSnapshot(planId);
    const res = await admin.agent.get(cptUrl(planId)).expect(200);
    const after = await engineOwnedSnapshot(planId);
    expect(after).toEqual(before);

    // An intact two-task chain: the completion moved in step with the injection.
    expect(res.body.data).toMatchObject({
      id: 'CRITICAL_PATH_TEST',
      ordinal: 12,
      verdict: 'PASS',
      reason: null,
      threshold: null,
    });
    expect(res.body.data.measured.ratio).toBe(1);
    expect(res.body.data.detail).toMatchObject({
      injectedDays: 600,
      deltaDays: 600,
      perturbedActivityId: a,
      completionActivityId: b,
    });
    // Role-invariance holds on this route too — same G4 shadow as the report.
    expect(JSON.stringify(res.body)).not.toMatch(/cost|budget|rate|expense/i);

    // Cross-org: 404, no existence oracle — the report route's rule, re-proved here because this
    // is a separate controller route with its own guard path.
    const stranger = await signUp('cpt-stranger@example.com');
    await stranger.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await stranger.agent.get(cptUrl(planId)).expect(404);
  });

  // The PLAN_START_REQUIRED 422 is deliberately NOT proved here: `plannedStart` is required on
  // create and non-nullable on update, so the no-start state is unreachable through the public
  // API — it is a legacy-row defence (the floatPaths rule), pinned by the service unit suite
  // where the state can exist.
});
