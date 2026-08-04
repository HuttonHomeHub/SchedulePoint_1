import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { pairwiseSuite, type DimensionAssignment, type SeedSpec } from '@repo/seed';
import { SeedClient, seedPlan } from '@repo/seed-http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../../src/app-setup';
import { computeSchedule } from '../../src/modules/schedule/engine/compute';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { clearAuditEvents } from '../audit-reset';

import { COMPARED_FIELDS, formatDivergences, type Divergence } from './divergence';
import { specToEngineInput } from './spec-to-engine';

/**
 * **The pairwise differential** (ADR-0066 M3.2) — the highest-risk task in the epic, and the one
 * whose regression test is the point of it.
 *
 * ```
 *   SeedSpec ──▶ HTTP ──▶ persist ──▶ recalculate ──▶ read back ──┐
 *           │                                                     ├──▶ compare
 *           └──────────▶ computeSchedule (directly) ──────────────┘
 * ```
 *
 * **The engine's input is built from the `SeedSpec`, never from the persisted rows.** Assembling it
 * by reading the database would reuse `schedule.repository`'s own input assembly — the exact code
 * both known defects lived in — and the comparison would agree with itself. See `spec-to-engine.ts`.
 *
 * What the suite can and cannot claim, stated plainly because a green tick invites the wrong
 * reading: it **cannot** tell us the engine is right. The ADR-0034 goldens do that, per capability,
 * against documented semantics. This catches everything *between* the engine and the screen — a
 * field the write path drops, a column the read path forgets, an option the service never passes —
 * which is precisely the gap with no other gate.
 *
 * It seeds over **real HTTP** against a listening app, using the same `@repo/seed-http` seeder the
 * CLI uses. Not supertest's in-process shortcut and not a second seeder: a second one would drift,
 * and the whole premise is that the seeder is an ordinary client obeying every DTO, guard and lock.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'correct-horse-battery';
const EMAIL = 'pairwise@example.com';

/**
 * How many cases to run — **the whole array by default, everywhere, including CI**.
 *
 * The alternative was tempting and wrong: a deterministic prefix in CI, to keep the step short.
 * But then "the pairwise differential passes" would mean a third of the pairs, and the phrase would
 * not have changed. A covering array truncated is no longer a covering array, and the only reader
 * who would know is the one who opened this file.
 *
 * `PAIRWISE_CASES=<n>` narrows it for a local edit-run loop. The count is always printed, so a
 * narrowed run says so in its own output rather than looking like a full one.
 */
const CASE_LIMIT = (() => {
  const raw = process.env.PAIRWISE_CASES;
  if (raw === undefined || raw === 'all') return Number.POSITIVE_INFINITY;
  return Number.isFinite(Number(raw)) ? Number(raw) : Number.POSITIVE_INFINITY;
})();

