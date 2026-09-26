import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type LagCalendarSource, type Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearDomainData } from './audit-reset';

/**
 * **The cross-plan lag re-encoding, against a populated real Postgres** (#385 M2-T2, spec §4.4 and
 * FC-7 as rewritten by database-architect B1–B5; ADR-0107's practice).
 *
 * CI provisions an empty database, on which the rewrite is a silent no-op, so `migrate deploy`
 * going green proves nothing about it. This seeds every resolution path in the OLD encoding
 * (`days × 1440`), runs the migration's last statement **read from the shipped file**, and asserts
 * **hand-written** expected `lag_minutes` read back from the database (B2: the API's
 * `Math.round(minutes / factor)` would hide a wrong factor, so the API is not the oracle here).
 *
 * The links are inserted with Prisma rather than through the create route on purpose: M2-T3 changes
 * that route to write working minutes, so seeding through it would seed the new unit and test
 * nothing.
 *
 * The reverse and the factor-drift finder are run **as written in `docs/DEPLOYMENT.md`**, extracted
 * by their marker line, inside a transaction that is rolled back, so the record table and the
 * `_prisma_migrations` row the reverse drops come back for the next case.
 *
 * **Each case was verified red against the defect it names**; the runs are recorded in
 * `docs/specs/cross-plan-day-boundary/m2/red-runs.md`.
 *
 * The fixture gives every resolution path its own factor, so a link resolved on the wrong path
 * lands on a different number rather than on a coincidence:
 *
 * | Calendar       | Factor | Bound to                                                          |
 * | -------------- | ------ | ----------------------------------------------------------------- |
 * | `U`            | 600    | the upstream plan (predecessors)                                  |
 * | `D`            | 480    | the downstream plan (successors)                                  |
 * | `W`            | 300    | plan W, which a drifted link's `successor_plan_id` names (B5)     |
 * | `OWN`          | 360    | an activity's own calendar                                        |
 * | `DRIVER`       | 420    | the live driving resource (and a soft-deleted resource's)         |
 * | `OLD_DRIVER`   | 240    | a soft-deleted driving assignment's resource                      |
 * | `NON_DRIVER`   | 180    | a live non-driving assignment's resource                          |
 * | `DELETED`      | 540    | a soft-deleted calendar still bound to an activity                |
 * | `FULL`         | 1440   | an activity's own full-day calendar                               |
 * | (none)         | 1440   | plan V has no calendar at all                                     |
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const MIGRATION_NAME = '20260926120000_cross_plan_lag_working_minutes';

const MIGRATION_SQL = readFileSync(
  join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql'),
  'utf8',
);

const DEPLOYMENT_MD = readFileSync(
  join(__dirname, '..', '..', '..', 'docs', 'DEPLOYMENT.md'),
  'utf8',
);

/**
 * Split SQL into statements: whole-line `--` comments dropped, then split on `;` **outside** a
 * `$$ … $$` body, because the reverse's two checks are `DO` blocks with semicolons inside.
 */
function statementsOf(sql: string): string[] {
  const text = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  const out: string[] = [];
  let current = '';
  let inDollar = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith('$$', i)) {
      inDollar = !inDollar;
      current += '$$';
      i += 1;
      continue;
    }
    const ch = text[i] as string;
    if (ch === ';' && !inDollar) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out.filter((s) => s.length > 0);
}

/** The conversion: the file's last statement. The earlier ones create the record table, which exists. */
function conversionStatement(): string {
  const last = statementsOf(MIGRATION_SQL).at(-1)!;
  if (!last.startsWith('WITH resolved AS')) {
    throw new Error('the conversion is not the last statement of the migration');
  }
  return last;
}

/** The migration's `resolved` CTE, which the runbook must carry verbatim. */
function resolvedCte(sql: string): string {
  const match = /^WITH resolved AS \(\n[\s\S]*?\n\)/m.exec(sql);
  if (!match) throw new Error('no `WITH resolved AS (…)` CTE found');
  return match[0];
}

/** A fenced ```sql block of `docs/DEPLOYMENT.md`, found by its first line. */
function runbookBlock(marker: string): string {
  const blocks = [...DEPLOYMENT_MD.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1] as string);
  const found = blocks.filter((b) => b.startsWith(`${marker}\n`));
  if (found.length !== 1)
    throw new Error(`expected one runbook block "${marker}", found ${found.length}`);
  return found[0] as string;
}

