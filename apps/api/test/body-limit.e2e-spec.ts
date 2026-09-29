import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * The JSON body cap (`docs/TECH_DEBT.md` #407) against a real app and a real session.
 *
 * Two facts carry it, and each was wrong before:
 *
 * - **An over-cap body is a 413 with the standard envelope.** The parser's error is neither a
 *   `DomainError` nor an `HttpException`, so the global filter answered an opaque 500 — a client
 *   could not tell "too big" from "the server broke".
 * - **The cap is set by what the DTOs allow, not by the smallest route.** Four batch DTOs accept
 *   `@ArrayMaxSize(2000)`; one 64 KB parser for every route made that ceiling unreachable
 *   (`PATCH …/parents` topped out near 580 rows). The larger limit is scoped to the org-scoped
 *   prefix, where every route is behind the session guard; the routes a stranger can reach keep 64 KB.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const BATCH = 2_000;

describe.skipIf(!hasDatabase)('JSON body cap (e2e)', () => {
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
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();

  async function signedInPlan(): Promise<{
    agent: ReturnType<typeof request.agent>;
    planId: string;
    summaryId: string;
  }> {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id as string}/plans`)
      .send({ name: 'Scale', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const summary = await agent
      .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
      .send({ name: 'Substructure', durationDays: 5, type: 'WBS_SUMMARY' })
      .expect(201);
    return { agent, planId, summaryId: summary.body.data.id as string };
  }

  const parentsUrl = (planId: string) =>
    `/api/v1/organizations/acme/plans/${planId}/activities/parents`;

  it('accepts the DTO ceiling — 2,000 parent rows — on an org-scoped route', async () => {
    const { agent, planId, summaryId } = await signedInPlan();
    // One insert rather than 2,000 REST calls: this proves the parser and the DTO ceiling, not the
    // create path (the same bypass `cascade-restore-scale.e2e-spec.ts` states and justifies).
    const template = await prisma.activity.findUniqueOrThrow({ where: { id: summaryId } });
    const {
      id: _id,
      name: _name,
      type: _type,
      parentId: _parentId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...shared
    } = template;
    await prisma.activity.createMany({
      data: Array.from({ length: BATCH }, (_unused, i) => ({
        ...shared,
        name: `Member ${i}`,
        type: 'TASK' as const,
      })),
    });
    const members = await prisma.activity.findMany({
      where: { planId, type: 'TASK' },
      select: { id: true, version: true },
    });
    expect(members).toHaveLength(BATCH);

    const res = await agent
      .patch(parentsUrl(planId))
      .send({
        parents: members.map((m) => ({ id: m.id, parentId: summaryId, version: m.version })),
      })
      .expect(200);
    expect(res.body.data).toHaveLength(BATCH);
  });

  it('parses the widest valid 2,000-row placements body (~356 KB) rather than refusing it', async () => {
    const { agent, planId } = await signedInPlan();
    const row = {
      version: 2_147_483_647,
      constraintType: 'MANDATORY_FINISH',
      constraintDate: '2026-12-31',
      visualStart: '2026-12-31',
      laneIndex: 10_000,
    };
    const body = {
      placements: Array.from({ length: BATCH }, () => ({ id: randomUUID(), ...row })),
    };
    expect(JSON.stringify(body).length).toBeGreaterThan(350_000);
    // The ids are not this plan's, so the write itself is refused — the point is that it is the
    // service refusing (404), not the parser (413) and not a duplicate-id 422.
    const res = await agent
      .patch(`/api/v1/organizations/acme/plans/${planId}/activities/placements`)
      .send(body);
    expect(res.status).toBe(404);
  });

  it('answers an over-cap body on an org-scoped route with 413 and the standard envelope', async () => {
    const { agent, planId } = await signedInPlan();
    // Past the org-scoped cap: the parser refuses it before a guard, a pipe or the DTO's own
    // ceiling is consulted.
    const res = await agent
      .patch(parentsUrl(planId))
      .send({ parents: [], padding: 'x'.repeat(600 * 1024) })
      .expect(413);
    expect(res.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String) },
    });
  });

  it('accepts a body just under the org-scoped cap (the parser does not refuse it)', async () => {
    const { agent, planId } = await signedInPlan();
    // ~500 KB of padding against a 512 KB cap: read in full, then refused by the DTO, not the parser.
    const res = await agent
      .patch(parentsUrl(planId))
      .send({ parents: [], padding: 'x'.repeat(500 * 1024) });
    expect(res.status).toBe(422);
  });

  it('holds an anonymous caller to 64 KB even under the org-scoped prefix', async () => {
    // No session cookie and no Authorization header: the large parser is skipped, so a 300 KB body
    // is refused by the 64 KB one before the guard would have answered 401.
    const res = await request(server())
      .post('/api/v1/organizations/acme/clients')
      .send({ padding: 'x'.repeat(300 * 1024) })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('reads the large cap for any request that PRESENTS credentials — validity is the guard’s job', async () => {
    // Documents the residue the docblock in app-setup.ts states: presence is all the parser can
    // check, so a junk Authorization header buys the 512 KB read and then a 401.
    await request(server())
      .post('/api/v1/organizations/acme/clients')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ padding: 'x'.repeat(300 * 1024) })
      .expect(401);
  });

  it('keeps 64 KB on an authenticated route outside the org-scoped prefix', async () => {
    const { agent } = await signedInPlan();
    const res = await agent
      .post('/api/v1/staff/diagnostics')
      .send({ padding: 'x'.repeat(100 * 1024) })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('does not let a differently-cased path slip past the 64 KB cap', async () => {
    const res = await request(server())
      .post('/API/V1/Invitations/preview')
      .send({ padding: 'x'.repeat(100 * 1024) })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it.each([
    ['the CSP sink', '/api/v1/csp-report'],
    ['invitation preview', '/api/v1/invitations/preview'],
  ])('keeps the 64 KB cap on %s, which anyone can reach', async (_name, path) => {
    const res = await request(server())
      .post(path)
      .send({ padding: 'x'.repeat(100 * 1024) })
      .expect(413);
    expect(res.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String) },
    });
  });
});
