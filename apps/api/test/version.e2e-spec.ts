import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';

/**
 * End-to-end test for the public build-version endpoint. Boots the real Nest app
 * (global pipe, filter, interceptor, guards) and asserts `GET /api/v1/version` is
 * reachable without a session and returns the standard `{ data: { version } }`
 * envelope. Gated on a database only because booting AppModule connects Prisma.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('Version (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the API version without authentication (200)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/version').expect(200);
    expect(typeof res.body.data.version).toBe('string');
    expect(res.body.data.version.length).toBeGreaterThan(0);
  });
});
