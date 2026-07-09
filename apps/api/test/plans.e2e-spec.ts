import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for plans: nested create/list under a parent project, the
 * flat item operations, `status`/`plannedStart` metadata round-trip and
 * validation, per-project name uniqueness, the IDOR/parent-404 matrix, and the
 * soft-delete + restore round-trip incl. the top-down PARENT_DELETED invariant
 * (verified against a real PostgreSQL + Better Auth session).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Plans API (e2e)', () => {
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
    await prisma.plan.deleteMany();
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

  async function createClient(actor: Actor, name: string): Promise<string> {
    const res = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createProject(actor: Actor, clientId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  /** Set up an admin org with a client + project, returning the project id. */
  async function setup(): Promise<{ actor: Actor; orgId: string; projectId: string }> {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    return { actor, orgId, projectId };
  }

  it('creates a plan with defaults, gets and lists it', async () => {
    const { actor, projectId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Baseline' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      name: 'Baseline',
      projectId,
      status: 'DRAFT',
      plannedStart: null,
      version: 1,
    });
    const id = res.body.data.id as string;

    const got = await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(200);
    expect(got.body.data).toMatchObject({ name: 'Baseline', projectId, status: 'DRAFT' });

    const list = await actor.agent
      .get(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('round-trips status and plannedStart (date-only, no TZ drift)', async () => {
    const { actor, projectId } = await setup();
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Metadata', status: 'ACTIVE', plannedStart: '2026-05-01' })
      .expect(201);
    expect(res.body.data).toMatchObject({ status: 'ACTIVE', plannedStart: '2026-05-01' });
    const id = res.body.data.id as string;

    // Update status + clear the date.
    const patched = await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ status: 'ARCHIVED', plannedStart: null, version: 1 })
      .expect(200);
    expect(patched.body.data).toMatchObject({ status: 'ARCHIVED', plannedStart: null, version: 2 });
  });

  it('rejects an invalid status or plannedStart (422)', async () => {
    const { actor, projectId } = await setup();
    const base = `/api/v1/organizations/acme/projects/${projectId}/plans`;
    await actor.agent.post(base).send({ name: 'A', status: 'WIP' }).expect(422);
    await actor.agent.post(base).send({ name: 'B', plannedStart: '2026-02-30' }).expect(422);
    await actor.agent.post(base).send({ name: 'C', plannedStart: '01/05/2026' }).expect(422);
  });

  it('allows the same plan name under different projects, but not within one', async () => {
    const { actor, projectId } = await setup();
    const clientId = await createClient(actor, 'Second');
    const otherProject = await createProject(actor, clientId, 'Otherside');
    const a = `/api/v1/organizations/acme/projects/${projectId}/plans`;
    const b = `/api/v1/organizations/acme/projects/${otherProject}/plans`;

    await actor.agent.post(a).send({ name: 'Dup' }).expect(201);
    await actor.agent.post(b).send({ name: 'Dup' }).expect(201); // different project: allowed
    await actor.agent.post(a).send({ name: 'Dup' }).expect(409); // same project: conflict
  });

  it('updates with optimistic locking (stale version → 409)', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Lock' })
      .expect(201);
    const id = created.body.data.id as string;

    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ name: 'Lock v2', version: 1 })
      .expect(200);
    await actor.agent
      .patch(`/api/v1/organizations/acme/plans/${id}`)
      .send({ name: 'Again', version: 1 })
      .expect(409);
  });

  it('soft-deletes and restores a plan', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Temp' })
      .expect(201);
    const id = created.body.data.id as string;

    await actor.agent.delete(`/api/v1/organizations/acme/plans/${id}`).expect(204);
    await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(404);
    const list = await actor.agent
      .get(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);

    await actor.agent.post(`/api/v1/organizations/acme/plans/${id}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(200);
  });

  it('refuses to restore a plan whose parent project is still deleted (409)', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Child' })
      .expect(201);
    const id = created.body.data.id as string;

    // Deleting the project cascades the plan into the project's batch.
    await actor.agent.delete(`/api/v1/organizations/acme/projects/${projectId}`).expect(204);

    const res = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${id}/restore`)
      .expect(409);
    expect(res.body.error?.details?.reason).toBe('PARENT_DELETED');

    // Restoring the project brings the whole batch (incl. the plan) back.
    await actor.agent.post(`/api/v1/organizations/acme/projects/${projectId}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/plans/${id}`).expect(200);
  });

  it('404s a foreign/deleted parent project and hides plans from non-members', async () => {
    const { actor, projectId } = await setup();
    const created = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Hidden' })
      .expect(201);
    const planId = created.body.data.id as string;

    const unknownProject = '00000000-0000-7000-8000-000000000000';
    await actor.agent
      .get(`/api/v1/organizations/acme/projects/${unknownProject}/plans`)
      .expect(404);
    await actor.agent
      .post(`/api/v1/organizations/acme/projects/${unknownProject}/plans`)
      .send({ name: 'Nope' })
      .expect(404);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get(`/api/v1/organizations/acme/plans/${planId}`).expect(404);
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/plans/${planId}`).expect(404);
  });

  it('forbids a Viewer from creating a plan but allows reading (403 / 200)', async () => {
    const { orgId, projectId } = await setup();
    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });

    await viewer.agent.get(`/api/v1/organizations/acme/projects/${projectId}/plans`).expect(200);
    await viewer.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/projects/00000000-0000-7000-8000-000000000000/plans')
      .expect(401);
  });
});
