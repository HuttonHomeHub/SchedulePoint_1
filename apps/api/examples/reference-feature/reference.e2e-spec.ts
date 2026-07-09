import { VersioningType, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthContextService } from '../src/common/auth/auth-context.service';
import { OrganizationRole, Principal } from '../src/common/auth/principal';
import type { PrismaService } from '../src/prisma/prisma.service';
import { referencePermissionsForRole } from '../src/modules/reference/reference-permissions';

/**
 * End-to-end HTTP tests for the reference feature — the API-test template.
 * Boots the real Nest app (global pipe, filter, interceptor, guards) against a
 * real PostgreSQL, and overrides the authentication seam to inject a test
 * principal (the standard NestJS pattern — production auth stays deny-by-default).
 *
 * Requires a database: run in CI (Postgres service + `prisma migrate deploy`).
 * Skipped locally when DATABASE_URL is unset. `AppModule` is imported lazily so
 * a skipped run never triggers configuration validation. See docs/TESTING.md.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const ORGANIZATION = '018f4e8a-7b2c-7c3d-8e4f-1a2b3c4d5e6f';
const USER = '018f4e8a-9a1b-7c2d-8e3f-4a5b6c7d8e9f';

describe.skipIf(!hasDatabase)('Reference API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const principal = new Principal(USER, [
    {
      organizationId: ORGANIZATION,
      role: OrganizationRole.ORG_ADMIN,
      permissions: referencePermissionsForRole(OrganizationRole.ORG_ADMIN),
    },
  ]);
  const base = '/api/v1/reference-items';

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthContextService)
      .useValue({ resolve: () => Promise.resolve(principal) })
      .compile();

    app = moduleRef.createNestApplication({ bufferLogs: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    prisma = app.get(PrismaServiceToken);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await prisma.referenceItem.deleteMany();
  });

  const create = (name = 'First item') =>
    request(app.getHttpServer()).post(base).send({ organizationId: ORGANIZATION, name });

  it('creates an item (201) in the standard envelope', async () => {
    const res = await create('My item').expect(201);
    expect(res.body.data).toMatchObject({
      name: 'My item',
      organizationId: ORGANIZATION,
      version: 1,
    });
    expect(res.body.data.id).toEqual(expect.any(String));
    // Correlation id is returned for traceability.
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('rejects an invalid payload with 422', async () => {
    const res = await request(app.getHttpServer())
      .post(base)
      .send({ organizationId: 'not-a-uuid', name: '' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('lists items with pagination metadata', async () => {
    await create('A').expect(201);
    await create('B').expect(201);
    const res = await request(app.getHttpServer())
      .get(base)
      .query({ organizationId: ORGANIZATION, limit: 1 })
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ hasMore: true });
    expect(res.body.meta.nextCursor).toEqual(expect.any(String));
  });

  it('fetches an item by id (200) and 404s for a missing one', async () => {
    const created = await create('Fetch me').expect(201);
    const id = created.body.data.id as string;
    await request(app.getHttpServer()).get(`${base}/${id}`).expect(200);
    await request(app.getHttpServer())
      .get(`${base}/018f0000-0000-7000-8000-000000000000`)
      .expect(404);
  });

  it('enforces optimistic locking on update (409 on stale version)', async () => {
    const created = await create('Editable').expect(201);
    const id = created.body.data.id as string;

    const updated = await request(app.getHttpServer())
      .patch(`${base}/${id}`)
      .send({ name: 'Renamed', version: 1 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ name: 'Renamed', version: 2 });

    await request(app.getHttpServer())
      .patch(`${base}/${id}`)
      .send({ name: 'Stale', version: 1 })
      .expect(409);
  });

  it('soft-deletes (204) and then 404s and hides from lists', async () => {
    const created = await create('Delete me').expect(201);
    const id = created.body.data.id as string;

    await request(app.getHttpServer()).delete(`${base}/${id}`).expect(204);
    await request(app.getHttpServer()).get(`${base}/${id}`).expect(404);

    const list = await request(app.getHttpServer())
      .get(base)
      .query({ organizationId: ORGANIZATION })
      .expect(200);
    expect(list.body.data).toHaveLength(0);
  });
});
