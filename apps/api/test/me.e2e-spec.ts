import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests for authentication + the current-user endpoint. Boots the
 * real Nest app (global pipe, filter, interceptor, guards) with the real Better
 * Auth handler mounted (no auth override) against a real PostgreSQL, and drives
 * the actual sign-up / sign-in / sign-out cookie flow.
 *
 * State-changing auth requests carry an `Origin` header — Better Auth enforces
 * an origin allow-list (CSRF defence), exactly as a browser would send.
 *
 * Requires a database: run in CI (Postgres service + `prisma migrate deploy`).
 * Skipped when DATABASE_URL is unset. See docs/TESTING.md.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

describe.skipIf(!hasDatabase)('Auth & Me (e2e)', () => {
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
    // FK-safe order (invitations + memberships RESTRICT-reference orgs/users);
    // clears any rows left by other e2e specs sharing this database.
    await prisma.invitation.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.orgMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany(); // cascades sessions + accounts
  });

  const server = () => app.getHttpServer();
  const signUp = (agent: ReturnType<typeof request.agent>, email = 'ada@example.com') =>
    agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Ada Lovelace', email, password: PASSWORD });

  it('rejects /me without a session (401)', async () => {
    await request(server()).get('/api/v1/me').expect(401);
  });

  it('sets a hardened session cookie on sign-up (HttpOnly, SameSite=Lax)', async () => {
    const res = await signUp(request.agent(server())).expect(200);
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    const sessionCookie = (setCookie ?? []).find((c) => c.includes('session_token'));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    // Secure is only set in production (useSecureCookies), so not asserted here.
  });

  it('signs up and returns the user + empty memberships from /me (200)', async () => {
    const agent = request.agent(server());
    await signUp(agent).expect(200);

    const res = await agent.get('/api/v1/me').set('Origin', ORIGIN).expect(200);
    expect(res.body.data.user).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      emailVerified: false,
    });
    expect(res.body.data.user.id).toEqual(expect.any(String));
    expect(res.body.data.memberships).toEqual([]);
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('signs in and out, gating /me accordingly', async () => {
    const setup = request.agent(server());
    await signUp(setup).expect(200);
    await setup.post('/api/auth/sign-out').set('Origin', ORIGIN).expect(200);

    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: 'ada@example.com', password: PASSWORD })
      .expect(200);
    await agent.get('/api/v1/me').set('Origin', ORIGIN).expect(200);

    await agent.post('/api/auth/sign-out').set('Origin', ORIGIN).expect(200);
    await agent.get('/api/v1/me').set('Origin', ORIGIN).expect(401);
  });

  it('rejects sign-in with a wrong password (401)', async () => {
    const setup = request.agent(server());
    await signUp(setup).expect(200);

    await request(server())
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: 'ada@example.com', password: 'wrong-password!!' })
      .expect(401);
  });
});
