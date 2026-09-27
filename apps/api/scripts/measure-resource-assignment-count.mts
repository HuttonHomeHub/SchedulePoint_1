/**
 * **#384 M4-T1: what `resourceAssignmentCount` costs, measured against FC-9 before it ships.**
 *
 * FC-9 was committed in the spec before this harness existed (`feature-spec.md`, FC-9). For a
 * 100-row activity page:
 *   (a) the added grouped query plans as an index or bitmap scan on
 *       `idx_resource_assignments_activity_id_fk`, never a `Seq Scan on resource_assignments`;
 *   (b) its p95 is ≤ 2 ms (`EXPLAIN ANALYZE`, n ≥ 20);
 *   (c) the list route's end-to-end p95 rises by ≤ 5 ms;
 *   (d) one more query per read, never one per row (the service unit suite, not this harness).
 *
 * **It measures the remedy, because the first version failed (a).** Counting every row of a page
 * planned as a `Seq Scan on resource_assignments` on the single-tenant 2,000-activity plan, so the
 * spec's remedy rung 1 shipped: count only the page's zero-duration tasks, and skip the query when
 * there are none (`m0-measurement.md`, "M4-T1", records both runs). So every configuration is
 * reported twice: a TYPICAL page (the list route's first 100 rows, which may hold no zero-duration
 * task and then issue no query at all) and a WORST page (as many zero-duration tasks as one page
 * can hold), which is where the plan shape is judged.
 *
 * Two parts, each skipped unless its database is named:
 *
 *   ZD_COST_URL — the 102,000-activity diluted estate (`docs/specs/zero-duration-task/m0-dilute.sql`
 *     on a throwaway database). (a) and (b) only: the estate has no users, so no route.
 *   DATABASE_URL + ZD_ROUTE=1 — a throwaway migrated database the real `AppModule` boots against.
 *     A 2,000-activity plan, every activity holding one live assignment (the expensive shape), gets
 *     (a) and (b) again and then (c) over the real list route.
 *
 * **The SQL is the product's, never retyped**: a logging `PrismaClient` runs the shipped
 * `loadResourceAssignmentCounts` and captures the statement and parameters it issues, and that
 * statement is what is explained.
 *
 * **Where this bypasses the product** (ADR-0081 §3): the 2,000 activities and their assignments are
 * inserted directly, not created over HTTP (M0 of the revision-compare epic measured an hour to seed
 * 2,000 through the API, which would measure the seeder). The plan stands in for the catalogue's
 * `scale-2000`, which FC-9 names, because that plan is seeded through the API. And (c)'s "before"
 * is the same process with the count replaced by zeros on the service instance, so the two
 * configurations differ in exactly the one query and nothing else.
 *
 * Run from `apps/api` (`RATE_LIMIT_LIMIT` lifts the global 100/60 s throttle, which 105 route
 * requests exceed; `LOG_LEVEL=warn` keeps the report readable):
 *   RATE_LIMIT_LIMIT=100000 LOG_LEVEL=warn ZD_COST_URL=… DATABASE_URL=… ZD_ROUTE=1 \
 *     npx vitest run --config scripts/vitest.measure.config.mts \
 *     scripts/measure-resource-assignment-count.mts
 */
import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { it } from 'vitest';

import { configureHttpApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { ActivitiesService } from '../src/modules/activities/activities.service.js';
import { loadResourceAssignmentCounts } from '../src/modules/activities/resource-assignment-counts.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { clearAuditEvents } from '../test/audit-reset.js';

const EXPLAIN_RUNS = 25;
const ROUTE_RUNS = Number(process.env.RUNS ?? 30);
const WARMUPS = 5;
const PAGE = 100;
const INDEX = 'idx_resource_assignments_activity_id_fk';
const ORIGIN = 'http://localhost:5173';

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

function nodes(plan: PlanNode): string[] {
  const own =
    plan['Node Type'] +
    (plan['Relation Name'] ? ` on ${plan['Relation Name']}` : '') +
    (plan['Index Name'] ? ` using ${plan['Index Name']}` : '');
  return [own, ...(plan.Plans ?? []).flatMap(nodes)];
}

/** Nearest-rank, the convention the other measure harnesses use. */
function p(samples: number[], q: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((q / 100) * sorted.length) - 1)]!;
}

