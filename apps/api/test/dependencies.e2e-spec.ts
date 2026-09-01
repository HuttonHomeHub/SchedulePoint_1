import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for dependencies (activity logic ties): nested create/list
 * under a plan, the predecessors/successors direction lists, flat get/update/
 * delete, the self-loop (422) and duplicate (409) integrity rules, the
 * IDOR/cross-plan 404 matrix, the RBAC split (Planner writes, Viewer/Contributor
 * read only), and the soft-delete cascade + endpoint-guarded restore when an
 * endpoint activity is deleted. Verified against a real PostgreSQL + Better Auth
 * session. (Cycle detection is added in B2.)
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Dependencies API (e2e)', () => {
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

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
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

  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

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
    return plan.body.data.id as string;
  }

  async function makeActivity(actor: Actor, planId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  /** An admin org with a plan and two activities (A, B) in it. */
  async function setup(): Promise<{
    actor: Actor;
    orgId: string;
    planId: string;
    a: string;
    b: string;
  }> {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor, 'Northgate');
    const a = await makeActivity(actor, planId, 'Excavate');
    const b = await makeActivity(actor, planId, 'Pour slab');
    return { actor, orgId, planId, a, b };
  }

  /** TECH_DEBT #78 — the lag half of the same asymmetry. See activities.e2e-spec.ts. */
  describe('sub-day lags (TECH_DEBT #78)', () => {
    it('authors a two-hour lag, reads it back exactly, and edits it without rounding', async () => {
      const { actor, planId, a, b } = await setup();
      const created = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: a, successorId: b, lagMinutes: 120 })
        .expect(201);
      expect(created.body.data).toMatchObject({ lagMinutes: 120, lagDays: 0 });
      const id = created.body.data.id as string;

      const edited = await actor.agent
        .patch(`/api/v1/organizations/acme/dependencies/${id}`)
        .send({ lagMinutes: -45, version: created.body.data.version })
        .expect(200);
      // A lead is negative, and a sub-day lead is exactly the case days could not express.
      expect(edited.body.data).toMatchObject({ lagMinutes: -45, lagDays: 0 });
    });

    it('refuses a payload carrying both units', async () => {
      const { actor, planId, a, b } = await setup();
      const res = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: a, successorId: b, lagDays: 1, lagMinutes: 120 })
        .expect(422);
      expect(JSON.stringify(res.body)).toContain('send one, not both');
    });

    it('keeps the day field working unchanged', async () => {
      const { actor, planId, a, b } = await setup();
      const res = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId: a, successorId: b, lagDays: 2 })
        .expect(201);
      expect(res.body.data).toMatchObject({ lagDays: 2, lagMinutes: 2 * 1440 });
    });
  });

  it('links two activities, embeds endpoints, and lists by plan and by direction', async () => {
    const { actor, planId, a, b } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: a, successorId: b, lagDays: 3 })
      .expect(201);
    expect(created.body.data).toMatchObject({
      planId,
      type: 'FS',
      lagDays: 3,
      lagCalendar: 'PROJECT_DEFAULT', // the default when unset (ADR-0036 §6)
      predecessor: { id: a, name: 'Excavate' },
      successor: { id: b, name: 'Pour slab' },
      version: 1,
    });
    const id = created.body.data.id as string;

    await actor.agent.get(`/api/v1/organizations/acme/dependencies/${id}`).expect(200);

    const planList = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .expect(200);
    expect(planList.body.data).toHaveLength(1);

    // B's predecessors include the link; A's successors include the link.
    const bPreds = await actor.agent
      .get(`/api/v1/organizations/acme/activities/${b}/predecessors`)
      .expect(200);
    expect(bPreds.body.data).toHaveLength(1);
    const aSuccs = await actor.agent
      .get(`/api/v1/organizations/acme/activities/${a}/successors`)
      .expect(200);
    expect(aSuccs.body.data).toHaveLength(1);
    // ...and the mirror direction lists are empty.
    expect(
      (await actor.agent.get(`/api/v1/organizations/acme/activities/${a}/predecessors`).expect(200))
        .body.data,
    ).toHaveLength(0);
  });

  it('round-trips a 24-Hour lag calendar on create and update (ADR-0036 §6, M3)', async () => {
    const { actor, planId, a, b } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: a, successorId: b, lagDays: 7, lagCalendar: 'TWENTY_FOUR_HOUR' })
      .expect(201);
    expect(created.body.data).toMatchObject({ lagDays: 7, lagCalendar: 'TWENTY_FOUR_HOUR' });
    const id = created.body.data.id as string;

    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/dependencies/${id}`)
      .send({ lagCalendar: 'PROJECT_DEFAULT', version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ lagCalendar: 'PROJECT_DEFAULT', version: 2 });

    // An unknown lag-calendar value is rejected (422).
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: a, successorId: b, type: 'SS', lagCalendar: 'NOPE' })
      .expect(422);
  });

  it('updates type/lag with optimistic locking (stale version → 409)', async () => {
    const { actor, planId, a, b } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: a, successorId: b })
      .expect(201);
    const id = created.body.data.id as string;

    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/dependencies/${id}`)
      .send({ type: 'SS', lagDays: -2, version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ type: 'SS', lagDays: -2, version: 2 });

    await actor.agent
      .patch(`/api/v1/organizations/acme/dependencies/${id}`)
      .send({ lagDays: 5, version: 1 })
      .expect(409);
  });

  // N04 (ADR-0035 §13 amendment): reject an EXACT duplicate (same pair AND type); allow a
  // different-type ladder (SS+FF between a pair). Never silently dedupe.
  it('rejects a self-loop (422) and a duplicate of the same type (409), but allows another type', async () => {
    const { actor, planId, a, b } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/dependencies`;

    const selfLoop = await actor.agent
      .post(base)
      .send({ predecessorId: a, successorId: a })
      .expect(422);
    expect(selfLoop.body.error?.details?.reason).toBe('SELF_DEPENDENCY');

    await actor.agent.post(base).send({ predecessorId: a, successorId: b }).expect(201);
    const dup = await actor.agent.post(base).send({ predecessorId: a, successorId: b }).expect(409);
    expect(dup.body.error?.details?.reason).toBe('DUPLICATE_DEPENDENCY');
    // A different type between the same pair is allowed (the SS+FF ladder).
    await actor.agent.post(base).send({ predecessorId: a, successorId: b, type: 'SS' }).expect(201);
  });

  it('rejects a dependency that would create a cycle (409 CYCLE_DETECTED)', async () => {
    const { actor, planId, a, b } = await setup();
    const c = await makeActivity(actor, planId, 'Cure');
    const base = `/api/v1/organizations/acme/plans/${planId}/dependencies`;

    await actor.agent.post(base).send({ predecessorId: a, successorId: b }).expect(201); // a → b
    await actor.agent.post(base).send({ predecessorId: b, successorId: c }).expect(201); // b → c
    // c → a would close a → b → c → a.
    const cyclic = await actor.agent
      .post(base)
      .send({ predecessorId: c, successorId: a })
      .expect(409);
    expect(cyclic.body.error?.details?.reason).toBe('CYCLE_DETECTED');
    // A forward shortcut a → c keeps the graph acyclic.
    await actor.agent.post(base).send({ predecessorId: a, successorId: c }).expect(201);
  });

  // **Scope note (`docs/TECH_DEBT.md` #70), so nobody reads more into this name than it proves.**
  //
  // This exercises the cycle REJECTION through the real stack (HTTP -> service -> Postgres). It is
  // **not** the regression gate for the advisory lock, and the name "serialises" overclaims: two
  // mirror requests fired with `Promise.all`, even on separate keep-alive sockets, were **measured
  // not to overlap in the danger window** — the second request's read began after the first's
  // transaction had already committed — so this passes identically with the lock removed.
  //
  // The lock's real gate is the unit suite, which asserts the acquisition itself and its ordering
  // and fails when either is taken away. `activities.e2e-spec.ts`'s WBS block has carried this note
  // since the measurement; its three siblings did not,.
  it('rejects the mirror insert that would close a cycle, leaving the graph acyclic', async () => {
    const { actor, planId, a, b } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/dependencies`;

    // a → b and b → a raced together: the plan lock orders them; the loser's walk
    // sees the winner's edge and is rejected as a cycle (ADR-0021).
    const [r1, r2] = await Promise.all([
      actor.agent.post(base).send({ predecessorId: a, successorId: b }),
      actor.agent.post(base).send({ predecessorId: b, successorId: a }),
    ]);
    const statuses = [r1.status, r2.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error?.details?.reason).toBe('CYCLE_DETECTED');
    // Exactly one edge persisted.
    expect((await actor.agent.get(base).expect(200)).body.data).toHaveLength(1);
  });

  it('refuses to link activities across plans (404) and validates the endpoint ids (422)', async () => {
    const { actor, planId, a } = await setup();
    const otherPlan = await makePlan(actor, 'Southgate');
    const foreign = await makeActivity(actor, otherPlan, 'Elsewhere');
    const base = `/api/v1/organizations/acme/plans/${planId}/dependencies`;

    // A successor from another plan is indistinguishable from missing → 404.
    await actor.agent.post(base).send({ predecessorId: a, successorId: foreign }).expect(404);
    // An unknown activity id → 404.
    await actor.agent
      .post(base)
      .send({ predecessorId: a, successorId: '00000000-0000-7000-8000-000000000000' })
      .expect(404);
    // A malformed id → 422 (DTO validation).
    await actor.agent.post(base).send({ predecessorId: a, successorId: 'not-a-uuid' }).expect(422);
  });

  it('hides dependencies from non-members (404)', async () => {
    const { actor, planId, a, b } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
      .send({ predecessorId: a, successorId: b })
      .expect(201);
    const id = created.body.data.id as string;

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(`/api/v1/organizations/acme/dependencies/${id}`).expect(404);
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/dependencies/${id}`).expect(404);
  });

  it('soft-deletes a link, and cascades with an endpoint activity (restored endpoint-guarded)', async () => {
    const { actor, planId, a, b } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/dependencies`;
    const created = await actor.agent
      .post(base)
      .send({ predecessorId: a, successorId: b })
      .expect(201);
    const id = created.body.data.id as string;

    // Direct delete → gone.
    await actor.agent.delete(`/api/v1/organizations/acme/dependencies/${id}`).expect(204);
    await actor.agent.get(`/api/v1/organizations/acme/dependencies/${id}`).expect(404);

    // Re-create, then delete the PREDECESSOR activity — the link goes with it.
    await actor.agent.post(base).send({ predecessorId: a, successorId: b }).expect(201);
    expect((await actor.agent.get(base).expect(200)).body.data).toHaveLength(1);
    await actor.agent.delete(`/api/v1/organizations/acme/activities/${a}`).expect(200);
    expect((await actor.agent.get(base).expect(200)).body.data).toHaveLength(0);

    // Restoring the activity brings its link back (both endpoints active again).
    await actor.agent.post(`/api/v1/organizations/acme/activities/${a}/restore`).expect(200);
    expect((await actor.agent.get(base).expect(200)).body.data).toHaveLength(1);
  });

  it('lets a Viewer read but forbids write; a Contributor also cannot write logic', async () => {
    const { orgId, actor, planId, a, b } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/dependencies`;
    const created = await actor.agent
      .post(base)
      .send({ predecessorId: a, successorId: b })
      .expect(201);
    const id = created.body.data.id as string;

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(base).expect(200);
    await viewer.agent.post(base).send({ predecessorId: b, successorId: a }).expect(403);

    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.get(base).expect(200);
    await contributor.agent.post(base).send({ predecessorId: b, successorId: a }).expect(403);
    await contributor.agent
      .patch(`/api/v1/organizations/acme/dependencies/${id}`)
      .send({ lagDays: 1, version: 1 })
      .expect(403);
    await contributor.agent.delete(`/api/v1/organizations/acme/dependencies/${id}`).expect(403);
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/plans/00000000-0000-7000-8000-000000000000/dependencies')
      .expect(401);
  });
});