describe.skipIf(!hasDatabase)('Pairwise differential (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let client: SeedClient;
  let projectId: string;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../../src/app.module');
    const { PrismaService: Token } = await import('../../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    // A REAL socket on an ephemeral port, not supertest's in-process handler: the seeder is a
    // `fetch` client and reusing it verbatim is what stops a second seeder existing to drift.
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = app.get(Token);

    await resetDatabase();
    projectId = await bootstrapOrganisation();

    client = new SeedClient({ baseUrl, origin: baseUrl });
    await client.authenticate({ email: EMAIL, password: PASSWORD });
  }, 120_000);

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  // Children before parents, so no FK restriction bites. The order matters and the database is
  // shared with the other e2e specs, so leaving rows behind breaks a later file's cleanup.
  async function resetDatabase(): Promise<void> {
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planLock.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  /** One org, one client, one project — the target every case seeds a plan into. */
  async function bootstrapOrganisation(): Promise<string> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', baseUrl)
      .send({ name: 'Pairwise', email: EMAIL, password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Pairwise Co' }).expect(201);
    const clientRes = await agent
      .post('/api/v1/organizations/pairwise-co/clients')
      .send({ name: 'Generated' })
      .expect(201);
    const projectRes = await agent
      .post(`/api/v1/organizations/pairwise-co/clients/${clientRes.body.data.id}/projects`)
      .send({ name: 'Pairwise cases' })
      .expect(201);
    return projectRes.body.data.id as string;
  }

  /** What the application ended up with, read back through the public API. */
  interface PersistedActivity {
    code: string;
    earlyStart: string | null;
    earlyFinish: string | null;
    lateStart: string | null;
    lateFinish: string | null;
    totalFloat: number | null;
    freeFloat: number | null;
    isCritical: boolean;
  }

  async function readBack(planId: string): Promise<Map<string, PersistedActivity>> {
    const rows = await client.get<PersistedActivity[]>(
      `/api/v1/organizations/pairwise-co/plans/${planId}/activities?limit=100`,
    );
    return new Map(rows.map((row) => [row.code, row]));
  }

  /** Seed one case, recalculate, read it back, and compare against the engine on the same spec. */
  async function runCase(caseId: string, spec: SeedSpec): Promise<Divergence[]> {
    const result = await seedPlan(client, { orgSlug: 'pairwise-co', projectId }, spec);
    // A case that could not be created is a failure of the SEEDER or the API, not a divergence —
    // reporting it as one would blame the engine for a plan that never existed.
    expect(result.findings, `${caseId} seed findings`).toEqual([]);
    expect(result.planId, `${caseId} was not created`).not.toBeNull();

    const persisted = await readBack(result.planId!);
    const input = specToEngineInput(spec);
    const expectedByKey = new Map(
      computeSchedule(input.activities, input.edges, input.options).results.map((r) => [
        r.activityId,
        r,
      ]),
    );

    return compare(caseId, spec, persisted, expectedByKey);
  }

  /** Field-by-field, engine against application. Shared so the regression guard compares alike. */
  function compare(
    caseId: string,
    spec: SeedSpec,
    persisted: ReadonlyMap<string, PersistedActivity>,
    expectedByKey: ReadonlyMap<string, unknown>,
  ): Divergence[] {
    const divergences: Divergence[] = [];
    for (const activity of spec.activities) {
      const actual = persisted.get(activity.code);
      const expected = expectedByKey.get(activity.key);
      if (actual === undefined || expected === undefined) {
        divergences.push({
          caseId,
          activityKey: activity.key,
          field: 'presence',
          expected: expected === undefined ? 'absent from engine' : 'present',
          actual: actual === undefined ? 'absent from API' : 'present',
        });
        continue;
      }
      for (const field of COMPARED_FIELDS) {
        const a = normalise(field, (actual as unknown as Record<string, unknown>)[field], 'app');
        const e = normalise(
          field,
          (expected as unknown as Record<string, unknown>)[field],
          'engine',
        );
        if (a !== e) {
          divergences.push({ caseId, activityKey: activity.key, field, expected: e, actual: a });
        }
      }
    }
    return divergences;
  }

  it(
    'the application matches the engine on every generated case',
    async () => {
      const { cases } = pairwiseSuite();
      const running = cases.slice(0, Math.min(cases.length, CASE_LIMIT));
      // Never truncate silently. A suite that quietly ran a third of its cases reports the same
      // green as one that ran them all, which is the M3.4 risk in its most damaging form.
      // eslint-disable-next-line no-console -- the count IS the result; a silent slice is the risk.
      console.log(`Pairwise differential: running ${running.length} of ${cases.length} cases.`);

      const assignments = new Map<string, DimensionAssignment>(
        cases.map((item) => [item.caseId, item.assignment]),
      );
      const divergences: Divergence[] = [];
      const started = Date.now();
      for (const item of running) {
        divergences.push(...(await runCase(item.caseId, item.spec)));
      }
      // Recorded, never asserted — a millisecond threshold on a shared CI runner is noise dressed
      // as a guarantee (the ADR-0059 M6 lesson).
      // eslint-disable-next-line no-console -- the wall-clock is M3.4's deliverable.
      console.log(`Pairwise differential: ${running.length} cases in ${Date.now() - started} ms.`);

      expect(formatDivergences(divergences, assignments)).toBe(
        'No divergences: the application matches the engine.',
      );
    },
    30 * 60_000,
  );

  /**
   * **The test that makes the suite worth having.**
   *
   * A differential that has never been seen to fail is decoration: it reports the same green
   * whether it is comparing carefully or comparing nothing. So this reintroduces one of the two
   * defects that motivated ADR-0066 — the importer coercing a `LEVEL_OF_EFFORT` activity into a
   * zero-duration `TASK` — by writing that coercion straight into the persisted row after a clean
   * seed, and asserts the comparison catches it.
   *
   * The defect is reproduced at the DATABASE, not in the spec, and that is the whole point. The
   * spec still says `LEVEL_OF_EFFORT`, so the engine still spans the logic; the row says `TASK`, so
   * the application collapses it to a point. That is exactly the shape of the original defect, in
   * which every engine golden passed and five activities in the product owner's own file were
   * wrong.
   */
  it(
    'fails when the LOE defect is reintroduced into the persisted rows',
    async () => {
      const spec = loeCaseSpec();
      const clean = await runCase('loe-regression', spec);
      // Precondition, not the assertion: if the case diverged before the sabotage, the test below
      // would "pass" for the wrong reason.
      expect(clean, 'the LOE case must be clean before the defect is introduced').toEqual([]);

      const plan = await prisma.plan.findFirstOrThrow({ where: { name: spec.plan.name } });
      // The coercion, written exactly as the importer used to make it: the type is lost and the
      // duration is zeroed. Nothing else about the plan changes.
      await prisma.activity.updateMany({
        where: { planId: plan.id, code: 'SUPERVISION' },
        data: { type: 'TASK', durationMinutes: 0 },
      });
      await client.post(
        `/api/v1/organizations/pairwise-co/plans/${plan.id}/schedule/recalculate`,
        {},
      );

      const persisted = await readBack(plan.id);
      const input = specToEngineInput(spec);
      const expectedByKey = new Map(
        computeSchedule(input.activities, input.edges, input.options).results.map((r) => [
          r.activityId,
          r,
        ]),
      );
      const sabotaged = compare('loe-regression', spec, persisted, expectedByKey);

      // The engine spans the LOE across its logic; the coerced row is a point at the data date.
      expect(
        sabotaged.length,
        'the differential did not notice the reintroduced LOE defect',
      ).toBeGreaterThan(0);
      expect(sabotaged.some((d) => d.activityKey === 'SUPERVISION')).toBe(true);
      expect(sabotaged.some((d) => d.field === 'earlyFinish')).toBe(true);
    },
    5 * 60_000,
  );
});

