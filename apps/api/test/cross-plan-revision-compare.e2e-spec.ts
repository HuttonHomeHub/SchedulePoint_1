import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';
import { clearBaselineTree } from './clear-baseline-tree';

/**
 * End-to-end tests for the **cross-plan** revision comparison (M1-T5):
 * `GET /organizations/:orgSlug/cross-plan-revision-compare?fromPlanId=…&toPlanId=…`.
 *
 * **The route ships DARK.** Nothing in `apps/web` calls it until M2 — there is no menu item and no
 * dock — and "the model landed" is not a claim the capability exists (ADR-0081). These tests are
 * its only caller, and they are deliberately its full contract rather than a smoke test, because a
 * dark route has no user to find its defects.
 *
 * Every fixture is built THROUGH THE PUBLIC REST API (the ADR-0066 rule — never by writing rows),
 * which is also what makes the correlation meaningful: the two plans are two ordinary plans, with
 * two independent id spaces, exactly as two imports of one programme would be.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Cross-plan revision compare API (e2e)', () => {
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
    await clearBaselineTree(prisma);
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

  const url = (params: Record<string, string | string[] | undefined>, slug = 'acme'): string => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) for (const one of v) q.append(k, one);
      else q.set(k, v);
    }
    return `/api/v1/organizations/${slug}/cross-plan-revision-compare?${q.toString()}`;
  };

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

  let clientSeq = 0;

  async function makePlan(
    actor: Actor,
    slug = 'acme',
    plannedStart = '2026-01-01',
  ): Promise<string> {
    const client = await actor.agent
      .post(`/api/v1/organizations/${slug}/clients`)
      .send({ name: `Programme client ${(clientSeq += 1)}` })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/${slug}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/${slug}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Programme revision', plannedStart })
      .expect(201);
    const planId = plan.body.data.id as string;
    // All-days-work, so the working-day arithmetic is transparent.
    await actor.agent
      .patch(`/api/v1/organizations/${slug}/plans/${planId}`)
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

  /**
   * **Two plans standing in for two imports of one programme.**
   *
   * Both carry `A100`/`A200`; the second re-durations `A200` and adds `A300`. Their activity UUIDs
   * are unrelated, which is the whole premise — a comparison keyed on id would report every row of
   * one plan as removed and every row of the other as added.
   */
  async function twoRevisions(admin: Actor): Promise<{ fromPlanId: string; toPlanId: string }> {
    const fromPlanId = await makePlan(admin);
    const fa = await makeActivity(admin, fromPlanId, 'Groundworks', 10, { code: 'A100' });
    const fb = await makeActivity(admin, fromPlanId, 'Frame', 10, { code: 'A200' });
    await link(admin, fromPlanId, fa, fb);
    await recalculate(admin, fromPlanId);

    const toPlanId = await makePlan(admin);
    const ta = await makeActivity(admin, toPlanId, 'Groundworks', 10, { code: 'A100' });
    const tb = await makeActivity(admin, toPlanId, 'Frame', 25, { code: 'A200' });
    await makeActivity(admin, toPlanId, 'Cladding', 5, { code: 'A300' });
    await link(admin, toPlanId, ta, tb);
    await recalculate(admin, toPlanId);

    return { fromPlanId, toPlanId };
  }

  describe('authorisation and scope', () => {
    it('a member with schedule:read and baseline:read reads it', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const viewer = await member(admin, 'viewer@example.com', 'VIEWER');

      const res = await viewer.agent.get(url({ fromPlanId, toPlanId })).expect(200);
      expect(res.body.data.correlation.matched).toBe(2);
    });

    it('a non-member gets 404 — the organisation, not the plan, is the miss', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.get(url({ fromPlanId, toPlanId })).expect(404);
    });

    it('another organisation’s plan is 404 and NOT 403 — a 403 is an existence oracle', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      // A second organisation whose admin is a stranger to Acme.
      const other = await signUp('other-admin@example.com');
      await other.agent.post('/api/v1/organizations').send({ name: 'Beta' }).expect(201);
      const betaPlan = await makePlan(other, 'beta');

      // Acme's admin naming Beta's plan: the plan exists, and the answer must not say so.
      await admin.agent.get(url({ fromPlanId, toPlanId: betaPlan })).expect(404);
      // And the reverse: a real Acme plan named from Beta's org slug.
      await other.agent.get(url({ fromPlanId, toPlanId }, 'beta')).expect(404);
    });

    it('a soft-deleted plan is 404', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      await admin.agent.delete(`/api/v1/organizations/acme/plans/${fromPlanId}`).expect(204);
      await admin.agent.get(url({ fromPlanId, toPlanId })).expect(404);
    });

    it('a baseline of the OTHER plan, named on the wrong side, is 404', async () => {
      // Each revision is resolved against its OWN plan. Without that, this would quietly compare
      // two snapshots of the same plan under two plan headings — a wrong answer that looks right.
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const toBaseline = await capture(admin, toPlanId, 'Rev B');

      await admin.agent.get(url({ fromPlanId, toPlanId, from: toBaseline })).expect(404);
      // The same id on its OWN side resolves, which is what makes the assertion above about the
      // side and not about the id.
      await admin.agent.get(url({ fromPlanId, toPlanId, to: toBaseline })).expect(200);
    });
  });

  describe('refusals', () => {
    it('the same plan on both sides is 422 CROSS_PLAN_SAME_PLAN', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId } = await twoRevisions(admin);
      const res = await admin.agent.get(url({ fromPlanId, toPlanId: fromPlanId })).expect(422);
      expect(res.body.error.details.reason).toBe('CROSS_PLAN_SAME_PLAN');
      // The message names the route that DOES answer this, rather than only refusing.
      expect(res.body.error.message).toMatch(/Compare revisions/i);
    });

    it('two plans with no codes in common is a 200 with a reason and NO delta', async () => {
      const admin = await adminWithOrg();
      const fromPlanId = await makePlan(admin);
      await makeActivity(admin, fromPlanId, 'Groundworks', 10, { code: 'AAA' });
      await recalculate(admin, fromPlanId);
      const toPlanId = await makePlan(admin);
      await makeActivity(admin, toPlanId, 'Groundworks', 10, { code: 'ZZZ' });
      await recalculate(admin, toPlanId);

      const res = await admin.agent.get(url({ fromPlanId, toPlanId })).expect(200);
      expect(res.body.data.notAssessableReason).toBe('NO_COMMON_CODES');
      expect(res.body.data.criticalPath.notAssessableReason).toBe('NO_COMMON_CODES');
      expect(res.body.data.criticalPath.added).toEqual([]);
      expect(res.body.data.criticalPath.removed).toEqual([]);
      expect(res.body.data.completion.assessable).toBe(false);
      expect(res.body.data.completion.reason).toBe('NO_COMMON_ACTIVITIES');
      // The coverage block is still present and still true: it is what a reader needs MOST here.
      expect(res.body.data.correlation).toMatchObject({
        matched: 0,
        fromUnmatched: 1,
        toUnmatched: 1,
      });
    });

    it('a malformed plan id or revision is 422 field validation', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      await admin.agent.get(url({ fromPlanId: 'not-a-uuid', toPlanId })).expect(422);
      await admin.agent.get(url({ fromPlanId, toPlanId, from: 'latest' })).expect(422);
    });
  });

  describe('the correlation', () => {
    it('matches on code across two independent id spaces, and states the coverage', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);

      const res = await admin.agent.get(url({ fromPlanId, toPlanId })).expect(200);
      const { correlation } = res.body.data;
      expect(correlation).toMatchObject({
        key: 'CODE',
        matched: 2,
        fromUnmatched: 0,
        toUnmatched: 1,
        fromUncoded: 0,
        toUncoded: 0,
      });
      expect(correlation.toUnmatchedRows).toHaveLength(1);
      expect(correlation.toUnmatchedRows[0]).toMatchObject({
        code: 'A300',
        planId: toPlanId,
      });
      // A300 is in the ANCHOR plan, so it has an id there — the only rows carrying null are those
      // that live only in the other plan.
      expect(correlation.toUnmatchedRows[0].activityId).not.toBeNull();
    });

    it('carries anchor-plan ids, and null for a row that exists only in the other plan', async () => {
      const admin = await adminWithOrg();
      const fromPlanId = await makePlan(admin);
      const fa = await makeActivity(admin, fromPlanId, 'Groundworks', 10, { code: 'A100' });
      const fb = await makeActivity(admin, fromPlanId, 'Demolition', 5, { code: 'GONE' });
      await link(admin, fromPlanId, fa, fb);
      await recalculate(admin, fromPlanId);
      const toPlanId = await makePlan(admin);
      const ta = await makeActivity(admin, toPlanId, 'Groundworks', 10, { code: 'A100' });
      await recalculate(admin, toPlanId);

      const res = await admin.agent.get(url({ fromPlanId, toPlanId })).expect(200);
      const removed = res.body.data.criticalPath.removed as Array<{
        code: string;
        activityId: string | null;
        existsLive: boolean;
      }>;
      expect(removed.map((r) => r.code)).toContain('GONE');
      const gone = removed.find((r) => r.code === 'GONE')!;
      // Inventing an id here would give a client a reveal control that navigates nowhere.
      expect(gone.activityId).toBeNull();
      expect(gone.existsLive).toBe(false);
      // And a matched row resolves in the anchor plan, not the other one.
      const matched = (res.body.data.correlation.fromUnmatchedRows as unknown[]).length;
      expect(matched).toBe(1);
      expect(ta).not.toBe(fa);
    });

    it('lists an uncoded row and puts it in NEITHER presence set', async () => {
      const admin = await adminWithOrg();
      const fromPlanId = await makePlan(admin);
      await makeActivity(admin, fromPlanId, 'Groundworks', 10, { code: 'A100' });
      await makeActivity(admin, fromPlanId, 'Unlabelled', 3);
      await recalculate(admin, fromPlanId);
      const toPlanId = await makePlan(admin);
      await makeActivity(admin, toPlanId, 'Groundworks', 10, { code: 'A100' });
      await recalculate(admin, toPlanId);

      const res = await admin.agent.get(url({ fromPlanId, toPlanId })).expect(200);
      expect(res.body.data.correlation.fromUncoded).toBe(1);
      expect(res.body.data.correlation.uncodedRows).toHaveLength(1);
      expect(res.body.data.correlation.uncodedRows[0]).toMatchObject({
        code: null,
        planId: fromPlanId,
      });
      // Neither added nor removed: the product does not know which it is.
      const codes = [
        ...(res.body.data.criticalPath.added as { code: string | null }[]),
        ...(res.body.data.criticalPath.removed as { code: string | null }[]),
      ].map((r) => r.code);
      expect(codes).not.toContain(null);
    });

    it('names both plans and the measurement frame', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const res = await admin.agent.get(url({ fromPlanId, toPlanId })).expect(200);

      expect(res.body.data.fromPlan).toMatchObject({ id: fromPlanId, projectName: 'Riverside' });
      expect(res.body.data.toPlan).toMatchObject({ id: toPlanId, projectName: 'Riverside' });
      // The frame is the OLD side's, and it is named because two plans need not share one.
      expect(res.body.data.frame.planId).toBe(fromPlanId);
      expect(res.body.data.frame.hoursPerDayMinutes).toBe(res.body.data.dayFactorMinutes);
    });
  });

  describe('the opt-in projections', () => {
    it('omits every projection when none is asked for', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const res = await admin.agent.get(url({ fromPlanId, toPlanId })).expect(200);
      expect(res.body.data.changes).toBeUndefined();
      expect(res.body.data.ghosts).toBeUndefined();
      expect(res.body.data.links).toBeUndefined();
    });

    it('accepts `include` in BOTH wire shapes — sent ONCE (a string) and REPEATED (an array)', async () => {
      /**
       * `?include=changes` arrives as a STRING and `?include=changes&include=ghosts` as an ARRAY,
       * and `@IsIn(..., { each: true })` needs an array either way. The single case is the one that
       * shipped broken on the sibling route for one commit — a 400 on exactly what a client sends
       * most — and no unit or API test could see it, because none passed `include` at all.
       *
       * **A third shape was asserted here first and it was WRONG.** The plan says "both wire
       * shapes", which I read as repeated-key and comma-joined; the run answered 422, and reading
       * `common/dto/to-array.ts` showed why — it wraps, it does not split, so `changes,ghosts` is
       * one value that is not in the vocabulary. Comma-joining is not a contract this API offers on
       * either route, and asserting it would have invented one and then "fixed" the product to
       * match. The two shapes are the two HTTP produces.
       */
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);

      const once = await admin.agent
        .get(url({ fromPlanId, toPlanId, include: 'changes' }))
        .expect(200);
      expect(once.body.data.changes).toBeDefined();

      const repeated = await admin.agent
        .get(url({ fromPlanId, toPlanId, include: ['changes', 'ghosts'] }))
        .expect(200);
      expect(repeated.body.data.changes).toBeDefined();
      expect(repeated.body.data.ghosts).toBeDefined();

      // And an unknown projection is refused rather than ignored, in either shape.
      await admin.agent.get(url({ fromPlanId, toPlanId, include: 'changes,ghosts' })).expect(422);
      await admin.agent.get(url({ fromPlanId, toPlanId, include: 'costs' })).expect(422);
    });

    it('`?include=changes` ALONE returns the change list and no geometry', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const res = await admin.agent
        .get(url({ fromPlanId, toPlanId, include: 'changes' }))
        .expect(200);
      expect(res.body.data.changes.classes.length).toBeGreaterThan(0);
      expect(res.body.data.ghosts).toBeUndefined();
    });

    it('`?include=ghosts` ALONE returns geometry AND the changed logic', async () => {
      // ADR-0126 records this exact projection receiving two EMPTY edge sets on the sibling route,
      // because the edge loads were gated on `changes` alone — a lit overlay drawing no logic.
      // Nothing else can see it: a client asks for both together.
      const admin = await adminWithOrg();
      const fromPlanId = await makePlan(admin);
      const fa = await makeActivity(admin, fromPlanId, 'Groundworks', 10, { code: 'A100' });
      const fb = await makeActivity(admin, fromPlanId, 'Frame', 10, { code: 'A200' });
      await link(admin, fromPlanId, fa, fb);
      await recalculate(admin, fromPlanId);
      // The same two activities, with the LINK REMOVED — so there is a changed link to report.
      const toPlanId = await makePlan(admin);
      await makeActivity(admin, toPlanId, 'Groundworks', 10, { code: 'A100' });
      await makeActivity(admin, toPlanId, 'Frame', 10, { code: 'A200' });
      await recalculate(admin, toPlanId);

      const res = await admin.agent
        .get(url({ fromPlanId, toPlanId, include: 'ghosts' }))
        .expect(200);
      expect(res.body.data.changes).toBeUndefined();
      expect(res.body.data.links).toBeDefined();
      expect(res.body.data.links).toHaveLength(1);
      expect(res.body.data.links[0].state).toBe('REMOVED');
      expect(res.body.data.ghosts).toBeDefined();
    });

    it('hands an ADDED link back under the ANCHOR plan’s own dependency id', async () => {
      /**
       * **The defect this case exists for was found by reading the painter, not by a failure.**
       *
       * The canvas resolves an ADDED or CHANGED link by looking its `dependencyId` up among the
       * edges the diagram already draws, which carry the anchor plan's real ids. Handed the
       * correlation key it matches nothing, draws nothing and says nothing — while `linksTotal`
       * counts it and `linksUndrawable` does not. A picture quietly missing rows nobody is told
       * about is exactly the absence the overlay exists to remove, in the one place a reader
       * cannot check it.
       *
       * A REMOVED link is asserted to keep the correlation key, because it is in no live edge list
       * and the painter routes it from its endpoints instead — so the two states are checked
       * separately rather than one standing in for the other.
       */
      const admin = await adminWithOrg();
      const fromPlanId = await makePlan(admin);
      await makeActivity(admin, fromPlanId, 'Groundworks', 10, { code: 'A100' });
      await makeActivity(admin, fromPlanId, 'Frame', 10, { code: 'A200' });
      await recalculate(admin, fromPlanId);
      // The same two, WITH a link — so the link is ADDED relative to the old plan.
      const toPlanId = await makePlan(admin);
      const ta = await makeActivity(admin, toPlanId, 'Groundworks', 10, { code: 'A100' });
      const tb = await makeActivity(admin, toPlanId, 'Frame', 10, { code: 'A200' });
      await link(admin, toPlanId, ta, tb);
      await recalculate(admin, toPlanId);

      const res = await admin.agent
        .get(url({ fromPlanId, toPlanId, include: 'ghosts' }))
        .expect(200);
      const links = res.body.data.links as { dependencyId: string; state: string }[];
      expect(links).toHaveLength(1);
      expect(links[0]!.state).toBe('ADDED');

      const anchorEdges = await prisma.activityDependency.findMany({
        where: { planId: toPlanId, deletedAt: null },
        select: { id: true },
      });
      expect(anchorEdges).toHaveLength(1);
      // The id the canvas will look up, not a key it cannot resolve.
      expect(links[0]!.dependencyId).toBe(anchorEdges[0]!.id);
      expect(links[0]!.dependencyId).not.toMatch(/^\[/);
    });

    it('places every ghost in the ANCHOR plan’s lane space', async () => {
      // Two independently built plans do not share a lane space. Placing a ghost at the OLD side's
      // index would put it somewhere arbitrary in the diagram being drawn on, and the reader could
      // not tell. Every drawn ghost here is matched, so its lane is literally where its live bar is.
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const res = await admin.agent
        .get(url({ fromPlanId, toPlanId, include: 'ghosts' }))
        .expect(200);

      const anchorLanes = await prisma.activity.findMany({
        where: { planId: toPlanId, deletedAt: null },
        select: { id: true, laneIndex: true },
      });
      const laneById = new Map(anchorLanes.map((a) => [a.id, a.laneIndex]));
      for (const ghost of res.body.data.ghosts as { activityId: string; laneIndex: number }[]) {
        expect(laneById.get(ghost.activityId)).toBe(ghost.laneIndex);
      }
      expect((res.body.data.ghosts as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('the honesty properties', () => {
    it('withholds the criticality delta when either plan was never calculated', async () => {
      const admin = await adminWithOrg();
      const fromPlanId = await makePlan(admin);
      await makeActivity(admin, fromPlanId, 'Groundworks', 10, { code: 'A100' });
      await recalculate(admin, fromPlanId);
      // Deliberately NOT recalculated: `isCritical` defaults false, so a naive comparison would
      // report everything critical in the old plan as having LEFT the critical path.
      const toPlanId = await makePlan(admin);
      await makeActivity(admin, toPlanId, 'Groundworks', 10, { code: 'A100' });

      const res = await admin.agent.get(url({ fromPlanId, toPlanId })).expect(200);
      expect(res.body.data.criticalPath.notAssessableReason).toBe('SIDE_NOT_SCHEDULED');
      expect(res.body.data.criticalPath.left).toEqual([]);
      expect(res.body.data.criticalPath.leftTotal).toBe(0);
    });

    it('carries no cost, rate or budget field at any depth — one URL, one document', async () => {
      // The structural gate scans the sources; this asserts the SHIPPED payload, which is the
      // claim a reader actually cares about. A gate over sources cannot see a field arriving from
      // a type it does not scan.
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const res = await admin.agent
        .get(url({ fromPlanId, toPlanId, include: ['changes', 'progress', 'ghosts'] }))
        .expect(200);

      const keys: string[] = [];
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node !== null && typeof node === 'object') {
          for (const [k, v] of Object.entries(node)) {
            keys.push(k);
            walk(v);
          }
        }
      };
      walk(res.body.data);
      expect(keys.length).toBeGreaterThan(30);
      expect(keys.filter((k) => /cost|budget|rate|expense/i.test(k))).toEqual([]);
      // And no causal field, which is the other half of what this payload refuses to claim.
      expect(
        keys.filter((k) => /^(cause|causedBy|blame|attribution|contribution)$/i.test(k)),
      ).toEqual([]);
    });

    it('writes nothing — every engine-owned column is byte-identical after the call', async () => {
      const admin = await adminWithOrg();
      const { fromPlanId, toPlanId } = await twoRevisions(admin);
      const snapshot = async () =>
        JSON.stringify(
          await prisma.activity.findMany({
            where: { planId: { in: [fromPlanId, toPlanId] } },
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
              laneIndex: true,
              version: true,
              updatedAt: true,
            },
          }),
        );
      const before = await snapshot();
      await admin.agent
        .get(url({ fromPlanId, toPlanId, include: ['changes', 'ghosts'] }))
        .expect(200);
      expect(await snapshot()).toBe(before);
    });
  });

  describe('the plan-nested route is unchanged', () => {
    it('still answers, and still refuses a revision compared with itself', async () => {
      // The cross-plan route is a SIBLING, not a widening. Its existence must not have changed the
      // shipped one, whose own suite is the real oracle; this is the cheap cross-check.
      const admin = await adminWithOrg();
      const { fromPlanId } = await twoRevisions(admin);
      const baseline = await capture(admin, fromPlanId, 'Rev A');

      await admin.agent
        .get(
          `/api/v1/organizations/acme/plans/${fromPlanId}/schedule/revision-compare?from=${baseline}`,
        )
        .expect(200);
      const same = await admin.agent
        .get(
          `/api/v1/organizations/acme/plans/${fromPlanId}/schedule/revision-compare?from=${baseline}&to=${baseline}`,
        )
        .expect(422);
      expect(same.body.error.details.reason).toBe('SAME_REVISION');
    });
  });
});
