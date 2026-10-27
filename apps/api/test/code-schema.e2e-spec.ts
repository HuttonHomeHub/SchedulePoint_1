import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { clearPlanTree } from './clear-plan-tree';

/**
 * The P6 activity codes schema's database guarantees (migration 20261027120100_p6_activity_codes;
 * docs/specs/p6-activity-codes/database-design.md §5–§6), before any route writes the tables: rows
 * are created directly, through their SCALAR columns only (§16 D-P1). Each case is one the design
 * claims the DATABASE refuses, so a later migration that loosened a key or a CHECK fails here.
 *
 * Run on CI's own `postgres:17-alpine`, because the two case-insensitive uniques fold non-ASCII
 * letters by the database collation (docs/DATABASE.md "Indexes"); the migration header records the
 * PostgreSQL 16.15 reading.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

describe.skipIf(!hasDatabase)('P6 activity code tables (e2e)', () => {
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

  interface World {
    orgId: string;
    planA: string;
    planB: string;
    activityA: string;
    activityB: string;
  }

  async function setup(): Promise<World> {
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
    const plan = (name: string) =>
      agent
        .post(`${base}/projects/${project.body.data.id}/plans`)
        .send({ name, plannedStart: '2026-01-01' })
        .expect(201);
    const orgId = org.body.data.id as string;
    const planA = (await plan('Plan A')).body.data.id as string;
    const planB = (await plan('Plan B')).body.data.id as string;
    const activity = (planId: string) =>
      prisma.activity.create({
        data: { organizationId: orgId, planId, name: 'Excavate', durationMinutes: 1440 },
        select: { id: true },
      });
    return {
      orgId,
      planA,
      planB,
      activityA: (await activity(planA)).id,
      activityB: (await activity(planB)).id,
    };
  }

  const makeType = (w: World, planId: string, name: string, deletedAt: Date | null = null) =>
    prisma.codeType.create({
      data: { organizationId: w.orgId, planId, name, position: 0, deletedAt },
    });

  const makeValue = (
    w: World,
    codeTypeId: string,
    shortCode: string,
    description: string | null = null,
  ) =>
    prisma.codeValue.create({
      data: { organizationId: w.orgId, codeTypeId, shortCode, description, position: 0 },
    });

  describe('code_value_assignments: the composite keys', () => {
    it('admits a value of the type, for an activity of the type’s plan', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      const l1 = await makeValue(w, area.id, 'L1');
      await prisma.codeValueAssignment.create({
        data: {
          organizationId: w.orgId,
          planId: w.planA,
          activityId: w.activityA,
          codeTypeId: area.id,
          codeValueId: l1.id,
        },
      });
      expect(await prisma.codeValueAssignment.count()).toBe(1);
    });

    it('refuses a type of another plan (23503)', async () => {
      const w = await setup();
      const foreign = await makeType(w, w.planB, 'Area');
      const value = await makeValue(w, foreign.id, 'L1');
      await expect(
        prisma.codeValueAssignment.create({
          data: {
            organizationId: w.orgId,
            planId: w.planA,
            activityId: w.activityA,
            codeTypeId: foreign.id,
            codeValueId: value.id,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('refuses an activity of another plan (23503)', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      const value = await makeValue(w, area.id, 'L1');
      await expect(
        prisma.codeValueAssignment.create({
          data: {
            organizationId: w.orgId,
            planId: w.planA,
            activityId: w.activityB,
            codeTypeId: area.id,
            codeValueId: value.id,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('refuses a value of another type (23503)', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      const trade = await makeType(w, w.planA, 'Trade');
      const steel = await makeValue(w, trade.id, 'STL');
      await expect(
        prisma.codeValueAssignment.create({
          data: {
            organizationId: w.orgId,
            planId: w.planA,
            activityId: w.activityA,
            codeTypeId: area.id,
            codeValueId: steel.id,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('refuses a second value of one type for one activity (23505)', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      const l1 = await makeValue(w, area.id, 'L1');
      const l2 = await makeValue(w, area.id, 'L2');
      const assign = (codeValueId: string) =>
        prisma.codeValueAssignment.create({
          data: {
            organizationId: w.orgId,
            planId: w.planA,
            activityId: w.activityA,
            codeTypeId: area.id,
            codeValueId,
          },
        });
      await assign(l1.id);
      await expect(assign(l2.id)).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('code_types and code_values: names, short codes and shapes', () => {
    it('refuses a live type name differing only in case, É and é included (23505)', async () => {
      const w = await setup();
      await makeType(w, w.planA, 'Électrique');
      await expect(makeType(w, w.planA, 'éLECTRIQUE')).rejects.toMatchObject({ code: 'P2002' });
      // A soft-deleted name does not block reuse; another plan is another namespace.
      await makeType(w, w.planA, 'Steel', new Date('2026-02-01T00:00:00.000Z'));
      await makeType(w, w.planA, 'steel');
      await makeType(w, w.planB, 'Électrique');
    });

    it('refuses a live short code differing only in case within a type (23505)', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      const trade = await makeType(w, w.planA, 'Trade');
      await makeValue(w, area.id, 'Étage');
      await expect(makeValue(w, area.id, 'éTAGE')).rejects.toMatchObject({ code: 'P2002' });
      await makeValue(w, trade.id, 'Étage');
    });

    it.each([
      ['empty', ''],
      ['padded', ' Area'],
      ['81 characters', 'x'.repeat(81)],
      ['a control character', 'Ar\tea'],
    ])('refuses a type name that is %s (ck_code_types_name_shape)', async (_label, name) => {
      const w = await setup();
      await expect(makeType(w, w.planA, name)).rejects.toThrow(/ck_code_types_name_shape/);
    });

    it('bounds a short code at 80 and a description at 255, and stores no empty description', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      await makeValue(w, area.id, 'x'.repeat(80), 'd'.repeat(255));
      await expect(makeValue(w, area.id, 'y'.repeat(81))).rejects.toThrow(
        /ck_code_values_short_code_shape/,
      );
      await expect(makeValue(w, area.id, 'Z1', 'd'.repeat(256))).rejects.toThrow(
        /ck_code_values_description_shape/,
      );
      await expect(makeValue(w, area.id, 'Z2', '')).rejects.toThrow(
        /ck_code_values_description_shape/,
      );
      await makeValue(w, area.id, 'Z3', null);
    });
  });

  describe('code_swimlane_lanes', () => {
    it('keeps one "no value" row per (activity, type): NULLS NOT DISTINCT', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      const row = {
        organizationId: w.orgId,
        planId: w.planA,
        activityId: w.activityA,
        codeTypeId: area.id,
        codeValueId: null,
        laneIndex: 2,
      };
      await prisma.codeSwimlaneLane.createMany({ data: [row], skipDuplicates: true });
      await prisma.codeSwimlaneLane.createMany({ data: [row], skipDuplicates: true });
      expect(await prisma.codeSwimlaneLane.count()).toBe(1);
      await expect(prisma.codeSwimlaneLane.create({ data: row })).rejects.toMatchObject({
        code: 'P2002',
      });
      // The raw upsert the write path must use (a compound-unique `where` cannot name a NULL).
      await prisma.$executeRaw`
        INSERT INTO code_swimlane_lanes
          (id, organization_id, plan_id, activity_id, code_type_id, code_value_id, lane_index, updated_at)
        VALUES (gen_random_uuid(), ${w.orgId}::uuid, ${w.planA}::uuid, ${w.activityA}::uuid,
                ${area.id}::uuid, NULL, 5, now())
        ON CONFLICT (plan_id, activity_id, code_type_id, code_value_id)
        DO UPDATE SET lane_index = EXCLUDED.lane_index, updated_at = now()`;
      const lanes = await prisma.codeSwimlaneLane.findMany();
      expect(lanes.map((l) => l.laneIndex)).toEqual([5]);
    });

    it('refuses a value of another type and a negative lane', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      const trade = await makeType(w, w.planA, 'Trade');
      const steel = await makeValue(w, trade.id, 'STL');
      const lane = (codeValueId: string | null, laneIndex: number) =>
        prisma.codeSwimlaneLane.create({
          data: {
            organizationId: w.orgId,
            planId: w.planA,
            activityId: w.activityA,
            codeTypeId: area.id,
            codeValueId,
            laneIndex,
          },
        });
      await expect(lane(steel.id, 0)).rejects.toMatchObject({ code: 'P2003' });
      await expect(lane(null, -1)).rejects.toThrow(/ck_code_swimlane_lanes_lane_index_nonneg/);
    });
  });

  describe('plans.swimlane_code_type_id and ck_plans_swimlane_source_level', () => {
    it('admits ACTIVITY_CODE with a type of the same plan, and nothing else', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      const foreign = await makeType(w, w.planB, 'Area');
      const set = (data: {
        swimlaneSource: 'NONE' | 'MANUAL' | 'WBS' | 'ACTIVITY_CODE';
        swimlaneCodeTypeId?: string | null;
        swimlaneWbsLevel?: number | null;
      }) => prisma.plan.update({ where: { id: w.planA }, data });

      await expect(set({ swimlaneSource: 'ACTIVITY_CODE' })).rejects.toThrow(
        /ck_plans_swimlane_source_level/,
      );
      await expect(
        set({ swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: foreign.id }),
      ).rejects.toMatchObject({ code: 'P2003' });
      await expect(
        set({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2, swimlaneCodeTypeId: area.id }),
      ).rejects.toThrow(/ck_plans_swimlane_source_level/);
      await expect(set({ swimlaneSource: 'NONE', swimlaneCodeTypeId: area.id })).rejects.toThrow(
        /ck_plans_swimlane_source_level/,
      );
      await expect(
        set({ swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: area.id, swimlaneWbsLevel: 1 }),
      ).rejects.toThrow(/ck_plans_swimlane_source_level/);

      await set({ swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: area.id });
      // WBS still works as before, through the two comparisons that replaced BETWEEN.
      await set({ swimlaneSource: 'WBS', swimlaneCodeTypeId: null, swimlaneWbsLevel: 3 });
      await expect(set({ swimlaneSource: 'WBS', swimlaneWbsLevel: 4 })).rejects.toThrow(
        /ck_plans_swimlane_source_level/,
      );
    });

    it('closes a RESTRICT cycle that only clearing the pointer first can open', async () => {
      const w = await setup();
      const area = await makeType(w, w.planA, 'Area');
      await prisma.plan.update({
        where: { id: w.planA },
        data: { swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: area.id },
      });
      // Neither side can be hard-deleted first (database-design §5.7).
      await expect(prisma.codeType.delete({ where: { id: area.id } })).rejects.toMatchObject({
        code: 'P2003',
      });
      // The order every hard-delete path uses: clear the pointer, then types, then the plan.
      await prisma.plan.updateMany({
        where: { id: w.planA, swimlaneCodeTypeId: { not: null } },
        data: { swimlaneSource: 'NONE', swimlaneCodeTypeId: null },
      });
      await prisma.codeType.deleteMany({ where: { planId: w.planA } });
      expect(await prisma.codeType.count({ where: { planId: w.planA } })).toBe(0);
    });
  });

  describe('the test sweeps that delete plans', () => {
    // The pointer, the assignments, the lanes, the values and the types all hold RESTRICT keys into
    // rows a plain `plan.deleteMany()` removes (database-design §8.5): a coded, code-sourced plan is
    // the case every spec that resets by deleting plans must survive.
    async function codedPlan(w: World): Promise<void> {
      const area = await makeType(w, w.planA, 'Area');
      const l1 = await makeValue(w, area.id, 'L1');
      await prisma.codeValueAssignment.create({
        data: {
          organizationId: w.orgId,
          planId: w.planA,
          activityId: w.activityA,
          codeTypeId: area.id,
          codeValueId: l1.id,
        },
      });
      await prisma.codeSwimlaneLane.create({
        data: {
          organizationId: w.orgId,
          planId: w.planA,
          activityId: w.activityA,
          codeTypeId: area.id,
          codeValueId: l1.id,
          laneIndex: 0,
        },
      });
      await prisma.plan.update({
        where: { id: w.planA },
        data: { swimlaneSource: 'ACTIVITY_CODE', swimlaneCodeTypeId: area.id },
      });
    }

    const counts = async () => [
      await prisma.plan.count(),
      await prisma.activity.count(),
      await prisma.codeType.count(),
      await prisma.codeValue.count(),
      await prisma.codeValueAssignment.count(),
      await prisma.codeSwimlaneLane.count(),
    ];

    it('clearPlanTree removes a coded plan and everything under it', async () => {
      const w = await setup();
      await codedPlan(w);
      expect(await counts()).toEqual([2, 2, 1, 1, 1, 1]);

      await clearPlanTree(prisma);

      expect(await counts()).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('clearDomainData removes a coded plan and everything under it', async () => {
      const w = await setup();
      await codedPlan(w);

      await clearDomainData(prisma);

      expect(await counts()).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });

  describe('baselines: the frozen code shape', () => {
    async function baseline(w: World, data: Partial<Prisma.BaselineUncheckedCreateInput>) {
      return prisma.baseline.create({
        data: { organizationId: w.orgId, planId: w.planA, name: `B ${Math.random()}`, ...data },
      });
    }

    it('binds the frozen code type to a frozen ACTIVITY_CODE source', async () => {
      const w = await setup();
      const typeId = '00000000-0000-7000-8000-00000000c0de';
      await baseline(w, {
        swimlaneSnapshotLevel: 'FULL',
        swimlaneSource: 'ACTIVITY_CODE',
        swimlaneCodeTypeId: typeId,
        codeSnapshotLevel: 'SWIMLANE_TYPE',
      });
      await expect(
        baseline(w, { swimlaneSnapshotLevel: 'FULL', swimlaneSource: 'ACTIVITY_CODE' }),
      ).rejects.toThrow(/ck_baselines_swimlane_snapshot_shape/);
      await expect(baseline(w, { swimlaneCodeTypeId: typeId })).rejects.toThrow(
        /ck_baselines_swimlane_snapshot_shape/,
      );
      await expect(
        baseline(w, {
          swimlaneSnapshotLevel: 'FULL',
          swimlaneSource: 'MANUAL',
          swimlaneCodeTypeId: typeId,
        }),
      ).rejects.toThrow(/ck_baselines_swimlane_snapshot_shape/);
    });

    it('requires the swimlane snapshot for a SWIMLANE_TYPE code snapshot', async () => {
      const w = await setup();
      await expect(baseline(w, { codeSnapshotLevel: 'SWIMLANE_TYPE' })).rejects.toThrow(
        /ck_baselines_code_snapshot_shape/,
      );
      await baseline(w, {
        swimlaneSnapshotLevel: 'FULL',
        swimlaneSource: 'NONE',
        codeSnapshotLevel: 'SWIMLANE_TYPE',
      });
    });

    it('keeps a frozen code lane whole: index and tie-break together, never negative', async () => {
      const w = await setup();
      const b = await baseline(w, {});
      const row = (data: Partial<Prisma.BaselineActivityUncheckedCreateInput>) =>
        prisma.baselineActivity.create({
          data: {
            organizationId: w.orgId,
            baselineId: b.id,
            sourceActivityId: w.activityA,
            name: 'Excavate',
            durationMinutes: 1440,
            ...data,
          },
        });
      await row({ codeLaneIndex: 1, codeLaneUpdatedAt: new Date() });
      await row({});
      await expect(row({ codeLaneIndex: 1 })).rejects.toThrow(
        /ck_baseline_activities_code_lane_pair/,
      );
      await expect(row({ codeLaneUpdatedAt: new Date() })).rejects.toThrow(
        /ck_baseline_activities_code_lane_pair/,
      );
      await expect(row({ codeLaneIndex: -1, codeLaneUpdatedAt: new Date() })).rejects.toThrow(
        /ck_baseline_activities_code_lane_pair/,
      );
    });
  });
});
