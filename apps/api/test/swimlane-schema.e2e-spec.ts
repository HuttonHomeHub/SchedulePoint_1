import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * The swimlane tables' database guarantees and lifecycle (swimlanes schema-design §4 Q2, §6),
 * before any route writes them: rows are created directly, which is the only way to reach them in
 * M1. Verified against the CI database image, because the case-insensitive name index folds
 * non-ASCII letters according to the database's collation, and the design measured it only on a
 * glibc `C.UTF-8` scratch database (§4 Q2, last bullet).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

describe.skipIf(!hasDatabase)('Swimlane tables (e2e)', () => {
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
    await clearDomainData(prisma);
    await app?.close();
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  const base = '/api/v1/organizations/acme';

  async function setup(): Promise<{
    agent: ReturnType<typeof request.agent>;
    orgId: string;
    planId: string;
    activityId: string;
  }> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    const org = await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent.post(`${base}/clients`).send({ name: 'Client' }).expect(201);
    const project = await agent
      .post(`${base}/clients/${client.body.data.id}/projects`)
      .send({ name: 'Project' })
      .expect(201);
    const plan = await agent
      .post(`${base}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Plan', plannedStart: '2026-01-01' })
      .expect(201);
    const orgId = org.body.data.id as string;
    const planId = plan.body.data.id as string;
    const activity = await prisma.activity.create({
      data: { organizationId: orgId, planId, name: 'Excavate', durationMinutes: 1440 },
      select: { id: true },
    });
    return { agent, orgId, planId, activityId: activity.id };
  }

  it('refuses a second active name that differs only in case, ASCII and non-ASCII alike', async () => {
    const { orgId, planId } = await setup();
    const make = (name: string, position: number, deletedAt?: Date) =>
      prisma.swimlane.create({
        data: { organizationId: orgId, planId, name, position, deletedAt: deletedAt ?? null },
      });

    await make('Électrique', 0);
    // É against é is the case that depends on the collation (§4 Q2): it must hold on CI's image.
    await expect(make('éLECTRIQUE', 1)).rejects.toMatchObject({
      code: 'P2002',
      constructor: Prisma.PrismaClientKnownRequestError,
    });
    await make('Groundworks', 2);
    await expect(make('GROUNDWORKS', 3)).rejects.toMatchObject({ code: 'P2002' });

    // A soft-deleted name does not block reuse; restoring onto a taken name is what conflicts.
    await make('Steel', 4, new Date('2026-02-01T00:00:00.000Z'));
    await make('steel', 5);
    // The same name in another plan is fine: uniqueness is per plan.
    const other = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: (await prisma.plan.findFirstOrThrow()).projectId,
        name: 'Other',
        plannedStart: new Date('2026-01-01'),
      },
    });
    await prisma.swimlane.create({
      data: { organizationId: orgId, planId: other.id, name: 'Groundworks', position: 0 },
    });
  });

  it('refuses a member naming another plan’s swimlane (composite foreign key)', async () => {
    const { orgId, planId, activityId } = await setup();
    const other = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: (await prisma.plan.findFirstOrThrow({ where: { id: planId } })).projectId,
        name: 'Other',
        plannedStart: new Date('2026-01-01'),
      },
    });
    const foreign = await prisma.swimlane.create({
      data: { organizationId: orgId, planId: other.id, name: 'Foreign', position: 0 },
    });
    await expect(
      prisma.activity.update({ where: { id: activityId }, data: { swimlaneId: foreign.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('stamps a plan’s swimlanes into its delete batch and restores them with it', async () => {
    const { agent, orgId, planId, activityId } = await setup();
    const swimlane = await prisma.swimlane.create({
      data: { organizationId: orgId, planId, name: 'Groundworks', position: 0 },
    });
    // Deleted on its own earlier: it carries its own batch, so the plan's restore must not revive it.
    const earlier = await prisma.swimlane.create({
      data: {
        organizationId: orgId,
        planId,
        name: 'Earlier',
        position: 1,
        deletedAt: new Date('2026-02-01T00:00:00.000Z'),
        deleteBatchId: '00000000-0000-7000-8000-000000000001',
      },
    });
    await prisma.activity.update({ where: { id: activityId }, data: { swimlaneId: swimlane.id } });
    await prisma.activitySwimlaneLane.create({
      data: {
        organizationId: orgId,
        activityId,
        basis: 'SWIMLANE',
        swimlaneId: swimlane.id,
        laneIndex: 3,
      },
    });

    await agent.delete(`${base}/plans/${planId}`).expect(204);
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
    const deleted = await prisma.swimlane.findUniqueOrThrow({ where: { id: swimlane.id } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.deleteBatchId).toBe(plan.deleteBatchId);
    expect(
      (await prisma.swimlane.findUniqueOrThrow({ where: { id: earlier.id } })).deleteBatchId,
    ).toBe('00000000-0000-7000-8000-000000000001');

    await agent.post(`${base}/plans/${planId}/restore`).expect(200);
    const restored = await prisma.swimlane.findUniqueOrThrow({ where: { id: swimlane.id } });
    expect(restored.deletedAt).toBeNull();
    expect(restored.deleteBatchId).toBeNull();
    expect(
      (await prisma.swimlane.findUniqueOrThrow({ where: { id: earlier.id } })).deletedAt,
    ).not.toBeNull();
    // Membership and the remembered lane were never touched by either step.
    expect(
      (await prisma.activity.findUniqueOrThrow({ where: { id: activityId } })).swimlaneId,
    ).toBe(swimlane.id);
    expect(await prisma.activitySwimlaneLane.count({ where: { activityId } })).toBe(1);
  });
});
