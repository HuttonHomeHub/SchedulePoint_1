/**
 * **F3's end-to-end half** — the figure `docs/specs/revision-compare-delta/m0-measurement.md`
 * recorded as DEFERRED because the route did not exist when M0 ran.
 *
 * The condition, committed before any harness (`m0-condition.md` §F3): the route completes in
 * **≤ 250 ms p95 end-to-end over the real HTTP route at 2,000 activities**. Its stated purpose is
 * to catch an accidental N+1 or a per-row query, not to be tight — a bar that can only fail on a
 * mistake is still worth having when the mistake is silent.
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
  const recalc = await agent.post(`/api/v1/organizations/${slug}/plans/${planId}/schedule/recalculate`);
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
  const recalc2 = await agent.post(`/api/v1/organizations/${slug}/plans/${planId}/schedule/recalculate`);
  if (recalc2.status !== 200) throw new Error(`recalculate 2 ${recalc2.status}`);

  const url = `/api/v1/organizations/${slug}/plans/${planId}/schedule/revision-compare?from=${from}&to=live`;
  for (let i = 0; i < WARMUPS; i += 1) await agent.get(url).expect(200);

  const samples: number[] = [];
  let entered = 0;
  let left = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    const res = await agent.get(url);
    samples.push(performance.now() - started);
    if (res.status !== 200) throw new Error(`compare ${res.status} ${res.text}`);
    entered = res.body.data.criticalPath.enteredTotal;
    left = res.body.data.criticalPath.leftTotal;
  }

  const p = percentiles(samples);
  process.stdout.write(
    `\nF3 end-to-end, ${ACTIVITY_COUNT} activities / ${edges.length} dependencies, ` +
      `${RUNS} runs after ${WARMUPS} warm-ups:\n` +
      `  p50 ${p.p50.toFixed(1)} ms   p95 ${p.p95.toFixed(1)} ms   ` +
      `min ${p.min.toFixed(1)} ms   max ${p.max.toFixed(1)} ms\n` +
      `  bar ${BAR_MS} ms p95 -> ${p.p95 <= BAR_MS ? 'PASS' : 'FAIL'}\n` +
      `  non-vacuity: entered ${entered}, left ${left} ` +
      `(a delta of 0/0 would make this the empty case, not the measured one)\n`,
  );

  await prisma.baselineActivity.deleteMany({ where: { baselineId: from } });
  await prisma.baseline.deleteMany({ where: { planId } });
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

  // The committed bar, asserted rather than printed and forgotten. `entered > 0` is the
  // non-vacuity control and it is checked FIRST: a benchmark over two identical schedules reports
  // the fastest number this route can produce and says nothing about the case it exists for.
  if (entered === 0 && left === 0) throw new Error('vacuous: the delta was empty');
  if (p.p95 > BAR_MS) throw new Error(`F3 FAIL: p95 ${p.p95.toFixed(1)} ms > ${BAR_MS} ms`);
});