const REVERSE_SQL = runbookBlock('-- cross-plan lag: reverse');
const FINDER_SQL = runbookBlock('-- cross-plan lag: factor-drift finder');

/** Sentinel thrown to roll back an interactive transaction once its assertions have run. */
class RolledBack extends Error {}

/**
 * Run `body` in one transaction and always roll it back. An assertion that fails inside `body`
 * propagates as itself; only the sentinel is swallowed.
 */
async function inRolledBackTransaction(
  prisma: PrismaClient,
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RolledBack();
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (!(error instanceof RolledBack)) throw error;
    return;
  }
  throw new Error('the transaction committed; it must always roll back');
}

const DAY = 1440;

/** One seeded link and what the migration must do to it. Every `expected*` value is hand-written. */
interface Case {
  key: string;
  lagCalendar: LagCalendarSource;
  priorLagMinutes: number;
  expectedLagMinutes: number;
  expectedFactor: number;
  /** A calendar KEY from the fixture table, or null for "no calendar" (`TWENTY_FOUR_HOUR`, plan V). */
  expectedCalendar: string | null;
  /** The plan the record's `plan_id` must name: the SUCCESSOR ACTIVITY's plan. */
  expectedPlan: 'D' | 'V';
  predecessor: string;
  successor: string;
  /** For the one B5 case: the link's denormalised `successor_plan_id` names a different plan. */
  successorPlanOverride?: 'W';
  deleted?: boolean;
}

