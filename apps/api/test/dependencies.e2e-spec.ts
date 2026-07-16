import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

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

  it('serialises concurrent mirror inserts so exactly one wins (no persisted cycle)', async () => {
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
    await actor.agent.delete(`/api/v1/organizations/acme/activities/${a}`).expect(204);
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
