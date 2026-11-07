import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { CrossPlanInstantRederiveService } from '../src/modules/schedule/cross-plan-instant-rederive.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **Cross-plan instants M3 — the boot re-derivation recalculates a linked chain once, upstream first,
 * and fills every plan's instants** (ADR-0212 D5). Against a real database, because the pending query
 * reads `_prisma_migrations` and the order's effect is only visible through the real staleness read.
 *
 * **The marker row is inserted by the test.** M3 ships the service dormant: the migration it keys on does
 * not exist until M4, so with no row the service must admit nothing (the first case pins that), and the
 * other cases insert a row of that name, as the migration's own application would.
 *
 * **The fixture, and why it discriminates** (the #385 fixture, ADR-0161 D8). Three plans in a chain
 * `Upstream → Middle → Downstream`, one activity each, linked FS across plans. They are CREATED downstream
 * first, so their UUID v7 ids sort `Downstream < Middle < Upstream`: an id order is exactly the reverse of
 * the order the chain needs. After a first programme recalculation the upstream activity is lengthened
 * (an input change; nothing recalculates on the server) and every plan's `schedule_computed_at` is set
 * before the marker. A correct run recalculates Upstream, then Middle, then Downstream, so the
 * lengthened duration reaches Downstream and nothing reads stale. **Verified red** by reversing the order
 * inside the service and again by ordering by plan id: Downstream is recalculated first against
 * Middle's old dates, so the freshness-stamp order assertion fails first, and the staleness and date
 * assertions fail on their own with it removed.
 *
 * The third case pins the pending set's boundary, each clause verified red: dropping the edge predicate
 * lets the unlinked plan in, dropping the plan's soft-delete filter lets a deleted plan in, and dropping
 * the link's keeps a plan whose only link is deleted.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const MARKER = '20261107120100_cross_plan_instants_marker';

interface ActivityDates {
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  visualEffectiveStart: string | null;
  visualEffectiveFinish: string | null;
  totalFloat: number | null;
  version: number;
}

describe.skipIf(!hasDatabase)('cross-plan instant boot re-derivation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rederive: CrossPlanInstantRederiveService;

  /** Insert the marker row M4's migration will leave, as `prisma migrate deploy` would. */
  async function insertMarker(): Promise<Date> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
       VALUES (gen_random_uuid()::text, repeat('0', 64), $1, now(), now(), 1)`,
      MARKER,
    );
    const rows = await prisma.$queryRaw<{ finishedAt: Date }[]>`
      SELECT "finished_at" AS "finishedAt" FROM "_prisma_migrations"
       WHERE "migration_name" = ${MARKER}`;
    return rows[0]!.finishedAt;
  }

  async function deleteMarker(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE "migration_name" = $1`,
      MARKER,
    );
  }

  const backdate = (planIds: string[]) =>
    prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "schedule_computed_at" = TIMESTAMPTZ '2000-01-01' WHERE "id" = ANY($1::uuid[])`,
      planIds,
    );

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    const { CrossPlanInstantRederiveService: Rederive } =
      await import('../src/modules/schedule/cross-plan-instant-rederive.service');
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
    await deleteMarker();
  });

  afterAll(async () => {
    await deleteMarker();
    await clearDomainData(prisma);
    await app?.close();
  });

  async function seed() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'xplan', email: 'xplan-instants@example.com', password: PASSWORD })
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
    const makePlan = async (name: string): Promise<string> =>
      (
        await agent
          .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
          .send({ name, plannedStart: '2026-01-05' })
          .expect(201)
      ).body.data.id as string;
    const makeActivity = async (planId: string, name: string): Promise<string> =>
      (
        await agent
          .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
          .send({ name, code: name.slice(0, 3).toUpperCase(), durationDays: 3 })
          .expect(201)
      ).body.data.id as string;

    // Created downstream first, so the ids sort against the chain (see the docblock).
    const downstream = await makePlan('Downstream');
    const middle = await makePlan('Middle');
    const upstream = await makePlan('Upstream');
    expect([downstream, middle, upstream].sort()).toEqual([downstream, middle, upstream]);

    const d = await makeActivity(downstream, 'Downstream work');
    const m = await makeActivity(middle, 'Middle work');
    const u = await makeActivity(upstream, 'Upstream work');
    const link = (predecessorActivityId: string, successorActivityId: string) =>
      agent
        .post('/api/v1/organizations/acme/cross-plan-dependencies')
        .send({ predecessorActivityId, successorActivityId })
        .expect(201);
    await link(u, m);
    await link(m, d);

    const programme = (planId: string) =>
      agent
        .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate-programme`)
        .send({})
        .expect(200);
    const summary = async (planId: string) =>
      (await agent.get(`/api/v1/organizations/acme/plans/${planId}/schedule/summary`).expect(200))
        .body.data as { scheduleStale?: boolean; staleUpstreamPlanIds?: string[] };
    const dates = async (activityId: string): Promise<ActivityDates> =>
      (await agent.get(`/api/v1/organizations/acme/activities/${activityId}`).expect(200)).body
        .data as ActivityDates;
    const lengthen = async (activityId: string, durationDays: number) => {
      const { version } = await dates(activityId);
      await agent
        .patch(`/api/v1/organizations/acme/activities/${activityId}`)
        .send({ durationDays, version })
        .expect(200);
    };
    const computedAt = async (planIds: string[]): Promise<Date[]> => {
      const rows = await prisma.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, scheduleComputedAt: true },
      });
      return planIds.map((id) => rows.find((r) => r.id === id)!.scheduleComputedAt!);
    };
    return {
      plans: { upstream, middle, downstream },
      acts: { u, m, d },
      makePlan,
      makeActivity,
      programme,
      summary,
      dates,
      lengthen,
      computedAt,
    };
  }

  it('is dormant while its marker migration has no row: stale linked plans are not pending', async () => {
    const s = await seed();
    const all = [s.plans.upstream, s.plans.middle, s.plans.downstream];
    await s.programme(s.plans.downstream);
    await backdate(all);
    expect(await rederive.pendingPlans()).toEqual([]);
    expect(await rederive.rederive()).toBe(0);

    // A rolled-back row admits nothing either: fail closed, as the four precedents do.
    await insertMarker();
    await prisma.$executeRawUnsafe(
      `UPDATE "_prisma_migrations" SET "rolled_back_at" = now() WHERE "migration_name" = $1`,
      MARKER,
    );
    expect(await rederive.pendingPlans()).toEqual([]);
  });

  it('recalculates a chain once, upstream first, fills the instants and leaves nothing stale', async () => {
    const s = await seed();
    const all = [s.plans.upstream, s.plans.middle, s.plans.downstream];
    await s.programme(s.plans.downstream);
    const before = await s.dates(s.acts.d);

    // An input change upstream that must reach the end of the chain, then the old freshness stamp.
    await s.lengthen(s.acts.u, 10);
    await backdate(all);
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "schedule_instants_computed_at" = NULL WHERE "id" = ANY($1::uuid[])`,
      all,
    );
    const markerFinished = await insertMarker();
    expect(
      (await rederive.pendingPlans()).map((p) => p.id).sort(),
      'all three are pending: each touches a live cross-plan edge and predates the marker',
    ).toEqual([...all].sort());

    expect(await rederive.rederive()).toBe(3);

    // All three recalculated, upstream first.
    const at = await s.computedAt(all);
    for (const stamp of at) expect(stamp.getTime()).toBeGreaterThan(markerFinished.getTime() - 1);
    expect(at[0]!.getTime()).toBeLessThanOrEqual(at[1]!.getTime());
    expect(at[1]!.getTime()).toBeLessThanOrEqual(at[2]!.getTime());

    // Every plan's instants are current: the marker D-4 reads equals the cursor.
    const rows = await prisma.$queryRaw<{ current: boolean }[]>`
      SELECT ("schedule_instants_computed_at" = "schedule_computed_at") AS "current"
        FROM "plans" WHERE "id" = ANY(${all}::uuid[])`;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.current)).toBe(true);

    // Nothing reads stale.
    expect((await s.summary(s.plans.middle)).scheduleStale).toBe(false);
    expect((await s.summary(s.plans.downstream)).scheduleStale).toBe(false);

    // The lengthened upstream reached the end of the chain, and the downstream's dates are exactly what a
    // programme recalculation produces from the same inputs.
    const after = await s.dates(s.acts.d);
    expect(after.earlyStart).not.toBe(before.earlyStart);
    await s.programme(s.plans.downstream);
    const reference = await s.dates(s.acts.d);
    const pick = ({ version: _version, ...rest }: ActivityDates) => rest;
    expect(pick(after)).toEqual(pick(reference));

    // Once: every plan was stamped, so a second run finds nothing.
    expect(await rederive.pendingPlans()).toEqual([]);
    expect(await rederive.rederive()).toBe(0);
  });

  it('leaves out a plan with no link, a plan never calculated, a deleted plan and a deleted link', async () => {
    const s = await seed();
    // Upstream and Middle only: the downstream is never calculated, so it has no stored dates to
    // replace and its NULL freshness stamp must keep it out of the set.
    await s.programme(s.plans.middle);
    // A fourth plan, calculated, with no link at all.
    const unlinked = await s.makePlan('Unlinked');
    await s.makeActivity(unlinked, 'Alone');
    await s.programme(unlinked);
    await backdate([unlinked, s.plans.upstream, s.plans.middle]);
    await insertMarker();
    expect((await rederive.pendingPlans()).map((p) => p.id).sort()).toEqual(
      [s.plans.upstream, s.plans.middle].sort(),
    );

    // A soft-deleted plan keeps its link rows and its old stamp, and must not be recalculated.
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "deleted_at" = now() WHERE "id" = $1::uuid`,
      s.plans.middle,
    );
    expect((await rederive.pendingPlans()).map((p) => p.id)).toEqual([s.plans.upstream]);
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "deleted_at" = NULL WHERE "id" = $1::uuid`,
      s.plans.middle,
    );

    // With the upstream link soft-deleted, the upstream plan touches no ACTIVE edge and leaves the set.
    await prisma.$executeRawUnsafe(
      `UPDATE "cross_plan_dependencies" SET "deleted_at" = now() WHERE "predecessor_plan_id" = $1::uuid`,
      s.plans.upstream,
    );
    expect((await rederive.pendingPlans()).map((p) => p.id)).toEqual([s.plans.middle]);
  });
});
