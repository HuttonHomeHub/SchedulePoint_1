import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **#539 — a finish milestone across calendars is dated where its logic puts it** (ADR-0207), through
 * the public API against a real database: the row-539 fixture's dates and float, as a planner computes
 * them by hand.
 *
 * Until 1.1 this file also proved the boot re-derivation that recalculated plans the old engine had
 * dated; that half read a marker row in `_prisma_migrations` which the 1.1 baseline no longer has
 * (ADR-0215), and it is at api-v1.0.0. This case never depended on it and is a current invariant.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

describe.skipIf(!hasDatabase)('finish milestone across calendars (e2e)', () => {
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

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await app?.close();
  });

  async function seed() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'ms', email: 'ms-cross-calendar@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Programme' })
      .expect(201);
    return { agent, projectId: project.body.data.id as string };
  }

  it('gives the row-539 fixture the dates and float a planner computes by hand, after a recalculation', async () => {
    const { agent, projectId } = await seed();
    const weekday = await agent
      .post('/api/v1/organizations/acme/calendars')
      .send({
        name: 'Weekday',
        shifts: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 480, endMinute: 960 })),
      })
      .expect(201);
    const weekend = await agent
      .post('/api/v1/organizations/acme/calendars')
      .send({
        name: 'Weekend',
        shifts: [5, 6].map((weekday) => ({ weekday, startMinute: 420, endMinute: 1140 })),
      })
      .expect(201);
    const planId = (
      await agent
        .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
        .send({ name: 'Row 539', plannedStart: '2027-06-14' })
        .expect(201)
    ).body.data as { id: string; version: number };
    await agent
      .patch(`/api/v1/organizations/acme/plans/${planId.id}`)
      .send({ calendarId: weekday.body.data.id, version: planId.version })
      .expect(200);
    const base = `/api/v1/organizations/acme/plans/${planId.id}`;
    const make = async (body: Record<string, unknown>) =>
      (await agent.post(`${base}/activities`).send(body).expect(201)).body.data.id as string;
    const a = await make({ name: 'A', code: 'A', durationMinutes: 5 * 480 });
    const w = await make({
      name: 'W',
      code: 'W',
      durationMinutes: 1440,
      calendarId: weekend.body.data.id,
      constraintType: 'SNET',
      constraintDate: '2027-06-26',
    });
    const m = await make({ name: 'M', code: 'M', type: 'FINISH_MILESTONE' });
    const k = await make({ name: 'K', code: 'K', durationMinutes: 5 * 480 });
    const f = await make({
      name: 'F',
      code: 'F',
      type: 'FINISH_MILESTONE',
      constraintType: 'FNLT',
      constraintDate: '2027-07-09',
    });
    for (const [from, to] of [
      [a, w],
      [w, m],
      [m, k],
      [k, f],
    ] as const) {
      await agent
        .post(`${base}/dependencies`)
        .send({ predecessorId: from, successorId: to })
        .expect(201);
    }
    await agent.post(`${base}/schedule/recalculate`).send({}).expect(200);

    const rows = (await agent.get(`${base}/activities`).expect(200)).body.data as Array<{
      id: string;
      earlyStart: string;
      earlyFinish: string;
      totalFloat: number;
    }>;
    const byId = new Map(rows.map((r) => [r.id, r]));
    // The milestone reads the Sunday the weekend work ends, the weekday work after it starts the next
    // morning, and the weekend task carries no float it did not earn.
    expect(byId.get(m)!.earlyFinish).toBe('2027-06-27');
    expect(byId.get(k)!.earlyStart).toBe('2027-06-28');
    expect(byId.get(w)!.totalFloat).toBe(0);
    // Five weekdays of slack before W's SNET, in the weekday calendar's days (float is stored in days).
    expect(byId.get(a)!.totalFloat).toBe(5);
  });
});
