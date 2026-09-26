/**
 * **#385 M0-T4 — the cost baseline FC-6 is judged against** (`docs/specs/cross-plan-day-boundary/`).
 *
 * FC-6, committed in the spec before this ran: on the M2 build, `buildEngineGraph`'s added time is
 * at most **50 ms p95** over this baseline, and — a counting shape, not a timing — with the plans and
 * calendars held fixed, the query count **and** the number of calendar resolutions are equal at 10
 * edges and at 100 edges. This harness measures today's values of all three so M2-T8 has something
 * to be judged against. It asserts nothing about the bar; M2-T8 does.
 *
 * **The fixture** (plan M0-T4): one downstream plan `D` with 100 incoming and 100 outgoing
 * cross-plan links, from 10 other plans on 10 distinct calendars. Five plans are upstream of `D`
 * (they supply the incoming links) and five are downstream (they receive the outgoing ones), because
 * ADR-0045 §3 keeps the plan graph acyclic: one plan cannot be both. Every remote activity carries
 * real engine output, persisted by a real recalculation, before any link exists.
 *
 * **Held fixed across the three configurations** (0, 10, 100 links in each direction): the plans,
 * their calendars and every activity. Only which links are active changes, by soft-deleting the rest,
 * and at 10 and at 100 every one of the 10 remote plans still has at least one active link.
 *
 * **What it measures, and how:**
 * - time: `buildEngineGraph(D)` in full, inside a transaction as the recalculation runs it, `RUNS`
 *   samples after `WARMUPS`, nearest-rank p50/p95. The cross-plan branch is the difference from the
 *   0-link configuration, which takes the guard's early return (spec E14). Two rounds, so the spread
 *   between them is on the record beside the spread within them;
 * - queries: every Prisma model call and raw query made through the transaction client, counted by
 *   a proxy around it, and the subset on `crossPlanDependency`;
 * - calendar resolutions: calls to the service's `resolveCalendar`, counted by a spy.
 *
 * **Where this harness bypasses the product, stated rather than left to be discovered** (ADR-0081
 * §3):
 * 1. **It never goes through HTTP for the thing it measures.** `buildEngineGraph` is a private
 *    method of `ScheduleService`, called directly on the real, DI-built service against the real
 *    database. It times the branch, not the endpoint: no guard chain, no DTO, no serialisation, no
 *    `computeSchedule`, no write.
 * 2. **The activities and the cross-plan links are inserted directly**, not created over HTTP, so
 *    the create-path checks (pen, cycle, duplicate, same-organisation) are not exercised. The links
 *    are acyclic and same-organisation by construction.
 * 3. The organisation, the plans, the calendars and every recalculation DO go through the public
 *    API, because the remote dates the derivation reads must be real persisted engine output.
 *
 * Run from `apps/api` against a migrated database:
 *   DATABASE_URL=… npx vitest run --config scripts/vitest.measure.config.mts \
 *     scripts/measure-cross-plan-derivation.mts
 *
 * Under vitest rather than `tsx` because tsx cannot boot this application at all (see that config's
 * docblock). One `it`, because it is a harness: it prints the numbers `m0/cost.md` records.
 */
import { randomUUID } from 'node:crypto';
import { cpus, totalmem } from 'node:os';

import { it, vi } from 'vitest';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import request from 'supertest';

import { configureHttpApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PlanRepository } from '../src/modules/plans/plan.repository.js';
import { ScheduleService } from '../src/modules/schedule/schedule.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUNS = Number(process.env.RUNS ?? 40);
const WARMUPS = 5;
const ROUNDS = 2;
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const DATA_DATE = '2026-01-05';
const REMOTE_PLANS = 10;
const LINKS_PER_DIRECTION = 100;
const CONFIGURATIONS = [0, 10, 100] as const;

