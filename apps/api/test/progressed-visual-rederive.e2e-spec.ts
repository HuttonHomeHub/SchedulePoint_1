import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import {
  PROGRESSED_VISUAL_MIGRATION,
  type ProgressedVisualRederiveService,
} from '../src/modules/schedule/progressed-visual-rederive.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **#421 M2-T2.2 — the boot re-derivation recalculates exactly the plans the old Pass 2 wrote, once, and
 * the plans downstream of them** (spec §4.4; product owner 2026-09-30, "all at once on release").
 * Against a real database, because the pending query reads `_prisma_migrations` and `activities`.
 *
 * **Staleness is manufactured, never the marker edited.** A plan is made to look computed by the old
 * engine by setting `schedule_computed_at` before the marker's `finished_at`; `_prisma_migrations` is
 * left alone. Seven plans in one organisation, each recalculated once first so all have real dates:
 *
 * - `ACTUALS` — an activity with an actual start: pending, and recalculated.
 * - `EF_ON` / `EF_OFF` — an activity with an `expected_finish`, with the plan option on / off: only the
 *   first is pending, because the option is what makes the value an input to Pass 2.
 * - `NONE` — no progress at all: not pending, and not downstream of anything: left alone.
 * - `DOWN` — no progress, but linked FS downstream of `ACTUALS`: not pending, and recalculated because
 *   its upstream was, which is what "every plan corrected" costs.
 * - `DELETED` — actuals, soft-deleted: not pending.
 * - `NEVER` — actuals, never calculated (`schedule_computed_at` NULL): not pending.
 *
 * **Verified red** by mutation of the service: dropping the `actual_start` branch of the `EXISTS` leaves
 * `ACTUALS` out; dropping the `use_expected_finish_dates` conjunct lets `EF_OFF` in; dropping the
 * downstream rule leaves `DOWN` stale at the 2000 stamp; dropping the `deleted_at` predicate on `plans`
 * lets `DELETED` in.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const OLD_STAMP = '2000-01-01';

