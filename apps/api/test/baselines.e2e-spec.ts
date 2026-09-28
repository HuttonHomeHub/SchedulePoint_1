import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { BaselineRepository } from '../src/modules/baselines/baseline.repository';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for the baselines capture/list/get endpoints (M7 Task B1,
 * ADR-0025). Covers capturing a snapshot of a plan's computed schedule, the
 * first-baseline auto-active rule, the 422 never-calculated guard, the 409
 * duplicate-name guard, the RBAC split (Planner captures, Viewer/Contributor 403),
 * the IDOR/cross-org 404 matrix, and reading a baseline's frozen activity rows.
 * Verified against a real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Baselines API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baselineRepo: BaselineRepository;

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
    const { BaselineRepository: RepoToken } =
      await import('../src/modules/baselines/baseline.repository');
    baselineRepo = app.get(RepoToken);
  });

  // Delete children before parents so the FK restrictions never bite. Baselines and
  // their snapshot rows reference plans (RESTRICT), so they go before plans; snapshot
  // rows reference their baseline (RESTRICT), so they go first of all.
  async function resetDatabase(): Promise<void> {
    // **The shared list, not a private copy** (`docs/TECH_DEBT.md` #119a). This hand-rolled its own
    // sweep and omitted `plan_shares`, so `plan.deleteMany()` died on `plan_shares_plan_id_fkey`
    // whenever a Playwright run left a share behind on the same database — the failure that took all
    // 45 of `activities.e2e-spec.ts` down. `clearDomainData` is a strict superset in the same
    // deepest-first order, ending identically, and it handles the append-only audit triggers itself.
    await clearDomainData(prisma);
  }

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const baselinesUrl = (planId: string) => `/api/v1/organizations/acme/plans/${planId}/baselines`;

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

  /** A plan with a start date (all-days-work). Returns its id. */
  async function makePlan(actor: Actor, clientName: string): Promise<string> {
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
      .send({ name: 'Baseline', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
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

  async function recalc(actor: Actor, planId: string): Promise<void> {
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
      .expect(200);
  }

  /** A calculated plan with one activity A(3) from 2026-01-01. Returns { planId, activityId }. */
  async function calculatedPlan(
    actor: Actor,
    clientName = 'Northgate',
  ): Promise<{ planId: string; activityId: string }> {
    const planId = await makePlan(actor, clientName);
    const activityId = await makeActivity(actor, planId, 'A', 3);
    await recalc(actor, planId);
    return { planId, activityId };
  }

  it('freezes the criticality rule the recalculation ran with, and a later settings change does not move it (ADR-0125)', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);

    const frozen = async (baselineId: string) =>
      prisma.baseline.findUniqueOrThrow({
        where: { id: baselineId },
        select: {
          criticalPathDefinition: true,
          criticalFloatThresholdMinutes: true,
          totalFloatMode: true,
          makeOpenEndsCritical: true,
        },
      });

    // `calculatedPlan` recalculates, so the plan's mirrors hold the default rule and the capture
    // freezes it. This is also the only place the enum values cross a real database: the service
    // unit suite mocks Prisma, so a value PostgreSQL refused to coerce would be invisible there.
    const first = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Under the default rule' })
      .expect(201);
    expect(await frozen(first.body.data.id as string)).toEqual({
      criticalPathDefinition: 'TOTAL_FLOAT',
      criticalFloatThresholdMinutes: 0,
      totalFloatMode: 'FINISH',
      makeOpenEndsCritical: false,
    });

    // Move the plan's CONFIGURATION without recalculating. A settings PATCH does not mark the
    // schedule stale, so every activity's is_critical still reflects the OLD rule.
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({
        criticalPathDefinition: 'LONGEST_PATH',
        criticalFloatThresholdMinutes: 480,
        totalFloatMode: 'START',
        makeOpenEndsCritical: true,
        version: 2,
      })
      .expect(200);

    // THE POINT. A capture taken now must still freeze the rule the numbers were COMPUTED under,
    // not the one the plan happens to hold — otherwise the baseline claims a provenance its own
    // is_critical column contradicts, which is the defect this column exists to remove.
    const second = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'After a settings change, before a recalculation' })
      .expect(201);
    expect(await frozen(second.body.data.id as string)).toEqual({
      criticalPathDefinition: 'TOTAL_FLOAT',
      criticalFloatThresholdMinutes: 0,
      totalFloatMode: 'FINISH',
      makeOpenEndsCritical: false,
    });

    // Recalculating is what moves it — with the non-default enum labels, which is the half a
    // default-valued assertion cannot distinguish from a column nothing ever wrote.
    await recalc(actor, planId);
    const third = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'After the recalculation' })
      .expect(201);
    expect(await frozen(third.body.data.id as string)).toEqual({
      criticalPathDefinition: 'LONGEST_PATH',
      criticalFloatThresholdMinutes: 480,
      totalFloatMode: 'START',
      makeOpenEndsCritical: true,
    });
  });

  it('projects both sides of the revision delta, carrying type and isCritical (M1-T3)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId, activityId } = await calculatedPlan(actor);
    const created = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Rev A' })
      .expect(201);

    // The FROZEN side. `loadSnapshotRowsForVariance` does not cover this: it omits `isCritical` and
    // `type`, which are exactly the two the delta turns on — criticality is what "entered" and
    // "left" mean, and `type` is what excludes a summary from those sets and from carrier
    // selection. Asserting both fields present is what makes the separate projection non-vacuous.
    const frozen = await baselineRepo.loadSnapshotRowsForDelta(
      created.body.data.id as string,
      orgId,
    );
    expect(frozen).toHaveLength(1);
    expect(frozen[0]).toMatchObject({
      sourceActivityId: activityId,
      name: 'A',
      type: 'TASK',
      isCritical: true,
      totalFloat: 0,
    });

    // The LIVE side, carrying the same facts so both project to one row shape and the pure delta
    // cannot tell them apart.
    const live = await baselineRepo.loadActiveActivitiesForDelta(orgId, planId);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ id: activityId, name: 'A', type: 'TASK', isCritical: true });

    // The FROZEN side is org-scoped in the query too (the M4 security finding): a baseline id from
    // another organisation returns nothing here even though the id itself is real and the row
    // exists — so the uniform 404 upstream does not depend on the caller having checked first.
    expect(
      await baselineRepo.loadSnapshotRowsForDelta(created.body.data.id as string, randomUUID()),
    ).toEqual([]);

    // Org-scoped: a different organisation's id must return nothing rather than another org's rows.
    // The uniform-404 story upstream depends on this read being scoped, not on the caller being
    // careful.
    expect(await baselineRepo.loadActiveActivitiesForDelta(randomUUID(), planId)).toEqual([]);
    // Plan-scoped too — a real plan id in the right org, but not this one.
    expect(await baselineRepo.loadActiveActivitiesForDelta(orgId, randomUUID())).toEqual([]);
  });

  it('captures, lists and reads a baseline of a computed plan', async () => {
    const { actor } = await adminWithOrg();
    const { planId, activityId } = await calculatedPlan(actor);

    const created = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Contract Baseline' })
      .expect(201);
    expect(created.body.data).toMatchObject({
      name: 'Contract Baseline',
      planId,
      isActive: true, // the plan's first baseline is captured active
      dataDate: '2026-01-01',
      capturedProjectFinish: '2026-01-03',
      activityCount: 1,
    });
    const baselineId = created.body.data.id as string;

    const list = await actor.agent.get(baselinesUrl(planId)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: baselineId, isActive: true, activityCount: 1 });

    const detail = await actor.agent.get(`${baselinesUrl(planId)}/${baselineId}`).expect(200);
    expect(detail.body.data.activities).toHaveLength(1);
    expect(detail.body.data.activities[0]).toMatchObject({
      sourceActivityId: activityId,
      name: 'A',
      durationDays: 3,
      baselineStart: '2026-01-01',
      baselineFinish: '2026-01-03',
      isCritical: true,
      totalFloat: 0,
    });
  });

  // T3 (placement-baseline-variance): a plain fixture where placed == early cannot tell
  // "the capture correctly froze the placed span" apart from "the capture froze the early
  // span twice" — both produce the same numbers. Hand-placing A first, so placed ≠ early,
  // is what discriminates them (m-c/placement-snapshot.md:25-34).
  it('exposes the frozen placement and level on baseline reads, on a hand-placed bar (M-C)', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await makeActivity(actor, planId, 'A', 3); // early start 2026-01-01 (all-days)
    // Hand-place A five days later than its logic-earliest — placed (01-06) ≠ early (01-01).
    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${a}`)
      .send({ visualStart: '2026-01-06', version: 1 })
      .expect(200);
    await recalc(actor, planId);

    const activities = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .expect(200);
    const live = (activities.body.data as { visualEffectiveStart: string | null }[])[0]!;
    expect(live.visualEffectiveStart).toBe('2026-01-06'); // the bar as drawn — not 01-01

    const created = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Contract Baseline' })
      .expect(201);
    expect(created.body.data).toMatchObject({ placementSnapshotLevel: 'FULL' });
    const baselineId = created.body.data.id as string;

    const detail = await actor.agent.get(`${baselinesUrl(planId)}/${baselineId}`).expect(200);
    expect(detail.body.data.activities[0]).toMatchObject({
      sourceActivityId: a,
      baselineStart: '2026-01-01', // the pure-network dates, unchanged
      baselineFinish: '2026-01-03',
      placedStart: '2026-01-06', // where the bar actually sat — NOT re-frozen from early
      placedFinish: '2026-01-08',
      visualStart: '2026-01-06', // the planner's own input, distinct from the engine's output
    });
  });

  it('activates only the first baseline; later captures are inactive', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);

    const first = await actor.agent.post(baselinesUrl(planId)).send({ name: 'First' }).expect(201);
    const second = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Second' })
      .expect(201);
    expect(first.body.data.isActive).toBe(true);
    expect(second.body.data.isActive).toBe(false);
  });

  // The one list in the app that honours `order` — the reason it declares the param
  // at all, and every other list does not (TECH_DEBT #19). Both keyset terms
  // (created_at, id) flip together, so the reversal must be exact, not merely different.
  it('honours ?order — newest-first by default, oldest-first on asc', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);

    for (const name of ['First', 'Second', 'Third']) {
      await actor.agent.post(baselinesUrl(planId)).send({ name }).expect(201);
    }

    const def = await actor.agent.get(baselinesUrl(planId)).expect(200);
    expect(def.body.data.map((b: { name: string }) => b.name)).toEqual([
      'Third',
      'Second',
      'First',
    ]);

    const asc = await actor.agent.get(`${baselinesUrl(planId)}?order=asc`).expect(200);
    expect(asc.body.data.map((b: { name: string }) => b.name)).toEqual([
      'First',
      'Second',
      'Third',
    ]);

    await actor.agent.get(`${baselinesUrl(planId)}?order=sideways`).expect(422);

    // And the contract's other half: a list that does NOT honour a direction now
    // says so — `forbidNonWhitelisted` turns the old accept-and-ignore into a 422.
    await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/activities?order=desc`)
      .expect(422);
  });

  it('422s (SCHEDULE_NOT_CALCULATED) capturing a plan that was never calculated', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    await makeActivity(actor, planId, 'A', 3); // present but not recalculated

    const res = await actor.agent.post(baselinesUrl(planId)).send({ name: 'X' }).expect(422);
    expect(res.body.error?.details?.reason).toBe('SCHEDULE_NOT_CALCULATED');
  });

  it('422s (SCHEDULE_NOT_CALCULATED) capturing an empty plan', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Empty');
    const res = await actor.agent.post(baselinesUrl(planId)).send({ name: 'X' }).expect(422);
    expect(res.body.error?.details?.reason).toBe('SCHEDULE_NOT_CALCULATED');
  });

  it('409s (DUPLICATE_BASELINE) on a name already used by an active baseline', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(201);
    const res = await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(409);
    expect(res.body.error?.details?.reason).toBe('DUPLICATE_BASELINE');
  });

  it('422s on an empty name', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    await actor.agent.post(baselinesUrl(planId)).send({ name: '   ' }).expect(422);
  });

  it('enforces RBAC: Viewer and Contributor cannot capture (403), but can read', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Base' }).expect(201);

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.post(baselinesUrl(planId)).send({ name: 'Nope' }).expect(403);
    await viewer.agent.get(baselinesUrl(planId)).expect(200); // read is open to every member

    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.post(baselinesUrl(planId)).send({ name: 'Nope' }).expect(403);
  });

  it('hides the plan from non-members and other orgs (404), and validates the id (400)', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(baselinesUrl(planId)).expect(404); // not a member of acme
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/plans/${planId}/baselines`).expect(404); // a member of another org cannot reach acme's plan
    await actor.agent.get(baselinesUrl('00000000-0000-7000-8000-000000000000')).expect(404); // well-formed but unknown plan
    await actor.agent.get('/api/v1/organizations/acme/plans/not-a-uuid/baselines').expect(400); // malformed plan id
  });

  it('activates exactly one baseline, atomically deactivating the previous', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    const first = await actor.agent.post(baselinesUrl(planId)).send({ name: 'First' }).expect(201);
    const second = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Second' })
      .expect(201);
    const firstId = first.body.data.id as string;
    const secondId = second.body.data.id as string;

    const activated = await actor.agent
      .post(`${baselinesUrl(planId)}/${secondId}/activate`)
      .expect(200);
    expect(activated.body.data).toMatchObject({ id: secondId, isActive: true });

    const list = await actor.agent.get(baselinesUrl(planId)).expect(200);
    const byId = new Map(
      (list.body.data as { id: string; isActive: boolean }[]).map((b) => [b.id, b.isActive]),
    );
    expect(byId.get(secondId)).toBe(true);
    expect(byId.get(firstId)).toBe(false); // exactly one active

    // Idempotent: activating the already-active one keeps it active, still only one.
    await actor.agent.post(`${baselinesUrl(planId)}/${secondId}/activate`).expect(200);
    const active = await prisma.baseline.count({
      where: { planId, isActive: true, deletedAt: null },
    });
    expect(active).toBe(1);
  });

  it('deletes a baseline (soft cascade) and frees its name; deleting the active leaves none active', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    const created = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Contract' })
      .expect(201);
    const baselineId = created.body.data.id as string;

    await actor.agent.delete(`${baselinesUrl(planId)}/${baselineId}`).expect(204);
    const list = await actor.agent.get(baselinesUrl(planId)).expect(200);
    expect(list.body.data).toHaveLength(0);
    // Its snapshot rows soft-deleted with it, under one batch.
    const snap = await prisma.baselineActivity.findFirst({
      where: { baselineId, deletedAt: null },
    });
    expect(snap).toBeNull();

    // The plan now has no active baseline; a fresh capture reuses the name and is active again.
    const again = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Contract' })
      .expect(201);
    expect(again.body.data.isActive).toBe(true);
  });

  it('enforces RBAC on activate/delete: Viewer and Contributor are forbidden (403)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    const created = await actor.agent.post(baselinesUrl(planId)).send({ name: 'Base' }).expect(201);
    const baselineId = created.body.data.id as string;

    for (const [email, role] of [
      ['viewer@example.com', 'VIEWER'],
      ['contributor@example.com', 'CONTRIBUTOR'],
    ] as const) {
      const user = await signUp(email);
      await prisma.orgMember.create({ data: { organizationId: orgId, userId: user.userId, role } });
      await user.agent.post(`${baselinesUrl(planId)}/${baselineId}/activate`).expect(403);
      await user.agent.delete(`${baselinesUrl(planId)}/${baselineId}`).expect(403);
    }
  });

  it('cascades: deleting the plan soft-deletes its baselines; restoring the plan brings them back', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    const created = await actor.agent.post(baselinesUrl(planId)).send({ name: 'Base' }).expect(201);
    const baselineId = created.body.data.id as string;

    // Delete the plan → its baselines + snapshot rows are swept into the same batch.
    await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);
    const deleted = await prisma.baseline.findUniqueOrThrow({ where: { id: baselineId } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.deleteBatchId).not.toBeNull();
    const liveSnap = await prisma.baselineActivity.count({
      where: { baselineId, deletedAt: null },
    });
    expect(liveSnap).toBe(0);
    // The plan is gone, so the baselines endpoint 404s.
    await actor.agent.get(baselinesUrl(planId)).expect(404);

    // Restore the plan → its baselines come back, active flag preserved.
    await actor.agent.post(`/api/v1/organizations/acme/plans/${planId}/restore`).expect(200);
    const restored = await prisma.baseline.findUniqueOrThrow({ where: { id: baselineId } });
    expect(restored.deletedAt).toBeNull();
    expect(restored.isActive).toBe(true);
    const list = await actor.agent.get(baselinesUrl(planId)).expect(200);
    expect(list.body.data.map((b: { id: string }) => b.id)).toContain(baselineId);
  });

  const varianceUrl = (planId: string) => `${baselinesUrl(planId)}/variance`;

  /**
   * The variance read builds a calendar port of its own, so it reaches the "no working time at
   * all" state by exactly the same route as a recalculation — and answered the same opaque 500.
   * Both seams now go through one `buildPlanCalendarOrReject`: a mapping written only at the seam
   * that happened to be found first would have left this one throwing, and nothing would have said
   * so (TECH_DEBT #79).
   */
  it('rejects a variance read on a calendar with no working time with a 422, not a 500', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    // An ACTIVE baseline is required to reach the calendar at all: with none, variance returns an
    // empty set before resolving one. The first version of this test omitted the capture and got a
    // 200 — the test was wrong, not the mapping, and a 200 there proves only that the short-circuit
    // works.
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(201);

    const cal = await actor.agent
      .post('/api/v1/organizations/acme/calendars')
      .send({ name: 'Nothing works', workingWeekdays: 0 })
      .expect(201);
    const plan = await actor.agent.get(`/api/v1/organizations/acme/plans/${planId}`).expect(200);
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${planId}`)
      .send({ calendarId: cal.body.data.id as string, version: plan.body.data.version as number })
      .expect(200);

    const res = await actor.agent.get(varianceUrl(planId)).expect(422);
    expect(res.body.error.details).toMatchObject({ reason: 'CALENDAR_HAS_NO_WORKING_TIME' });
    expect(res.body.error.message).toContain('Nothing works');
  });

  it('variance is empty with a null baselineId when the plan has no active baseline', async () => {
    const { actor } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    const res = await actor.agent.get(varianceUrl(planId)).expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.baselineId).toBeNull();
  });

  it('computes per-activity variance (behind + added) vs the active baseline', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await makeActivity(actor, planId, 'A', 3); // finishes 2026-01-03 (all-days)
    await recalc(actor, planId);
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(201);

    // Extend A by 3 days and add a new activity B, then recalculate.
    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${a}`)
      .send({ durationDays: 6, version: 1 })
      .expect(200);
    await makeActivity(actor, planId, 'B', 2);
    await recalc(actor, planId);

    const res = await actor.agent.get(varianceUrl(planId)).expect(200);
    const byId = new Map(
      (res.body.data as { activityId: string; name: string }[]).map((r) => [r.name, r]),
    );
    expect(byId.get('A')).toMatchObject({ inBaseline: true, finishVarianceDays: 3 });
    expect(byId.get('B')).toMatchObject({ inBaseline: false, finishVarianceDays: null });
    expect(res.body.meta).toMatchObject({ worstFinishSlipDays: 3, behindCount: 1, addedCount: 1 });
  });

  it('reports a baselined activity deleted since capture as a removed row', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await makeActivity(actor, planId, 'A', 3);
    await recalc(actor, planId);
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(201);

    await actor.agent.delete(`/api/v1/organizations/acme/activities/${a}`).expect(200);

    const res = await actor.agent.get(varianceUrl(planId)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ name: 'A', removed: true, currentFinish: null });
    expect(res.body.meta.removedCount).toBe(1);
  });

  // R1 (placement-baseline-variance §2, fails against today's code before this epic): the
  // stripped activity reads as ahead of baseline while its bar has not moved. A carries a
  // BINDING SNET nine calendar days after the data date; B is its FS successor. After
  // capture, PATCH A the way ADR-0148's strip converted a binding constraint into a
  // placement — through the public PATCH, not the migration SQL (that row transformation
  // is already covered by strip-drag-constraints-migration.e2e-spec.ts, and running the SQL
  // here would convert other tests' rows too, since it is not plan-scoped).
  it('R1: a stripped activity reads as ahead of baseline while its bar has not moved', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate'); // data date 2026-01-01
    const a = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'A', durationDays: 3, constraintType: 'SNET', constraintDate: '2026-01-10' })
      .expect(201);
    const aId = a.body.data.id as string;
    const bId = await makeActivity(actor, planId, 'B', 2);
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: aId, successorId: bId, type: 'FS' })
      .expect(201);
    await recalc(actor, planId);

    type Row = {
      id: string;
      visualEffectiveStart: string | null;
      visualEffectiveFinish: string | null;
    };
    const listUrl = `/api/v1/organizations/acme/plans/${planId}/activities?limit=100`;
    const beforeById = new Map(
      ((await actor.agent.get(listUrl).expect(200)).body.data as Row[]).map((r) => [r.id, r]),
    );
    // Fixture is only worth anything if A is genuinely bound (the constraint pushed it later
    // than logic would have) — assert that FIRST.
    expect(beforeById.get(aId)!.visualEffectiveStart).toBe('2026-01-10');

    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(201);

    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${aId}`)
      .send({ constraintType: null, constraintDate: null, visualStart: '2026-01-10', version: 1 })
      .expect(200);
    await recalc(actor, planId);

    // Assert FIRST that the bars have not moved — without this, a passing 0 below could come
    // from a fixture where both moved by the same amount.
    const afterById = new Map(
      ((await actor.agent.get(listUrl).expect(200)).body.data as Row[]).map((r) => [r.id, r]),
    );
    for (const id of [aId, bId]) {
      expect(afterById.get(id)!.visualEffectiveStart, `${id} start moved`).toBe(
        beforeById.get(id)!.visualEffectiveStart,
      );
      expect(afterById.get(id)!.visualEffectiveFinish, `${id} finish moved`).toBe(
        beforeById.get(id)!.visualEffectiveFinish,
      );
    }

    const res = await actor.agent.get(varianceUrl(planId)).expect(200);
    const byId = new Map(
      (res.body.data as { activityId: string; startVarianceDays: number | null }[]).map((r) => [
        r.activityId,
        r,
      ]),
    );
    expect(byId.get(aId)).toMatchObject({ startVarianceDays: 0, finishVarianceDays: 0 });
    expect(byId.get(bId)).toMatchObject({ startVarianceDays: 0, finishVarianceDays: 0 });
    expect(res.body.meta).toMatchObject({
      basis: 'PLACED',
      worstFinishSlipDays: null,
      behindCount: 0,
    });
  });

  // R2 (placement-baseline-variance §2, fails against today's code before this epic): a
  // dragged bar reads as unmoved.
  it('R2: a bar dragged after capture reads as moved', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const aId = await makeActivity(actor, planId, 'A', 3); // unconstrained
    const bId = await makeActivity(actor, planId, 'B', 2);
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: aId, successorId: bId, type: 'FS' })
      .expect(201);
    await recalc(actor, planId);
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Contract' }).expect(201);

    // Drag A five calendar days later (all-days calendar, so five working days too).
    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${aId}`)
      .send({ visualStart: '2026-01-06', version: 1 })
      .expect(200);
    await recalc(actor, planId);

    const res = await actor.agent.get(varianceUrl(planId)).expect(200);
    const byId = new Map(
      (res.body.data as { activityId: string; startVarianceDays: number | null }[]).map((r) => [
        r.activityId,
        r,
      ]),
    );
    expect(byId.get(aId)).toMatchObject({ startVarianceDays: 5, finishVarianceDays: 5 });
    expect(byId.get(bId)).toMatchObject({ startVarianceDays: 5, finishVarianceDays: 5 });
    expect(res.body.meta).toMatchObject({ basis: 'PLACED', behindCount: 2 });
  });

  // R3 (characterisation): a NONE-level baseline compares network-vs-network, unchanged from
  // before this epic. Repeats R1's fixture, then forces the active baseline back to how a
  // pre-M-C capture reads (`placement_snapshot_level: 'NONE'`, the three placement columns
  // null) through Prisma directly — the public API never produces this shape any more. Pins
  // the Q1 default; if Q1 is ever answered otherwise, this case changes with it.
  it('R3: a NONE-level baseline compares network-vs-network, unchanged', async () => {
    const { actor } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'A', durationDays: 3, constraintType: 'SNET', constraintDate: '2026-01-10' })
      .expect(201);
    const aId = a.body.data.id as string;
    const bId = await makeActivity(actor, planId, 'B', 2);
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: aId, successorId: bId, type: 'FS' })
      .expect(201);
    await recalc(actor, planId);
    const created = await actor.agent
      .post(baselinesUrl(planId))
      .send({ name: 'Contract' })
      .expect(201);
    const baselineId = created.body.data.id as string;

    await prisma.baselineActivity.updateMany({
      where: { baselineId },
      data: { placedStart: null, placedFinish: null, visualStart: null },
    });
    await prisma.baseline.update({
      where: { id: baselineId },
      data: { placementSnapshotLevel: 'NONE' },
    });

    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${aId}`)
      .send({ constraintType: null, constraintDate: null, visualStart: '2026-01-10', version: 1 })
      .expect(200);
    await recalc(actor, planId);

    const res = await actor.agent.get(varianceUrl(planId)).expect(200);
    const byId = new Map(
      (res.body.data as { activityId: string; startVarianceDays: number | null }[]).map((r) => [
        r.activityId,
        r,
      ]),
    );
    // -9 (ahead): the frozen constraint-bound early start compared with today's lowered one —
    // exactly today's (pre-epic) behaviour, kept for a NONE-level baseline by Q1's default (a).
    expect(byId.get(aId)).toMatchObject({ startVarianceDays: -9, finishVarianceDays: -9 });
    expect(byId.get(bId)).toMatchObject({ startVarianceDays: -9, finishVarianceDays: -9 });
    expect(res.body.meta.basis).toBe('NETWORK');
  });

  it('variance reads for any member but hides the plan from non-members (404)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const { planId } = await calculatedPlan(actor);
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(varianceUrl(planId)).expect(200);
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(varianceUrl(planId)).expect(404);
  });

  it('scale smoke: variance for a 500-activity baseline is one bounded read', async () => {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'BigPlan');
    // Seed a 500-node chain directly (HTTP per-activity is too slow for a fixture).
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
    await recalc(actor, planId);
    await actor.agent.post(baselinesUrl(planId)).send({ name: 'Big' }).expect(201);

    // The variance join + one calendar build serves the whole plan in a single read
    // (the same O(n) join scales to the 2,000-activity ceiling; asserted here at 500).
    const res = await actor.agent.get(varianceUrl(planId)).expect(200);
    expect(res.body.data).toHaveLength(500);
    expect((res.body.data as { inBaseline: boolean }[]).every((r) => r.inBaseline)).toBe(true);
    expect(res.body.meta.behindCount).toBe(0); // live matches the just-captured baseline
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/plans/00000000-0000-7000-8000-000000000000/baselines')
      .expect(401);
  });
});
