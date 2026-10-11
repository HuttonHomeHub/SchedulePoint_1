/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
   `EXPLAIN` rows are untyped and this is a measurement script, not a contract test. */
import { writeFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';
import { afterAll, describe, it } from 'vitest';

import { markScheduleInputsChanged } from '../../src/common/schedule-inputs/mark-schedule-inputs-changed';
import { CalendarRepository } from '../../src/modules/calendars/calendar.repository';
import { ResourceRepository } from '../../src/modules/resources/resource.repository';

/**
 * Correctness sweep M1-T0 (ADR-0142) — what do the two plan-set queries cost, and do they use the
 * existing partial indexes?
 *
 * Run against a DISPOSABLE database with migrations applied:
 *
 *   DATABASE_URL=postgresql://…/app_measure MEASURE_OUT=/path/run.json \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts \
 *     test/measure/calendar-plan-set.measure.ts
 *
 * Builds one organisation with `PLANS` plans, of which a third are on one ORG calendar by each of
 * the three routes (the plan's own, an activity's, a resource assigned to one of its activities),
 * and the rest on none, then prints `EXPLAIN (ANALYZE, BUFFERS)` for the calendar query and the
 * resource query, with the planner's own choice and with sequential scans forbidden.
 */
const PLANS = Number(process.env.MEASURE_PLANS ?? 1800);
const ACTIVITIES_PER_PLAN = 5;

describe.skipIf(!process.env.DATABASE_URL)('calendar plan-set measurement', () => {
  const prisma = new PrismaClient();
  const out: Record<string, unknown> = {};
  let organizationId = '';

  afterAll(async () => {
    if (process.env.MEASURE_OUT)
      writeFileSync(process.env.MEASURE_OUT, JSON.stringify(out, null, 2));
    await prisma.$disconnect();
  });

  it('measures', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Measure', slug: `measure-${Date.now()}` },
    });
    organizationId = org.id;
    const client = await prisma.client.create({ data: { organizationId, name: 'C' } });
    const project = await prisma.project.create({
      data: { organizationId, clientId: client.id, name: 'P' },
    });
    const calendar = await prisma.calendar.create({ data: { organizationId, name: 'Shared' } });
    const resource = await prisma.resource.create({
      data: { organizationId, name: 'Crew', kind: 'LABOUR', calendarId: calendar.id },
    });

    const third = Math.floor(PLANS / 3);
    const planRows = Array.from({ length: PLANS }, (_, i) => ({
      organizationId,
      projectId: project.id,
      name: `Plan ${i}`,
      plannedStart: new Date('2026-01-05'),
      ...(i < third ? { calendarId: calendar.id } : {}),
    }));
    await prisma.plan.createMany({ data: planRows });
    const plans = await prisma.plan.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const activityRows = plans.flatMap((plan, i) =>
      Array.from({ length: ACTIVITIES_PER_PLAN }, (_, j) => ({
        organizationId,
        planId: plan.id,
        name: `A${j}`,
        ...(j === 0 && i >= third && i < 2 * third ? { calendarId: calendar.id } : {}),
      })),
    );
    await prisma.activity.createMany({ data: activityRows });
    const resourceActivities = await prisma.activity.findMany({
      where: {
        organizationId,
        name: 'A1',
        planId: { in: plans.slice(2 * third).map((p) => p.id) },
      },
      take: third,
      select: { id: true },
    });
    await prisma.resourceAssignment.createMany({
      data: resourceActivities.map((a) => ({
        organizationId,
        activityId: a.id,
        resourceId: resource.id,
      })),
    });
    await prisma.$executeRaw`ANALYZE plans`;
    await prisma.$executeRaw`ANALYZE activities`;
    await prisma.$executeRaw`ANALYZE resource_assignments`;

    const explain = async (label: string, run: () => Promise<unknown>) => {
      // The repository methods are measured through their own SQL: capture it from the query log by
      // running `EXPLAIN` on the same statement text below, and time the real call here.
      const t0 = performance.now();
      const rows = (await run()) as string[];
      out[`${label}.callMs`] = Math.round(performance.now() - t0);
      out[`${label}.rows`] = rows.length;
    };
    const calendars = new CalendarRepository(prisma as never);
    const resources = new ResourceRepository(prisma as never);
    await explain('calendar', () => calendars.findActivePlanIdsUsing(calendar.id, organizationId));
    await explain('calendar.second', () =>
      calendars.findActivePlanIdsUsing(calendar.id, organizationId),
    );
    await explain('resource.any', () =>
      resources.findActivePlanIdsAssigning(resource.id, organizationId, false),
    );

    const calendarSql = `
      SELECT p.id FROM plans p
      WHERE p.organization_id = '${organizationId}'::uuid AND p.calendar_id = '${calendar.id}'::uuid AND p.deleted_at IS NULL
      UNION
      SELECT a.plan_id FROM activities a
      JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
      WHERE a.organization_id = '${organizationId}'::uuid AND a.calendar_id = '${calendar.id}'::uuid AND a.deleted_at IS NULL
      UNION
      SELECT a.plan_id FROM resources r
      JOIN resource_assignments ra ON ra.resource_id = r.id AND ra.deleted_at IS NULL
      JOIN activities a ON a.id = ra.activity_id AND a.deleted_at IS NULL
      JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
      WHERE r.organization_id = '${organizationId}'::uuid AND r.calendar_id = '${calendar.id}'::uuid AND r.deleted_at IS NULL`;
    const resourceSql = `
      SELECT DISTINCT a.plan_id AS id FROM resource_assignments ra
      JOIN activities a ON a.id = ra.activity_id AND a.deleted_at IS NULL
      JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
      WHERE ra.organization_id = '${organizationId}'::uuid AND ra.resource_id = '${resource.id}'::uuid AND ra.deleted_at IS NULL`;

    for (const [name, sql] of [
      ['calendarQuery', calendarSql],
      ['resourceQuery', resourceSql],
    ] as const) {
      for (const seqscan of ['on', 'off']) {
        const plan = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = ${seqscan}`);
          const rows: any[] = await tx.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
          return rows.map((r) => r['QUERY PLAN']).join('\n');
        });
        out[`${name}.seqscan_${seqscan}`] = plan;
      }
    }
    // The stamp itself: one id-ordered row lock and one UPDATE over every plan the calendar reaches.
    const ids = await calendars.findActivePlanIdsUsing(calendar.id, organizationId);
    const stampMs: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = performance.now();
      await prisma.$transaction((tx) => markScheduleInputsChanged(tx, organizationId, ids));
      stampMs.push(Math.round(performance.now() - t0));
    }
    out.stampMs = { plans: ids.length, runs: stampMs };
    out.counts = { plans: PLANS, activities: PLANS * ACTIVITIES_PER_PLAN, perRoute: third };

    // Tear down the scratch organisation's rows, children first.
    await prisma.resourceAssignment.deleteMany({ where: { organizationId } });
    await prisma.activity.deleteMany({ where: { organizationId } });
    await prisma.plan.deleteMany({ where: { organizationId } });
    await prisma.resource.deleteMany({ where: { organizationId } });
    await prisma.calendar.deleteMany({ where: { organizationId } });
    await prisma.project.deleteMany({ where: { organizationId } });
    await prisma.client.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });
});
