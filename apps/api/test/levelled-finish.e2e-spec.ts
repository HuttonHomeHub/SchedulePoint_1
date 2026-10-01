import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **`docs/specs/logic-aware-levelling/` C7: there are two "levelled finish" figures, and they disagree.**
 *
 * The recalculation response takes the engine's `leveledProjectFinish`, which counts a bar where it is
 * DRAWN (ADR-0166 D2). `GET …/schedule/summary`, which is what the strip reads, takes
 * `MAX(COALESCE(leveled_finish, early_finish))` over every activity in SQL
 * (`schedule.repository.ts`, `summarise`). An activity with no capped resource has no `leveled_finish`, so
 * the SQL counts it at its **early** finish and a hand-placed last bar is ignored: the strip's "Levelled
 * finish" reads earlier than its own "Finish".
 *
 * The plan: `X` and `Y` share a crane for three days each, so `Y` is levelled to 4-6 January. `Z` holds no
 * resource and is hand-placed on 20 January, so it is drawn 20-21 January while its early finish is 2
 * January. The engine says the levelled plan finishes on the 21st; the SQL says the 6th.
 *
 * The precondition `it` is the claim that its numbers are right. The second `it` was an `it.fails`,
 * recorded red by the orchestrator's `e2e-local.sh api` run on 2026-10-01 at 31c54d3, until M1 aligned
 * the SQL with the engine (`placed-finish.ts`, `leveledFinishSql`).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const ORG = '/api/v1/organizations/acme';

describe.skipIf(!hasDatabase)('Levelled finish — the response and the summary read (e2e)', () => {
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

  /** The plan above, recalculated with levelling on. Returns the recalculation response and the ids. */
  async function seedPlacedLastBarPlan() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'planner', email: 'planner@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent.post(`${ORG}/clients`).send({ name: 'Northgate' }).expect(201);
    const project = await agent
      .post(`${ORG}/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await agent
      .post(`${ORG}/projects/${project.body.data.id as string}/plans`)
      .send({ name: 'Levelled', plannedStart: '2026-01-01' })
      .expect(201);
    const planId = plan.body.data.id as string;
    // An all-days calendar, so a day offset is a calendar day (the apply-levelling spec's convention).
    await agent.patch(`${ORG}/plans/${planId}`).send({ calendarId: null, version: 1 }).expect(200);
    const crane = await agent
      .post(`${ORG}/resources`)
      .send({ name: 'Crane', kind: 'EQUIPMENT', maxUnitsPerHour: 1 })
      .expect(201);
    const make = async (name: string, extra: Record<string, unknown> = {}) => {
      const created = await agent
        .post(`${ORG}/plans/${planId}/activities`)
        .send({ name, durationDays: name === 'Z' ? 2 : 3, ...extra })
        .expect(201);
      return created.body.data.id as string;
    };
    const x = await make('X', { levelingPriority: 1 });
    const y = await make('Y', { levelingPriority: 2 });
    await make('Z', { visualStart: '2026-01-20' });
    for (const id of [x, y]) {
      await agent
        .post(`${ORG}/activities/${id}/assignments`)
        .send({ resourceId: crane.body.data.id as string, unitsPerHour: 1 })
        .expect(201);
    }
    const current = await agent.get(`${ORG}/plans/${planId}`).expect(200);
    await agent
      .patch(`${ORG}/plans/${planId}`)
      .send({ levelResources: true, version: current.body.data.version as number })
      .expect(200);
    const recalculated = await agent
      .post(`${ORG}/plans/${planId}/schedule/recalculate`)
      .send({})
      .expect(200);
    return { agent, planId, y, recalculated: recalculated.body.data as Record<string, unknown> };
  }

  const summaryOf = async (agent: ReturnType<typeof request.agent>, planId: string) =>
    (await agent.get(`${ORG}/plans/${planId}/schedule/summary`).expect(200)).body.data as Record<
      string,
      unknown
    >;

  it('precondition: Y is levelled to 6 January, Z is drawn to 21 January, and the engine finishes the levelled plan on the 21st', async () => {
    const { y, recalculated } = await seedPlacedLastBarPlan();
    const stored = await prisma.activity.findUniqueOrThrow({
      where: { id: y },
      select: { leveledFinish: true },
    });
    expect(stored.leveledFinish?.toISOString().slice(0, 10)).toBe('2026-01-06');
    expect(recalculated.projectFinish).toBe('2026-01-21');
    expect(recalculated.leveledProjectFinish).toBe('2026-01-21');
  });

  it('the summary read states the same levelled finish as the recalculation, and never before Finish', async () => {
    const { agent, planId, recalculated } = await seedPlacedLastBarPlan();
    const summary = await summaryOf(agent, planId);
    expect(summary.leveledProjectFinish).toBe(recalculated.leveledProjectFinish);
    expect(String(summary.leveledProjectFinish) >= String(summary.projectFinish)).toBe(true);
  });
});
