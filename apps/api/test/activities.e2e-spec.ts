import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for activities: nested create/list under a parent plan, the
 * flat item operations, the milestone-duration invariant and constraint pairing,
 * per-plan name/code uniqueness, the IDOR/parent-404 matrix, the soft-delete +
 * restore round-trip incl. the top-down PARENT_DELETED invariant, and the RBAC
 * split (a Viewer/Contributor cannot edit the definition) — verified against a
 * real PostgreSQL + Better Auth session.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Activities API (e2e)', () => {
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

  /** Set up an admin org with a client + project + plan, returning the plan id. */
  async function setup(): Promise<{ actor: Actor; orgId: string; planId: string }> {
    const { actor, orgId } = await adminWithOrg();
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const clientId = client.body.data.id as string;
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const projectId = project.body.data.id as string;
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Baseline' })
      .expect(201);
    return { actor, orgId, planId: plan.body.data.id as string };
  }

  it('creates an activity with defaults, gets and lists it', async () => {
    const { actor, planId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Excavate' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      name: 'Excavate',
      planId,
      type: 'TASK',
      durationDays: 1,
      code: null,
      constraintType: null,
      constraintDate: null,
      laneIndex: 0,
      status: 'NOT_STARTED',
      percentComplete: 0,
      isCritical: false,
      version: 1,
    });
    const id = res.body.data.id as string;

    const got = await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(200);
    expect(got.body.data).toMatchObject({ name: 'Excavate', planId });

    const list = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('round-trips code, duration, lane and a paired constraint', async () => {
    const { actor, planId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({
        name: 'Pour slab',
        code: 'A100',
        durationDays: 10,
        laneIndex: 2,
        constraintType: 'SNET',
        constraintDate: '2026-05-01',
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      code: 'A100',
      durationDays: 10,
      laneIndex: 2,
      constraintType: 'SNET',
      constraintDate: '2026-05-01',
    });
  });

  it('forces a milestone duration to 0, on create and on type change', async () => {
    const { actor, planId } = await setup();
    // A milestone created with a non-zero duration is coerced to 0.
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Kickoff', type: 'START_MILESTONE', durationDays: 0 })
      .expect(201);
    expect(created.body.data).toMatchObject({ type: 'START_MILESTONE', durationDays: 0 });

    // A task turned into a milestone loses its duration.
    const task = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Handover', durationDays: 5 })
      .expect(201);
    const id = task.body.data.id as string;
    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${id}`)
      .send({ type: 'FINISH_MILESTONE', version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ type: 'FINISH_MILESTONE', durationDays: 0 });
  });

  it('rejects a non-zero milestone duration, a lone constraint, and a bad date (422)', async () => {
    const { actor, planId } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
    await actor.agent
      .post(base)
      .send({ name: 'A', type: 'START_MILESTONE', durationDays: 3 })
      .expect(422);
    await actor.agent.post(base).send({ name: 'B', constraintType: 'SNET' }).expect(422);
    await actor.agent.post(base).send({ name: 'C', constraintDate: '2026-05-01' }).expect(422);
    await actor.agent
      .post(base)
      .send({ name: 'D', constraintType: 'SNET', constraintDate: '2026-02-30' })
      .expect(422);
  });

  it('rejects a partial constraint update that omits one side (422), keeping the pair intact', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Constrained', constraintType: 'SNET', constraintDate: '2026-05-01' })
      .expect(201);
    const id = created.body.data.id as string;
    const item = `/api/v1/organizations/acme/activities/${id}`;

    // Clearing only the type (date omitted) would leave a dangling date — refused.
    const res = await actor.agent
      .patch(item)
      .send({ constraintType: null, version: 1 })
      .expect(422);
    expect(res.body.error?.details?.reason).toBe('CONSTRAINT_PAIR_REQUIRED');
    // The symmetric case (date only) is refused too.
    await actor.agent.patch(item).send({ constraintDate: null, version: 1 }).expect(422);
    // And setting only a type on an unconstrained field is refused.
    await actor.agent.patch(item).send({ constraintType: 'FNLT', version: 1 }).expect(422);

    // The activity is untouched — the original pair is still intact.
    const got = await actor.agent.get(item).expect(200);
    expect(got.body.data).toMatchObject({
      constraintType: 'SNET',
      constraintDate: '2026-05-01',
      version: 1,
    });

    // Clearing BOTH together is allowed.
    const cleared = await actor.agent
      .patch(item)
      .send({ constraintType: null, constraintDate: null, version: 1 })
      .expect(200);
    expect(cleared.body.data).toMatchObject({ constraintType: null, constraintDate: null });
  });

  it('allows the same activity name under different plans, but not within one', async () => {
    const { actor, planId } = await setup();
    // A second plan under the same project.
    const list = await actor.agent.get('/api/v1/organizations/acme/clients').expect(200);
    const clientId = list.body.data[0].id as string;
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name: 'Otherside' })
      .expect(201);
    const secondPlan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Second' })
      .expect(201);
    const a = `/api/v1/organizations/acme/plans/${planId}/activities`;
    const b = `/api/v1/organizations/acme/plans/${secondPlan.body.data.id}/activities`;

    await actor.agent.post(a).send({ name: 'Dup' }).expect(201);
    await actor.agent.post(b).send({ name: 'Dup' }).expect(201); // different plan: allowed
    await actor.agent.post(a).send({ name: 'Dup' }).expect(409); // same plan: conflict
  });

  it('enforces per-plan code uniqueness among active rows', async () => {
    const { actor, planId } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
    await actor.agent.post(base).send({ name: 'One', code: 'A100' }).expect(201);
    const clash = await actor.agent.post(base).send({ name: 'Two', code: 'A100' }).expect(409);
    // The 409 pinpoints the code (not the name) so the client can fix the field.
    expect(clash.body.error?.details?.reason).toBe('CODE_TAKEN');
    // Two activities with no code do not collide (the code unique is partial).
    await actor.agent.post(base).send({ name: 'Three' }).expect(201);
    await actor.agent.post(base).send({ name: 'Four' }).expect(201);
  });

  it('updates with optimistic locking (stale version → 409)', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Lock' })
      .expect(201);
    const id = created.body.data.id as string;

    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${id}`)
      .send({ name: 'Lock v2', version: 1 })
      .expect(200);
    await actor.agent
      .patch(`/api/v1/organizations/acme/activities/${id}`)
      .send({ name: 'Again', version: 1 })
      .expect(409);
  });

  it('soft-deletes and restores an activity', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Temp' })
      .expect(201);
    const id = created.body.data.id as string;

    await actor.agent.delete(`/api/v1/organizations/acme/activities/${id}`).expect(204);
    await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(404);
    const list = await actor.agent
      .get(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);

    await actor.agent.post(`/api/v1/organizations/acme/activities/${id}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(200);
  });

  it('refuses to restore an activity whose parent plan is still deleted (409)', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Child' })
      .expect(201);
    const id = created.body.data.id as string;

    // Deleting the plan cascades the activity into the plan's batch.
    await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);

    const res = await actor.agent
      .post(`/api/v1/organizations/acme/activities/${id}/restore`)
      .expect(409);
    expect(res.body.error?.details?.reason).toBe('PARENT_DELETED');

    // Restoring the plan brings the whole batch (incl. the activity) back.
    await actor.agent.post(`/api/v1/organizations/acme/plans/${planId}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/activities/${id}`).expect(200);
  });

  it('404s a foreign/deleted parent plan and hides activities from non-members', async () => {
    const { actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Hidden' })
      .expect(201);
    const activityId = created.body.data.id as string;

    const unknownPlan = '00000000-0000-7000-8000-000000000000';
    await actor.agent.get(`/api/v1/organizations/acme/plans/${unknownPlan}/activities`).expect(404);
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${unknownPlan}/activities`)
      .send({ name: 'Nope' })
      .expect(404);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(`/api/v1/organizations/acme/activities/${activityId}`).expect(404);
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/activities/${activityId}`).expect(404);
  });

  it('lets a Viewer read but forbids create; a Contributor also cannot edit the definition', async () => {
    const { orgId, actor, planId } = await setup();
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
    const created = await actor.agent.post(base).send({ name: 'Seed' }).expect(201);
    const activityId = created.body.data.id as string;

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(base).expect(200);
    await viewer.agent.post(base).send({ name: 'Nope' }).expect(403);

    // A Contributor may read, but definition write (create/update/delete) is
    // Planner+ only — progress is what a Contributor gets (that endpoint is B2).
    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.get(base).expect(200);
    await contributor.agent.post(base).send({ name: 'Nope' }).expect(403);
    await contributor.agent
      .patch(`/api/v1/organizations/acme/activities/${activityId}`)
      .send({ name: 'Renamed', version: 1 })
      .expect(403);
    await contributor.agent
      .delete(`/api/v1/organizations/acme/activities/${activityId}`)
      .expect(403);
  });

  it('reports progress and derives status; a Contributor can, a Viewer cannot', async () => {
    const { orgId, actor, planId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Framing', durationDays: 10 })
      .expect(201);
    const id = created.body.data.id as string;
    const item = `/api/v1/organizations/acme/activities/${id}`;

    // A Contributor (who cannot edit the definition) reports progress.
    const contributor = await signUp('contributor@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    const progressed = await contributor.agent
      .patch(`${item}/progress`)
      .send({ percentComplete: 40, actualStart: '2026-05-01', version: 1 })
      .expect(200);
    expect(progressed.body.data).toMatchObject({
      percentComplete: 40,
      actualStart: '2026-05-01',
      status: 'IN_PROGRESS', // derived from the numbers, not sent
      version: 2,
    });

    // Completing it (100% + finish date) derives COMPLETE.
    const done = await contributor.agent
      .patch(`${item}/progress`)
      .send({ percentComplete: 100, actualFinish: '2026-06-01', version: 2 })
      .expect(200);
    expect(done.body.data).toMatchObject({ status: 'COMPLETE', actualFinish: '2026-06-01' });

    // A finish before the start, or without one, is rejected.
    await contributor.agent
      .patch(`${item}/progress`)
      .send({ actualStart: '2026-07-01', actualFinish: '2026-06-01', version: 3 })
      .expect(422);

    // A Viewer cannot report progress.
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent
      .patch(`${item}/progress`)
      .send({ percentComplete: 50, version: 3 })
      .expect(403);

    // A Contributor still cannot edit the definition (that split is the whole point).
    await contributor.agent.patch(item).send({ name: 'Renamed', version: 3 }).expect(403);
  });

  describe('batch lane positions (M4)', () => {
    async function makeAct(actor: Actor, planId: string, name: string) {
      const res = await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name })
        .expect(201);
      return { id: res.body.data.id as string, version: res.body.data.version as number };
    }
    const positionsUrl = (planId: string) =>
      `/api/v1/organizations/acme/plans/${planId}/activities/positions`;

    it('moves several activities to new lanes in one call and bumps their versions', async () => {
      const { actor, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      const b = await makeAct(actor, planId, 'B');

      const res = await actor.agent
        .patch(positionsUrl(planId))
        .send({
          positions: [
            { id: a.id, laneIndex: 2, version: a.version },
            { id: b.id, laneIndex: 3, version: b.version },
          ],
        })
        .expect(200);

      const byId = new Map(
        (res.body.data as Array<{ id: string; laneIndex: number; version: number }>).map((x) => [
          x.id,
          x,
        ]),
      );
      expect(byId.get(a.id)).toMatchObject({ laneIndex: 2, version: 2 });
      expect(byId.get(b.id)).toMatchObject({ laneIndex: 3, version: 2 });
    });

    it('is all-or-nothing: a single stale version rejects the whole batch (409), nothing moves', async () => {
      const { actor, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      const b = await makeAct(actor, planId, 'B');

      await actor.agent
        .patch(positionsUrl(planId))
        .send({
          positions: [
            { id: a.id, laneIndex: 5, version: a.version },
            { id: b.id, laneIndex: 6, version: 99 }, // stale
          ],
        })
        .expect(409);

      // Neither row moved — the good one rolled back with the bad one.
      const got = await actor.agent
        .get(`/api/v1/organizations/acme/activities/${a.id}`)
        .expect(200);
      expect(got.body.data).toMatchObject({ laneIndex: 0, version: 1 });
    });

    it('rejects an id from another plan (404) and moves nothing (anti-IDOR)', async () => {
      const { actor, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      // A second plan in the same org with its own activity.
      const project = await actor.agent
        .post(`/api/v1/organizations/acme/clients`)
        .send({ name: 'Other' })
        .expect(201);
      const proj = await actor.agent
        .post(`/api/v1/organizations/acme/clients/${project.body.data.id}/projects`)
        .send({ name: 'P2' })
        .expect(201);
      const plan2 = await actor.agent
        .post(`/api/v1/organizations/acme/projects/${proj.body.data.id}/plans`)
        .send({ name: 'Plan2' })
        .expect(201);
      const foreign = await makeAct(actor, plan2.body.data.id as string, 'Foreign');

      await actor.agent
        .patch(positionsUrl(planId))
        .send({
          positions: [
            { id: a.id, laneIndex: 4, version: a.version },
            { id: foreign.id, laneIndex: 4, version: foreign.version },
          ],
        })
        .expect(404);

      const got = await actor.agent
        .get(`/api/v1/organizations/acme/activities/${a.id}`)
        .expect(200);
      expect(got.body.data).toMatchObject({ laneIndex: 0 }); // in-plan row untouched
    });

    it('422s a batch that names the same activity twice', async () => {
      const { actor, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      await actor.agent
        .patch(positionsUrl(planId))
        .send({
          positions: [
            { id: a.id, laneIndex: 1, version: a.version },
            { id: a.id, laneIndex: 2, version: a.version },
          ],
        })
        .expect(422);
    });

    it('forbids a Contributor and a Viewer from moving lanes (403)', async () => {
      const { actor, orgId, planId } = await setup();
      const a = await makeAct(actor, planId, 'A');
      const body = { positions: [{ id: a.id, laneIndex: 1, version: a.version }] };

      const contributor = await signUp('lane-contrib@example.com');
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
      });
      await contributor.agent.patch(positionsUrl(planId)).send(body).expect(403);

      const viewer = await signUp('lane-viewer@example.com');
      await prisma.orgMember.create({
        data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
      });
      await viewer.agent.patch(positionsUrl(planId)).send(body).expect(403);
    });
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/plans/00000000-0000-7000-8000-000000000000/activities')
      .expect(401);
  });
});
