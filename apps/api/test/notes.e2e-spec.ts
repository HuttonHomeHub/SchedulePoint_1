import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for notes (attributed threads on plans & activities, ADR-0046 M2). Boots with the
 * plan edit-lock write-gate ENFORCED (`PLAN_EDIT_LOCK_ENFORCED=true`) so we can PROVE notes are NOT
 * pen-gated: the structural setup writes (plan/activity create & delete) hold the pen and release it,
 * but every note write below runs with NO lock held and must SUCCEED (the `activity:update_progress`
 * precedent). Covers: create+list on a plan and on an activity (newest-first); pagination; the
 * not-pen-gated assertion; RBAC (Viewer 403 / Contributor succeeds); cross-author 403 on update+delete;
 * optimistic 409; whitespace-only 422; cross-org 404 (anti-IDOR); the batch activity-counts endpoint;
 * and parent-cascade (a soft-deleted plan/activity's notes stop listing). Verified against a real
 * PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Notes API (e2e, pen enforced)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let priorEnforced: string | undefined;

  beforeAll(async () => {
    // Enforce the pen for THIS app instance only (restored in afterAll). e2e files run sequentially and
    // each boots its own ConfigModule, so this does not leak into the unenforced suites.
    priorEnforced = process.env.PLAN_EDIT_LOCK_ENFORCED;
    process.env.PLAN_EDIT_LOCK_ENFORCED = 'true';
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
    if (priorEnforced === undefined) delete process.env.PLAN_EDIT_LOCK_ENFORCED;
    else process.env.PLAN_EDIT_LOCK_ENFORCED = priorEnforced;
  });

  beforeEach(async () => {
    await prisma.note.deleteMany();
    await prisma.planLock.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
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
  const base = (org = 'acme') => `/api/v1/organizations/${org}`;
  const lockUrl = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/edit-lock`;
  const planNotes = (planId: string, org = 'acme') => `${base(org)}/plans/${planId}/notes`;
  const activityNotes = (activityId: string, org = 'acme') =>
    `${base(org)}/activities/${activityId}/notes`;
  const noteItem = (noteId: string, org = 'acme') => `${base(org)}/notes/${noteId}`;
  const counts = (planId: string, org = 'acme') =>
    `${base(org)}/plans/${planId}/notes/activity-counts`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(name = 'Acme'): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  async function makePlan(actor: Actor, org = 'acme'): Promise<string> {
    const client = await actor.agent
      .post(`${base(org)}/clients`)
      .send({ name: 'Client' })
      .expect(201);
    const project = await actor.agent
      .post(`${base(org)}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    const plan = await actor.agent
      .post(`${base(org)}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Plan', plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  /** Create an activity under a plan while holding the pen (a structural write), then release it. */
  async function makeActivity(
    actor: Actor,
    planId: string,
    name: string,
    org = 'acme',
  ): Promise<string> {
    await actor.agent.post(lockUrl(planId, org)).send({}).expect(200);
    const res = await actor.agent
      .post(`${base(org)}/plans/${planId}/activities`)
      .send({ name })
      .expect(201);
    await actor.agent.delete(lockUrl(planId, org)).expect(204);
    return res.body.data.id as string;
  }

  /** An admin org with a plan and one activity — no pen held on return. */
  async function setup(): Promise<{
    actor: Actor;
    orgId: string;
    planId: string;
    activityId: string;
  }> {
    const { actor, orgId } = await adminWithOrg();
    const planId = await makePlan(actor);
    const activityId = await makeActivity(actor, planId, 'Erect frame');
    return { actor, orgId, planId, activityId };
  }

  async function addMember(
    orgId: string,
    role: 'VIEWER' | 'CONTRIBUTOR',
    email: string,
  ): Promise<Actor> {
    const member = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: member.userId, role } });
    return member;
  }

  it('creates and lists notes on a plan WITHOUT holding the pen (not pen-gated), newest-first', async () => {
    const { actor, planId } = await setup();

    // No lock is held here — a structural write would 423, but a note write must SUCCEED.
    const first = await actor.agent
      .post(planNotes(planId))
      .send({ body: 'First note' })
      .expect(201);
    const second = await actor.agent
      .post(planNotes(planId))
      .send({ body: 'Second note' })
      .expect(201);

    expect(first.body.data).toMatchObject({
      entityType: 'PLAN',
      planId,
      activityId: null,
      body: 'First note',
      authorId: actor.userId,
      authorName: 'admin',
      edited: false,
      version: 1,
    });

    const list = await actor.agent.get(planNotes(planId)).expect(200);
    // Newest-first: the second note comes first.
    expect(list.body.data.map((n: { body: string }) => n.body)).toEqual([
      'Second note',
      'First note',
    ]);
    expect(list.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
    // The second note's id is returned first.
    expect(list.body.data[0].id).toBe(second.body.data.id);
  });

  it('creates and lists notes on an activity (newest-first), carrying the activity plan id', async () => {
    const { actor, planId, activityId } = await setup();

    await actor.agent.post(activityNotes(activityId)).send({ body: 'A' }).expect(201);
    const b = await actor.agent.post(activityNotes(activityId)).send({ body: 'B' }).expect(201);
    expect(b.body.data).toMatchObject({ entityType: 'ACTIVITY', planId, activityId });

    const list = await actor.agent.get(activityNotes(activityId)).expect(200);
    expect(list.body.data.map((n: { body: string }) => n.body)).toEqual(['B', 'A']);

    // A plan note is NOT an activity note and vice-versa: the plan thread is empty.
    await actor.agent
      .get(planNotes(planId))
      .expect(200)
      .expect((r) => {
        expect(r.body.data).toHaveLength(0);
      });
  });

  it('cursor-paginates a plan thread', async () => {
    const { actor, planId } = await setup();
    for (let i = 0; i < 3; i += 1) {
      await actor.agent
        .post(planNotes(planId))
        .send({ body: `note ${i}` })
        .expect(201);
    }
    const page1 = await actor.agent.get(planNotes(planId)).query({ limit: 2 }).expect(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.hasMore).toBe(true);
    const page2 = await actor.agent
      .get(planNotes(planId))
      .query({ limit: 2, cursor: page1.body.meta.nextCursor })
      .expect(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.hasMore).toBe(false);
    // No overlap across the two pages.
    const ids = [...page1.body.data, ...page2.body.data].map((n: { id: string }) => n.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('edits and deletes own note; marks edited; 409 on stale version', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent.post(planNotes(planId)).send({ body: 'v1' }).expect(201);
    const id = created.body.data.id as string;

    // Edit (no pen) succeeds and flips `edited`.
    const edited = await actor.agent
      .patch(noteItem(id))
      .send({ body: 'v2', version: 1 })
      .expect(200);
    expect(edited.body.data).toMatchObject({ body: 'v2', version: 2, edited: true });

    // Re-using the stale version → 409.
    await actor.agent.patch(noteItem(id)).send({ body: 'v3', version: 1 }).expect(409);

    // Delete (no pen) → 204, then gone.
    await actor.agent.delete(noteItem(id)).expect(204);
    await actor.agent.patch(noteItem(id)).send({ body: 'zombie', version: 2 }).expect(404);
    await actor.agent
      .get(planNotes(planId))
      .expect(200)
      .expect((r) => {
        expect(r.body.data).toHaveLength(0);
      });
  });

  it('rejects a whitespace-only body (422) on create and on edit', async () => {
    const { actor, planId } = await setup();
    await actor.agent.post(planNotes(planId)).send({ body: '   ' }).expect(422);
    const created = await actor.agent.post(planNotes(planId)).send({ body: 'real' }).expect(201);
    await actor.agent
      .patch(noteItem(created.body.data.id))
      .send({ body: '\t\n ', version: 1 })
      .expect(422);
    // A client-supplied scope field is rejected (whitelist) — body is the only field.
    await actor.agent.post(planNotes(planId)).send({ body: 'x', planId }).expect(422);
  });

  it('enforces RBAC: a Viewer cannot create (403), a Contributor can', async () => {
    const { actor, orgId, planId } = await setup();

    const viewer = await addMember(orgId, 'VIEWER', 'viewer@example.com');
    await viewer.agent.get(planNotes(planId)).expect(200); // read is allowed
    await viewer.agent.post(planNotes(planId)).send({ body: 'nope' }).expect(403);

    const contributor = await addMember(orgId, 'CONTRIBUTOR', 'contrib@example.com');
    await contributor.agent.post(planNotes(planId)).send({ body: 'from contributor' }).expect(201);

    // The admin still sees the contributor's note in the thread.
    const list = await actor.agent.get(planNotes(planId)).expect(200);
    expect(list.body.data.map((n: { body: string }) => n.body)).toContain('from contributor');
  });

  it("forbids editing or deleting ANOTHER author's note (403) even with note:update/delete", async () => {
    const { orgId, planId } = await setup();
    const authorA = await addMember(orgId, 'CONTRIBUTOR', 'a@example.com');
    const authorB = await addMember(orgId, 'CONTRIBUTOR', 'b@example.com');

    const created = await authorA.agent
      .post(planNotes(planId))
      .send({ body: "A's note" })
      .expect(201);
    const id = created.body.data.id as string;

    await authorB.agent.patch(noteItem(id)).send({ body: 'hijack', version: 1 }).expect(403);
    await authorB.agent.delete(noteItem(id)).expect(403);
    // The author can still edit their own.
    await authorA.agent.patch(noteItem(id)).send({ body: 'my edit', version: 1 }).expect(200);
  });

  it('hides notes across orgs (anti-IDOR 404)', async () => {
    const { planId } = await setup();
    const admin = { agent: request.agent(server()) };
    // A separate org + member who is NOT in Acme.
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);

    // Creating a note on Acme's plan from the other org's slug → the plan is not in "other" → 404.
    await outsider.agent.post(planNotes(planId, 'other')).send({ body: 'x' }).expect(404);
    // And addressing Acme's plan under Acme's slug as a non-member → org resolve 404.
    await outsider.agent.get(planNotes(planId)).expect(404);
    void admin;
  });

  it('returns correct grouped per-activity note counts for a plan (no soft-deleted)', async () => {
    const { actor, planId, activityId } = await setup();
    const activity2 = await makeActivity(actor, planId, 'Pour slab');

    // 2 notes on activity1, 1 on activity2, plus a PLAN note (excluded from activity counts).
    await actor.agent.post(activityNotes(activityId)).send({ body: 'a1-1' }).expect(201);
    const toDelete = await actor.agent
      .post(activityNotes(activityId))
      .send({ body: 'a1-2' })
      .expect(201);
    await actor.agent.post(activityNotes(activityId)).send({ body: 'a1-3' }).expect(201);
    await actor.agent.post(activityNotes(activity2)).send({ body: 'a2-1' }).expect(201);
    await actor.agent.post(planNotes(planId)).send({ body: 'plan note' }).expect(201);

    // Soft-delete one activity1 note — it must drop out of the count.
    await actor.agent.delete(noteItem(toDelete.body.data.id)).expect(204);

    const res = await actor.agent.get(counts(planId)).expect(200);
    const byId = new Map<string, number>(
      res.body.data.map((c: { activityId: string; count: number }) => [c.activityId, c.count]),
    );
    expect(byId.get(activityId)).toBe(2);
    expect(byId.get(activity2)).toBe(1);
    // Only activities with ≥1 note appear (2 rows), and the PLAN note is not counted here.
    expect(res.body.data).toHaveLength(2);
  });

  it('cascades: a soft-deleted activity and plan hide their notes', async () => {
    const { actor, planId, activityId } = await setup();
    await actor.agent.post(activityNotes(activityId)).send({ body: 'activity note' }).expect(201);
    await actor.agent.post(planNotes(planId)).send({ body: 'plan note' }).expect(201);

    // Delete the activity (structural → hold the pen).
    await actor.agent.post(lockUrl(planId)).send({}).expect(200);
    await actor.agent.delete(`${base()}/activities/${activityId}`).expect(204);

    // The activity's notes are swept with it — the plan's activity-counts no longer lists it.
    const c = await actor.agent.get(counts(planId)).expect(200);
    expect(c.body.data).toHaveLength(0);
    // The activity note row is soft-deleted in the same cascade.
    const swept = await prisma.note.findFirst({ where: { activityId } });
    expect(swept?.deletedAt).not.toBeNull();

    // Now delete the whole plan — its PLAN notes are swept too (pen still held from above).
    await actor.agent.delete(`${base()}/plans/${planId}`).expect(204);
    const planNoteRow = await prisma.note.findFirst({ where: { planId, entityType: 'PLAN' } });
    expect(planNoteRow?.deletedAt).not.toBeNull();
    // Listing a deleted plan's notes 404s (parent gone).
    await actor.agent.get(planNotes(planId)).expect(404);
  });

  it('401s without a session', async () => {
    await request(server()).get(planNotes('00000000-0000-7000-8000-000000000000')).expect(401);
  });
});
