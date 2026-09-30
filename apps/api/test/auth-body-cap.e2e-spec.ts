import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { DEFAULT_JSON_LIMIT_BYTES } from '../src/common/http/body-limits';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * The 64 KB cap on Better Auth's own routes (`docs/TECH_DEBT.md` #416), through the real app. The
 * cap was absent there because `toNodeHandler` gives better-call no `bodySizeLimit`, so an anonymous
 * caller's body was unbounded; the error must reach the same handler as every other body-parser
 * failure and answer the fixed-message 413 envelope, never parser text and never a 500.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const OVER = DEFAULT_JSON_LIMIT_BYTES + 1;
const TOO_LARGE = {
  error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' },
};

describe.skipIf(!hasDatabase)('Better Auth body cap (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;

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
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    prisma = app.get(Token);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();

  // No Content-Length, so Node frames the body with `Transfer-Encoding: chunked`.
  function chunkedSignUp(payload: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          port,
          method: 'POST',
          path: '/api/auth/sign-up/email',
          headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        },
        (res) => {
          let body = '';
          res.on('data', (c: Buffer) => (body += c.toString()));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on('error', reject);
      const half = Math.floor(payload.length / 2);
      req.write(payload.slice(0, half));
      req.write(payload.slice(half));
      req.end();
    });
  }

  it('answers an over-cap JSON sign-up with 413 and the standard envelope', async () => {
    const res = await request(server())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'x'.repeat(OVER), email: 'big@example.com', password: PASSWORD })
      .expect(413);
    expect(res.body).toEqual(TOO_LARGE);
    expect(await prisma.user.count()).toBe(0);
  });

  it('answers an over-cap CHUNKED sign-up (no Content-Length) with 413 and the envelope', async () => {
    const res = await chunkedSignUp(
      JSON.stringify({ name: 'x'.repeat(OVER * 2), email: 'big@example.com', password: PASSWORD }),
    );
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body)).toEqual(TOO_LARGE);
    expect(await prisma.user.count()).toBe(0);
  });

  it('still signs up from a small chunked body', async () => {
    const res = await chunkedSignUp(
      JSON.stringify({ name: 'Chunky', email: 'chunky@example.com', password: PASSWORD }),
    );
    expect(res.status).toBe(200);
    expect(await prisma.user.count()).toBe(1);
  });

  it('still signs up, signs out, signs in and reads the session for an ordinary caller', async () => {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Ada', email: 'ada@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/auth/sign-out').set('Origin', ORIGIN).expect(200);
    await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: 'ada@example.com', password: PASSWORD })
      .expect(200);
    const session = await agent.get('/api/auth/get-session').expect(200);
    expect(session.body.user.email).toBe('ada@example.com');
  });

  it('leaves a malformed body to Better Auth, which is not the parser’s 413', async () => {
    const res = await request(server())
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(413);
  });
});
