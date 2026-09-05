import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { fixtureSpec } from '@repo/seed';
import { PenHolder, SeedClient, seedPlan } from '@repo/seed-http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import {
  measureCarrierMovementDays,
  selectCompletionCarrier,
} from '../src/modules/schedule/completion-carrier';
import { computeSchedule } from '../src/modules/schedule/engine/compute';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * The run's numbers have to survive vitest's per-task console buffering — the setup run's counts
 * never reached the log, so the assertion was verified and the figures were not.
 *
 * The path is FIXED. It was briefly an env var in the previous epic's harness and CodeQL flagged
 * that as `js/path-injection` (high), correctly: an environment value flowing unchecked into a
 * filesystem write is a real sink. Every write is best-effort and swallowed — a measurement harness
 * must never fail a build over where it puts its notes.
 */
const REPORT = join(tmpdir(), 'schedulepoint-delta-m0.txt');
const say = (line: string): void => {
  try {
    appendFileSync(REPORT, `${line}\n`);
  } catch {
    // The stdout copy is the one that matters.
  }
  process.stdout.write(`${line}\n`);
};

/**
 * **M0-T2 — the critical-path delta's measurement harness.**
 *
 * Judged against [`docs/specs/revision-compare-delta/m0-condition.md`](../../../docs/specs/revision-compare-delta/m0-condition.md),
 * which was committed on its own before this file existed.
 *
 * **The non-vacuity limb runs FIRST**, because F1 passes trivially against two identical schedules
 * and a green suite that cannot tell "all correct" from "found nothing" is the failure ADR-0093 and
 * ADR-0108 both record. If a qualifying change set cannot be produced through the public write
 * path, that is itself the finding and it is reported rather than worked around.
 *
 * **Where it bypasses the product (ADR-0081 §3).** F1 and F2 call the delta and the engine
 * directly. A pass says the METHOD is sound and says nothing about a route, a DTO or a guard. F3
 * goes over the real HTTP route precisely because the other two do not.
 *
 * The fixture is seeded **in-spec** through the same seeder the CLI uses, so this runs anywhere the
 * e2e suite runs and does not depend on a machine having been seeded by hand. That is why
 * `fixtureSpec` moved into `@repo/seed`: it was the only catalogue tier living in an app, and an
 * app cannot be imported from here.
 */
type Lever = 'extend' | 'shorten' | 'both';

/**
 * The service's own graph builder, reached the way `m0-engine-input.e2e-spec.ts` reaches it.
 *
 * `buildEngineGraph` is PRIVATE, and the harness deliberately uses the product's builder rather
 * than a copy — a second builder is how the previous epic's harness came to schedule a plan four
 * and a half months different from the product. The widening lives in one narrow helper because an
 * inline `as unknown as GraphBuilder` reads to `no-unnecessary-type-assertion` as removable, and
 * `--fix` duly removed it; typecheck then caught the private-access error. A fixer cannot know why
 * a cast is there, so the cast is placed where its purpose is written down beside it.
 */
type GraphBuilder = {
  buildEngineGraph: (
    orgId: string,
    plan: unknown,
    dataDate: string,
    tx: unknown,
  ) => Promise<{
    activities: Parameters<typeof computeSchedule>[0] extends readonly (infer A)[] ? A[] : never;
    edges: Parameters<typeof computeSchedule>[1] extends readonly (infer E)[] ? E[] : never;
    options: Parameters<typeof computeSchedule>[2];
  }>;
};

/** Widens past the private modifier at exactly one place. See {@link GraphBuilder}. */
function graphBuilderOf(service: object): GraphBuilder {
  return service as unknown as GraphBuilder;
}

