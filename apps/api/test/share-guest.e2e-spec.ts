import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the session-less External-Guest READ surface
 * (`/api/v1/share/*`, ADR-0051 F-M3) — the app's FIRST unauthenticated data-read
 * path. This suite is deliberately negative-heavy: it proves the anti-IDOR
 * design (the token IS the entire scope — there is nothing to tamper with),
 * the uniform-404 no-oracle contract (dead-for-any-reason tokens are provably
 * indistinguishable), the field-stripped guest DTOs (no cost/EV/resources/
 * baselines/notes/audit/token ever leak), and cursor pagination. Verified
 * against a real PostgreSQL + Better Auth session, minting tokens through the
 * F-M2 management API exactly as a real Planner would.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

/** Recursively scan a JSON value for a forbidden key name, anywhere in the payload. */
function containsKey(value: unknown, keys: readonly string[]): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, keys));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, v]) => keys.includes(key) || containsKey(v, keys),
    );
  }
  return false;
}

describe.skipIf(!hasDatabase)('External-Guest share read API (e2e)', () => {
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
    await prisma.planShare.deleteMany();
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
    await prisma.calendarException.deleteMany();
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
    await resetDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
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

  /** An Org Admin owning a fresh org of the given name (slug = lower-cased name). Returns admin + orgId. */
  async function adminWithOrg(
    name: string,
    email: string,
  ): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp(email);
    const res = await actor.agent.post('/api/v1/organizations').send({ name }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  /** A plan under the org (via the given actor). Returns its id. */
  async function makePlan(actor: Actor, orgSlug: string, name: string): Promise<string> {
    const client = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/clients`)
      .send({ name: `Client-${Math.random().toString(36).slice(2, 10)}` })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  async function makeActivity(
    actor: Actor,
    orgSlug: string,
    planId: string,
    name: string,
  ): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/plans/${planId}/activities`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function makeDependency(
    actor: Actor,
    orgSlug: string,
    planId: string,
    predecessorId: string,
    successorId: string,
  ): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/plans/${planId}/dependencies`)
      .send({ predecessorId, successorId })
      .expect(201);
    return res.body.data.id as string;
  }

  /** Mint a share link via the F-M2 management API; returns the raw guest token + share id. */
  async function mintShareToken(
    actor: Actor,
    orgSlug: string,
    planId: string,
    body: { label?: string; expiresAt?: string } = {},
  ): Promise<{ token: string; shareId: string }> {
    const res = await actor.agent
      .post(`/api/v1/organizations/${orgSlug}/plans/${planId}/shares`)
      .send(body)
      .expect(201);
    const url = res.body.data.url as string;
    const token = url.split('#')[1];
    if (!token) throw new Error(`share url carried no fragment token: ${url}`);
    return { token, shareId: res.body.data.share.id as string };
  }

  async function revokeShare(
    actor: Actor,
    orgSlug: string,
    planId: string,
    shareId: string,
  ): Promise<void> {
    await actor.agent
      .delete(`/api/v1/organizations/${orgSlug}/plans/${planId}/shares/${shareId}`)
      .expect(204);
  }

  /** A guest GET against the share surface, optionally bearing a token. */
  function guestGet(path: string, token?: string): request.Test {
    const req = request(server()).get(path);
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  }

  // Every field a guest DTO must NEVER carry (ADR-0051 §4 — see guest-*.dto.ts exclusion
  // comments): the raw/hashed token itself, all audit columns, cost/Earned-Value/money,
  // resources/assignments, baseline/variance, notes, the levelling overlay, visual-planning
  // fields, and internal ids a guest has no business seeing.
  const FORBIDDEN_KEYS = [
    'token',
    'tokenHash',
    'createdBy',
    'updatedBy',
    'deletedAt',
    'version',
    'createdAt',
    'updatedAt',
    'budgetedExpense',
    'actualExpense',
    'percentCompleteType',
    'physicalPercentComplete',
    'accrualType',
    'resources',
    'resourceAssignments',
    'baseline',
    'baselineActivities',
    'notes',
    'levelingPriority',
    'levelingDelay',
    'selfOverAllocated',
    'levelingWindowExceeded',
    'visualStart',
    'visualConflict',
    'constraintType',
    'constraintDate',
    'externalEarlyStart',
    'externalLateFinish',
    'expectedFinish',
    'durationType',
    'calendarId',
    'parentId',
    'userId',
  ];

  /** The uniform 404 the guard/service return for every dead-token reason (ADR-0051 §5). */
  const UNIFORM_NOT_FOUND = {
    error: { code: 'NOT_FOUND', message: 'This share link is no longer available.' },
  };

  it('reads /plan, /activities, /dependencies with a live token: 200s, only the shared plan’s data', async () => {
    const { actor } = await adminWithOrg('Acme', 'admin@example.com');
    const planId = await makePlan(actor, 'acme', 'Riverside Plan');
    const a = await makeActivity(actor, 'acme', planId, 'Excavate');
    const b = await makeActivity(actor, 'acme', planId, 'Pour slab');
    await makeDependency(actor, 'acme', planId, a, b);
    const { token } = await mintShareToken(actor, 'acme', planId, { label: 'Client review' });

    const plan = await guestGet('/api/v1/share/plan', token).expect(200);
    expect(plan.body.data).toMatchObject({ id: planId, name: 'Riverside Plan' });
    expect(plan.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(plan.headers['referrer-policy']).toBe('no-referrer');

    const activities = await guestGet('/api/v1/share/activities', token).expect(200);
    expect(activities.body.data).toHaveLength(2);
    expect(activities.body.data.map((row: { id: string }) => row.id).sort()).toEqual([a, b].sort());
    expect(activities.body.meta).toMatchObject({ hasMore: false });

    const dependencies = await guestGet('/api/v1/share/dependencies', token).expect(200);
    expect(dependencies.body.data).toHaveLength(1);
    expect(dependencies.body.data[0]).toMatchObject({ predecessorId: a, successorId: b });

    // No field leak (requirement 4) — reuse these three live responses, no extra requests.
    expect(containsKey(plan.body, FORBIDDEN_KEYS)).toBe(false);
    expect(containsKey(activities.body, FORBIDDEN_KEYS)).toBe(false);
    expect(containsKey(dependencies.body, FORBIDDEN_KEYS)).toBe(false);
  });

  it('anti-IDOR: a token scopes to exactly its own plan — never a sibling plan or a different org/tenant', async () => {
    const { actor: acmeAdmin } = await adminWithOrg('Acme', 'admin@example.com');
    const planA = await makePlan(acmeAdmin, 'acme', 'Plan A');
    const activityA = await makeActivity(acmeAdmin, 'acme', planA, 'A-only activity');
    const { token: tokenA } = await mintShareToken(acmeAdmin, 'acme', planA);

    const { actor: globexAdmin } = await adminWithOrg('Globex', 'other@example.com');
    const planB = await makePlan(globexAdmin, 'globex', 'Plan B');
    const activityB = await makeActivity(globexAdmin, 'globex', planB, 'B-only activity');
    const { token: tokenB } = await mintShareToken(globexAdmin, 'globex', planB);

    // Token A never surfaces plan B / org 2's data.
    const planViaA = await guestGet('/api/v1/share/plan', tokenA).expect(200);
    expect(planViaA.body.data.id).toBe(planA);
    expect(planViaA.body.data.id).not.toBe(planB);

    const activitiesViaA = await guestGet('/api/v1/share/activities', tokenA).expect(200);
    const idsViaA = activitiesViaA.body.data.map((row: { id: string }) => row.id);
    expect(idsViaA).toEqual([activityA]);
    expect(idsViaA).not.toContain(activityB);

    // Symmetrically, token B is scoped to plan B only — the boundary holds both ways.
    const planViaB = await guestGet('/api/v1/share/plan', tokenB).expect(200);
    expect(planViaB.body.data.id).toBe(planB);

    const activitiesViaB = await guestGet('/api/v1/share/activities', tokenB).expect(200);
    const idsViaB = activitiesViaB.body.data.map((row: { id: string }) => row.id);
    expect(idsViaB).toEqual([activityB]);
    expect(idsViaB).not.toContain(activityA);
  });

  it('404s uniformly (no oracle) for every dead-token reason: missing/malformed/unknown/revoked/expired/deleted-plan', async () => {
    const { actor } = await adminWithOrg('Acme', 'admin@example.com');
    const planId = await makePlan(actor, 'acme', 'Riverside Plan');

    // (a) No Authorization header at all.
    const noHeader = await guestGet('/api/v1/share/plan').expect(404);

    // (b) Malformed: right scheme, but not the sp_share_ prefix.
    const malformed = await guestGet('/api/v1/share/plan', 'garbage').expect(404);

    // (c) Well-formed prefix, but a value that was never minted.
    const unknownToken = `sp_share_${'a'.repeat(43)}`;
    const unknown = await guestGet('/api/v1/share/plan', unknownToken).expect(404);

    // (d) A live token that has since been revoked.
    const { token: revokedToken, shareId: revokedShareId } = await mintShareToken(
      actor,
      'acme',
      planId,
    );
    await revokeShare(actor, 'acme', planId, revokedShareId);
    const revoked = await guestGet('/api/v1/share/plan', revokedToken).expect(404);

    // (e) A live token whose expiry has since passed. The management API refuses to mint an
    // already-expired link (422 SHARE_EXPIRY_IN_PAST — a link cannot be born dead), so we mint
    // live and backdate `expiresAt` directly, mirroring how a real link goes stale over time.
    const { token: expiredToken, shareId: expiredShareId } = await mintShareToken(
      actor,
      'acme',
      planId,
    );
    await prisma.planShare.update({
      where: { id: expiredShareId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await guestGet('/api/v1/share/plan', expiredToken).expect(404);

    // (f) A live token whose PLAN has since been soft-deleted (the guard re-checks plan liveness
    // as defence in depth, independent of the plan-cascade stamping the link itself).
    const deletablePlanId = await makePlan(actor, 'acme', 'Soon Deleted');
    const { token: deletedPlanToken } = await mintShareToken(actor, 'acme', deletablePlanId);
    await actor.agent.delete(`/api/v1/organizations/acme/plans/${deletablePlanId}`).expect(204);
    const deletedPlan = await guestGet('/api/v1/share/plan', deletedPlanToken).expect(404);

    // Every single case is not just a 404 — it is the exact SAME body, proving the surface is no
    // oracle for whether/why a token is dead (ADR-0051 §5).
    for (const res of [noHeader, malformed, unknown, revoked, expired, deletedPlan]) {
      expect(res.body).toEqual(UNIFORM_NOT_FOUND);
    }
  });

  it('paginates activities by cursor: every activity is returned exactly once, and only from the shared plan', async () => {
    const { actor } = await adminWithOrg('Acme', 'admin@example.com');
    const planId = await makePlan(actor, 'acme', 'Big Plan');
    const expectedIds: string[] = [];
    for (let i = 0; i < 23; i += 1) {
      expectedIds.push(await makeActivity(actor, 'acme', planId, `Activity ${i}`));
    }
    // A sibling plan in the SAME org, so pagination can also prove it never bleeds across plans.
    const otherPlanId = await makePlan(actor, 'acme', 'Other Plan');
    const foreignActivityId = await makeActivity(actor, 'acme', otherPlanId, 'Foreign activity');

    const { token } = await mintShareToken(actor, 'acme', planId);

    const collected: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      pages += 1;
      const query = cursor ? `?limit=10&cursor=${encodeURIComponent(cursor)}` : '?limit=10';
      const res = await guestGet(`/api/v1/share/activities${query}`, token).expect(200);
      const ids = res.body.data.map((row: { id: string }) => row.id) as string[];
      collected.push(...ids);
      expect(ids).not.toContain(foreignActivityId);

      const meta = res.body.meta as { hasMore: boolean; nextCursor: string | null };
      if (!meta.hasMore) {
        expect(meta.nextCursor).toBeNull();
        break;
      }
      expect(meta.nextCursor).toBeTruthy();
      cursor = meta.nextCursor as string;
      // Guard against an infinite loop if hasMore never resolves.
      expect(pages).toBeLessThan(10);
    }

    expect(pages).toBe(3); // 23 activities at limit 10 → 10 + 10 + 3
    expect(collected).toHaveLength(23);
    expect(new Set(collected).size).toBe(23); // no duplicates across pages
    expect(collected.sort()).toEqual([...expectedIds].sort());
  });
});