describe.skipIf(!hasDatabase)('progressed-predecessor boot re-derivation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rederive: ProgressedVisualRederiveService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    const { ProgressedVisualRederiveService: Rederive } =
      await import('../src/modules/schedule/progressed-visual-rederive.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(Token);
    rederive = app.get(Rederive);
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
      .send({ name: 'pv', email: 'pv-rederive@example.com', password: PASSWORD })
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

    const makePlan = async (name: string) => {
      const planId = (
        await agent
          .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
          .send({ name, plannedStart: '2026-01-05' })
          .expect(201)
      ).body.data.id as string;
      const activity = (
        await agent
          .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
          .send({ name: `${name} work`, code: 'W', durationDays: 3 })
          .expect(201)
      ).body.data as { id: string; version: number };
      return { planId, activityId: activity.id, version: activity.version };
    };
    const start = (a: { activityId: string; version: number }) =>
      agent
        .patch(`/api/v1/organizations/acme/activities/${a.activityId}/progress`)
        .send({ percentComplete: 50, actualStart: '2026-01-05', version: a.version })
        .expect(200);

    const actuals = await makePlan('ACTUALS');
    const efOn = await makePlan('EF_ON');
    const efOff = await makePlan('EF_OFF');
    const none = await makePlan('NONE');
    const down = await makePlan('DOWN');
    const deleted = await makePlan('DELETED');
    const never = await makePlan('NEVER');

    await start(actuals);
    await start(deleted);
    await start(never);
    // The plan PATCH is optimistically locked, so it carries the version the read returns.
    const efOnPlan = await agent.get(`/api/v1/organizations/acme/plans/${efOn.planId}`).expect(200);
    await agent
      .patch(`/api/v1/organizations/acme/plans/${efOn.planId}`)
      .send({
        useExpectedFinishDates: true,
        version: (efOnPlan.body.data as { version: number }).version,
      })
      .expect(200);
    await prisma.$executeRawUnsafe(
      `UPDATE "activities" SET "expected_finish" = DATE '2026-01-30' WHERE "id" = ANY($1::uuid[])`,
      [efOn.activityId, efOff.activityId],
    );
    await agent
      .post('/api/v1/organizations/acme/cross-plan-dependencies')
      .send({ predecessorActivityId: actuals.activityId, successorActivityId: down.activityId })
      .expect(201);

    for (const p of [actuals, efOn, efOff, none, down, deleted]) {
      await agent
        .post(`/api/v1/organizations/acme/plans/${p.planId}/schedule/recalculate`)
        .send({})
        .expect(200);
    }
    const ids = {
      actuals: actuals.planId,
      efOn: efOn.planId,
      efOff: efOff.planId,
      none: none.planId,
      down: down.planId,
      deleted: deleted.planId,
      never: never.planId,
    };
    // As if the old engine had computed them all (and `NEVER` not at all), and one had been deleted since.
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "schedule_computed_at" = TIMESTAMPTZ '${OLD_STAMP}' WHERE "id" = ANY($1::uuid[])`,
      Object.values(ids).filter((id) => id !== ids.never),
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "schedule_computed_at" = NULL WHERE "id" = $1::uuid`,
      ids.never,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "deleted_at" = now() WHERE "id" = $1::uuid`,
      ids.deleted,
    );
    return { ids, agent };
  }

  /** The moment the marker migration finished: the service's marker. */
  async function marker(): Promise<Date> {
    const rows = await prisma.$queryRaw<{ finishedAt: Date }[]>`
      SELECT "finished_at" AS "finishedAt" FROM "_prisma_migrations"
       WHERE "migration_name" = ${PROGRESSED_VISUAL_MIGRATION}
         AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`;
    expect(rows).toHaveLength(1);
    return rows[0]!.finishedAt;
  }

  async function stamps(ids: string[]): Promise<Map<string, Date | null>> {
    const rows = await prisma.$queryRawUnsafe<{ id: string; at: Date | null }[]>(
      `SELECT "id", "schedule_computed_at" AS "at" FROM "plans" WHERE "id" = ANY($1::uuid[])`,
      ids,
    );
    return new Map(rows.map((r) => [r.id, r.at]));
  }

  it('recalculates the progressed plans and what is downstream of them, once, and nothing else', async () => {
    const { ids } = await seed();
    expect(
      (await rederive.pendingPlans()).map((p) => p.id).sort(),
      'only the actuals plan and the Expected-Finish-on plan are pending',
    ).toEqual([ids.actuals, ids.efOn].sort());

    // Three: the two pending plans, and DOWN because ACTUALS was recalculated upstream of it.
    expect(await rederive.rederive()).toBe(3);

    const at = await stamps(Object.values(ids));
    const finished = (await marker()).getTime();
    for (const recalculated of [ids.actuals, ids.efOn, ids.down]) {
      expect(at.get(recalculated)!.getTime(), recalculated).toBeGreaterThan(finished);
    }
    // ACTUALS is upstream of DOWN, so it was stamped first.
    expect(at.get(ids.actuals)!.getTime()).toBeLessThanOrEqual(at.get(ids.down)!.getTime());
    // Left exactly as they were: option off, no progress, deleted, never calculated.
    expect(at.get(ids.efOff)!.toISOString().slice(0, 10)).toBe(OLD_STAMP);
    expect(at.get(ids.none)!.toISOString().slice(0, 10)).toBe(OLD_STAMP);
    expect(at.get(ids.deleted)!.toISOString().slice(0, 10)).toBe(OLD_STAMP);
    expect(at.get(ids.never)).toBeNull();

    // Once: the recalculation stamped them, so the set is empty and a second run does nothing.
    expect(await rederive.pendingPlans()).toEqual([]);
    expect(await rederive.rederive()).toBe(0);
  });
});
