/**
 * **F3's end-to-end half** — the figure `docs/specs/revision-compare-delta/m0-measurement.md`
 * recorded as DEFERRED because the route did not exist when M0 ran.
 *
 * The condition, committed before any harness (`m0-condition.md` §F3): the route completes in
 * **≤ 250 ms p95 end-to-end over the real HTTP route at 2,000 activities**. Its stated purpose is
 * to catch an accidental N+1 or a per-row query, not to be tight — a bar that can only fail on a
 * mistake is still worth having when the mistake is silent.
 *
 * **It measures TWO configurations back to back, and the second one is the point**
 * (`docs/TECH_DEBT.md` #254, condition in `f3-include-condition.md`). Until 2026-09-10 it sent
 * `?from=…&to=live` with no `include` at all — so the 250 ms figure `docs/API.md` publishes was
 * measured on a request **no client sends**: the shipped panel always asks for `changes` and
 * `ghosts`, and the change classifier and the two geometry builders had never been timed over
 * HTTP. Both are now measured in ONE process, because the interesting quantity is the difference
 * between them and a figure taken on another night against another machine cannot supply it.
 *
 * The bar is asserted on the **client's** configuration. The delta-only figure is reported beside
 * it and the ratio is printed and **not gated**: no ratio threshold has ever been measured, and
 * inventing one now to pass would be the number-tuned-to-the-answer this epic's conditions exist
 * to prevent.
 *
 * **Where this harness bypasses the product, stated rather than left to be discovered** (ADR-0081
 * §3, and the M0 harness's own practice):
 *
 * 1. **The 2,000 activity rows and their dependencies are inserted DIRECTLY**, not created over
 *    HTTP. M0 measured that seeding 2,000 activities through the API costs about an hour at the
 *    observed rate, which would have measured the seeder. For a READ benchmark that is legitimate:
 *    the numbers describe queries, not writes.
 * 2. **Everything the measurement is ABOUT goes over the real route** — a real socket, the real
 *    guard chain, the real query DTO, the real service and the real DTO serialisation. That is the
 *    half M0 could not reach, and it is why this exists rather than timing the two loads again.
 * 3. The recalculation and the baseline capture DO go through the public API, because they are
 *    what makes both sides real persisted CPM output rather than rows this script invented.
 *
 * Run from `apps/api`:
 *   DATABASE_URL=… npx vitest run --config scripts/vitest.measure.config.mts \
 *     scripts/measure-revision-compare.mts
 *
 * Under vitest rather than `tsx` because tsx cannot boot this application at all — see that
 * config's docblock. It is wrapped in one `it` so vitest will run it; it is a HARNESS, and the
 * only thing it asserts is the committed bar, so a regression shows up as a failure rather than
 * as a number nobody read.
 */
import { randomUUID } from 'node:crypto';

import { it } from 'vitest';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureHttpApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { clearAuditEvents } from '../test/audit-reset.js';
import { clearBaselineTree } from '../test/clear-baseline-tree.js';

const ACTIVITY_COUNT = Number(process.env.ACTIVITY_COUNT ?? 2000);
const RUNS = Number(process.env.RUNS ?? 15);
const WARMUPS = 3;
const BAR_MS = 250;
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

