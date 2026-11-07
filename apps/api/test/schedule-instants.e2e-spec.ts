import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **The schedule instants, written by the real statement and read back from a real database**
 * (ADR-0212, `docs/specs/cross-plan-instants/m2-schema-design.md` §8).
 *
 * `schedule.repository.day-factor.spec.ts` asserts the arguments handed to a MOCKED `$executeRaw`,
 * so it cannot see a missing `SET` entry, a wrong cast, or a session `TimeZone` shifting the value.
 * This is the half that can. It also owns the two CHECKs and the rollback simulation, because those
 * are statements about the database rather than about the repository.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface InstantRow {
  code: string;
  start: number;
  finish: number;
  lateStart: number;
  lateFinish: number;
}

describe.skipIf(!hasDatabase)('schedule instants (e2e)', () => {
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

  const org = '/api/v1/organizations/acme';

  async function planWithActivities(): Promise<{
    agent: ReturnType<typeof request.agent>;
    planId: string;
    ids: string[];
  }> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'instants-admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent.post(`${org}/clients`).send({ name: 'C' }).expect(201);
    const project = await agent
      .post(`${org}/clients/${client.body.data.id}/projects`)
      .send({ name: 'P' })
      .expect(201);
    const plan = await agent
      .post(`${org}/projects/${project.body.data.id}/plans`)
      .send({ name: 'Instants', plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const ids: string[] = [];
    for (const [code, type] of [
      ['A', 'TASK'],
      ['B', 'TASK'],
      ['M', 'FINISH_MILESTONE'],
      ['S', 'WBS_SUMMARY'],
    ] as const) {
      const res = await agent
        .post(`${org}/plans/${planId}/activities`)
        .send({ name: code, code, type, ...(type === 'TASK' ? { durationDays: 3 } : {}) })
        .expect(201);
      ids.push(res.body.data.id as string);
    }
    await agent
      .post(`${org}/plans/${planId}/dependencies`)
      .send({ predecessorId: ids[0], successorId: ids[1], type: 'FS' })
      .expect(201);
    return { agent, planId, ids };
  }

  const recalculate = (agent: ReturnType<typeof request.agent>, planId: string) =>
    agent.post(`${org}/plans/${planId}/schedule/recalculate`).send({}).expect(200);

  /** The stored instants as whole minutes since the epoch, read in the CURRENT session zone. */
  async function minutes(planId: string): Promise<InstantRow[]> {
    return prisma.$queryRaw<InstantRow[]>`
      SELECT code,
             (extract(epoch FROM visual_effective_start_instant) / 60)::float8 AS start,
             (extract(epoch FROM visual_effective_finish_instant) / 60)::float8 AS finish,
             (extract(epoch FROM late_start_instant) / 60)::float8 AS "lateStart",
             (extract(epoch FROM late_finish_instant) / 60)::float8 AS "lateFinish"
      FROM activities WHERE plan_id = ${planId}::uuid ORDER BY code`;
  }

  it('writes all four instants for every activity type, and the marker equals the cursor', async () => {
    const { agent, planId } = await planWithActivities();

    // Before any recalculation nothing is written: NULL reads the date (FC-5).
    const before = await prisma.activity.findMany({ where: { planId } });
    expect(before.every((a) => a.visualEffectiveStartInstant === null)).toBe(true);

    await recalculate(agent, planId);

    const rows = await minutes(planId);
    expect(rows.map((r) => r.code)).toEqual(['A', 'B', 'M', 'S']);
    for (const r of rows) {
      for (const v of [r.start, r.finish, r.lateStart, r.lateFinish]) {
        expect(Number.isInteger(v), `${r.code} holds a whole minute`).toBe(true);
      }
    }
    // A runs three working days from the data date and B follows it, so B starts no earlier.
    const a = rows.find((r) => r.code === 'A')!;
    const b = rows.find((r) => r.code === 'B')!;
    expect(a.finish).toBeGreaterThan(a.start);
    expect(b.start).toBeGreaterThanOrEqual(a.finish);

    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
    expect(plan.scheduleComputedAt).not.toBeNull();
    expect(plan.scheduleInstantsComputedAt?.getTime()).toBe(plan.scheduleComputedAt?.getTime());
  });

  it('round-trips the minute under a +12:45 session zone, a pre-1970 value included', async () => {
    const { agent, planId, ids } = await planWithActivities();
    await recalculate(agent, planId);
    const { ScheduleRepository } = await import('../src/modules/schedule/schedule.repository');
    const repo = app.get(ScheduleRepository);

    // A pre-1970 minute (negative), and a finish on a 24-hour calendar's midnight.
    const preEpoch = Date.UTC(1969, 6, 20, 20, 17) / 60000;
    const midnight = Date.UTC(2027, 2, 1, 0, 0) / 60000;
    const result = (activityId: string, start: number, finish: number) => ({
      activityId,
      earlyStart: '2026-01-05',
      earlyFinish: '2026-01-07',
      lateStart: '2026-01-05',
      lateFinish: '2026-01-07',
      totalFloat: 0,
      freeFloat: 0,
      isCritical: false,
      isNearCritical: false,
      constraintViolated: false,
      loeNoSpan: false,
      resourceDriverMissing: false,
      visualEffectiveStart: '2026-01-05',
      visualEffectiveFinish: '2026-01-07',
      visualConflict: false,
      visualConflictReason: null,
      visualDriftMinutes: null,
      remainingFloatMinutes: 0,
      leveledStart: null,
      leveledFinish: null,
      levelingDelayMinutes: null,
      levelingWindowExceeded: false,
      selfOverAllocated: false,
      placedStartInstant: start,
      placedFinishInstant: finish,
      lateStartInstant: start + 1,
      lateFinishInstant: finish + 1,
    });
    const organizationId = (await prisma.plan.findUniqueOrThrow({ where: { id: planId } }))
      .organizationId;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Pacific/Chatham'`);
      await repo.writeResults(
        organizationId,
        planId,
        [
          result(ids[0]!, preEpoch, preEpoch + 60),
          result(ids[1]!, midnight - 1440, midnight),
        ] as never,
        new Map(),
        tx,
      );
    });

    // Read back in a DIFFERENT session zone than the one it was written in, and through Prisma.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Pacific/Chatham'`);
      const rows = await tx.$queryRaw<{ id: string; start: number; late: number }[]>`
        SELECT id,
               (extract(epoch FROM visual_effective_start_instant) / 60)::float8 AS start,
               (extract(epoch FROM late_finish_instant) / 60)::float8 AS late
        FROM activities WHERE id IN (${ids[0]}::uuid, ${ids[1]}::uuid)`;
      const first = rows.find((r) => r.id === ids[0])!;
      const second = rows.find((r) => r.id === ids[1])!;
      expect(first.start).toBe(preEpoch);
      expect(second.late).toBe(midnight + 1);
    });
    const viaPrisma = await prisma.activity.findUniqueOrThrow({ where: { id: ids[0]! } });
    expect(viaPrisma.visualEffectiveStartInstant!.getTime() / 60000).toBe(preEpoch);
    expect(viaPrisma.visualEffectiveFinishInstant!.getTime() / 60000).toBe(preEpoch + 60);
    const viaPrismaB = await prisma.activity.findUniqueOrThrow({ where: { id: ids[1]! } });
    expect(viaPrismaB.visualEffectiveFinishInstant!.getTime() / 60000).toBe(midnight);
    expect(viaPrismaB.lateStartInstant!.getTime() / 60000).toBe(midnight - 1440 + 1);
  });

  describe('the two CHECK constraints', () => {
    const dateCols = `visual_effective_start = '2026-01-05', visual_effective_finish = '2026-01-07', late_start = '2026-01-05', late_finish = '2026-01-07'`;

    it('refuses three instants and one NULL (activities, 23514)', async () => {
      const { planId } = await planWithActivities();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE activities SET ${dateCols}, visual_effective_start_instant = now(),
             visual_effective_finish_instant = now(), late_start_instant = now()
           WHERE plan_id = '${planId}'::uuid AND code = 'A'`,
        ),
      ).rejects.toThrow(/ck_activities_schedule_instants_all_or_none_with_dates|23514/);
    });

    it('refuses four instants beside a NULL date (activities, 23514)', async () => {
      const { planId } = await planWithActivities();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE activities SET visual_effective_start = '2026-01-05', visual_effective_finish = '2026-01-07',
             late_start = NULL, late_finish = '2026-01-07',
             visual_effective_start_instant = now(), visual_effective_finish_instant = now(),
             late_start_instant = now(), late_finish_instant = now()
           WHERE plan_id = '${planId}'::uuid AND code = 'A'`,
        ),
      ).rejects.toThrow(/ck_activities_schedule_instants_all_or_none_with_dates|23514/);
    });

    it('refuses a marker with no cursor (plans, 23514)', async () => {
      const { planId } = await planWithActivities();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE plans SET schedule_computed_at = NULL, schedule_instants_computed_at = now()
           WHERE id = '${planId}'::uuid`,
        ),
      ).rejects.toThrow(/ck_plans_schedule_instants_requires_cursor|23514/);
    });

    it('accepts an older image’s write beside current instants, and the freshness rule reads false', async () => {
      const { agent, planId } = await planWithActivities();
      await recalculate(agent, planId);

      // What an image that predates the columns does: dates and the cursor, in its own transaction,
      // naming neither the instants nor the marker. Both CHECKs must let it through.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE activities SET late_start = '2026-02-02', late_finish = '2026-02-03'
           WHERE plan_id = '${planId}'::uuid`,
        );
        await tx.$executeRawUnsafe(
          `UPDATE plans SET schedule_computed_at = now() + interval '1 second'
           WHERE id = '${planId}'::uuid`,
        );
      });

      const [row] = await prisma.$queryRaw<{ fresh: boolean }[]>`
        SELECT (schedule_instants_computed_at = schedule_computed_at) AS fresh
        FROM plans WHERE id = ${planId}::uuid`;
      expect(row!.fresh).toBe(false);
    });
  });
});
