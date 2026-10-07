import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { resetThrottleCounters } from './throttle-reset';

/**
 * **One 404 body (ADR-0086, `docs/TECH_DEBT.md` #459).** A signed-in non-staff member must not be able
 * to tell the guarded `/staff/me` from an address that was never a route. The status was already the
 * same; the body was not — Nest's own router answered `Cannot GET /api/v1/x`, echoing the method and
 * path, while `StaffGuard` answered `Not found` (measured 2026-10-07,
 * `docs/specs/estate-polish-oct/m3-measurement.md`). Driven through the real guard and the real
 * filter, because the unit suite mocks the exception and so cannot say which one the router throws.
 *
 * Residue, deliberately **not** asserted equal and not claimed away: the staff controller's throttle
 * adds `x-ratelimit-*` headers and a 429 after 30 requests a minute that no other route has, and an
 * anonymous caller gets 401 on `/api/v1/staff/*` and 404 elsewhere (`StaffGuard`, ADR-0086).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const MEMBER_EMAIL = 'planner@acme.test';

/** Per-request values and the throttle's own headers; everything else must match byte for byte. */
const VOLATILE_HEADERS = new Set(['date', 'x-correlation-id']);
const isVolatile = (name: string): boolean =>
  VOLATILE_HEADERS.has(name) || name.startsWith('x-ratelimit-');

describe.skipIf(!hasDatabase)('One 404 body (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let originalStaffEmails: string | undefined;
  let throttlerStorage: ThrottlerStorage;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    originalStaffEmails = process.env.STAFF_EMAILS;
    // Somebody IS staff, so the guard is armed; the caller below is not that somebody.
    process.env.STAFF_EMAILS = 'ops@schedulepoint.test';
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
    throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);
  });

  afterAll(async () => {
    await app?.close();
    if (originalStaffEmails === undefined) delete process.env.STAFF_EMAILS;
    else process.env.STAFF_EMAILS = originalStaffEmails;
  });

  beforeEach(async () => {
    resetThrottleCounters(throttlerStorage);
    await clearDomainData(prisma);
  });

  async function signedInMember(): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Test Person', email: MEMBER_EMAIL, password: 'correct-horse-battery' })
      .expect(200);
    await prisma.user.updateMany({ where: { email: MEMBER_EMAIL }, data: { emailVerified: true } });
    return agent;
  }

  it('gives a signed-in non-staff member the same body, content type, length and headers four ways', async () => {
    const agent = await signedInMember();
    const responses = [
      await agent.get('/api/v1/x').set('Origin', ORIGIN),
      await agent.get('/api/v1/staff/no-such-route').set('Origin', ORIGIN),
      await agent.get('/api/v1/staff/me').set('Origin', ORIGIN),
      await agent.post('/api/v1/staff/me').set('Origin', ORIGIN),
    ];

    const expected = '{"error":{"code":"NOT_FOUND","message":"Not found"}}';
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.text).toBe(expected);
      expect(response.headers['content-length']).toBe(String(expected.length));
    }

    const comparable = (headers: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(Object.entries(headers).filter(([name]) => !isVolatile(name)));
    const [first, ...rest] = responses.map((response) => comparable(response.headers));
    expect(first?.['content-type']).toBe('application/json; charset=utf-8');
    for (const headers of rest) expect(headers).toEqual(first);
  });

  it('does not echo the request path or query in an unmapped route’s 404', async () => {
    const agent = await signedInMember();
    const response = await agent.get('/api/v1/x?token=abc').set('Origin', ORIGIN).expect(404);
    expect(response.text).not.toContain('/api');
    expect(response.text).not.toContain('token');
  });
});