/** Nearest-rank, so a 15-run p95 is the 15th value — the M0 harness's convention, kept. */
function percentiles(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
  return { p50: at(50), p95: at(95), min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

it('F3 — the revision comparison end-to-end at scale', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: false,
    bodyParser: false,
  });
  configureHttpApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const agent = request.agent(app.getHttpServer());

  const email = `revision-measure-${randomUUID()}@example.com`;
  const signUp = await agent
    .post('/api/auth/sign-up/email')
    .set('Origin', ORIGIN)
    .send({ name: 'Measure', email, password: PASSWORD });
  if (signUp.status !== 200) throw new Error(`sign-up ${signUp.status}`);
  const userId = signUp.body.user.id as string;

  const org = await agent
    .post('/api/v1/organizations')
    .send({ name: `Measure ${randomUUID().slice(0, 8)}` });
  if (org.status !== 201) throw new Error(`org ${org.status}`);
  const slug = org.body.data.slug as string;
  const organizationId = org.body.data.id as string;

  const client = await agent
    .post(`/api/v1/organizations/${slug}/clients`)
    .send({ name: 'Scale client' });
  const project = await agent
    .post(`/api/v1/organizations/${slug}/clients/${client.body.data.id}/projects`)
    .send({ name: 'Scale project' });
  const plan = await agent
    .post(`/api/v1/organizations/${slug}/projects/${project.body.data.id}/plans`)
    .send({ name: 'Scale plan', plannedStart: '2026-01-01' });
  const planId = plan.body.data.id as string;
  await agent
    .patch(`/api/v1/organizations/${slug}/plans/${planId}`)
    .send({ calendarId: null, version: 1 });

  // BYPASS 1: the rows go in directly. Chains of 20 so the network has real depth and a real
  // critical path rather than 2,000 parallel bars, which would make the delta trivially empty.
  process.stdout.write(`Seeding ${ACTIVITY_COUNT} activities directly…\n`);
  const ids = Array.from({ length: ACTIVITY_COUNT }, () => randomUUID());
  await prisma.activity.createMany({
    data: ids.map((id, i) => ({
      id,
      organizationId,
      planId,
      name: `Activity ${i + 1}`,
      code: `A${String(i + 1).padStart(5, '0')}`,
      // MINUTES, not days (ADR-0036). 1440 = one elapsed day on the all-days-work calendar
      // this plan uses, so the arithmetic stays transparent.
      durationMinutes: ((i % 7) + 1) * 1440,
      laneIndex: i,
      createdBy: userId,
      updatedBy: userId,
    })),
  });
  const edges = ids.flatMap((id, i) =>
    i % 20 === 0 || i === 0
      ? []
      : [
          {
            id: randomUUID(),
            organizationId,
            planId,
            predecessorId: ids[i - 1]!,
            successorId: id,
            createdBy: userId,
            updatedBy: userId,
          },
        ],
  );
  await prisma.activityDependency.createMany({ data: edges });
  process.stdout.write(`Seeded ${ids.length} activities, ${edges.length} dependencies.\n`);

  // Through the public API from here: this is what makes both sides real CPM output.
  const recalc = await agent.post(
    `/api/v1/organizations/${slug}/plans/${planId}/schedule/recalculate`,
  );
  if (recalc.status !== 200) throw new Error(`recalculate ${recalc.status}`);
  const baseline = await agent
    .post(`/api/v1/organizations/${slug}/plans/${planId}/baselines`)
    .send({ name: 'Measured revision' });
  if (baseline.status !== 201) throw new Error(`capture ${baseline.status} ${baseline.text}`);
  const from = baseline.body.data.id as string;

  // Move the plan so the delta is NON-EMPTY. A benchmark over two identical schedules measures the
  // empty case and reports the fastest number the route can produce — the non-vacuity rule the
  // condition applies to F1, applied to the cost limb because it matters here for the same reason.
  await prisma.activity.updateMany({
    where: { planId, laneIndex: { lt: 200 } },
    data: { durationMinutes: 30 * 1440 },
  });

  /**
   * **The logic half of the mutation, added because the first run of this measurement reported
   * `0 links`.**
   *
   * #254's complaint is that "the change classifier and the two geometry builders have never been
   * timed end to end over HTTP". A duration-only mutation exercises the ghost **bar** builder and
   * leaves the ghost **link** builder at zero rows — so the first run satisfied the committed C1
   * (a change row and a ghost) while still not timing half of what the row names. Strengthening
   * the delta EXCEEDS the committed floor rather than relaxing it, which is the only direction a
   * condition may be moved after it is written.
   *
   * Both directions, because ADDED and REMOVED are different code paths: a removed edge is in no
   * live edge list and has to be carried from the old side.
   *
   * **Every added edge runs low index -> high index**, exactly like the seed's, so the graph is a
   * DAG by construction and the recalculation cannot refuse it for a cycle. The chain generator
   * skips every twentieth edge; these join fifty of those breaks, which is why they are available
   * to add at all.
   */
  const removedEdgeIds = edges.slice(0, 50).map((e) => e.id);
  await prisma.activityDependency.deleteMany({ where: { id: { in: removedEdgeIds } } });
  const joinPoints = ids
    .map((_, i) => i)
    .filter((i) => i > 0 && i % 20 === 0)
    .slice(0, 50);
  await prisma.activityDependency.createMany({
    data: joinPoints.map((i) => ({
      id: randomUUID(),
      organizationId,
      planId,
      predecessorId: ids[i - 1]!,
      successorId: ids[i]!,
      createdBy: userId,
      updatedBy: userId,
    })),
  });

  const recalc2 = await agent.post(
    `/api/v1/organizations/${slug}/plans/${planId}/schedule/recalculate`,
  );
  if (recalc2.status !== 200) throw new Error(`recalculate 2 ${recalc2.status}`);

  /**
   * **Counted from the database, not from the seed array.** `edges.length` is what was INSERTED;
   * the mutation above then removes fifty and adds fifty, so the two figures agree today only
   * because that happens to be edge-neutral. Reporting a seeded count as a measured one is the
   * instrument-reports-a-number-it-did-not-measure failure this register keeps recording, and it
   * would go wrong silently the first time somebody changed one of those fifties.
   */
  const measuredEdges = await prisma.activityDependency.count({ where: { planId } });

  const base = `/api/v1/organizations/${slug}/plans/${planId}/schedule/revision-compare?from=${from}&to=live`;

  /**
   * Measure one configuration: warm up, then take `RUNS` samples, returning the percentiles and
   * the non-vacuity counts read off the LAST response.
   *
   * Factored out rather than duplicated because the two configurations must differ in exactly one
   * thing — the query string — and two copies of a fifteen-iteration loop is how one acquires a
   * different warm-up count from the other and the difference between them stops being the
   * projections.
   */
  async function measure(url: string) {
    for (let i = 0; i < WARMUPS; i += 1) {
      const warm = await agent.get(url);
      if (warm.status !== 200) throw new Error(`warm-up ${warm.status} ${warm.text}`);
    }
    const samples: number[] = [];
    let body: {
      criticalPath: { enteredTotal: number; leftTotal: number };
      // The REAL response shape, read off `revision-compare.dto.ts` rather than assumed. The
      // first draft of this measurement guessed `changes.rows` and `ghosts.activities`; both are
      // wrong — `changes` is `{ classes, cap }` and every class carries its own `rows`, and
      // `ghosts` is a FLAT array with `links` as its sibling on the envelope. A guessed shape
      // reads `undefined` and coalesces to 0, so C1 would have thrown VACUOUS against a
      // perfectly non-vacuous response and the natural reading is "the projections are empty".
      changes?: { classes?: { rows?: unknown[]; total?: number }[] };
      ghosts?: unknown[];
      ghostsTotal?: number;
      links?: unknown[];
    } | null = null;
    for (let i = 0; i < RUNS; i += 1) {
      const started = performance.now();
      const res = await agent.get(url);
      samples.push(performance.now() - started);
      if (res.status !== 200) throw new Error(`compare ${res.status} ${res.text}`);
      body = res.body.data;
    }
    return { ...percentiles(samples), body: body! };
  }

  // Delta-only: what F3 has always measured, kept verbatim so the two figures are comparable.
  const deltaOnly = await measure(base);

  /**
   * **The configuration the shipped client actually sends** (`docs/TECH_DEBT.md` #254). The
   * production call sites pass `REVISION_COMPARE_INCLUDES = ['changes', 'ghosts']`
   * (`apps/web/src/features/revision-compare/api/use-revision-compare.ts:23`) and the query builder
   * sorts before joining, so this string is the client's request character for character.
   *
   * **Repeated, never comma-joined.** `?include=changes,ghosts` is refused with 422 — the query DTO
   * normalises through `toArray` and validates `@IsIn(…, { each: true })`, so a comma-joined value
   * is read as one member named `changes,ghosts`. The condition document specified the comma form
   * until it was read against the DTO; had this run as first written it would have thrown before
   * taking a sample, and the natural reading of that failure is "the route is broken".
   *
   * `progress` is deliberately absent, because the client deliberately does not ask for it: it
   * moves on nearly every activity every week and would bury the classes that explain a date move.
   */
  const withProjections = await measure(`${base}&include=changes&include=ghosts`);

  const entered = deltaOnly.body.criticalPath.enteredTotal;
  const left = deltaOnly.body.criticalPath.leftTotal;
  // Summed across the class vocabulary: `classes` is TOTAL over it by design (a class is never
  // simply missing), so counting classes would report a constant and prove nothing. `total` is
  // the pre-cap figure and `rows` the capped one — both are reported, because a cap reached is
  // exactly when the two diverge and the ratio below is about the work done, not the bytes sent.
  const classes = withProjections.body.changes?.classes ?? [];
  const changeRows = classes.reduce((n, c) => n + (c.rows?.length ?? 0), 0);
  const changeTotal = classes.reduce((n, c) => n + (c.total ?? 0), 0);
  const ghostActivities = withProjections.body.ghosts?.length ?? 0;
  const ghostsTotal = withProjections.body.ghostsTotal ?? 0;
  const ghostLinks = withProjections.body.links?.length ?? 0;

  const line = (label: string, p: ReturnType<typeof percentiles>) =>
    `  ${label.padEnd(22)} p50 ${p.p50.toFixed(1).padStart(6)} ms   ` +
    `p95 ${p.p95.toFixed(1).padStart(6)} ms   ` +
    `min ${p.min.toFixed(1).padStart(6)} ms   max ${p.max.toFixed(1).padStart(6)} ms\n`;

  process.stdout.write(
    `\nF3' end-to-end, ${ACTIVITY_COUNT} activities / ${measuredEdges} dependencies ` +
      `(${(measuredEdges / ids.length).toFixed(2)}:1), ${RUNS} runs after ${WARMUPS} warm-ups:\n` +
      line('delta only', deltaOnly) +
      line('+changes +ghosts', withProjections) +
      `  ratio (p95)            ${(withProjections.p95 / deltaOnly.p95).toFixed(2)}x ` +
      `— reported, NOT gated: no ratio threshold has ever been measured\n` +
      `  C2  bar ${BAR_MS} ms p95 on the client's configuration -> ` +
      `${withProjections.p95 <= BAR_MS ? 'PASS' : 'FAIL'}\n` +
      `  C1  non-vacuity: delta entered ${entered} / left ${left}; ` +
      `changes ${changeRows} rows of ${changeTotal} before the cap; ` +
      `ghosts ${ghostActivities} of ${ghostsTotal}, ${ghostLinks} links\n`,
  );

  /**
   * **The FOURTEENTH copy of the sweep `docs/TECH_DEBT.md` #253 removed, and it was missed because
   * it lives in `scripts/` rather than `test/`.**
   *
   * These two lines used to be hand-written, naming `baselineActivity` and nothing else — so the
   * moment ADR-0126 added `baseline_dependencies` as a third child of `Baseline`, the teardown hit
   * `baseline_dependencies_baseline_id_fkey` and threw. That is precisely the regression #253
   * exists to prevent, in the one file its thirteen-caller sweep could not see.
   *
   * It is worse than an untidy teardown, and the worse half is why this is written down. The
   * teardown runs BEFORE this harness's own assertions, so a crash here means the committed bar is
   * never evaluated at all: the docblock's claim that "the only thing it asserts is the committed
   * bar, so a regression shows up as a failure rather than as a number nobody read" has been FALSE
   * since ADR-0126 landed. It would have reported a failure either way, which is the only reason
   * this was survivable — but a C2 breach and a stale teardown are the same red, and the second
   * one arrives first.
   */
  await clearBaselineTree(prisma);
  await prisma.activityDependency.deleteMany({ where: { planId } });
  await prisma.activity.deleteMany({ where: { planId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.project.deleteMany({ where: { id: project.body.data.id } });
  await prisma.client.deleteMany({ where: { id: client.body.data.id } });
  // Creating an organisation seeds its default calendar library, so those rows must go too
  // or the organisation delete hits `calendars_organization_id_fkey`.
  await prisma.calendarException.deleteMany({ where: { organizationId } });
  await prisma.calendar.deleteMany({ where: { organizationId } });
  await prisma.orgMember.deleteMany({ where: { organizationId } });
  // `audit_events` is append-only in the database and its organisation FK is RESTRICT, so the
  // organisation cannot be deleted while its trail exists and the trail cannot be deleted by
  // the application role. That is ADR-0072 working, not a defect; the e2e suite's documented
  // escape hatch is the same one, and it lives in `test/` for the same reason.
  await clearAuditEvents(prisma);
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await app.close();

  // The committed conditions, asserted rather than printed and forgotten.
  //
  // **C1 is checked FIRST and it now has two halves.** A benchmark over two identical schedules
  // reports the fastest number this route can produce and says nothing about the case it exists
  // for — and the same is true one level in: a request whose `include` produced an empty change
  // list and no ghosts measures the cost of ASKING for the projections rather than of building
  // them, and would read as a pass. That is the defect #254 exists to close, so it must not be
  // reachable through the fix.
  if (entered === 0 && left === 0) throw new Error('VACUOUS: the delta was empty');
  if (changeRows === 0) throw new Error('VACUOUS: the change list was empty');
  if (ghostActivities === 0) throw new Error('VACUOUS: no ghosts were built');
  if (withProjections.p95 > BAR_MS)
    throw new Error(
      `C2 FAIL: p95 ${withProjections.p95.toFixed(1)} ms > ${BAR_MS} ms with the client's ` +
        `includes (delta-only was ${deltaOnly.p95.toFixed(1)} ms). Per the committed condition ` +
        `the remedy is NOT to relax the bar — docs/API.md publishes a figure for a configuration ` +
        `nobody requests, and the choice between republishing and optimising is the product ` +
        `owner's.`,
    );
});