/** Nearest-rank, the convention the other harnesses use. */
function percentiles(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
  return { p50: at(50), p95: at(95), min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

/**
 * A transaction client that counts every model call and raw query made through it. Keys are
 * `model.operation` or the raw method name. Everything else is passed through bound to the real
 * client, so the counted calls run exactly as they would unwrapped.
 */
function countingClient(
  inner: Prisma.TransactionClient,
  counts: Map<string, number>,
): Prisma.TransactionClient {
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  const RAW = new Set(['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe']);
  return new Proxy(inner, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof prop !== 'string') return value;
      if (typeof value === 'function') {
        if (!RAW.has(prop)) return (value as (...a: unknown[]) => unknown).bind(target);
        return (...args: unknown[]) => {
          bump(prop);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (value !== null && typeof value === 'object' && !prop.startsWith('$')) {
        const delegate = value as Record<string, unknown>;
        return new Proxy(delegate, {
          get(model, op) {
            const fn = Reflect.get(model, op, model);
            if (typeof fn !== 'function' || typeof op !== 'string') return fn;
            return (...args: unknown[]) => {
              bump(`${prop}.${op}`);
              return (fn as (...a: unknown[]) => unknown).apply(model, args);
            };
          },
        });
      }
      return value;
    },
  });
}

/** The private method under measurement, typed at the one place it is reached. */
type BuildEngineGraph = (
  organizationId: string,
  plan: unknown,
  dataDate: string,
  tx: Prisma.TransactionClient,
) => Promise<unknown>;

it('M0-T4 — the cross-plan branch of buildEngineGraph, baseline', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: false,
    bodyParser: false,
  });
  configureHttpApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const plans = app.get(PlanRepository, { strict: false });
  const service = app.get(ScheduleService, { strict: false });
  const agent = request.agent(app.getHttpServer());

  // --- Through the public API: identity, organisation, plans, calendars, recalculation. ---------
  const email = `xplan-measure-${randomUUID()}@example.com`;
  const signUp = await agent
    .post('/api/auth/sign-up/email')
    .set('Origin', ORIGIN)
    .send({ name: 'Measure', email, password: PASSWORD });
  if (signUp.status !== 200) throw new Error(`sign-up ${signUp.status}`);
  const userId = signUp.body.user.id as string;
  const org = await agent
    .post('/api/v1/organizations')
    .send({ name: `XPlan ${randomUUID().slice(0, 8)}` });
  if (org.status !== 201) throw new Error(`org ${org.status}`);
  const slug = org.body.data.slug as string;
  const organizationId = org.body.data.id as string;
  const client = await agent.post(`/api/v1/organizations/${slug}/clients`).send({ name: 'C' });
  const project = await agent
    .post(`/api/v1/organizations/${slug}/clients/${client.body.data.id}/projects`)
    .send({ name: 'P' });

  /** A plan on a calendar of its own: 11 plans, 11 distinct calendars (D's plus the 10 remotes'). */
  async function planOnOwnCalendar(name: string, index: number): Promise<string> {
    const cal = await agent
      .post(`/api/v1/organizations/${slug}/calendars`)
      // Alternate a Monday-to-Friday and a seven-day week (bit 0 = Monday), so the calendars
      // differ in content as well as in id.
      .send({ name: `Calendar ${name}`, workingWeekdays: index % 2 === 0 ? 0b0011111 : 0b1111111 });
    if (cal.status !== 201) throw new Error(`calendar ${cal.status} ${cal.text}`);
    const plan = await agent
      .post(`/api/v1/organizations/${slug}/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart: DATA_DATE });
    if (plan.status !== 201) throw new Error(`plan ${plan.status} ${plan.text}`);
    const patched = await agent
      .patch(`/api/v1/organizations/${slug}/plans/${plan.body.data.id}`)
      .send({ calendarId: cal.body.data.id, version: plan.body.data.version });
    if (patched.status !== 200) throw new Error(`plan calendar ${patched.status} ${patched.text}`);
    return plan.body.data.id as string;
  }

  const downstreamPlanId = await planOnOwnCalendar('D', 0);
  const remotePlanIds: string[] = [];
  for (let i = 0; i < REMOTE_PLANS; i += 1) {
    remotePlanIds.push(await planOnOwnCalendar(`R${i}`, i + 1));
  }
  const upstreamPlans = remotePlanIds.slice(0, REMOTE_PLANS / 2);
  const downstreamPlans = remotePlanIds.slice(REMOTE_PLANS / 2);
  const perRemotePlan = LINKS_PER_DIRECTION / (REMOTE_PLANS / 2);

  // --- BYPASS 2: the activities go in directly. ------------------------------------------------
  const activity = (planId: string, i: number) => ({
    id: randomUUID(),
    organizationId,
    planId,
    name: `Activity ${i + 1}`,
    code: `A${String(i + 1).padStart(4, '0')}`,
    durationMinutes: 3 * 1440,
    laneIndex: i,
    createdBy: userId,
    updatedBy: userId,
  });
  const dActivities = Array.from({ length: LINKS_PER_DIRECTION }, (_, i) =>
    activity(downstreamPlanId, i),
  );
  const remoteActivities = new Map(
    remotePlanIds.map((planId) => [
      planId,
      Array.from({ length: perRemotePlan }, (_, i) => activity(planId, i)),
    ]),
  );
  await prisma.activity.createMany({
    data: [...dActivities, ...[...remoteActivities.values()].flat()],
  });

  // Real persisted engine output on every remote plan, before any link exists.
  for (const planId of [downstreamPlanId, ...remotePlanIds]) {
    const recalc = await agent.post(
      `/api/v1/organizations/${slug}/plans/${planId}/schedule/recalculate`,
    );
    if (recalc.status !== 200) throw new Error(`recalculate ${recalc.status} ${recalc.text}`);
  }

  // --- BYPASS 2, continued: the links. `D`'s activity i takes one incoming and one outgoing. ----
  const link = (
    predecessorPlanId: string,
    predecessorId: string,
    successorPlanId: string,
    successorId: string,
  ) => ({
    id: randomUUID(),
    organizationId,
    predecessorPlanId,
    successorPlanId,
    predecessorId,
    successorId,
    type: 'FS' as const,
    lagMinutes: 1440,
    createdBy: userId,
    updatedBy: userId,
  });
  const incoming = dActivities.map((d, i) => {
    const planId = upstreamPlans[i % upstreamPlans.length]!;
    const pred = remoteActivities.get(planId)![Math.floor(i / upstreamPlans.length)]!;
    return link(planId, pred.id, downstreamPlanId, d.id);
  });
  const outgoing = dActivities.map((d, i) => {
    const planId = downstreamPlans[i % downstreamPlans.length]!;
    const succ = remoteActivities.get(planId)![Math.floor(i / downstreamPlans.length)]!;
    return link(downstreamPlanId, d.id, planId, succ.id);
  });
  await prisma.crossPlanDependency.createMany({ data: [...incoming, ...outgoing] });

  /**
   * Activate the first `n` links in each direction and soft-delete the rest. Because the lists are
   * dealt round-robin over the remote plans, any `n ≥ 5` keeps every one of them linked.
   */
  async function activate(n: number) {
    const on = [...incoming.slice(0, n), ...outgoing.slice(0, n)].map((l) => l.id);
    await prisma.crossPlanDependency.updateMany({
      where: { organizationId },
      data: { deletedAt: new Date() },
    });
    if (on.length > 0) {
      await prisma.crossPlanDependency.updateMany({
        where: { id: { in: on } },
        data: { deletedAt: null },
      });
    }
    const active = await prisma.crossPlanDependency.count({
      where: { organizationId, deletedAt: null },
    });
    if (active !== 2 * n) throw new Error(`activated ${active} links, wanted ${2 * n}`);
    const linkedPlans = await prisma.crossPlanDependency.findMany({
      where: { organizationId, deletedAt: null },
      select: { predecessorPlanId: true, successorPlanId: true },
    });
    const remotes = new Set(linkedPlans.flatMap((l) => [l.predecessorPlanId, l.successorPlanId]));
    remotes.delete(downstreamPlanId);
    return remotes.size;
  }

  const plan = await plans.findActiveByIdInOrg(downstreamPlanId, organizationId);
  if (!plan) throw new Error('downstream plan not found');
  const buildEngineGraph = (
    service as unknown as { buildEngineGraph: BuildEngineGraph }
  ).buildEngineGraph.bind(service);
  const resolveSpy = vi.spyOn(
    service as unknown as { resolveCalendar: (...args: unknown[]) => unknown },
    'resolveCalendar',
  );

  // --- Counting pass: one build per configuration, through the counting client. --------------
  const counting: Record<number, unknown> = {};
  for (const n of CONFIGURATIONS) {
    const remotesLinked = await activate(n);
    const counts = new Map<string, number>();
    resolveSpy.mockClear();
    const graph = (await prisma.$transaction((tx) =>
      buildEngineGraph(organizationId, plan, DATA_DATE, countingClient(tx, counts)),
    )) as {
      activities: { externalEarlyStart?: string | null; externalLateFinish?: string | null }[];
    };
    // Non-vacuity: at `n` links each way, exactly `n` of D's activities carry a derived bound in
    // each direction. A branch that loaded the links and derived nothing would time the loads and
    // report a cost for work that never happened.
    const withForward = graph.activities.filter((a) => a.externalEarlyStart != null).length;
    const withBackward = graph.activities.filter((a) => a.externalLateFinish != null).length;
    if (withForward !== n || withBackward !== n) {
      throw new Error(`at ${n} links: ${withForward} forward and ${withBackward} backward bounds`);
    }
    const total = [...counts.values()].reduce((s, v) => s + v, 0);
    const crossPlan = [...counts.entries()]
      .filter(([k]) => k.startsWith('crossPlanDependency.'))
      .reduce((s, [, v]) => s + v, 0);
    counting[n] = {
      linksPerDirection: n,
      remotePlansLinked: remotesLinked,
      queries: total,
      crossPlanQueries: crossPlan,
      calendarResolutions: resolveSpy.mock.calls.length,
      derivedBounds: { forward: withForward, backward: withBackward },
      byKey: Object.fromEntries([...counts.entries()].sort()),
    };
  }

  // --- Timing pass: the plain transaction client, no proxy, no spy in the way. ---------------
  resolveSpy.mockRestore();
  const timing: Record<string, unknown>[] = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const n of CONFIGURATIONS) {
      await activate(n);
      const time = async () => {
        const started = performance.now();
        await prisma.$transaction((tx) => buildEngineGraph(organizationId, plan, DATA_DATE, tx));
        return performance.now() - started;
      };
      for (let i = 0; i < WARMUPS; i += 1) await time();
      const samples: number[] = [];
      for (let i = 0; i < RUNS; i += 1) samples.push(await time());
      timing.push({ round, linksPerDirection: n, runs: RUNS, ...percentiles(samples) });
    }
  }

  const version = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  process.stdout.write(
    `${JSON.stringify(
      {
        machine: {
          cpu: cpus()[0]?.model,
          cores: cpus().length,
          memoryGiB: Math.round(totalmem() / 2 ** 30),
          node: process.version,
          postgres: version[0]?.version,
        },
        fixture: {
          downstreamActivities: dActivities.length,
          remotePlans: REMOTE_PLANS,
          distinctCalendars: REMOTE_PLANS + 1,
          linksPerDirectionAtMost: LINKS_PER_DIRECTION,
        },
        counting,
        timing,
      },
      null,
      2,
    )}\n`,
  );

  await app.close();
});
