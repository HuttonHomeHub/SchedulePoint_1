import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for projects: nested create/list under a parent client, the
 * flat item operations, the IDOR/parent-404 matrix, per-client name uniqueness,
 * and the cascade soft-delete + restore round-trip incl. the top-down
 * PARENT_DELETED invariant (verified against a real PostgreSQL + Better Auth
 * session). Plans are seeded directly via Prisma since their HTTP module lands
 * in a later task.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Projects API (e2e)', () => {
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

  /** An admin (Planner privileges included) who owns an org 'acme'. */
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
    expect(res.body.data).toMatchObject({ name, clientId, description: null, version: 1 });
    return res.body.data.id as string;
  }

  it('creates a project under a client, gets and lists it', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const id = await createProject(actor, clientId, 'Riverside');

    const got = await actor.agent.get(`/api/v1/organizations/acme/projects/${id}`).expect(200);
    expect(got.body.data).toMatchObject({ name: 'Riverside', clientId });

    const list = await actor.agent
      .get(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ hasMore: false });
  });

  it('allows the same project name under different clients, but not within one', async () => {
    const { actor } = await adminWithOrg();
    const clientA = await createClient(actor, 'Client A');
    const clientB = await createClient(actor, 'Client B');

    await createProject(actor, clientA, 'Dup');
    // Same name, different client: allowed.
    await createProject(actor, clientB, 'Dup');
    // Same name, same client: 409.
    await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientA}/projects`)
      .send({ name: 'Dup' })
      .expect(409);
  });

  it('updates with optimistic locking (stale version → 409)', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Client');
    const id = await createProject(actor, clientId, 'Renamed');

    const ok = await actor.agent
      .patch(`/api/v1/organizations/acme/projects/${id}`)
      .send({ name: 'Renamed Phase 2', version: 1 })
      .expect(200);
    expect(ok.body.data).toMatchObject({ name: 'Renamed Phase 2', version: 2 });

    await actor.agent
      .patch(`/api/v1/organizations/acme/projects/${id}`)
      .send({ name: 'Again', version: 1 })
      .expect(409);
  });

  it('cascade soft-deletes the project subtree and restores it as one batch', async () => {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Cascade');
    const projectId = await createProject(actor, clientId, 'Proj');

    // Seed a plan directly (its HTTP module lands later).
    const plan = await prisma.plan.create({
      data: { organizationId: orgId, projectId, name: 'Plan', createdBy: actor.userId },
    });

    await actor.agent.delete(`/api/v1/organizations/acme/projects/${projectId}`).expect(204);

    const deletedProject = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const deletedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(deletedProject.deletedAt).not.toBeNull();
    expect(deletedPlan.deletedAt).not.toBeNull();
    // One batch id spans the whole deleted subtree.
    expect(deletedPlan.deleteBatchId).toBe(deletedProject.deleteBatchId);
    // The project is gone from the client's active list.
    const list = await actor.agent
      .get(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .expect(200);
    expect(list.body.data).toHaveLength(0);

    // Restore brings the whole batch back.
    await actor.agent.post(`/api/v1/organizations/acme/projects/${projectId}/restore`).expect(200);
    const restoredPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(restoredPlan.deletedAt).toBeNull();
    expect(restoredPlan.deleteBatchId).toBeNull();
  });

  it('refuses to restore a project whose parent client is still deleted (409)', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Parent');
    const projectId = await createProject(actor, clientId, 'Child');

    // Deleting the client cascades the project into the client's batch.
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    // Restoring the project alone violates the top-down invariant.
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/restore`)
      .expect(409);
    expect(res.body.error?.details?.reason).toBe('PARENT_DELETED');

    // Restoring the client brings the whole batch (incl. the project) back.
    await actor.agent.post(`/api/v1/organizations/acme/clients/${clientId}/restore`).expect(200);
    await actor.agent.get(`/api/v1/organizations/acme/projects/${projectId}`).expect(200);
  });

  it('404s a foreign/deleted parent client and hides projects from non-members', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Secret');
    const projectId = await createProject(actor, clientId, 'Hidden');

    // Unknown parent client → 404 on nested create/list.
    const unknownClient = '00000000-0000-7000-8000-000000000000';
    await actor.agent
      .get(`/api/v1/organizations/acme/clients/${unknownClient}/projects`)
      .expect(404);
    await actor.agent
      .post(`/api/v1/organizations/acme/clients/${unknownClient}/projects`)
      .send({ name: 'Nope' })
      .expect(404);

    const outsider = await signUp('outsider@example.com');
    // Non-member: the org is invisible (404, not 403).
    await outsider.agent.get(`/api/v1/organizations/acme/projects/${projectId}`).expect(404);
    await outsider.agent.get(`/api/v1/organizations/acme/clients/${clientId}/projects`).expect(404);

    // A member of a *different* org cannot reach this org's project either.
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/projects/${projectId}`).expect(404);
  });

  it('forbids a Viewer from creating a project but allows reading (403 / 200)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Visible');
    await createProject(actor, clientId, 'Seen');

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });

    await viewer.agent.get(`/api/v1/organizations/acme/clients/${clientId}/projects`).expect(200);
    await viewer.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('401s without a session', async () => {
    await request(server())
      .get('/api/v1/organizations/acme/clients/00000000-0000-7000-8000-000000000000/projects')
      .expect(401);
  });
});
