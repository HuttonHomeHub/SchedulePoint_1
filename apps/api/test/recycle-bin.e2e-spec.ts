import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for the recycle bin (`GET .../deleted`): the combined
 * deleted-list across clients/projects/plans, `canRestore` reflecting the
 * top-down invariant, org-scoping (non-members/outsiders see nothing), and the
 * list → per-entity restore round-trip — against a real PostgreSQL + Better Auth.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface DeletedItem {
  kind: 'client' | 'project' | 'plan';
  id: string;
  name: string;
  deletedAt: string;
  canRestore: boolean;
}

describe.skipIf(!hasDatabase)('Recycle bin API (e2e)', () => {
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

  async function createPlan(actor: Actor, projectId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  it('lists a cascade-deleted subtree with only the root restorable', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');

    // Empty to start.
    const empty = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    expect(empty.body.data).toHaveLength(0);
    expect(empty.body.meta).toMatchObject({ hasMore: false, nextCursor: null });

    // Deleting the client cascades the project + plan into one batch.
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    const items = res.body.data as DeletedItem[];
    expect(items).toHaveLength(3);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId[clientId]).toMatchObject({ kind: 'client', canRestore: true });
    expect(byId[projectId]).toMatchObject({ kind: 'project', canRestore: false });
    expect(byId[planId]).toMatchObject({ kind: 'plan', canRestore: false });
  });

  it('restoring the root (via its own endpoint) empties the recycle bin', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    await createPlan(actor, projectId, 'Baseline');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    await actor.agent.post(`/api/v1/organizations/acme/clients/${clientId}/restore`).expect(200);

    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('shows a directly-deleted plan as restorable', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');

    await actor.agent.delete(`/api/v1/organizations/acme/plans/${planId}`).expect(204);

    const res = await actor.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    const items = res.body.data as DeletedItem[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'plan', id: planId, canRestore: true });
  });

  it('paginates newest-deleted first with a working cursor', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Owner');
    const projectId = await createProject(actor, clientId, 'Proj');
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await createPlan(actor, projectId, `Plan ${i}`);
      await actor.agent.delete(`/api/v1/organizations/acme/plans/${id}`).expect(204);
      ids.push(id);
    }

    const first = await actor.agent.get('/api/v1/organizations/acme/deleted?limit=2').expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.hasMore).toBe(true);
    const cursor = first.body.meta.nextCursor as string;

    const second = await actor.agent
      .get(`/api/v1/organizations/acme/deleted?limit=2&cursor=${encodeURIComponent(cursor)}`)
      .expect(200);
    expect(second.body.data.length).toBeGreaterThanOrEqual(1);
    expect(second.body.meta.hasMore).toBe(false);

    // Every deleted plan appears exactly once across the two pages.
    const seen = [...first.body.data, ...second.body.data].map((i: DeletedItem) => i.id);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it('scopes the bin to the caller — outsiders and non-members see nothing/404', async () => {
    const { actor } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    // An outsider is not a member of 'acme' → 404 (org not found for them).
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get('/api/v1/organizations/acme/deleted').expect(404);

    // Their own org's bin is empty (no cross-tenant leak).
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    const own = await outsider.agent.get('/api/v1/organizations/other/deleted').expect(200);
    expect(own.body.data).toHaveLength(0);
  });

  it('lets a Viewer read the bin (read is any member)', async () => {
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });

    const res = await viewer.agent.get('/api/v1/organizations/acme/deleted').expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('401s without a session', async () => {
    await request(server()).get('/api/v1/organizations/acme/deleted').expect(401);
  });
});
