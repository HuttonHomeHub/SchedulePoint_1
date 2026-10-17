/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
   `EXPLAIN` rows are untyped and this is a measurement script, not a contract test. */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';
import { afterAll, describe, it } from 'vitest';

import { RecycleBinRepository } from '../../src/modules/recycle-bin/recycle-bin.repository';

/**
 * Library restore M1-T1 (ADR-0195) — what does widening the recycle bin from three tables to five
 * cost, and does it need an index? Measured BEFORE it is decided, per ADR-0142.
 *
 * Run against a DISPOSABLE database with migrations applied:
 *
 *   DATABASE_URL=postgresql://…/app_measure MEASURE_OUT=/path/run.json \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts \
 *     test/measure/recycle-bin-library.measure.ts
 *
 * Builds ONE organisation holding the largest library ADR-0053 allows (5,000 of each), with a deleted
 * minority of every kind: `GROUPS` resource groups of `GROUP_SIZE` children each (one batch per
 * group, a share of children on a calendar that is itself deleted so the batch-wide calendar lookup
 * has work to do), deleted ORG calendars, and a deleted slice of plans and projects. Then prints, for
 * the three-table query as it stood on main and for the five-table query as the repository runs it:
 * `EXPLAIN (ANALYZE, BUFFERS)` with the planner's own choice and with sequential scans forbidden, and
 * the wall time of the real repository call over `RUNS` runs.
 *
 * **What decides the index question** (spec §4 "Database changes"): the five-table plan's time
 * against the three-table plan's, and whether the two new branches seq-scan a table whose deleted rows
 * are a small minority. A seq scan over 5,000 rows is tens of milliseconds at worst; the answer that
 * means "hand it to database-architect" is the new branches dominating the plan, or p95 for a full
 * first page past the `docs/PERFORMANCE.md` read target. Anything short of that is recorded as
 * "no index" with these numbers beside it.
 */
const LIBRARY = Number(process.env.MEASURE_LIBRARY ?? 5000);
const GROUPS = Number(process.env.MEASURE_GROUPS ?? 60);
const GROUP_SIZE = Number(process.env.MEASURE_GROUP_SIZE ?? 25);
const DELETED_CALENDARS = Number(process.env.MEASURE_DELETED_CALENDARS ?? 400);
const DELETED_PLANS = Number(process.env.MEASURE_DELETED_PLANS ?? 600);
const RUNS = Number(process.env.MEASURE_RUNS ?? 15);
const TAKE = 101;

/**
 * The query exactly as `RecycleBinRepository.findDeletedPage` ran on main before this change: three
 * branches, the parent blocker from the join. Literals stand in for the bound parameters because it
 * is run through `$queryRawUnsafe` for `EXPLAIN`. The first page: no cursor.
 */
const BEFORE_SQL = (organizationId: string): string => `
  SELECT 'client' AS kind, c.id, c.name, c.deleted_at, true AS parent_active, c.delete_batch_id,
         NULL::text AS blocker_kind, NULL::uuid AS blocker_id, NULL::text AS blocker_name,
         NULL::uuid AS blocker_batch_id
    FROM clients c
   WHERE c.organization_id = '${organizationId}'::uuid AND c.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'project' AS kind, p.id, p.name, p.deleted_at, (cl.deleted_at IS NULL) AS parent_active,
         p.delete_batch_id,
         CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE 'client' END AS blocker_kind,
         CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.id END AS blocker_id,
         CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.name END AS blocker_name,
         CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.delete_batch_id END AS blocker_batch_id
    FROM projects p JOIN clients cl ON cl.id = p.client_id
   WHERE p.organization_id = '${organizationId}'::uuid AND p.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'plan' AS kind, pl.id, pl.name, pl.deleted_at, (pr.deleted_at IS NULL) AS parent_active,
         pl.delete_batch_id,
         CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE 'project' END AS blocker_kind,
         CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.id END AS blocker_id,
         CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.name END AS blocker_name,
         CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.delete_batch_id END AS blocker_batch_id
    FROM plans pl JOIN projects pr ON pr.id = pl.project_id
   WHERE pl.organization_id = '${organizationId}'::uuid AND pl.deleted_at IS NOT NULL
  ORDER BY deleted_at DESC, id ASC
  LIMIT ${TAKE}`;

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