const CASES: Case[] = [
  // PROJECT_DEFAULT: the SUCCESSOR activity's plan (CQ-2). Red against the predecessor's plan (600).
  {
    key: 'PD',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 2 * DAY,
    expectedLagMinutes: 960,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd1',
  },
  // B5: the link says plan W (300); the successor ACTIVITY is in plan D (480). Red against reading
  // the link's `successor_plan_id`: 4320 × 300 / 1440 = 900.
  {
    key: 'PD_DRIFTED_PLAN_ID',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 3 * DAY,
    expectedLagMinutes: 1440,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd2',
    successorPlanOverride: 'W',
  },
  // PREDECESSOR, inheriting ITS OWN plan (U, 600). Red against the successor's plan calendar (480).
  {
    key: 'PRED_INHERITS_OWN_PLAN',
    lagCalendar: 'PREDECESSOR',
    priorLagMinutes: 1 * DAY,
    expectedLagMinutes: 600,
    expectedFactor: 600,
    expectedCalendar: 'U',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd3',
  },
  {
    key: 'PRED_OWN_CALENDAR',
    lagCalendar: 'PREDECESSOR',
    priorLagMinutes: 2 * DAY,
    expectedLagMinutes: 720,
    expectedFactor: 360,
    expectedCalendar: 'OWN',
    expectedPlan: 'D',
    predecessor: 'uB',
    successor: 'd4',
  },
  // RESOURCE_DEPENDENT with a live driver (420), a soft-deleted driver (240) and a live NON-driving
  // assignment (180) — exactly one record, on the live driver. Red against a join without
  // `is_driving` or without the assignment's `deleted_at IS NULL` (fan-out).
  {
    key: 'PRED_DRIVEN',
    lagCalendar: 'PREDECESSOR',
    priorLagMinutes: 1 * DAY,
    expectedLagMinutes: 420,
    expectedFactor: 420,
    expectedCalendar: 'DRIVER',
    expectedPlan: 'D',
    predecessor: 'uR',
    successor: 'd5',
  },
  // A soft-deleted RESOURCE_DEPENDENT endpoint with a live driver falls back to its own calendar,
  // here inherited from plan U (spec E29). Red against a join without the activity guard (420).
  {
    key: 'PRED_DELETED_ENDPOINT',
    lagCalendar: 'PREDECESSOR',
    priorLagMinutes: 1 * DAY,
    expectedLagMinutes: 600,
    expectedFactor: 600,
    expectedCalendar: 'U',
    expectedPlan: 'D',
    predecessor: 'uZ',
    successor: 'd6',
  },
  // SUCCESSOR bound to a SOFT-DELETED calendar (540): the calendar join has no deleted_at filter
  // (spec E30). Red against a filtered join (factor 1440, row unchanged).
  {
    key: 'SUCC_DELETED_CALENDAR',
    lagCalendar: 'SUCCESSOR',
    priorLagMinutes: 2 * DAY,
    expectedLagMinutes: 1080,
    expectedFactor: 540,
    expectedCalendar: 'DELETED',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'dB',
  },
  // SUCCESSOR inheriting its own plan (D), as a lead.
  {
    key: 'SUCC_INHERITS_LEAD',
    lagCalendar: 'SUCCESSOR',
    priorLagMinutes: -1 * DAY,
    expectedLagMinutes: -480,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uB',
    successor: 'd7',
  },
  // A RESOURCE_DEPENDENT successor whose driving resource is soft-deleted: own calendar (360).
  // Red against a join without the resource's deleted_at guard (420).
  {
    key: 'SUCC_DELETED_RESOURCE',
    lagCalendar: 'SUCCESSOR',
    priorLagMinutes: 1 * DAY,
    expectedLagMinutes: 360,
    expectedFactor: 360,
    expectedCalendar: 'OWN',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'dR',
  },
  // Unchanged classes (B3): lag_minutes, version and updated_at all stay.
  {
    key: 'TWENTY_FOUR_HOUR',
    lagCalendar: 'TWENTY_FOUR_HOUR',
    priorLagMinutes: 5 * DAY,
    expectedLagMinutes: 5 * DAY,
    expectedFactor: 1440,
    expectedCalendar: null,
    expectedPlan: 'D',
    predecessor: 'uB',
    successor: 'd8',
  },
  {
    key: 'ZERO_LAG',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 0,
    expectedLagMinutes: 0,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd9',
  },
  {
    key: 'NO_CALENDAR_ANYWHERE',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 2 * DAY,
    expectedLagMinutes: 2 * DAY,
    expectedFactor: 1440,
    expectedCalendar: null,
    expectedPlan: 'V',
    predecessor: 'uA',
    successor: 'v1',
  },
  {
    key: 'FULL_DAY_CALENDAR',
    lagCalendar: 'SUCCESSOR',
    priorLagMinutes: 2 * DAY,
    expectedLagMinutes: 2 * DAY,
    expectedFactor: 1440,
    expectedCalendar: 'FULL',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'dF',
  },
  // A soft-deleted LINK is converted too: a restored link must not come back in the old unit.
  {
    key: 'SOFT_DELETED_LINK',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 4 * DAY,
    expectedLagMinutes: 1920,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd10',
    deleted: true,
  },
  // Not a multiple of 1440: converted by the same formula, no RAISE, recorded with its prior value.
  {
    key: 'NON_MULTIPLE',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 720,
    expectedLagMinutes: 240,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd11',
  },
  {
    key: 'ONE_MINUTE',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 1,
    expectedLagMinutes: 0,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd12',
  },
  // Overflow (B1): ±3,650 days. In int4, 5,256,000 × 480 and 5,256,000 × 1440 both overflow — and
  // the factor-1440 rows overflow although the statement then leaves them alone, because the WITH
  // form evaluates every row. Expected values computed in numeric, never in int4.
  {
    key: 'OVERFLOW_480_POS',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 3650 * DAY,
    expectedLagMinutes: 1_752_000,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd13',
  },
  {
    key: 'OVERFLOW_480_NEG',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: -3650 * DAY,
    expectedLagMinutes: -1_752_000,
    expectedFactor: 480,
    expectedCalendar: 'D',
    expectedPlan: 'D',
    predecessor: 'uA',
    successor: 'd14',
  },
  {
    key: 'OVERFLOW_1440_POS',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: 3650 * DAY,
    expectedLagMinutes: 3650 * DAY,
    expectedFactor: 1440,
    expectedCalendar: null,
    expectedPlan: 'V',
    predecessor: 'uA',
    successor: 'v2',
  },
  {
    key: 'OVERFLOW_1440_NEG',
    lagCalendar: 'PROJECT_DEFAULT',
    priorLagMinutes: -3650 * DAY,
    expectedLagMinutes: -3650 * DAY,
    expectedFactor: 1440,
    expectedCalendar: null,
    expectedPlan: 'V',
    predecessor: 'uA',
    successor: 'v3',
  },
];

