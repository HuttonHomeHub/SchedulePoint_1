import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **`docs/specs/apply-levelled-dates/`: the API cases A1-A4 for `GET …/schedule/levelling-application`.**
 *
 * Written in M0 as `it.fails` while the route did not exist (docs/TESTING.md forbids a skipped test and
 * `main` cannot carry a red one); M1 added the route and flipped them to plain `it`, with no assertion
 * changed.
 *
 * **Each case opens with a positive assertion on the route** (a Planner gets 200), so none can pass
 * for the wrong reason: a missing route answers 404 to everyone, which would otherwise satisfy A3's
 * "another organisation's plan is 404" on its own (ADR-0110).
 *
 * Every plan is built through the public REST API (ADR-0066). It is the `capability-levelling` shape
 * (three 3-day lifts on one crane, priorities 1 to 3) on an all-days-work calendar, so a day offset is
 * a calendar day and the expected dates read straight off the arithmetic.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface Ref {
  id: string;
  version: number;
}

interface PlacementRow {
  id: string;
  version: number;
  constraintType: string | null;
  constraintDate: string | null;
  visualStart: string | null;
  laneIndex: number | null;
}

describe.skipIf(!hasDatabase)('Apply levelled dates — the preview read (e2e)', () => {
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

  const orgBase = '/api/v1/organizations/acme';
  const previewUrl = (planId: string, org = 'acme') =>
    `/api/v1/organizations/${org}/plans/${planId}/schedule/levelling-application`;
  const placementsUrl = (planId: string) => `${orgBase}/plans/${planId}/activities/placements`;

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  /** Three 3-day lifts on one crane, levelling on. `bConstraint` is carried by the second lift. */
  async function seedLevelledPlan(bConstraint?: { type: string; date: string }) {
    const actor = await signUp('planner@example.com');
    const org = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await actor.agent
      .post(`${orgBase}/clients`)
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await actor.agent
      .post(`${orgBase}/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await actor.agent
      .post(`${orgBase}/projects/${project.body.data.id as string}/plans`)
      .send({ name: 'Levelled', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    await actor.agent
      .patch(`${orgBase}/plans/${planId}`)
      .send({ calendarId: null, version: 1 })
      .expect(200);
    const crane = await actor.agent
      .post(`${orgBase}/resources`)
      .send({ name: 'Crane', kind: 'EQUIPMENT', maxUnitsPerHour: 1 })
      .expect(201);
    const refs: Ref[] = [];
    for (const [index, name] of ['A', 'B', 'C'].entries()) {
      const extra =
        name === 'B' && bConstraint
          ? { constraintType: bConstraint.type, constraintDate: bConstraint.date }
          : {};
      const created = await actor.agent
        .post(`${orgBase}/plans/${planId}/activities`)
        .send({ name, durationDays: 3, levelingPriority: index + 1, ...extra })
        .expect(201);
      const id = created.body.data.id as string;
      await actor.agent
        .post(`${orgBase}/activities/${id}/assignments`)
        .send({ resourceId: crane.body.data.id as string, unitsPerHour: 1 })
        .expect(201);
      refs.push({ id, version: created.body.data.version as number });
    }
    const current = await actor.agent.get(`${orgBase}/plans/${planId}`).expect(200);
    await actor.agent
      .patch(`${orgBase}/plans/${planId}`)
      .send({ levelResources: true, version: current.body.data.version as number })
      .expect(200);
    await actor.agent.post(`${orgBase}/plans/${planId}/schedule/recalculate`).send({}).expect(200);
    return { actor, orgId: org.body.data.id as string, planId, refs };
  }

  it('A1: the rows the preview returns, written and recalculated, leave what it predicted', async () => {
    const { actor, planId } = await seedLevelledPlan();
    const preview = await actor.agent.get(previewUrl(planId)).expect(200);
    const { rows, remainingAfterApply } = preview.body.data as {
      rows: PlacementRow[];
      remainingAfterApply: number;
    };
    expect(rows.length).toBeGreaterThan(0);
    await actor.agent.patch(placementsUrl(planId)).send({ placements: rows }).expect(200);
    const recalculated = await actor.agent
      .post(`${orgBase}/plans/${planId}/schedule/recalculate`)
      .send({})
      .expect(200);
    expect(recalculated.body.data.leveledActivityCount).toBe(remainingAfterApply);
  });

  it('A2: the preview writes nothing', async () => {
    const { actor, planId, refs } = await seedLevelledPlan();
    const read = () =>
      prisma.activity.findMany({
        where: { id: { in: refs.map((r) => r.id) } },
        orderBy: { id: 'asc' },
        select: { id: true, version: true, visualStart: true, updatedAt: true },
      });
    const before = await read();
    await actor.agent.get(previewUrl(planId)).expect(200);
    expect(await read()).toEqual(before);
  });

  it('A3: a Planner may read it; a Contributor and a Viewer may not; another organisation cannot', async () => {
    const { actor, orgId, planId } = await seedLevelledPlan();
    await actor.agent.get(previewUrl(planId)).expect(200);

    const contributor = await signUp('contrib@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: contributor.userId, role: 'CONTRIBUTOR' },
    });
    await contributor.agent.get(previewUrl(planId)).expect(403);

    const viewer = await signUp('viewer@example.com');
    await prisma.orgMember.create({
      data: { organizationId: orgId, userId: viewer.userId, role: 'VIEWER' },
    });
    await viewer.agent.get(previewUrl(planId)).expect(403);

    const outsider = await signUp('outsider@example.com');
    await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);
    await outsider.agent.get(previewUrl(planId, 'other')).expect(404);
  });

  it('A4: a row carries the activity constraint unchanged, and none where there is none', async () => {
    const { actor, planId, refs } = await seedLevelledPlan({ type: 'SNET', date: '2026-01-02' });
    const preview = await actor.agent.get(previewUrl(planId)).expect(200);
    const rows = (preview.body.data as { rows: PlacementRow[] }).rows;
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(refs[1]!.id)).toMatchObject({
      constraintType: 'SNET',
      constraintDate: '2026-01-02',
    });
    for (const other of [refs[0]!, refs[2]!]) {
      const row = byId.get(other.id);
      if (row) expect(row).toMatchObject({ constraintType: null, constraintDate: null });
    }
    await actor.agent.patch(placementsUrl(planId)).send({ placements: rows }).expect(200);
    const stored = await prisma.activity.findUniqueOrThrow({
      where: { id: refs[1]!.id },
      select: { constraintType: true },
    });
    expect(stored.constraintType).toBe('SNET');
  });
});