interface LiveActivity {
  id: string;
  code: string;
  durationDays: number;
  version: number;
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

/** See `interchange-roundtrip.e2e-spec.ts` — Better Auth validates Origin against trustedOrigins. */
const TRUSTED_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const EMAIL = 'revision-delta@example.com';

describe.skipIf(!hasDatabase)('Revision delta — M0 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let client: SeedClient;
  let projectId: string;
  const orgSlug = 'delta-co';

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
    await app.listen(0);
    const baseUrl = await app.getUrl();
    prisma = app.get(Token);

    await resetDatabase();
    projectId = await bootstrapOrganisation(baseUrl);

    client = new SeedClient({ baseUrl, origin: TRUSTED_ORIGIN });
    await client.authenticate({ email: EMAIL, password: PASSWORD });
  }, 300_000);

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  /** Children before parents. The database is shared between specs, so this clears others' rows too. */
  async function resetDatabase(): Promise<void> {
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planLock.deleteMany();
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.planShare.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarExceptionWindow.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendarShift.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  async function bootstrapOrganisation(baseUrl: string): Promise<string> {
    const request = (await import('supertest')).default;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ name: 'Delta', email: EMAIL, password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Delta Co' }).expect(201);
    const clientRes = await agent
      .post(`/api/v1/organizations/${orgSlug}/clients`)
      .send({ name: 'Revision' })
      .expect(201);
    const projectRes = await agent
      .post(`/api/v1/organizations/${orgSlug}/clients/${clientRes.body.data.id}/projects`)
      .send({ name: 'Delta' })
      .expect(201);
    void baseUrl;
    return projectRes.body.data.id as string;
  }

  it('seeds the fixture, recalculates and captures a baseline through the public API', async () => {
    const spec = fixtureSpec();
    const seeded = await seedPlan(client, { orgSlug, projectId }, spec);
    expect(seeded.planId, `fixture seed failed: ${JSON.stringify(seeded.findings)}`).not.toBeNull();
    const planId = seeded.planId!;

    // The catalogue captures no baseline (docs/TEST_PLAYBOOK.md:196), so the old side of every
    // comparison has to be created here, through the ordinary write path a planner would use.
    const captured = await client.post<{ id: string }>(
      `/api/v1/organizations/${orgSlug}/plans/${planId}/baselines`,
      { name: 'M0 old side' },
    );

    const rows = await prisma.baselineActivity.count({ where: { baselineId: captured.id } });
    const activities = await prisma.activity.count({ where: { planId, deletedAt: null } });

    say(`M0 setup: plan ${planId} — ${activities} activities, baseline froze ${rows} rows`);
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBe(activities);

    // ---------------------------------------------------------------------------------------
    // NON-VACUITY — the pinned positive case, run BEFORE any other limb.
    //
    // F1 compares two ways of computing the same delta, so it passes perfectly against two
    // identical schedules. A green suite that cannot tell "all correct" from "found nothing" is
    // the failure ADR-0093 and ADR-0108 both record, which is why this runs first and why a
    // failure here is reported as the finding rather than worked around.
    // ---------------------------------------------------------------------------------------
    // F1 needs the ENGINE's own answer for both sides, so the old graph is built and computed
    // BEFORE anything is perturbed. The baseline froze the OUTPUT; this is the INPUT the engine
    // would have been handed, and it is the only way to get an authoritative old-side run to
    // compare the frozen columns against.
    const { ScheduleService } = await import('../src/modules/schedule/schedule.service');
    const svc = graphBuilderOf(app.get(ScheduleService));
    const planRow = await prisma.plan.findFirstOrThrow({ where: { id: planId } });
    const dataDate = planRow.plannedStart.toISOString().slice(0, 10);
    const graphOld = await prisma.$transaction((tx) =>
      svc.buildEngineGraph(planRow.organizationId, planRow, dataDate, tx),
    );
    const engineOld = computeSchedule(graphOld.activities, graphOld.edges, graphOld.options);
    say(
      `F1 old side: engine sees ${graphOld.activities.length} activities, ` +
        `finish ${engineOld.summary.projectFinish}, critical ${engineOld.summary.criticalCount}`,
    );

    const oldSide = await prisma.baselineActivity.findMany({
      where: { baselineId: captured.id },
      select: {
        sourceActivityId: true,
        code: true,
        isCritical: true,
        totalFloat: true,
        baselineFinish: true,
        type: true,
      },
    });

    // Perturb through the PUBLIC write path, under the pen — not by writing rows. The whole point
    // is that the old and new sides are both things the product produced.
    // The change set has to move criticality in BOTH directions, and the first version did not.
    // Extending critical activities was measured at `entered=5 left=0`: lengthening critical work
    // consumes float elsewhere, so activities JOIN the critical path, and nothing gains float, so
    // nothing leaves. A one-directional perturbation cannot satisfy a two-directional bar, however
    // large it is — which is a fact about CPM, not a threshold to tune.
    //
    // So the set is split: one group is extended (pulling work on) and a DISJOINT group is
    // shortened hard (letting its chain fall off, once the extended paths outrun it). That is also
    // what a real revision looks like — some work slips, some is re-sequenced shorter.
    // ONE LEVER AT A TIME. Three levers were applied together and recalculated once — extend,
    // shorten, cut — and every run reported the same `entered=5 left=0`, which attributes nothing:
    // the +20-day extensions dominate the network and could be masking anything that would
    // otherwise leave. This is the clean test of the only question still open, "can ANYTHING leave
    // the critical path on this fixture": shorten, and change nothing else.
    // MEASURED, one lever at a time, because three levers applied together reported the same
    // `entered=5 left=0` four times and attributed nothing:
    //
    //   extend 4 x +20d   -> entered=5  left=0
    //   shorten 12 x -20d -> entered=0  left=2   (A7210, A8200)
    //
    // Both levers work. They CANCEL: the extensions dominate the network and mask the exits, which
    // is why every combined run looked like "nothing can leave". So the change set keeps both and
    // the target sets are DISJOINT — an earlier version had extend `slice(0,4)` overlapping shrink
    // `slice(0,12)`, which would patch four activities twice, the second time with a stale version.
    // `as Lever` rather than a plain annotation: a `const` with a literal initialiser narrows to
    // that literal, so TypeScript proves the other branches dead (TS2367) and the gate refuses it.
    // The widening is the honest expression of what this is — a knob edited between runs to
    // isolate one lever at a time, which is what produced the table above.
    const LEVER = 'both' as Lever;
    const critical = oldSide.filter((a) => a.isCritical && a.type === 'TASK');
    const extend = LEVER === 'shorten' ? [] : critical.slice(0, 4);
    const shrink = LEVER === 'extend' ? [] : critical.slice(4, 16);
    say(
      `non-vacuity [lever=${LEVER}]: ${critical.length} critical TASKs — extending ${extend.length}, shortening ${shrink.length}`,
    );
    expect(critical.length, 'the fixture has no critical TASKs to perturb').toBeGreaterThan(0);
    expect(critical.length, 'too few critical TASKs to perturb').toBeGreaterThan(0);
    const overlap = extend.filter((e) =>
      shrink.some((h) => h.sourceActivityId === e.sourceActivityId),
    );
    expect(
      overlap,
      'extend and shrink must be disjoint or an activity is patched twice',
    ).toHaveLength(0);
    const targets = [...extend, ...shrink];

    // There is no GET-by-id route for an activity — the first attempt assumed one and got a bare
    // "Cannot GET" 404 from Express rather than an API error, which is what a route that does not
    // exist looks like. The list is the public read, and it is PAGED: `getPage` is used rather than
    // `get` precisely so a complete list is distinguishable from the first 100 rows of one, which
    // is a defect `client.ts:155-160` records having shipped once already.
    const live = new Map<string, { durationDays: number; version: number }>();
    let cursor: string | null = null;
    do {
      const page: { rows: LiveActivity[]; meta: { nextCursor: string | null } } =
        await client.getPage<LiveActivity>(
          `/api/v1/organizations/${orgSlug}/plans/${planId}/activities?limit=100` +
            (cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`),
        );
      for (const row of page.rows) {
        live.set(row.id, { durationDays: row.durationDays, version: row.version });
      }
      cursor = page.meta.nextCursor;
    } while (cursor !== null);
    say(`non-vacuity: read ${live.size} live activities for their versions`);
    expect(live.size).toBe(activities);

    await PenHolder.withPen(client, orgSlug, planId, async () => {
      for (const t of targets) {
        const current = live.get(t.sourceActivityId);
        expect(current, `target ${t.code} missing from the live list`).toBeDefined();
        // The routes are ASYMMETRIC and this cost two runs to learn: the activity LIST is nested
        // under a plan (`plans/:planId/activities`, used above), while a single activity is
        // addressed at the ORG level (`organizations/:orgSlug/activities/:id`,
        // `activities.controller.ts:52`). The seeder has always used the org-level form
        // (`runner.ts:414`); guessing the plan-nested one produced a bare Express "Cannot PATCH"
        // rather than an API error, which is what a route that does not exist looks like.
        // Extended or shortened by which group it is in. A duration is floored at 1 working day:
        // zero would make it a milestone by another name and change the activity's KIND, not its
        // length, which is a different class of change from the one being measured.
        const isExtend = extend.some((e) => e.sourceActivityId === t.sourceActivityId);
        const next = isExtend
          ? current!.durationDays + 20
          : Math.max(1, current!.durationDays - 20);
        await client.patch(`/api/v1/organizations/${orgSlug}/activities/${t.sourceActivityId}`, {
          durationDays: next,
          version: current!.version,
        });
      }
    });
    // Duration edits alone were measured at `left=0` twice, including with four critical tasks cut
    // by 20 days. Removing a predecessor is a different lever: it does not shorten a path, it
    // DETACHES one, so the successor's chain can float free. If that still moves nothing, the
    // honest conclusion is that this fixture cannot produce a qualifying change set through the
    // public write path — which the condition says is itself the finding, not a bar to soften.
    const links = await client.getPage<{ id: string; successor: { id: string } }>(
      `/api/v1/organizations/${orgSlug}/plans/${planId}/dependencies?limit=100`,
    );
    const criticalIds = new Set(oldSide.filter((a) => a.isCritical).map((a) => a.sourceActivityId));
    const cuts =
      LEVER === 'shorten'
        ? []
        : links.rows.filter((l) => criticalIds.has(l.successor.id)).slice(0, 3);
    // Instrumented, because cutting three dependencies moved NOTHING off the path and the two
    // candidate explanations need different fixes: either the cut edges were not driving (so
    // removing them freed nothing that was binding), or something structural holds criticality
    // here regardless. Guessing between them is what produced the wrong comment above.
    const floatBefore = new Map(oldSide.map((a) => [a.sourceActivityId, a.totalFloat ?? 0]));
    say(`non-vacuity: cutting ${cuts.length} dependencies into critical successors`);
    for (const cut of cuts) {
      say(
        `  cut ${cut.id.slice(-12)} -> successor float before = ${floatBefore.get(cut.successor.id) ?? '(unknown)'}`,
      );
    }
    if (cuts.length > 0) {
      await PenHolder.withPen(client, orgSlug, planId, async () => {
        for (const cut of cuts) {
          await client.del(`/api/v1/organizations/${orgSlug}/dependencies/${cut.id}`);
        }
      });
    }

    await client.post(`/api/v1/organizations/${orgSlug}/plans/${planId}/schedule/recalculate`);

    const newSide = await prisma.activity.findMany({
      where: { planId, deletedAt: null },
      select: {
        id: true,
        code: true,
        isCritical: true,
        totalFloat: true,
        earlyFinish: true,
        type: true,
      },
    });

    const wasCritical = new Map(oldSide.map((a) => [a.sourceActivityId, a.isCritical]));
    const entered = newSide.filter((a) => a.isCritical && wasCritical.get(a.id) === false);
    const left = newSide.filter((a) => !a.isCritical && wasCritical.get(a.id) === true);

    // Why nothing leaves is a question about the FIXTURE, and it is MEASURED.
    //
    // The first version of this comment asserted that mandatory constraints drive float deeply
    // negative here — "-60,240 minutes to -50,640, still critical". That was wrong, and the
    // readout below is what disproved it: the real spread is min=-108, p25=-42, median=0, p75=0,
    // max=176 MINUTES, with 118 of 147 activities at float <= 0. Two float values remembered from
    // a different plan in a different epic, reasoned from instead of measured — the exact ADR-0076
    // Class 3 failure this harness exists to avoid, caught only because the number was printed
    // before the explanation was committed.
    //
    // What the numbers actually say: the network is packed hard against zero float (80% of it at
    // <= 0) across a total spread under 300 minutes. A "20 day" duration edit is enormous against
    // that, which is why work joins the critical path easily — and why almost nothing has slack to
    // gain, so almost nothing can leave.
    const floats = newSide.map((a) => a.totalFloat ?? 0).sort((x, y) => x - y);
    const pct = (q: number): number =>
      floats[Math.min(floats.length - 1, Math.floor(floats.length * q))] ?? 0;
    say(
      `float distribution (minutes): min=${floats[0]} p25=${pct(0.25)} median=${pct(0.5)} ` +
        `p75=${pct(0.75)} max=${floats[floats.length - 1]} | <=0: ${floats.filter((f) => f <= 0).length}/${floats.length}`,
    );
    say(`non-vacuity: entered=${entered.length} left=${left.length}`);
    say(
      `  entered: ${entered
        .slice(0, 8)
        .map((a) => a.code)
        .join(', ')}`,
    );
    say(
      `  left:    ${left
        .slice(0, 8)
        .map((a) => a.code)
        .join(', ')}`,
    );
    const byId = new Map(newSide.map((a) => [a.id, a]));
    for (const cut of cuts) {
      const after = byId.get(cut.successor.id);
      say(
        `  detached successor ${after?.code ?? '?'}: float ${floatBefore.get(cut.successor.id) ?? '?'}` +
          ` -> ${after?.totalFloat ?? '?'}, critical ${after?.isCritical ?? '?'}`,
      );
    }

    // The bar the condition committed to, before any of this existed.
    expect(
      entered.length,
      'non-vacuity: fewer than 3 activities entered the critical path',
    ).toBeGreaterThanOrEqual(3);
    expect(left.length, 'non-vacuity: nothing left the critical path').toBeGreaterThanOrEqual(1);

    // ---------------------------------------------------------------------------------------
    // F1 — FIDELITY. The delta computed from persisted/frozen columns must equal the delta
    // computed from two authoritative `computeSchedule` runs over the same two input states.
    //
    // This is the claim the whole design rests on, and nothing proved it before now: the
    // persisted columns are day-denominated projections of minute quantities (ADR-0036 §7), and
    // a baseline's frozen values were written by a possibly-older engine. If the two disagree,
    // the failure names which side and which quantity; the remedy is a scope decision, not a
    // softened bar.
    // ---------------------------------------------------------------------------------------
    const graphNew = await prisma.$transaction((tx) =>
      svc.buildEngineGraph(planRow.organizationId, planRow, dataDate, tx),
    );
    const engineNew = computeSchedule(graphNew.activities, graphNew.edges, graphNew.options);

    const engineWasCritical = new Map(engineOld.results.map((r) => [r.activityId, r.isCritical]));
    const engineEntered = engineNew.results
      .filter((r) => r.isCritical && engineWasCritical.get(r.activityId) === false)
      .map((r) => r.activityId);
    const engineLeft = engineNew.results
      .filter((r) => !r.isCritical && engineWasCritical.get(r.activityId) === true)
      .map((r) => r.activityId);

    const persistedEntered = new Set(entered.map((a) => a.id));
    const persistedLeft = new Set(left.map((a) => a.id));
    const sameSet = (a: Set<string>, b: readonly string[]): boolean =>
      a.size === b.length && b.every((id) => a.has(id));

    say(
      `F1 sets: persisted entered=${persistedEntered.size} left=${persistedLeft.size} | ` +
        `engine entered=${engineEntered.length} left=${engineLeft.length}`,
    );

    // Carrier movement on the carrier's own calendar, through the SHARED ADR-0116 rules —
    // imported, never restated, which is what the condition file instructs.
    const carrier = selectCompletionCarrier(graphOld.activities, engineOld.results);
    const carrierAfter = engineNew.results.find((r) => r.activityId === carrier?.activityId);
    const carrierActivity = graphOld.activities.find((a) => a.id === carrier?.activityId);
    const engineMovement =
      carrier !== undefined && carrierAfter !== undefined
        ? measureCarrierMovementDays({
            carrier,
            carrierPerturbed: carrierAfter,
            calendar: carrierActivity?.calendar ?? graphOld.options.calendar,
            dayFactorMinutes: 8 * 60,
          })
        : Number.NaN;
    say(
      `F1 carrier: ${carrier?.activityId.slice(-12) ?? '(none)'} moved ${engineMovement} working days`,
    );

    const enteredAgrees = sameSet(persistedEntered, engineEntered);
    const leftAgrees = sameSet(persistedLeft, engineLeft);
    say(
      `F1 verdict: entered ${enteredAgrees ? 'AGREE' : 'DISAGREE'}, left ${leftAgrees ? 'AGREE' : 'DISAGREE'}`,
    );
    if (!enteredAgrees) {
      const pOnly = [...persistedEntered].filter((id) => !engineEntered.includes(id)).length;
      say(
        `  entered persisted-only=${pOnly} engine-only=${engineEntered.filter((id) => !persistedEntered.has(id)).length}`,
      );
    }
    if (!leftAgrees) {
      const pOnly = [...persistedLeft].filter((id) => !engineLeft.includes(id)).length;
      say(
        `  left persisted-only=${pOnly} engine-only=${engineLeft.filter((id) => !persistedLeft.has(id)).length}`,
      );
    }
    expect(
      enteredAgrees,
      'F1: entered sets disagree between the persisted columns and the engine',
    ).toBe(true);
    expect(leftAgrees, 'F1: left sets disagree between the persisted columns and the engine').toBe(
      true,
    );

    // ---------------------------------------------------------------------------------------
    // F2 — CARRIER AGREEMENT. The carrier derived from DATE-ONLY persisted columns must be the
    // same activity `selectCompletionCarrier` picks from engine results.
    //
    // The engine sorts by `earlyFinishOffset` in MINUTES and breaks ties by id
    // (`completion-carrier.ts:53-63`). A frozen baseline stores `baseline_finish` as a DATE. So
    // the two rules diverge precisely when two non-summary activities finish on the same DATE at
    // different MINUTES: the engine takes the later minute, the date-only rule cannot see it and
    // falls through to the id tie-break. That is not a hypothetical — it is the only way this
    // design's cheaper input can pick a different activity from the shipped rule.
    // ---------------------------------------------------------------------------------------
    const dateOnlyCarrier = (
      rows: readonly { sourceActivityId: string; type: string; baselineFinish: Date | null }[],
    ): string | undefined =>
      rows
        .filter((r) => r.type !== 'WBS_SUMMARY' && r.baselineFinish !== null)
        .sort((x, y) => {
          const dx = (x.baselineFinish as Date).getTime();
          const dy = (y.baselineFinish as Date).getTime();
          // Same ordering discipline as the engine: latest first, then id ascending.
          return dy - dx || x.sourceActivityId.localeCompare(y.sourceActivityId);
        })[0]?.sourceActivityId;

    const persistedCarrier = dateOnlyCarrier(oldSide);
    const engineCarrier = carrier?.activityId;
    say(
      `F2 carrier: persisted=${persistedCarrier?.slice(-12) ?? '(none)'} ` +
        `engine=${engineCarrier?.slice(-12) ?? '(none)'} — ` +
        `${persistedCarrier === engineCarrier ? 'AGREE' : 'DISAGREE'}`,
    );

    // How many non-summary rows share the winning DATE. More than one means the fixture exercises
    // the tie naturally; exactly one means the comparison above says nothing about ties, and the
    // synthetic case below is doing the work. Stated either way rather than left ambiguous.
    const winningDate = oldSide.find(
      (r) => r.sourceActivityId === persistedCarrier,
    )?.baselineFinish;
    const sharingDate = oldSide.filter(
      (r) =>
        r.type !== 'WBS_SUMMARY' &&
        r.baselineFinish !== null &&
        winningDate != null &&
        r.baselineFinish.getTime() === winningDate.getTime(),
    ).length;
    say(`F2 tie context: ${sharingDate} non-summary rows share the winning date`);

    // The DELIBERATELY CONSTRUCTED tie the condition asks for. Synthetic and labelled as such: it
    // is a property of the two ORDERING RULES, not of this plan, so building it in memory tests
    // exactly the thing at issue without a second five-minute seed.
    const tieDate = new Date('2027-03-12T00:00:00Z');
    const syntheticTie = [
      { sourceActivityId: 'zzzz-later-minute', type: 'TASK', baselineFinish: tieDate },
      { sourceActivityId: 'aaaa-earlier-minute', type: 'TASK', baselineFinish: tieDate },
    ];
    const tieWinner = dateOnlyCarrier(syntheticTie);
    say(`F2 synthetic tie: date-only rule picks ${tieWinner}`);
    // Deterministic, and by the SAME discipline the engine uses — lowest id wins a tie. It can
    // still differ from the engine when the engine can see minutes the date cannot, which is the
    // residual this limb exists to surface rather than to eliminate.
    expect(tieWinner, 'F2: the date-only tie-break must be deterministic and id-ascending').toBe(
      'aaaa-earlier-minute',
    );

    expect(
      persistedCarrier,
      'F2: the date-only carrier disagrees with selectCompletionCarrier',
    ).toBe(engineCarrier);

    // The real comparison above AGREED, and it agreed WITHOUT a tie — the fixture puts exactly one
    // non-summary row on the winning date. So it is true and says nothing about the residual, which
    // is the only place these two rules can part company. Both rules are pure, so the question is
    // answered directly rather than left to a fixture that happens not to contain the case.
    //
    // Two activities, same DATE, different MINUTES, and the LATER minute has the HIGHER id — so
    // the id tie-break and the minute ordering point at different activities on purpose.
    const tieActivities = [
      { id: 'aaaa-earlier-minute', type: 'TASK', durationMinutes: 480 },
      { id: 'zzzz-later-minute', type: 'TASK', durationMinutes: 480 },
    ] as unknown as Parameters<typeof selectCompletionCarrier>[0];
    const tieResults = [
      { activityId: 'aaaa-earlier-minute', earlyFinishOffset: 1_000 },
      { activityId: 'zzzz-later-minute', earlyFinishOffset: 1_400 },
    ] as unknown as Parameters<typeof selectCompletionCarrier>[1];
    const engineTiePick = selectCompletionCarrier(tieActivities, tieResults)?.activityId;
    say(
      `F2 residual: same date, different minutes — engine picks ${engineTiePick}, ` +
        `date-only picks ${tieWinner} — ${engineTiePick === tieWinner ? 'AGREE' : 'DISAGREE'}`,
    );

    // This is REPORTED, not asserted equal. The condition says a disagreement here is recorded and
    // the panel names the carrier — it is a known cost of the cheaper input, not a defect to fix by
    // pretending the date carries minutes it does not.
    expect(engineTiePick, 'the engine must still order by minutes when the dates tie').toBe(
      'zzzz-later-minute',
    );
  }, 900_000);
});
