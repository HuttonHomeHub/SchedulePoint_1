import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import {
  MILESTONE_CROSS_CALENDAR_MIGRATION,
  type MilestoneRederiveService,
} from '../src/modules/schedule/milestone-rederive.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **#539 M4-T1 — the boot re-derivation recalculates exactly the plans a zero-span activity's old snap
 * wrote dates for, once** (spec §4.5; product owner 2026-10-26, "every affected plan at the first boot").
 * Against a real database, because the pending query reads `_prisma_migrations`, `activities` and
 * `cross_plan_dependencies`.
 *
 * **Staleness is manufactured, never the marker edited.** A plan is made to look computed by the old
 * engine by setting `schedule_computed_at` before the marker's `finished_at`; `_prisma_migrations` is
 * left alone. Each plan is recalculated once first so all have real dates. The eight outcomes the
 * database-architect's design lists (`docs/DATABASE.md` "Re-derivation markers"):
 *
 * - `MILESTONE` — holds a `FINISH_MILESTONE`: pending.
 * - `ZERO_TASK` — holds a zero-duration `TASK`: pending.
 * - `HAMMOCK` — only a zero-duration level-of-effort and a zero-duration WBS summary, which store 0 by
 *   construction: NOT pending (or every plan with a summary would be).
 * - `UP` — no zero-span activity of its own, with an OUTGOING cross-plan link to a milestone in `DOWN`:
 *   pending, because the derivation no longer back-rolls that milestone's late date (the case the spec's
 *   first draft missed).
 * - `DELETED` — a milestone, soft-deleted: not pending.
 * - `NEVER` — a milestone, never calculated (`schedule_computed_at` NULL): not pending.
 * - `FRESH` — a milestone, calculated after the marker: not pending, the fixed engine wrote it.
 * - a second run: nothing pending, and `rederive()` recalculates 0.
 *
 * **Verified red** by mutation of the service: dropping the outgoing `EXISTS` leaves `UP` out; adding
 * LOE and WBS_SUMMARY to the zero-span predicate lets `HAMMOCK` in; dropping the `deleted_at` predicate on
 * `plans` lets `DELETED` in; dropping the milestone-type disjunct leaves a milestone stored with a
 * non-zero duration out.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const OLD_STAMP = '2000-01-01';

