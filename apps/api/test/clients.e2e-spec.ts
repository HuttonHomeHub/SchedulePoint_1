import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for clients: CRUD, the IDOR/404 matrix, name uniqueness, and
 * the cascade soft-delete + restore round-trip (verified against a real
 * PostgreSQL + Better Auth session). Projects/plans are seeded directly via
 * Prisma since their HTTP modules land in later tasks.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Clients API (e2e)', () => {
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
    expect(res.body.data).toMatchObject({ name, description: null, version: 1 });
    return res.body.data.id as string;
  }

  it('creates, gets and lists clients', async () => {
    const { actor } = await adminWithOrg();
    const id = await createClient(actor, 'Northgate');

    const got = await actor.agent.get(`/api/v1/organizations/acme/clients/${id}`).expect(200);
    expect(got.body.data.name).toBe('Northgate');

    const list = await actor.agent.get('/api/v1/organizations/acme/clients').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ hasMore: false });
  });

  it('rejects a duplicate active name (409) but allows reuse after delete', async () => {
    const { actor } = await adminWithOrg();
    const id = await createClient(actor, 'Dup');
    await actor.agent.post('/api/v1/organizations/acme/clients').send({ name: 'Dup' }).expect(409);

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${id}`).expect(204);
    // Same name is free once the holder is soft-deleted.
    await createClient(actor, 'Dup');
  });

  it('updates with optimistic locking (stale version → 409)', async () => {
    const { actor } = await adminWithOrg();
    const id = await createClient(actor, 'Renamed');

    const ok = await actor.agent
      .patch(`/api/v1/organizations/acme/clients/${id}`)
      .send({ name: 'Renamed Ltd', version: 1 })
      .expect(200);
    expect(ok.body.data).toMatchObject({ name: 'Renamed Ltd', version: 2 });

    await actor.agent
      .patch(`/api/v1/organizations/acme/clients/${id}`)
      .send({ name: 'Again', version: 1 })
      .expect(409);
  });

  it('cascade soft-deletes the subtree and restores it as one batch', async () => {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Cascade');

    // Seed a project + plan directly (their HTTP modules land later).
    const project = await prisma.project.create({
      data: { organizationId: orgId, clientId, name: 'Proj', createdBy: actor.userId },
    });
    const plan = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        name: 'Plan',
        plannedStart: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: actor.userId,
      },
    });

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const deletedProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const deletedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(deletedProject.deletedAt).not.toBeNull();
    expect(deletedPlan.deletedAt).not.toBeNull();
    // One batch id spans the whole deleted subtree.
    expect(deletedPlan.deleteBatchId).toBe(deletedProject.deleteBatchId);
    // The client is gone from the active list.
    const list = await actor.agent.get('/api/v1/organizations/acme/clients').expect(200);
    expect(list.body.data).toHaveLength(0);

    // Restore brings the whole batch back.
    await actor.agent.post(`/api/v1/organizations/acme/clients/${clientId}/restore`).expect(200);
    const restoredProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const restoredPlan = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(restoredProject.deletedAt).toBeNull();
    expect(restoredPlan.deletedAt).toBeNull();
    expect(restoredPlan.deleteBatchId).toBeNull();
  });

  it('404s a foreign/unknown client id and hides clients from non-members', async () => {
    const { actor } = await adminWithOrg();
    const id = await createClient(actor, 'Secret');

    const outsider = await signUp('outsider@example.com');
    // Non-member: the org is invisible (404, not 403).
    await outsider.agent.get('/api/v1/organizations/acme/clients').expect(404);
    await outsider.agent.get(`/api/v1/organizations/acme/clients/${id}`).expect(404);

    // A member of a *different* org cannot reach this org's client either.
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(`/api/v1/organizations/other/clients/${id}`).expect(404);
  });

  it('forbids a Viewer from creating a client but allows reading (403 / 200)', async () => {
    const { actor, orgId } = await adminWithOrg();
    await createClient(actor, 'Visible');

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });

    await viewer.agent.get('/api/v1/organizations/acme/clients').expect(200);
    await viewer.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('401s without a session', async () => {
    await request(server()).get('/api/v1/organizations/acme/clients').expect(401);
  });
});