/** Hand-checked arithmetic: every expected value is `round(prior × factor / 1440)`, in exact rationals. */
for (const c of CASES) {
  const exact = (c.priorLagMinutes * c.expectedFactor) / DAY;
  if (Math.abs(exact - c.expectedLagMinutes) > 0.5) {
    throw new Error(
      `fixture arithmetic is wrong for ${c.key}: ${exact} vs ${c.expectedLagMinutes}`,
    );
  }
}

interface World {
  organizationId: string;
  planIds: Record<'U' | 'D' | 'W' | 'V', string>;
  calendarIds: Record<string, string>;
  activityIds: Record<string, string>;
  linkIds: Record<string, string>;
}

interface LinkRow {
  id: string;
  lag_minutes: number;
  version: number;
  updated_at: Date;
  deleted_at: Date | null;
}

describe.skipIf(!hasDatabase)('cross-plan lag re-encoding migration (e2e)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  beforeEach(async () => {
    // The record's organisation FK is RESTRICT; the plan FK cascades, but go first regardless.
    await prisma.$executeRawUnsafe('DELETE FROM "cross_plan_lag_migrations"');
    await clearDomainData(prisma);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "cross_plan_lag_migrations"');
    await clearDomainData(prisma);
    await prisma.$disconnect();
  });

  async function seed(): Promise<World> {
    const org = await prisma.organization.create({ data: { name: 'Lag', slug: 'xplag' } });
    const organizationId = org.id;
    const client = await prisma.client.create({ data: { organizationId, name: 'Northgate' } });
    const project = await prisma.project.create({
      data: { organizationId, clientId: client.id, name: 'Riverside' },
    });

    const factors: Record<string, number> = {
      U: 600,
      D: 480,
      W: 300,
      OWN: 360,
      DRIVER: 420,
      OLD_DRIVER: 240,
      NON_DRIVER: 180,
      DELETED: 540,
      FULL: 1440,
      // Two calendars only the drift-finder case uses, created now so every calendar predates it.
      PATH_A: 480,
      PATH_B: 600,
      HOURS: 480,
    };
    const calendarIds: Record<string, string> = {};
    for (const [key, hoursPerDayMinutes] of Object.entries(factors)) {
      const cal = await prisma.calendar.create({
        data: { organizationId, name: `cal-${key}`, hoursPerDayMinutes },
      });
      calendarIds[key] = cal.id;
    }
    await prisma.calendar.update({
      where: { id: calendarIds.DELETED! },
      data: { deletedAt: new Date('2026-09-01T00:00:00Z') },
    });

    const plan = (name: string, calendarId: string | null) =>
      prisma.plan.create({
        data: {
          organizationId,
          projectId: project.id,
          name,
          plannedStart: new Date('2026-01-05'),
          calendarId,
        },
      });
    const planIds = {
      U: (await plan('Upstream', calendarIds.U!)).id,
      D: (await plan('Downstream', calendarIds.D!)).id,
      W: (await plan('Wrong', calendarIds.W!)).id,
      V: (await plan('No calendar', null)).id,
    };

    const activityIds: Record<string, string> = {};
    const activity = async (
      key: string,
      planKey: keyof typeof planIds,
      extra: Partial<Prisma.ActivityUncheckedCreateInput> = {},
    ) => {
      const row = await prisma.activity.create({
        data: { organizationId, planId: planIds[planKey], name: key, code: key, ...extra },
      });
      activityIds[key] = row.id;
      return row.id;
    };

    await activity('uA', 'U');
    await activity('uB', 'U', { calendarId: calendarIds.OWN! });
    await activity('uR', 'U', { type: 'RESOURCE_DEPENDENT' });
    await activity('uZ', 'U', {
      type: 'RESOURCE_DEPENDENT',
      deletedAt: new Date('2026-09-01T00:00:00Z'),
    });
    for (let i = 1; i <= 19; i += 1) await activity(`d${i}`, 'D');
    await activity('dB', 'D', { calendarId: calendarIds.DELETED! });
    await activity('dR', 'D', { type: 'RESOURCE_DEPENDENT', calendarId: calendarIds.OWN! });
    await activity('dF', 'D', { calendarId: calendarIds.FULL! });
    await activity('dP', 'D', { calendarId: calendarIds.PATH_A! });
    await activity('dH', 'D', { calendarId: calendarIds.HOURS! });
    for (let i = 1; i <= 3; i += 1) await activity(`v${i}`, 'V');

    const resource = async (name: string, calendarKey: string, deleted = false) =>
      (
        await prisma.resource.create({
          data: {
            organizationId,
            name,
            kind: 'LABOUR',
            calendarId: calendarIds[calendarKey]!,
            ...(deleted ? { deletedAt: new Date('2026-09-01T00:00:00Z') } : {}),
          },
        })
      ).id;
    const driver = await resource('Driver', 'DRIVER');
    const oldDriver = await resource('Old driver', 'OLD_DRIVER');
    const nonDriver = await resource('Non-driver', 'NON_DRIVER');
    const deletedResource = await resource('Deleted driver', 'DRIVER', true);
    const zDriver = await resource('Deleted-endpoint driver', 'DRIVER');

    const assign = (activityKey: string, resourceId: string, isDriving: boolean, deleted = false) =>
      prisma.resourceAssignment.create({
        data: {
          organizationId,
          activityId: activityIds[activityKey]!,
          resourceId,
          isDriving,
          ...(deleted ? { deletedAt: new Date('2026-09-01T00:00:00Z') } : {}),
        },
      });
    await assign('uR', oldDriver, true, true);
    await assign('uR', driver, true);
    await assign('uR', nonDriver, false);
    await assign('uZ', zDriver, true);
    await assign('dR', deletedResource, true);

    const linkIds: Record<string, string> = {};
    const planOf = (key: string): keyof typeof planIds =>
      key.startsWith('u') ? 'U' : key.startsWith('v') ? 'V' : 'D';
    for (const c of CASES) {
      const link = await prisma.crossPlanDependency.create({
        data: {
          organizationId,
          predecessorPlanId: planIds[planOf(c.predecessor)],
          successorPlanId: planIds[c.successorPlanOverride ?? planOf(c.successor)],
          predecessorId: activityIds[c.predecessor]!,
          successorId: activityIds[c.successor]!,
          type: 'FS',
          lagMinutes: c.priorLagMinutes,
          lagCalendar: c.lagCalendar,
          ...(c.deleted ? { deletedAt: new Date('2026-09-01T00:00:00Z') } : {}),
        },
      });
      linkIds[c.key] = link.id;
    }
    return { organizationId, planIds, calendarIds, activityIds, linkIds };
  }

  const convert = () => prisma.$executeRawUnsafe(conversionStatement());

  async function links(db: PrismaClient | Prisma.TransactionClient = prisma) {
    const rows = await db.$queryRawUnsafe<LinkRow[]>(
      'SELECT "id", "lag_minutes", "version", "updated_at", "deleted_at" FROM "cross_plan_dependencies"',
    );
    return new Map(rows.map((r) => [r.id, r]));
  }

  // ---------------------------------------------------------------------------------------------

  it('converts every seeded link to the hand-written expected lag_minutes (B2, B5)', async () => {
    const world = await seed();
    await convert();
    const after = await links();
    const actual = Object.fromEntries(
      CASES.map((c) => [c.key, after.get(world.linkIds[c.key]!)!.lag_minutes]),
    );
    const expected = Object.fromEntries(CASES.map((c) => [c.key, c.expectedLagMinutes]));
    expect(actual).toEqual(expected);
  });

  it('records EVERY resolved link, unchanged ones included, with the resolution it used (B2)', async () => {
    const world = await seed();
    await convert();
    const records = await prisma.crossPlanLagMigration.findMany();
    // Every pre-release link has exactly one record — the reverse's step-3 selector depends on it.
    expect(records).toHaveLength(CASES.length);
    const byLink = new Map(records.map((r) => [r.crossPlanDependencyId, r]));
    for (const c of CASES) {
      const record = byLink.get(world.linkIds[c.key]!);
      expect(record, c.key).toBeDefined();
      expect(
        {
          organizationId: record!.organizationId,
          planId: record!.planId,
          lagCalendar: record!.lagCalendar,
          lagCalendarId: record!.lagCalendarId,
          dayFactorMinutes: record!.dayFactorMinutes,
          priorLagMinutes: record!.priorLagMinutes,
          newLagMinutes: record!.newLagMinutes,
        },
        c.key,
      ).toEqual({
        organizationId: world.organizationId,
        planId: world.planIds[c.expectedPlan],
        lagCalendar: c.lagCalendar,
        lagCalendarId: c.expectedCalendar === null ? null : world.calendarIds[c.expectedCalendar],
        dayFactorMinutes: c.expectedFactor,
        priorLagMinutes: c.priorLagMinutes,
        newLagMinutes: c.expectedLagMinutes,
      });
    }
    // One run, one instant (DEFAULT CURRENT_TIMESTAMP is the transaction start).
    expect(new Set(records.map((r) => r.migratedAt.toISOString())).size).toBe(1);
  });

  it('leaves unchanged links untouched and bumps version, not updated_at, on changed ones (B3)', async () => {
    const world = await seed();
    const before = await links();
    await convert();
    const after = await links();
    for (const c of CASES) {
      const id = world.linkIds[c.key]!;
      const was = before.get(id)!;
      const now = after.get(id)!;
      const changed = c.expectedLagMinutes !== c.priorLagMinutes;
      expect({ version: now.version, updatedAt: now.updated_at.toISOString() }, c.key).toEqual({
        version: was.version + (changed ? 1 : 0),
        updatedAt: was.updated_at.toISOString(),
      });
      // Soft-delete state survives either way.
      expect(now.deleted_at?.toISOString() ?? null, c.key).toBe(
        was.deleted_at?.toISOString() ?? null,
      );
    }
    // The unchanged classes the spec names are all present in the fixture, so the loop above is
    // not satisfied vacuously.
    const unchanged = CASES.filter((c) => c.expectedLagMinutes === c.priorLagMinutes).map(
      (c) => c.key,
    );
    expect(unchanged).toEqual(
      expect.arrayContaining([
        'TWENTY_FOUR_HOUR',
        'ZERO_LAG',
        'NO_CALENDAR_ANYWHERE',
        'FULL_DAY_CALENDAR',
      ]),
    );
  });

  it('survives ±3,650 days at factors 480 and 1440 (B1: numeric, never int4)', async () => {
    const world = await seed();
    await convert(); // an int4 product throws "integer out of range" here
    const after = await links();
    for (const key of [
      'OVERFLOW_480_POS',
      'OVERFLOW_480_NEG',
      'OVERFLOW_1440_POS',
      'OVERFLOW_1440_NEG',
    ]) {
      const c = CASES.find((x) => x.key === key)!;
      expect(after.get(world.linkIds[key]!)!.lag_minutes, key).toBe(c.expectedLagMinutes);
    }
  });

  it('carries the migration’s `resolved` CTE verbatim in both runbook blocks', () => {
    const cte = resolvedCte(MIGRATION_SQL);
    expect(cte.split('\n').length).toBeGreaterThan(20); // not an empty match
    expect(REVERSE_SQL).toContain(cte);
    expect(FINDER_SQL).toContain(cte);
  });

  describe('the reverse, as written in docs/DEPLOYMENT.md', () => {
    const reverseStatements = () => statementsOf(REVERSE_SQL);

    async function runReverse(
      tx: Prisma.TransactionClient,
      statements: string[] = reverseStatements(),
    ): Promise<void> {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    }

    /** Links created AFTER the release: already in working minutes, and unrecorded. */
    async function postRelease(world: World) {
      const make = async (
        key: string,
        successor: string,
        lagMinutes: number,
        lagCalendar: LagCalendarSource,
      ) => {
        const link = await prisma.crossPlanDependency.create({
          data: {
            organizationId: world.organizationId,
            predecessorPlanId: world.planIds.U,
            successorPlanId: world.planIds.D,
            predecessorId: world.activityIds.uA!,
            successorId: world.activityIds[successor]!,
            type: 'FS',
            lagMinutes,
            lagCalendar,
          },
        });
        world.linkIds[key] = link.id;
      };
      // Two days at 480, as the M2-T3 write path stores it.
      await make('POST_TWO_DAYS', 'd15', 960, 'PROJECT_DEFAULT');
      // -2.5 days at 480. floor(-2.5 + 0.5) = -2 matches Math.round; Postgres round() gives -3.
      await make('POST_NEGATIVE_HALF', 'd16', -1200, 'PROJECT_DEFAULT');
      await make('POST_TWENTY_FOUR_HOUR', 'd17', 5 * DAY, 'TWENTY_FOUR_HOUR');
    }

    it('restores recorded links exactly, converts later ones, drops the record, and runs once', async () => {
      const world = await seed();
      const original = await links();
      await convert();
      const migrated = await links();
      await postRelease(world);
      const beforeReverse = await links();

      await inRolledBackTransaction(prisma, async (tx) => {
        await runReverse(tx);
        const after = await links(tx);

        // Recorded links: back at the value before the migration, byte for byte — including the
        // two non-multiples of 1440, which are correctly NOT whole days. A version never goes
        // backwards: a changed link is bumped again, an unchanged one is not touched at all.
        for (const c of CASES) {
          const id = world.linkIds[c.key]!;
          const changed = c.expectedLagMinutes !== c.priorLagMinutes;
          expect(
            { lag: after.get(id)!.lag_minutes, version: after.get(id)!.version },
            c.key,
          ).toEqual({
            lag: original.get(id)!.lag_minutes,
            version: migrated.get(id)!.version + (changed ? 1 : 0),
          });
        }

        // Links created after the release: converted back to days × 1440 on today's factor.
        const expectPost = (key: string, lag: number) => {
          const id = world.linkIds[key]!;
          expect({ lag: after.get(id)!.lag_minutes, version: after.get(id)!.version }, key).toEqual(
            {
              lag,
              version: beforeReverse.get(id)!.version + 1,
            },
          );
        };
        expectPost('POST_TWO_DAYS', 2 * DAY);
        expectPost('POST_NEGATIVE_HALF', -2 * DAY); // round() would give -3 * DAY
        expectPost('POST_TWENTY_FOUR_HOUR', 5 * DAY);

        // The record and the migration's entry are gone, so a later roll-forward applies it afresh.
        const [{ table }] = await tx.$queryRawUnsafe<[{ table: string | null }]>(
          `SELECT to_regclass('public.cross_plan_lag_migrations')::text AS "table"`,
        );
        expect(table).toBeNull();
        const entries = await tx.$queryRawUnsafe<unknown[]>(
          `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '${MIGRATION_NAME}'`,
        );
        expect(entries).toHaveLength(0);

        // A second run fails at its FIRST statement, the LOCK, and so applies nothing.
        const statements = reverseStatements();
        expect(statements[0]).toMatch(/^LOCK TABLE "cross_plan_lag_migrations"/);
        await expect(tx.$executeRawUnsafe(statements[0]!)).rejects.toThrow(
          /cross_plan_lag_migrations" does not exist/,
        );
      });

      // Rolled back: the record table and the migration's entry are there again.
      expect(await prisma.crossPlanLagMigration.count()).toBe(CASES.length);
    });

    it('check 4 aborts when a recorded link is not back at its prior value', async () => {
      const world = await seed();
      await convert();
      // Something the reverse cannot restore: a recorded, UNCHANGED link (step 2 skips it)
      // carrying a value it did not have before the release.
      await prisma.$executeRawUnsafe(
        `UPDATE "cross_plan_dependencies" SET "lag_minutes" = 7 WHERE "id" = '${world.linkIds.ZERO_LAG}'`,
      );
      await inRolledBackTransaction(prisma, async (tx) => {
        await expect(runReverse(tx)).rejects.toThrow(/a recorded link is not back at its prior/);
      });
    });

    it('check 5 aborts when an unrecorded link is not a whole number of days', async () => {
      const world = await seed();
      await convert();
      await postRelease(world);
      // Step 3 is the only thing that makes an unrecorded link whole again; without it, check 5
      // must fire. (Proves the check is not vacuous: after a correct step 3 it cannot fail.)
      const withoutStep3 = reverseStatements().filter((s) => !s.startsWith('WITH resolved AS'));
      expect(withoutStep3).toHaveLength(reverseStatements().length - 1);
      await inRolledBackTransaction(prisma, async (tx) => {
        await expect(runReverse(tx, withoutStep3)).rejects.toThrow(
          /an unrecorded link is not a whole number of days/,
        );
      });
    });
  });

  describe('the factor-drift finder, as written in docs/DEPLOYMENT.md', () => {
    it('lists an hours change, a non-multiple and a resolution-path change, and nothing else', async () => {
      const world = await seed();
      await convert();

      const make = async (
        key: string,
        successor: string,
        lagMinutes: number,
        lagCalendar: LagCalendarSource,
      ) => {
        const link = await prisma.crossPlanDependency.create({
          data: {
            organizationId: world.organizationId,
            predecessorPlanId: world.planIds.U,
            successorPlanId: world.planIds.D,
            predecessorId: world.activityIds.uA!,
            successorId: world.activityIds[successor]!,
            type: 'FS',
            lagMinutes,
            lagCalendar,
          },
        });
        world.linkIds[key] = link.id;
      };
      // Every post-release lag is a whole number of days at the factor it was written with.
      await make('UNTOUCHED', 'd18', 960, 'PROJECT_DEFAULT'); // 2 days at 480; nothing changes
      await make('NOT_A_MULTIPLE', 'd19', 1000, 'PROJECT_DEFAULT'); // 1000 % 480 ≠ 0
      await make('HOURS_CHANGED', 'dH', 2400, 'SUCCESSOR'); // 5 days at 480 → 4 at 600
      await make('PATH_CHANGED', 'dP', 2400, 'SUCCESSOR'); // 5 days at 480 → 4 at 600

      await inRolledBackTransaction(prisma, async (tx) => {
        // Pin the clock: the migration "finished" at noon, every seeded row was last edited at
        // eleven, and the two edits since happened at one.
        const before = `'2026-09-26 11:00:00+00'`;
        const after = `'2026-09-26 13:00:00+00'`;
        await tx.$executeRawUnsafe(
          `UPDATE "_prisma_migrations" SET "finished_at" = '2026-09-26 12:00:00+00' WHERE "migration_name" = '${MIGRATION_NAME}'`,
        );
        for (const table of [
          'calendars',
          'plans',
          'activities',
          'resources',
          'resource_assignments',
        ]) {
          await tx.$executeRawUnsafe(`UPDATE "${table}" SET "updated_at" = ${before}`);
        }
        // An hours-per-day edit on the calendar a link resolves to.
        await tx.$executeRawUnsafe(
          `UPDATE "calendars" SET "hours_per_day_minutes" = 600, "updated_at" = ${after} WHERE "id" = '${world.calendarIds.HOURS}'`,
        );
        // A resolution-path change: the successor moved to a DIFFERENT, unedited calendar whose
        // factor 2400 is also a multiple of. Neither the calendar limb nor the multiple limb sees it.
        await tx.$executeRawUnsafe(
          `UPDATE "activities" SET "calendar_id" = '${world.calendarIds.PATH_B}', "updated_at" = ${after} WHERE "id" = '${world.activityIds.dP}'`,
        );

        const listed =
          await tx.$queryRawUnsafe<Array<{ cross_plan_dependency_id: string }>>(FINDER_SQL);
        const keyOf = new Map(Object.entries(world.linkIds).map(([k, v]) => [v, k]));
        expect(listed.map((r) => keyOf.get(r.cross_plan_dependency_id)).sort()).toEqual(
          ['HOURS_CHANGED', 'NOT_A_MULTIPLE', 'PATH_CHANGED'].sort(),
        );
      });
    });
  });

  /**
   * **M2-T3's differential check lands here** (spec FC-7, database-architect B2). For every seeded
   * row, the record's `day_factor_minutes` must equal the factor the M2-T3 cross-plan lag-calendar
   * TypeScript function returns for the same link. It is the check that catches the SQL and the
   * TypeScript being two spellings of one rule. It needs that function, which does not exist yet;
   * `CASES[*].expectedFactor` is the hand-written value both must agree with. Red against a
   * factor-1440 row that should resolve to 480.
   */
  it.todo(
    'M2-T3 differential: record.day_factor_minutes equals the cross-plan lag-calendar function for every seeded link',
  );
});
