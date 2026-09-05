import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the revision comparison (revision M1-T4):
 * `GET /organizations/:orgSlug/plans/:planId/schedule/revision-compare?from=…&to=…`.
 *
 * **The route ships DARK.** Nothing in `apps/web` calls it: there is no menu item, no dock and no
 * entry point until M2, and "the model landed" is not a claim the capability exists (ADR-0081).
 * These tests are the route's only caller, and they are deliberately its full contract rather than
 * a smoke test, because a dark route has no user to find its defects.
 *
 * Every fixture is built THROUGH THE PUBLIC REST API (the ADR-0066 rule — never by writing rows),
 * including the baselines, which the seed catalogue does not capture.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Revision compare API (e2e)', () => {
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

  // Children before parents so the FK restrictions never bite (the schedule.e2e order).
  async function resetDatabase(): Promise<void> {
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
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
  const compareUrl = (planId: string, from: string, to?: string, slug = 'acme') =>
    `/api/v1/organizations/${slug}/plans/${planId}/schedule/revision-compare?from=${from}` +
    (to === undefined ? '' : `&to=${to}`);

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

  /** Invite a member at `role` and accept — the only way to get a non-admin principal. */
  async function member(admin: Actor, email: string, role: string): Promise<Actor> {
    const actor = await signUp(email);
    const invite = await admin.agent
      .post('/api/v1/organizations/acme/invitations')
      .send({ email, role })
      .expect(201);
    const token = new URL(invite.body.data.acceptUrl as string).searchParams.get('token');
    await actor.agent.post('/api/v1/invitations/accept').send({ token }).expect(200);
    return actor;
  }

  // A client name is unique per organisation, so a test building TWO plans needs two names.
  let clientSeq = 0;

  async function makePlan(actor: Actor, plannedStart = '2026-01-01'): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: `Revision client ${(clientSeq += 1)}` })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Revision plan', plannedStart })
      .expect(201);
    const planId = plan.body.data.id as string;
    // All-days-work, so the working-day arithmetic below is transparent.
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

  async function link(actor: Actor, planId: string, pred: string, succ: string): Promise<void> {
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: pred, successorId: succ })
      .expect(201);
  }

  async function recalculate(actor: Actor, planId: string): Promise<void> {
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
      .expect(200);
  }

  async function capture(actor: Actor, planId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/baselines`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  /** A two-task chain, recalculated. Both are critical; `b` is the completion carrier. */
  async function chainPlan(admin: Actor): Promise<{ planId: string; a: string; b: string }> {
    const planId = await makePlan(admin);
    const a = await makeActivity(admin, planId, 'Groundworks', 10);
    const b = await makeActivity(admin, planId, 'Frame', 10);
    await link(admin, planId, a, b);
    await recalculate(admin, planId);
    return { planId, a, b };
  }

  /**
   * Every engine-owned column the recalculation persists — the non-mutation oracle, lifted from
   * `schedule-health-check.e2e-spec.ts` where the M6 security review caught a first version
   * covering 9 of 21 and omitting `isDriving`. A proof narrower than its sentence is worse than no
   * proof, because it reads as one.
   */
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
        externalDriven: true,
        loeNoSpan: true,
        resourceDriverMissing: true,
        visualEffectiveStart: true,
        visualEffectiveFinish: true,
        visualConflict: true,
        visualDriftDays: true,
        leveledStart: true,
        leveledFinish: true,
        levelingDelayMinutes: true,
        levelingWindowExceeded: true,
        selfOverAllocated: true,
        version: true,
        updatedAt: true,
      },
    });
    const dependencies = await prisma.activityDependency.findMany({
      where: { planId },
      orderBy: { id: 'asc' },
      select: { id: true, isDriving: true, version: true, updatedAt: true },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { id: planId },
      select: {
        scheduleComputedAt: true,
        scheduleCriticalPathDefinition: true,
        scheduleCriticalFloatThresholdMinutes: true,
        scheduleTotalFloatMode: true,
        scheduleMakeOpenEndsCritical: true,
        version: true,
        updatedAt: true,
      },
    });
    const baselines = await prisma.baseline.findMany({
      where: { planId },
      orderBy: { id: 'asc' },
      select: { id: true, version: true, updatedAt: true },
    });
    return { activities, dependencies, plan, baselines };
  }

  it('compares a baseline against live and reports what entered the critical path', async () => {
    const admin = await adminWithOrg();
    const { planId, a, b } = await chainPlan(admin);
    // A third activity with float: parallel to the chain and shorter, so it is NOT critical.
    const slack = await makeActivity(admin, planId, 'Landscaping', 2);
    await recalculate(admin, planId);
    const before = await capture(admin, planId, 'Rev A');

    // Stretch it past the chain: it becomes the critical work and the completion carrier.
    const current = await admin.agent
      .get(`/api/v1/organizations/acme/activities/${slack}`)
      .expect(200);
    await admin.agent
      .patch(`/api/v1/organizations/acme/activities/${slack}`)
      .send({ durationDays: 40, version: current.body.data.version })
      .expect(200);
    await recalculate(admin, planId);

    const res = await admin.agent.get(compareUrl(planId, before)).expect(200);
    const body = res.body.data;

    expect(body.from).toMatchObject({ kind: 'BASELINE', id: before, name: 'Rev A' });
    expect(body.to).toMatchObject({ kind: 'LIVE', id: null, name: null });
    expect(body.to.computedAt).not.toBeNull();

    // Landscaping ENTERED; the two chain tasks LEFT (they now have float).
    expect(body.criticalPath.entered.map((r: { activityId: string }) => r.activityId)).toEqual([
      slack,
    ]);
    expect(body.criticalPath.enteredTotal).toBe(1);
    expect(body.criticalPath.left.map((r: { activityId: string }) => r.activityId).sort()).toEqual(
      [a, b].sort(),
    );
    expect(body.criticalPath.leftTotal).toBe(2);
    expect(body.criticalPath.added).toEqual([]);
    expect(body.criticalPath.removed).toEqual([]);
    expect(body.criticalPath.noCriticalPath).toBe(false);
    // The cap travels; a client never holds a second copy of it.
    expect(body.criticalPath.cap).toBe(200);
    // A row on the live plan is activatable; the flag is a fact about live, not about `to`.
    expect(body.criticalPath.entered[0].existsLive).toBe(true);
    // Both sides' numbers, and the movement, never collapsed to zero when a side is unknown.
    expect(body.criticalPath.entered[0].fromTotalFloatDays).toBeGreaterThan(0);
    expect(body.criticalPath.entered[0].toTotalFloatDays).toBe(0);

    // The completion moved, measured in WORKING DAYS on the plan calendar (all-days-work here),
    // and the carrier is NAMED so a reader can check it.
    expect(body.completion.assessable).toBe(true);
    expect(body.completion.reason).toBeNull();
    expect(body.completion.carrierActivityId).toBe(b);
    expect(body.completion.movementDays).toBe(0); // b itself did not move; the JOB did.
    expect(body.completion.carrierChanged).toBe(true);
    expect(body.completion.newSideCarrierActivityId).toBe(slack);
    expect(body.dayFactorMinutes).toBe(1440);

    // Both sides were computed under the same rule and the product says so — never coalesced.
    expect(body.settingsVerdict).toBe('MATCH');

    // Role-invariance is structural here (there is no cost-shaped field to gate), so this is the
    // runtime shadow of that claim rather than a gate.
    expect(JSON.stringify(res.body)).not.toMatch(/cost|budget|rate|expense/i);
    // And the vocabulary promise: no causal field reaches the wire under any name.
    expect(JSON.stringify(res.body)).not.toMatch(/cause|contribution|interaction|"rank"/i);
  });

  it('compares two baselines, and appearing is not entering', async () => {
    const admin = await adminWithOrg();
    const { planId } = await chainPlan(admin);
    const first = await capture(admin, planId, 'Rev A');

    // A new activity, unconstrained and 60 days, so it is critical the moment it exists.
    const added = await makeActivity(admin, planId, 'Fit-out', 60);
    await recalculate(admin, planId);
    const second = await capture(admin, planId, 'Rev B');

    const res = await admin.agent.get(compareUrl(planId, first, second)).expect(200);
    const body = res.body.data;

    expect(body.to).toMatchObject({ kind: 'BASELINE', id: second, name: 'Rev B' });
    // ADDED, and NOT also counted as having entered a path it was never off.
    expect(body.criticalPath.added.map((r: { activityId: string }) => r.activityId)).toEqual([
      added,
    ]);
    expect(body.criticalPath.added[0].isCritical).toBe(true);
    expect(body.criticalPath.added[0].existsLive).toBe(true);
    expect(body.criticalPath.entered).toEqual([]);
    expect(body.criticalPath.enteredTotal).toBe(0);
  });

  it('is readable by every member role, and refused to a non-member with 404', async () => {
    const admin = await adminWithOrg();
    const { planId } = await chainPlan(admin);
    const from = await capture(admin, planId, 'Rev A');

    // All four roles read it: the comparison is a schedule read, and the reporting audience IS
    // Viewer / Contributor. `schedule:read` and `baseline:read` are both in HIERARCHY_READ.
    for (const role of ['PLANNER', 'CONTRIBUTOR', 'VIEWER'] as const) {
      const actor = await member(admin, `${role.toLowerCase()}@example.com`, role);
      await actor.agent.get(compareUrl(planId, from)).expect(200);
    }
    await admin.agent.get(compareUrl(planId, from)).expect(200);

    // A signed-in NON-member of this org gets 404 — never 403, no existence oracle.
    const stranger = await signUp('stranger@example.com');
    await stranger.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await stranger.agent.get(compareUrl(planId, from)).expect(404);
  });

  it('answers 404 for a revision of another plan, and for one that does not exist', async () => {
    const admin = await adminWithOrg();
    const { planId } = await chainPlan(admin);
    const mine = await capture(admin, planId, 'Rev A');

    // A REAL baseline, belonging to a DIFFERENT plan in the SAME org. The scope check is on the
    // TARGET, so this is 404 and not a comparison of two unrelated plans.
    const other = await chainPlan(admin);
    const theirs = await capture(admin, other.planId, 'Other rev');
    await admin.agent.get(compareUrl(planId, theirs)).expect(404);
    await admin.agent.get(compareUrl(planId, mine, theirs)).expect(404);

    // An id naming nothing at all is the SAME 404 — the two are indistinguishable by design.
    await admin.agent.get(compareUrl(planId, randomUUID())).expect(404);
    await admin.agent.get(compareUrl(planId, mine, randomUUID())).expect(404);

    // A soft-deleted revision is gone for this purpose too, uniformly.
    await admin.agent
      .delete(`/api/v1/organizations/acme/plans/${planId}/baselines/${mine}`)
      .expect(204);
    await admin.agent.get(compareUrl(planId, mine)).expect(404);
  });

  it('refuses a revision compared with itself (422 SAME_REVISION) and a malformed `to`', async () => {
    const admin = await adminWithOrg();
    const { planId } = await chainPlan(admin);
    const from = await capture(admin, planId, 'Rev A');

    const same = await admin.agent.get(compareUrl(planId, from, from)).expect(422);
    expect(same.body.error.details).toMatchObject({ reason: 'SAME_REVISION' });
    expect(same.body.error.message).toMatch(/two different revisions/i);

    // `to` is a UUID or the literal `live` — anything else is a field-level 422, never a 500 and
    // never silently treated as live.
    await admin.agent.get(compareUrl(planId, from, 'latest')).expect(422);
    await admin.agent.get(compareUrl(planId, 'not-a-uuid')).expect(422);
    // `from` is required: a comparison with nothing to compare against is not a default.
    await admin.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/schedule/revision-compare`)
      .expect(422);
  });

  it('PERSISTS NOTHING — every engine-owned column unchanged after the read', async () => {
    const admin = await adminWithOrg();
    const { planId } = await chainPlan(admin);
    const from = await capture(admin, planId, 'Rev A');

    // The claim "nothing is written" is PROVED, not asserted: snapshot every engine-owned column
    // the recalculation writes — plus the plan's criticality mirrors and the baselines' own
    // versions, which this route reads and could plausibly touch — run the comparison, snapshot
    // again, compare whole objects. Verified RED by making the service persist once deliberately;
    // the diff then NAMES the columns that moved rather than reporting a bare inequality.
    const before = await engineOwnedSnapshot(planId);
    await admin.agent.get(compareUrl(planId, from)).expect(200);
    const after = await engineOwnedSnapshot(planId);
    expect(after).toEqual(before);
  });

  it('says UNKNOWN when a side never recorded its criticality rule, and never MATCH', async () => {
    const admin = await adminWithOrg();
    const { planId } = await chainPlan(admin);
    const from = await capture(admin, planId, 'Rev A');

    // A baseline captured before the freeze shipped has all four columns null — a permanent
    // sentinel, because a capture cannot be re-run. Written directly here BECAUSE the public API
    // structurally cannot produce it any more: the capture path always copies the plan's mirrors.
    // That is the one legitimate exception to the build-through-the-API rule, and it is exactly
    // the legacy state the three-valued verdict exists for.
    await prisma.baseline.update({
      where: { id: from },
      data: {
        criticalPathDefinition: null,
        criticalFloatThresholdMinutes: null,
        totalFloatMode: null,
        makeOpenEndsCritical: null,
      },
    });

    const res = await admin.agent.get(compareUrl(planId, from)).expect(200);
    // UNKNOWN, not MATCH. Coalescing it would tell a planner the two sides agree about a rule one
    // of them never recorded — the exact lie the columns exist to prevent.
    expect(res.body.data.settingsVerdict).toBe('UNKNOWN');
    // And the delta is still reported: an unknown rule is a caveat, not a refusal.
    expect(res.body.data.criticalPath.remainedCriticalCount).toBeGreaterThan(0);
  });
});