/** Run the shipped loader on a logging client and explain the statement it issued. */
type CountRow = { id: string; organizationId: string; type: string; durationMinutes: number };
const COUNT_ROW = { id: true, organizationId: true, type: true, durationMinutes: true } as const;

async function explainShipped(url: string, rows: CountRow[]) {
  const client = new PrismaClient({
    datasourceUrl: url,
    log: [{ emit: 'event', level: 'query' }],
  });
  const captured: { query: string; params: string }[] = [];
  client.$on('query', (e) => captured.push({ query: e.query, params: e.params }));
  try {
    const counts = await loadResourceAssignmentCounts(client, rows);
    const statements = captured.filter((c) => /resource_assignments/.test(c.query));
    if (statements.length === 0) {
      if (counts.size !== 0) throw new Error('counted rows without issuing a query');
      return { skipped: true as const, rows: rows.length };
    }
    if (statements.length !== 1)
      throw new Error(
        `expected at most ONE query over resource_assignments, saw ${statements.length}`,
      );
    const { query, params } = statements[0]!;
    // Inlined as UNTYPED literals: `$queryRawUnsafe` binds every parameter as text, and
    // `uuid = text` has no operator, where the engine's own bind carries the column's type. An
    // untyped literal resolves to the column's type exactly as the engine's bind does.
    const values = JSON.parse(params) as unknown[];
    const inlined = query.replace(/\$(\d+)/g, (_, n: string) => {
      const v = values[Number(n) - 1];
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    const explain = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${inlined}`;
    await client.$queryRawUnsafe(explain);
    const times: number[] = [];
    let plan: PlanNode | undefined;
    for (let i = 0; i < EXPLAIN_RUNS; i += 1) {
      const out = await client.$queryRawUnsafe<{ 'QUERY PLAN': unknown }[]>(explain);
      const doc = out[0]!['QUERY PLAN'] as [{ 'Execution Time': number; Plan: PlanNode }];
      times.push(doc[0]['Execution Time']);
      plan ??= doc[0].Plan;
    }
    const planNodes = nodes(plan!);
    const usesIndex = planNodes.some((n) => n.includes(INDEX));
    const seqScan = planNodes.some((n) => n === 'Seq Scan on resource_assignments');
    return {
      skipped: false as const,
      query,
      countedActivities: counts.size,
      countedAssignments: [...counts.values()].reduce((a, b) => a + b, 0),
      p50: p(times, 50),
      p95: p(times, 95),
      max: Math.max(...times),
      planNodes,
      a: usesIndex && !seqScan ? 'PASS' : 'FAIL',
      b: p(times, 95) <= 2 ? 'PASS' : 'FAIL',
    };
  } finally {
    await client.$disconnect();
  }
}

function report(label: string, r: Awaited<ReturnType<typeof explainShipped>>) {
  if (r.skipped) {
    process.stdout.write(
      `\n${label}\n  no zero-duration task among ${r.rows} rows: NO query issued\n`,
    );
    return;
  }
  process.stdout.write(
    `\n${label}\n` +
      `  counted ${r.countedActivities} activities / ${r.countedAssignments} live assignments\n` +
      `  EXPLAIN ANALYZE x${EXPLAIN_RUNS}: p50 ${r.p50.toFixed(3)} ms, p95 ${r.p95.toFixed(3)} ms, ` +
      `max ${r.max.toFixed(3)} ms\n` +
      `  plan: ${r.planNodes.join(' > ')}\n` +
      `  (a) ${r.a}   (b) ${r.b}\n`,
  );
}

it.skipIf(!process.env.ZD_COST_URL)('FC-9 (a)(b) on the diluted estate', async () => {
  const url = process.env.ZD_COST_URL!;
  const prisma = new PrismaClient({ datasourceUrl: url });
  const planRows = await prisma.$queryRawUnsafe<{ plan_id: string }[]>(
    `SELECT plan_id FROM activities GROUP BY plan_id ORDER BY count(*) DESC LIMIT 1`,
  );
  // TYPICAL: the first 100 of one plan's activities in the list route's own order (id).
  const page = await prisma.activity.findMany({
    where: { planId: planRows[0]!.plan_id, deletedAt: null },
    orderBy: { id: 'asc' },
    take: PAGE,
    select: COUNT_ROW,
  });
  // WORST: a page made entirely of zero-duration tasks, every one of them counted, from the plan
  // holding the most of them (the largest plan holds none).
  const zeroPlan = await prisma.$queryRawUnsafe<{ plan_id: string }[]>(
    `SELECT plan_id FROM activities WHERE type = 'TASK' AND duration_minutes = 0
       AND deleted_at IS NULL GROUP BY plan_id ORDER BY count(*) DESC LIMIT 1`,
  );
  const worst = await prisma.activity.findMany({
    where: { planId: zeroPlan[0]!.plan_id, deletedAt: null, type: 'TASK', durationMinutes: 0 },
    orderBy: { id: 'asc' },
    take: PAGE,
    select: COUNT_ROW,
  });
  await prisma.$disconnect();
  if (page.length !== PAGE) throw new Error(`estate page has ${page.length} rows`);
  if (worst.length !== PAGE) throw new Error(`estate worst page has ${worst.length} rows`);
  report(
    `FC-9 on the 102,000-activity diluted estate, TYPICAL ${PAGE}-row page`,
    await explainShipped(url, page),
  );
  const r = await explainShipped(url, worst);
  report(`FC-9 on the diluted estate, WORST page: ${PAGE} zero-duration tasks`, r);
  if (r.skipped || r.countedAssignments === 0)
    throw new Error('VACUOUS: the worst page held no live assignments');
});

it.skipIf(!process.env.ZD_ROUTE)('FC-9 (a)(b)(c) on a 2,000-activity resourced plan', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: false,
    bodyParser: false,
  });
  configureHttpApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const agent = request.agent(app.getHttpServer());

  const email = `assignment-count-measure-${randomUUID()}@example.com`;
  const signUp = await agent
    .post('/api/auth/sign-up/email')
    .set('Origin', ORIGIN)
    .send({ name: 'Measure', email, password: 'correct-horse-battery' });
  if (signUp.status !== 200) throw new Error(`sign-up ${signUp.status}`);
  const userId = signUp.body.user.id as string;
  const org = await agent.post('/api/v1/organizations').send({ name: `M ${randomUUID()}` });
  const slug = org.body.data.slug as string;
  const organizationId = org.body.data.id as string;
  const client = await agent.post(`/api/v1/organizations/${slug}/clients`).send({ name: 'C' });
  const project = await agent
    .post(`/api/v1/organizations/${slug}/clients/${client.body.data.id}/projects`)
    .send({ name: 'P' });
  const plan = await agent
    .post(`/api/v1/organizations/${slug}/projects/${project.body.data.id}/plans`)
    .send({ name: 'Scale', plannedStart: '2026-01-01' });
  const planId = plan.body.data.id as string;

  // BYPASS: rows inserted directly. Every activity holds one live assignment, the expensive shape.
  // Sorted, so "every 50th is zero-duration" holds in the route's own id order and the first page
  // is known to hold exactly two (a lowercase-hex sort is Postgres's uuid order).
  const ids = Array.from({ length: 2000 }, () => randomUUID()).sort();
  await prisma.activity.createMany({
    data: ids.map((id, i) => ({
      id,
      organizationId,
      planId,
      name: `Activity ${i + 1}`,
      durationMinutes: (i % 50 === 0 ? 0 : (i % 7) + 1) * 1440,
      laneIndex: i,
      createdBy: userId,
      updatedBy: userId,
    })),
  });
  const resource = await prisma.resource.create({
    data: { organizationId, name: 'Crew', kind: 'LABOUR', createdBy: userId, updatedBy: userId },
  });
  await prisma.resourceAssignment.createMany({
    data: ids.map((activityId) => ({ organizationId, activityId, resourceId: resource.id })),
  });
  await prisma.$executeRawUnsafe('ANALYZE activities');
  await prisma.$executeRawUnsafe('ANALYZE resource_assignments');

  const firstPage = await prisma.activity.findMany({
    where: { planId, deletedAt: null },
    orderBy: { id: 'asc' },
    take: PAGE,
    select: COUNT_ROW,
  });
  const allZero = await prisma.activity.findMany({
    where: { planId, deletedAt: null, type: 'TASK', durationMinutes: 0 },
    orderBy: { id: 'asc' },
    take: PAGE,
    select: COUNT_ROW,
  });
  report(
    `FC-9 on a 2,000-activity plan, every activity resourced, TYPICAL ${PAGE}-row page`,
    await explainShipped(process.env.DATABASE_URL!, firstPage),
  );
  const worst = await explainShipped(process.env.DATABASE_URL!, allZero);
  report(`FC-9 on the same plan, WORST page: all ${allZero.length} zero-duration tasks`, worst);
  if (worst.skipped || worst.countedAssignments === 0)
    throw new Error('VACUOUS: the worst page held no live assignments');

  const url = `/api/v1/organizations/${slug}/plans/${planId}/activities?limit=${PAGE}`;
  async function measure() {
    for (let i = 0; i < WARMUPS; i += 1) {
      const warm = await agent.get(url);
      if (warm.status !== 200) throw new Error(`warm-up ${warm.status}`);
    }
    const samples: number[] = [];
    let body: { data: { resourceAssignmentCount: number | null }[] } | undefined;
    for (let i = 0; i < ROUTE_RUNS; i += 1) {
      const started = performance.now();
      const res = await agent.get(url);
      samples.push(performance.now() - started);
      if (res.status !== 200) throw new Error(`list ${res.status}`);
      body = res.body;
    }
    return { p50: p(samples, 50), p95: p(samples, 95), body: body! };
  }

  // "Before": the same service instance with the count replaced by zeros, so the two
  // configurations differ in exactly the one grouped query.
  const service = app.get(ActivitiesService) as unknown as Record<string, unknown>;
  const shipped = service.withDayFactors as (rows: unknown[]) => Promise<unknown[]>;
  const factorsOnly = service.withDayFactorsOnly as (rows: unknown[]) => Promise<object[]>;
  service.withDayFactors = async (rows: unknown[]) =>
    (await factorsOnly.call(service, rows)).map((row) => ({
      ...row,
      resourceAssignmentCount: null,
    }));
  const before = await measure();
  service.withDayFactors = shipped;
  const after = await measure();
  const before2 = await (async () => {
    service.withDayFactors = async (rows: unknown[]) =>
      (await factorsOnly.call(service, rows)).map((row) => ({
        ...row,
        resourceAssignmentCount: null,
      }));
    const m = await measure();
    service.withDayFactors = shipped;
    return m;
  })();

  const counted = after.body.data.filter((a) => (a.resourceAssignmentCount ?? 0) > 0).length;
  const rise = after.p95 - Math.max(before.p95, before2.p95);
  process.stdout.write(
    `\nFC-9 (c), GET …/activities?limit=${PAGE}, ${ROUTE_RUNS} runs after ${WARMUPS} warm-ups each\n` +
      `  without the count (1st): p50 ${before.p50.toFixed(1)} ms, p95 ${before.p95.toFixed(1)} ms\n` +
      `  with the count         : p50 ${after.p50.toFixed(1)} ms, p95 ${after.p95.toFixed(1)} ms\n` +
      `  without the count (2nd): p50 ${before2.p50.toFixed(1)} ms, p95 ${before2.p95.toFixed(1)} ms\n` +
      `  rise over the slower "without" p95: ${rise.toFixed(1)} ms -> ${rise <= 5 ? 'PASS' : 'FAIL'}\n` +
      `  non-vacuity: ${counted} of ${after.body.data.length} rows carried a count > 0 ` +
      `(only zero-duration tasks are counted)\n`,
  );

  await prisma.resourceAssignment.deleteMany({ where: { organizationId } });
  await prisma.resource.deleteMany({ where: { organizationId } });
  await prisma.activity.deleteMany({ where: { planId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.project.deleteMany({ where: { id: project.body.data.id } });
  await prisma.client.deleteMany({ where: { id: client.body.data.id } });
  await prisma.calendarException.deleteMany({ where: { organizationId } });
  await prisma.calendar.deleteMany({ where: { organizationId } });
  await prisma.orgMember.deleteMany({ where: { organizationId } });
  await clearAuditEvents(prisma);
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await app.close();

  if (counted === 0) throw new Error('VACUOUS: no row carried a count');
});