describe.skipIf(!process.env.DATABASE_URL)('recycle bin, five tables (measurement)', () => {
  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  const out: Record<string, unknown> = {};
  let organizationId = '';
  const captured: { query: string; params: string }[] = [];
  prisma.$on('query', (event) => {
    if (event.query.includes('WITH page AS')) captured.push(event);
  });

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
    const base = Date.now() - 60 * 86_400_000;

    // Calendars: the active library, plus the deleted ones some resources still point at.
    const calendarRows = Array.from({ length: LIBRARY }, (_, i) => ({
      id: randomUUID(),
      organizationId,
      name: `Calendar ${i}`,
    }));
    await prisma.calendar.createMany({ data: calendarRows });
    const deletedCalendarIds = calendarRows.slice(0, DELETED_CALENDARS).map((c) => c.id);
    await prisma.calendar.updateMany({
      where: { id: { in: deletedCalendarIds } },
      data: { deletedAt: new Date(base), deleteBatchId: randomUUID() },
    });

    // Resources: an active library, plus GROUPS deleted branches of GROUP_SIZE children, each branch
    // one batch and every fifth child bound to a deleted calendar.
    const active = Array.from({ length: LIBRARY }, (_, i) => ({
      organizationId,
      name: `Active ${i}`,
      kind: 'LABOUR' as const,
    }));
    await prisma.resource.createMany({ data: active });
    const groups = Array.from({ length: GROUPS }, (_, g) => ({
      id: randomUUID(),
      batch: randomUUID(),
      name: `Group ${g}`,
    }));
    await prisma.resource.createMany({
      data: groups.map((g, i) => ({
        id: g.id,
        organizationId,
        name: g.name,
        kind: 'GROUP' as const,
        deletedAt: new Date(base + (i + 1) * 60_000),
        deleteBatchId: g.batch,
      })),
    });
    await prisma.resource.createMany({
      data: groups.flatMap((g, i) =>
        Array.from({ length: GROUP_SIZE }, (_, j) => ({
          organizationId,
          name: `${g.name} child ${j}`,
          kind: 'LABOUR' as const,
          parentId: g.id,
          ...(j % 5 === 0
            ? { calendarId: deletedCalendarIds[(i * GROUP_SIZE + j) % DELETED_CALENDARS] }
            : {}),
          deletedAt: new Date(base + (i + 1) * 60_000),
          deleteBatchId: g.batch,
        })),
      ),
    });

    // Hierarchy: a client and project with DELETED_PLANS deleted plans, and some deleted projects.
    const client = await prisma.client.create({ data: { organizationId, name: 'C' } });
    const project = await prisma.project.create({
      data: { organizationId, clientId: client.id, name: 'P' },
    });
    await prisma.plan.createMany({
      data: Array.from({ length: DELETED_PLANS }, (_, i) => ({
        organizationId,
        projectId: project.id,
        name: `Plan ${i}`,
        plannedStart: new Date('2026-01-05'),
        deletedAt: new Date(base + i * 1000),
        deleteBatchId: randomUUID(),
      })),
    });
    await prisma.project.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        organizationId,
        clientId: client.id,
        name: `Deleted project ${i}`,
        deletedAt: new Date(base + i * 2000),
        deleteBatchId: randomUUID(),
      })),
    });
    for (const table of ['calendars', 'resources', 'plans', 'projects', 'clients'])
      await prisma.$executeRawUnsafe(`ANALYZE ${table}`);
    out.counts = {
      library: LIBRARY,
      deletedResources: GROUPS * (GROUP_SIZE + 1),
      deletedCalendars: DELETED_CALENDARS,
      deletedPlans: DELETED_PLANS,
    };

    const repo = new RecycleBinRepository(prisma as never);

    // Wall time of the real repository call (the five-table query), first page.
    const afterMs: number[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      const t0 = performance.now();
      await repo.findDeletedPage({ organizationId, take: TAKE });
      afterMs.push(performance.now() - t0);
    }
    out.after = { p50: percentile(afterMs, 0.5), p95: percentile(afterMs, 0.95), runs: RUNS };

    // The three-table query as it stood on main.
    const beforeMs: number[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      const t0 = performance.now();
      await prisma.$queryRawUnsafe(BEFORE_SQL(organizationId));
      beforeMs.push(performance.now() - t0);
    }
    out.before = { p50: percentile(beforeMs, 0.5), p95: percentile(beforeMs, 0.95), runs: RUNS };

    // EXPLAIN both, planner's choice and sequential scans forbidden.
    const last = captured.at(-1);
    const afterParams: unknown[] = last ? (JSON.parse(last.params) as unknown[]) : [];
    for (const seqscan of ['on', 'off']) {
      out[`before.plan.seqscan_${seqscan}`] = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = ${seqscan}`);
        const rows: any[] = await tx.$queryRawUnsafe(
          `EXPLAIN (ANALYZE, BUFFERS) ${BEFORE_SQL(organizationId)}`,
        );
        return rows.map((r) => r['QUERY PLAN']).join('\n');
      });
      if (last) {
        out[`after.plan.seqscan_${seqscan}`] = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = ${seqscan}`);
          const rows: any[] = await tx.$queryRawUnsafe(
            `EXPLAIN (ANALYZE, BUFFERS) ${last.query}`,
            ...afterParams,
          );
          return rows.map((r) => r['QUERY PLAN']).join('\n');
        });
      }
    }
    const first = await repo.findDeletedPage({ organizationId, take: TAKE });
    out.firstPageBlockers = {
      rows: first.length,
      withCalendarBlocker: first.filter((r) => r.blockedBy?.relation === 'calendar').length,
      withParentBlocker: first.filter((r) => r.blockedBy?.relation === 'parent').length,
    };

    // Tear down the scratch organisation's rows, children first.
    await prisma.resource.updateMany({ where: { organizationId }, data: { parentId: null } });
    await prisma.resource.deleteMany({ where: { organizationId } });
    await prisma.calendar.deleteMany({ where: { organizationId } });
    await prisma.plan.deleteMany({ where: { organizationId } });
    await prisma.project.deleteMany({ where: { organizationId } });
    await prisma.client.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });
});
