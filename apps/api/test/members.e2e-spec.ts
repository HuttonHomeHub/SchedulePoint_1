import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for membership management: listing, role changes (optimistic
 * locking + last-Org-Admin invariant), removal, the permission matrix, and the
 * anti-IDOR 404 for a non-member. A second member is seeded directly (invitations
 * land in the next slice).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Agent {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Members API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaServiceToken);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await prisma.orgMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<Agent> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** Admin creates "Acme"; a viewer is seeded into it. Returns the actors + ids. */
  async function setupOrg() {
    const admin = await signUp('admin@example.com');
    const created = await admin.agent
      .post('/api/v1/organizations')
      .send({ name: 'Acme' })
      .expect(201);
    const organizationId = (created.body as { data: { id: string } }).data.id;

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId, userId: viewer.userId, role: 'VIEWER' },
    });

    return { admin, viewer, organizationId };
  }

  const membersOf = (agent: Agent['agent']) =>
    agent
      .get('/api/v1/organizations/acme/members')
      .expect(200)
      .then(
        (r) =>
          r.body.data as Array<{
            id: string;
            role: string;
            version: number;
            user: { email: string };
          }>,
      );

  it('lists members for a member of the org', async () => {
    const { admin } = await setupOrg();
    const members = await membersOf(admin.agent);
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.role).sort()).toEqual(['ORG_ADMIN', 'VIEWER']);
  });

  it('lets an admin change a member role (optimistic locking)', async () => {
    const { admin } = await setupOrg();
    const viewerMember = (await membersOf(admin.agent)).find(
      (m) => m.user.email === 'viewer@example.com',
    )!;

    const res = await admin.agent
      .patch(`/api/v1/organizations/acme/members/${viewerMember.id}`)
      .send({ role: 'PLANNER', version: viewerMember.version })
      .expect(200);
    expect(res.body.data.role).toBe('PLANNER');

    // Stale version now conflicts.
    await admin.agent
      .patch(`/api/v1/organizations/acme/members/${viewerMember.id}`)
      .send({ role: 'VIEWER', version: viewerMember.version })
      .expect(409);
  });

  it('refuses to demote the last Org Admin (409)', async () => {
    const { admin } = await setupOrg();
    const adminMember = (await membersOf(admin.agent)).find((m) => m.role === 'ORG_ADMIN')!;
    await admin.agent
      .patch(`/api/v1/organizations/acme/members/${adminMember.id}`)
      .send({ role: 'VIEWER', version: adminMember.version })
      .expect(409);
  });

  it('forbids a viewer from changing roles (403)', async () => {
    const { admin, viewer } = await setupOrg();
    const adminMember = (await membersOf(admin.agent)).find((m) => m.role === 'ORG_ADMIN')!;
    await viewer.agent
      .patch(`/api/v1/organizations/acme/members/${adminMember.id}`)
      .send({ role: 'VIEWER', version: adminMember.version })
      .expect(403);
  });

  it('lets an admin remove a member (204), then it disappears from the roster', async () => {
    const { admin } = await setupOrg();
    const viewerMember = (await membersOf(admin.agent)).find(
      (m) => m.user.email === 'viewer@example.com',
    )!;
    await admin.agent.delete(`/api/v1/organizations/acme/members/${viewerMember.id}`).expect(204);
    expect(await membersOf(admin.agent)).toHaveLength(1);
  });

  it('404s when a non-member lists members (anti-IDOR)', async () => {
    await setupOrg();
    const outsider = await signUp('outsider@example.com');
    await outsider.agent.get('/api/v1/organizations/acme/members').expect(404);
  });
});