describe.skipIf(!hasDatabase)('zero-span boot re-derivation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rederive: MilestoneRederiveService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    const { MilestoneRederiveService: Rederive } =
      await import('../src/modules/schedule/milestone-rederive.service');
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
      .send({ name: 'ms', email: 'ms-rederive@example.com', password: PASSWORD })
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

    /** A plan with one ordinary task, plus whatever the case adds. */
    const makePlan = async (name: string, extra: Array<Record<string, unknown>> = []) => {
      const planId = (
        await agent
          .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
          .send({ name, plannedStart: '2026-01-05' })
          .expect(201)
      ).body.data.id as string;
      const create = async (body: Record<string, unknown>) =>
        (
          await agent
            .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
            .send(body)
            .expect(201)
        ).body.data as { id: string };
      const work = await create({ name: `${name} work`, code: 'W', durationDays: 3 });
      const added: Array<{ id: string }> = [];
      for (const body of extra) added.push(await create(body));
      return { planId, workId: work.id, added };
    };

    const milestone = await makePlan('MILESTONE', [{ name: 'Done', type: 'FINISH_MILESTONE' }]);
    const zeroTask = await makePlan('ZERO_TASK', [{ name: 'Sign-off', durationMinutes: 0 }]);
    const hammock = await makePlan('HAMMOCK', [
      { name: 'Supervision', type: 'LEVEL_OF_EFFORT' },
      { name: 'Phase', type: 'WBS_SUMMARY' },
    ]);
    const up = await makePlan('UP');
    const down = await makePlan('DOWN', [{ name: 'Handover', type: 'FINISH_MILESTONE' }]);
    const deleted = await makePlan('DELETED', [{ name: 'Done', type: 'FINISH_MILESTONE' }]);
    const never = await makePlan('NEVER', [{ name: 'Done', type: 'FINISH_MILESTONE' }]);
    const fresh = await makePlan('FRESH', [{ name: 'Done', type: 'FINISH_MILESTONE' }]);
    // No zero-span activity of their own, three ways of still being near one.
    const incomingOnly = await makePlan('INCOMING_ONLY');
    const deadLink = await makePlan('DEAD_LINK');
    const deadMilestone = await makePlan('DEAD_MILESTONE', [
      { name: 'Gone', type: 'FINISH_MILESTONE' },
    ]);

    // UP has no zero-span activity of its own: its work is linked to DOWN's milestone, across plans.
    await agent
      .post('/api/v1/organizations/acme/cross-plan-dependencies')
      .send({ predecessorActivityId: up.workId, successorActivityId: down.added[0]!.id })
      .expect(201);

    // INCOMING_ONLY has no outgoing link: its work is the successor of a milestone in FRESH, a plan the fixed
    // engine computed, so only the incoming arm of the query can reach it.
    await agent
      .post('/api/v1/organizations/acme/cross-plan-dependencies')
      .send({ predecessorActivityId: fresh.added[0]!.id, successorActivityId: incomingOnly.workId })
      .expect(201);
    // DEAD_LINK's work was linked out to DOWN's milestone and the link has since been deleted.
    const dead = await agent
      .post('/api/v1/organizations/acme/cross-plan-dependencies')
      .send({ predecessorActivityId: deadLink.workId, successorActivityId: down.added[0]!.id })
      .expect(201);
    await prisma.$executeRawUnsafe(
      `UPDATE "cross_plan_dependencies" SET "deleted_at" = now() WHERE "id" = $1::uuid`,
      dead.body.data.id,
    );
    // DEAD_MILESTONE's only milestone is soft-deleted.
    await prisma.$executeRawUnsafe(
      `UPDATE "activities" SET "deleted_at" = now() WHERE "id" = $1::uuid`,
      deadMilestone.added[0]!.id,
    );
    // The LOE and the WBS summary store 0 by construction; say so rather than rely on the API doing it.
    await prisma.$executeRawUnsafe(
      `UPDATE "activities" SET "duration_minutes" = 0 WHERE "plan_id" = $1::uuid AND "type" IN ('LEVEL_OF_EFFORT', 'WBS_SUMMARY')`,
      hammock.planId,
    );
    const stored = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "activities" WHERE "plan_id" = $1::uuid AND "type" IN ('LEVEL_OF_EFFORT', 'WBS_SUMMARY') AND "duration_minutes" = 0`,
      hammock.planId,
    );
    expect(stored[0]!.n, 'the hammock plan holds exactly its LOE and its summary, both at 0').toBe(
      2,
    );

    for (const p of [
      milestone,
      zeroTask,
      hammock,
      up,
      down,
      deleted,
      fresh,
      incomingOnly,
      deadLink,
      deadMilestone,
    ]) {
      await agent
        .post(`/api/v1/organizations/acme/plans/${p.planId}/schedule/recalculate`)
        .send({})
        .expect(200);
    }
    const ids = {
      milestone: milestone.planId,
      zeroTask: zeroTask.planId,
      hammock: hammock.planId,
      up: up.planId,
      down: down.planId,
      deleted: deleted.planId,
      never: never.planId,
      fresh: fresh.planId,
      incomingOnly: incomingOnly.planId,
      deadLink: deadLink.planId,
      deadMilestone: deadMilestone.planId,
    };
    // As if the old engine had computed them all (`NEVER` not at all, `FRESH` after the marker).
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "schedule_computed_at" = TIMESTAMPTZ '${OLD_STAMP}' WHERE "id" = ANY($1::uuid[])`,
      Object.values(ids).filter((id) => id !== ids.never && id !== ids.fresh),
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "schedule_computed_at" = NULL WHERE "id" = $1::uuid`,
      ids.never,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "deleted_at" = now() WHERE "id" = $1::uuid`,
      ids.deleted,
    );
    return { ids, agent, up, down, projectId: project.body.data.id as string };
  }

  /** The moment the marker migration finished: the service's marker. */
  async function marker(): Promise<Date> {
    const rows = await prisma.$queryRaw<{ finishedAt: Date }[]>`
      SELECT "finished_at" AS "finishedAt" FROM "_prisma_migrations"
       WHERE "migration_name" = ${MILESTONE_CROSS_CALENDAR_MIGRATION}
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

  it('recalculates the plans holding or linked to a zero-span activity, once, and nothing else', async () => {
    const { ids } = await seed();
    expect(
      (await rederive.pendingPlans()).map((p) => p.id).sort(),
      'a milestone, a zero-duration task, the plan linked out to a milestone, that milestone’s plan, and the plan linked IN from a milestone',
    ).toEqual([ids.milestone, ids.zeroTask, ids.up, ids.down, ids.incomingOnly].sort());

    // Five: each pending plan once. DOWN is also downstream of UP, but it is recalculated once only.
    expect(await rederive.rederive()).toBe(5);

    const at = await stamps(Object.values(ids));
    const finished = (await marker()).getTime();
    for (const recalculated of [ids.milestone, ids.zeroTask, ids.up, ids.down, ids.incomingOnly]) {
      expect(at.get(recalculated)!.getTime(), recalculated).toBeGreaterThan(finished);
    }
    // UP is upstream of DOWN, so it was stamped first.
    expect(at.get(ids.up)!.getTime()).toBeLessThanOrEqual(at.get(ids.down)!.getTime());
    // Left exactly as they were: only derived spans, deleted, never calculated.
    expect(at.get(ids.hammock)!.toISOString().slice(0, 10)).toBe(OLD_STAMP);
    // A deleted link and a deleted milestone leave their plans out.
    expect(at.get(ids.deadLink)!.toISOString().slice(0, 10)).toBe(OLD_STAMP);
    expect(at.get(ids.deadMilestone)!.toISOString().slice(0, 10)).toBe(OLD_STAMP);
    expect(at.get(ids.deleted)!.toISOString().slice(0, 10)).toBe(OLD_STAMP);
    expect(at.get(ids.never)).toBeNull();
    // Calculated after the marker by the fixed engine: not pending, so not touched again.
    expect(at.get(ids.fresh)!.getTime()).toBeGreaterThan(finished);

    // Once: the recalculation stamped them, so the set is empty and a second run does nothing.
    expect(await rederive.pendingPlans()).toEqual([]);
    expect(await rederive.rederive()).toBe(0);
  });

  it('reads a milestone stored with a non-zero duration as zero-span, because only the type says so', async () => {
    const { ids } = await seed();
    await rederive.rederive();
    // Stale again, and the only milestone left in the plan carries a duration (nothing forces it to 0).
    await prisma.$executeRawUnsafe(
      `UPDATE "activities" SET "duration_minutes" = 480 WHERE "plan_id" = $1::uuid AND "type" = 'FINISH_MILESTONE'`,
      ids.milestone,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "plans" SET "schedule_computed_at" = TIMESTAMPTZ '${OLD_STAMP}' WHERE "id" = $1::uuid`,
      ids.milestone,
    );
    expect((await rederive.pendingPlans()).map((p) => p.id)).toEqual([ids.milestone]);
  });

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