/**
 * A minimal plan with a Level-of-Effort activity that spans its logic — the shape the defect
 * destroyed. Hand-written rather than picked out of the pairwise array so the regression test does
 * not silently change meaning when the array does.
 */
function loeCaseSpec(): SeedSpec {
  const DAY = 1440;
  const base = {
    code: '',
    name: '',
    type: 'TASK' as const,
    durationMinutes: 5 * DAY,
    calendarKey: null,
    parentKey: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    scheduleAsLateAsPossible: false,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME' as const,
    externalEarlyStart: null,
    externalLateFinish: null,
    levelingPriority: null,
    accrualType: 'UNIFORM' as const,
    budgetedExpense: null,
    actualExpense: null,
    steps: [],
    progress: null,
    visualStart: null,
    testTags: [],
  };
  return {
    seedName: 'pairwise-loe-regression',
    tier: 'pairwise',
    plan: {
      name: 'LOE regression guard',
      description:
        'Seeded clean, then the persisted LOE row is coerced to a zero-duration TASK — the ' +
        'importer defect that motivated ADR-0066. The differential must notice.',
      dataDate: '2026-03-02',
      defaultCalendarKey: null,
      currencyCode: null,
      options: {
        schedulingMode: 'EARLY',
        progressRecalcMode: 'RETAINED_LOGIC',
        useExpectedFinishDates: false,
        criticalPathDefinition: 'TOTAL_FLOAT',
        criticalFloatThresholdMinutes: 0,
        totalFloatMode: 'FINISH',
        makeOpenEndsCritical: false,
        levelResources: false,
        levelWithinFloatOnly: false,
        ignoreExternalRelationships: false,
      },
    },
    calendars: [],
    resources: [],
    activities: [
      { ...base, key: 'START', code: 'START', name: 'Start', durationMinutes: 3 * DAY },
      { ...base, key: 'BUILD', code: 'BUILD', name: 'Build', durationMinutes: 8 * DAY },
      // Spans START through BUILD, taking its dates from the logic (ADR-0035 §21).
      {
        ...base,
        key: 'SUPERVISION',
        code: 'SUPERVISION',
        name: 'Site supervision',
        type: 'LEVEL_OF_EFFORT',
        durationMinutes: 0,
      },
    ],
    dependencies: [
      {
        predecessorKey: 'START',
        successorKey: 'BUILD',
        type: 'FS',
        lagMinutes: 0,
        lagCalendarSource: 'PROJECT_DEFAULT',
      },
      {
        predecessorKey: 'START',
        successorKey: 'SUPERVISION',
        type: 'SS',
        lagMinutes: 0,
        lagCalendarSource: 'PROJECT_DEFAULT',
      },
      {
        predecessorKey: 'SUPERVISION',
        successorKey: 'BUILD',
        type: 'FF',
        lagMinutes: 0,
        lagCalendarSource: 'PROJECT_DEFAULT',
      },
    ],
    assignments: [],
    unplaceable: [],
  };
}

/**
 * Compare like with like — three real differences in how the two sides express the same value, and
 * getting any of them wrong makes the suite report a divergence on every activity in every case,
 * which buries the ones that mean something.
 *
 * The float one is a genuine contract difference and not a quirk of this test: the **engine returns
 * float in working MINUTES** (ADR-0036's internal axis) and the **API returns it in working DAYS**
 * (`ActivityResponseDto` says so). Both are correct for their audience; the differential has to
 * know. 20160 minutes and 14 days are the same float, and the first run reported it as 40-odd
 * divergences until this converted.
 */
function normalise(field: string, value: unknown, side: 'engine' | 'app'): unknown {
  if (value === undefined || value === null) return null;
  // Convert on the ENGINE side only, and unconditionally. A magnitude heuristic ("looks like
  // minutes") would mis-handle a sub-day float and a very large day count alike — the units are a
  // property of WHICH SIDE produced the number, never of the number.
  if (side === 'engine' && (field === 'totalFloat' || field === 'freeFloat')) {
    return typeof value === 'number' ? value / MINUTES_PER_DAY : value;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return value;
}

/** The engine's internal axis is working minutes (ADR-0036); the API's float columns are days. */
const MINUTES_PER_DAY = 1440;
