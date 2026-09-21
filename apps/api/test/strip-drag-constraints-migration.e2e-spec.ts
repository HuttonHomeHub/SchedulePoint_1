import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearDomainData } from './audit-reset';

/**
 * **The placement strip, against a real populated database** (one-planning-surface M-I-T1,
 * FC-10 clause **D**).
 *
 * **It claimed clause C too until the M-J gate pass, and could not have discharged it** — see the
 * paragraph below about writing `early_start` directly. That clause is about what the ENGINE
 * produces either side of the strip, and nothing here calls it; the claim and its refutation sat a
 * hundred lines apart in this one docblock. Clause C is `strip-bars-do-not-move.e2e-spec.ts`,
 * which seeds through the public API and recalculates on both sides.
 *
 * **This is the proof the API e2e suite structurally cannot be** — the ADR-0107 hazard, one
 * migration along. CI provisions the database pristine, so `migrate deploy` runs this migration
 * against an empty `activities` table and it is a **silent no-op**: it commits, changes nothing,
 * and every other gate goes green. The only shape that can exhibit anything is a populated one,
 * and the act is **irreversible** — there is no purge button and no undo, only the compensating
 * migration the shipped file writes out in a comment.
 *
 * **The SQL is read from the shipped migration file, never restated here.** A copy would pass while
 * the file it claims to test drifted, which is that precedent's own stated rule
 * (`account-issuer-migration.e2e-spec.ts:29-31`).
 *
 * **It runs against the REAL schema rather than a scratch one, and that is a departure from the
 * precedent with a reason.** `account-issuer` builds a cut-down table in a throwaway schema because
 * it tests a **DDL** migration and needs the table in its *pre*-migration shape. This migration is
 * pure DML against today's shape, so a hand-written copy would be a maintained duplicate that
 * drifts — and it would carry **none** of the thirteen CHECK constraints on `activities`, which is
 * precisely what a conversion clearing a constraint pair needs to be checked against. Seeding
 * through Prisma gets the real columns, the real CHECKs, the real foreign keys and the real
 * defaults for nothing.
 *
 * **Re-running the shipped migration here is safe and is itself one of the claims.** It is
 * idempotent: its predicate no longer matches a row it has converted.
 *
 * **Every case was verified red against the specific defect it guards**, not merely against
 * nothing:
 *
 * | Case                         | Verified red against                                            |
 * | ---------------------------- | --------------------------------------------------------------- |
 * | converts the binding row     | the `early_start = constraint_date` clause removed              |
 * | leaves the inert row         | `=` widened to `<=`, which converts it                          |
 * | leaves the already-placed row | `AND a."visual_start" IS NULL` deleted — the destruction path   |
 * | records what it replaced      | the `INSERT … RETURNING` reduced to a bare `SELECT` of the ids  |
 * | bumps `version`               | the `"version" = a."version" + 1` assignment removed            |
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260921120000_strip_drag_constraints',
    'migration.sql',
  ),
  'utf8',
);

/**
 * Split the file into statements, exactly as the `account-issuer` precedent does — whole-line
 * comments first, because this file is 160 lines of prose around one statement and a naive split
 * on `;` would cut inside it.
 *
 * It yields **one** statement, and the shipped SQL is written to keep it that way: no `$$` block,
 * no semicolon inside a literal, and every comment on its own line (a trailing `--` on a code line
 * would comment out the next statement's first line after the split).
 */
function statementsOf(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const DAY = 'T00:00:00.000Z';

describe.skipIf(!hasDatabase)('the placement strip migration (e2e)', () => {
  let prisma: PrismaClient;
  let planId: string;
  let ids: Record<string, string>;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await prisma.$disconnect();
  });

  async function applyMigration(): Promise<void> {
    const statements = statementsOf(MIGRATION_SQL);
    // Asserted rather than assumed: the splitter's contract and the SQL's shape are coupled, and a
    // future edit that introduced a second statement would silently run only part of the file.
    expect(statements).toHaveLength(1);
    await prisma.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
  }

  /**
   * One plan carrying all four classes.
   *
   * **The fourth row is the one FC-10's judged-by clause names and the staff-diagnostics fixture
   * does not have**: a binding SNET on an activity that ALREADY carries a `visual_start`. Without
   * it the destruction path has no fixture at all, because the M0 exhaustiveness assertion
   * partitions the SNET population by *effect* and an already-placed row is also binding — so that
   * assertion is structurally blind to this class.
   *
   * `early_start` and friends are written directly, because they are engine-owned and this test is
   * about what the migration reads, not about what the engine computes. A recalculation here would
   * be a second subject.
   */
  async function seed(): Promise<void> {
    await clearDomainData(prisma);
    const org = await prisma.organization.create({
      data: { name: 'Strip', slug: `strip-${Date.now().toString(36)}` },
    });
    const client = await prisma.client.create({
      data: { organizationId: org.id, name: 'C', createdBy: 'seed', updatedBy: 'seed' },
    });
    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        name: 'P',
        createdBy: 'seed',
        updatedBy: 'seed',
      },
    });
    const plan = await prisma.plan.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        name: 'Plan',
        plannedStart: new Date(`2026-01-05${DAY}`),
        createdBy: 'seed',
        updatedBy: 'seed',
      },
    });
    planId = plan.id;

    const make = async (
      name: string,
      code: string,
      fields: {
        constraintDate: string;
        earlyStart: string | null;
        visualStart?: string | null;
      },
    ): Promise<string> => {
      const row = await prisma.activity.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          name,
          code,
          durationMinutes: 960,
          constraintType: 'SNET',
          constraintDate: new Date(`${fields.constraintDate}${DAY}`),
          earlyStart: fields.earlyStart === null ? null : new Date(`${fields.earlyStart}${DAY}`),
          visualStart: fields.visualStart == null ? null : new Date(`${fields.visualStart}${DAY}`),
          createdBy: 'seed',
          updatedBy: 'seed',
        },
      });
      return row.id;
    };

    ids = {
      // early_start === constraint_date ⇒ the constraint is what puts the bar there.
      binding: await make('Pour slab', 'BIND', {
        constraintDate: '2026-02-02',
        earlyStart: '2026-02-02',
      }),
      // early_start > constraint_date ⇒ logic already overtook it; converting would place the bar
      // EARLIER than logic allows.
      inert: await make('Glazing', 'INERT', {
        constraintDate: '2026-02-02',
        earlyStart: '2026-02-09',
      }),
      // early_start < constraint_date ⇒ unmeasured against its constraint (a started activity's
      // actual start bypasses the clamp, and that case NEVER clears).
      unclassified: await make('Excavate', 'UNCL', {
        constraintDate: '2026-02-02',
        earlyStart: '2026-01-26',
      }),
      // Binding AND already hand-placed. The naive WHERE destroys the placement.
      placed: await make('Cladding', 'PLACED', {
        constraintDate: '2026-02-02',
        earlyStart: '2026-02-02',
        visualStart: '2026-03-16',
      }),
    };
  }

  const iso = (value: Date | null): string | null =>
    value === null ? null : value.toISOString().slice(0, 10);

  const read = async (id: string) =>
    prisma.activity.findUniqueOrThrow({
      where: { id },
      select: {
        constraintType: true,
        constraintDate: true,
        visualStart: true,
        earlyStart: true,
        version: true,
        updatedBy: true,
      },
    });

  beforeEach(async () => {
    await seed();
  });

  it('converts the binding row: the date moves to visualStart and the constraint pair clears', async () => {
    const before = await read(ids.binding!);
    await applyMigration();
    const after = await read(ids.binding!);

    expect(iso(after.visualStart)).toBe('2026-02-02');
    expect(after.constraintType).toBeNull();
    expect(after.constraintDate).toBeNull();
    // The bar's own engine columns are untouched — the migration writes no engine output, and the
    // stale values are what make the picture identical until the next recalculation.
    expect(iso(after.earlyStart)).toBe(iso(before.earlyStart));
  });

  /**
   * **`SET visual_start = constraint_date, constraint_date = NULL` reads the OLD row**, which is
   * standard SQL and exactly the kind of thing a later reader "fixes" into two statements. Pinned
   * against the record rather than against a literal, so it stays true if the fixture's dates move.
   */
  it('writes the constraint’s own date, not null', async () => {
    await applyMigration();
    const record = await prisma.placementMigration.findFirstOrThrow({
      where: { activityId: ids.binding! },
    });
    const after = await read(ids.binding!);

    expect(iso(after.visualStart)).toBe(iso(record.priorConstraintDate));
  });

  /**
   * **`version` is bumped, and this is the assertion that departs from every sibling data
   * migration.** Without it a tab left open across the deploy re-writes the stripped constraint on
   * its next save — `updateBody` sends `constraintType`/`constraintDate` unconditionally, seeded
   * from the row the dialog opened with — and through `useBatchPlacements` also clears the
   * placement the migration just wrote.
   */
  it('bumps version so a stale in-flight edit is refused, and leaves updatedBy alone', async () => {
    const before = await read(ids.binding!);
    await applyMigration();
    const after = await read(ids.binding!);

    expect(after.version).toBe(before.version + 1);
    // `updated_by` deliberately keeps naming the last human, so the overview's Recently changed
    // feed is not filled with UNKNOWN-attributed plans on the day of the deploy.
    expect(after.updatedBy).toBe(before.updatedBy);
  });

  it('leaves the inert row exactly as it was', async () => {
    const before = await read(ids.inert!);
    await applyMigration();

    expect(await read(ids.inert!)).toEqual(before);
  });

  it('leaves the unclassified row exactly as it was', async () => {
    const before = await read(ids.unclassified!);
    await applyMigration();

    expect(await read(ids.unclassified!)).toEqual(before);
  });

  /**
   * **The destruction path.** Deleting `AND a."visual_start" IS NULL` from the shipped file makes
   * this case fail by overwriting `2026-03-16` with `2026-02-02` — a hand-placement destroyed, with
   * the migration recording that it did so in `prior_visual_start`.
   */
  it('leaves a binding row that already carries a placement, and destroys nothing', async () => {
    const before = await read(ids.placed!);
    await applyMigration();
    const after = await read(ids.placed!);

    expect(iso(after.visualStart)).toBe('2026-03-16');
    expect(after.constraintType).toBe('SNET');
    expect(after).toEqual(before);
  });

  it('records exactly the rows it converted, and nothing else', async () => {
    await applyMigration();
    const rows = await prisma.placementMigration.findMany({ where: { planId } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.activityId).toBe(ids.binding);
  });

  /**
   * The record is what makes the compensating migration possible, so it carries what was replaced —
   * including the activity's code and name **as they then stood**, because after a hard delete an
   * id names nothing and the report could otherwise only say "N activities".
   */
  it('records the prior constraint, the label, and a null prior placement', async () => {
    await applyMigration();
    const row = await prisma.placementMigration.findFirstOrThrow({ where: { planId } });

    expect(row.priorConstraintType).toBe('SNET');
    expect(iso(row.priorConstraintDate)).toBe('2026-02-02');
    expect(row.activityCode).toBe('BIND');
    expect(row.activityName).toBe('Pour slab');
    // Expected null on every row under the shipped predicate — a value here is a FINDING, meaning
    // the already-placed exclusion failed and a hand-placement was overwritten.
    expect(row.priorVisualStart).toBeNull();
    expect(row.planId).toBe(planId);
  });

  /**
   * **The id is a UUID v7, and the report's "Oldest first" ordering depends on it.**
   * `placement_migrations.id` has no database default, so the migration generates one; a
   * `gen_random_uuid()` (v4) would make the shipped repository docblock's claim — that `id` is
   * monotonic by creation — false, and `migrated_at` cannot order within a batch because it is one
   * transaction-start instant for the whole batch.
   */
  it('generates a version-7 uuid, and one migratedAt instant for the batch', async () => {
    await applyMigration();
    const rows = await prisma.placementMigration.findMany({ where: { planId } });

    for (const row of rows) {
      expect(row.id[14]).toBe('7');
      expect(['8', '9', 'a', 'b']).toContain(row.id[19]);
    }
    expect(new Set(rows.map((r) => r.migratedAt.toISOString())).size).toBe(1);
  });

  /**
   * **Idempotent.** `migrate deploy` will not re-run a migration, but a replay from backup or a
   * manual run must be harmless — and the property is worth asserting rather than reasoning about,
   * because a second run that converted the row again would double the record and (with the
   * version bump) move the row's version twice.
   */
  it('converts nothing on a second run', async () => {
    await applyMigration();
    const after = await read(ids.binding!);

    await applyMigration();

    expect(await read(ids.binding!)).toEqual(after);
    expect(await prisma.placementMigration.count({ where: { planId } })).toBe(1);
  });

  /**
   * **The exhaustiveness guard M-I needs, and it is NOT the one M0 already has.**
   *
   * M0's assertion partitions the SNET population by **effect**
   * (`binding + inert + unclassified === examined`), and an already-placed row is *also* binding —
   * so it counts as binding there and the arithmetic balances whether or not the strip destroyed
   * it. That assertion is structurally blind to the class this one is about. The question here is
   * the other one: of everything that was binding, what did the migration take and what did it
   * leave? `converted + already_placed === binding` is the only form that catches a strip which
   * silently converted an already-placed row, because it is the only one whose two sides move in
   * opposite directions when that happens.
   */
  it('accounts for every binding row: converted plus already-placed equals binding', async () => {
    const bindingBefore = await prisma.activity.count({
      where: { planId, constraintType: 'SNET', earlyStart: new Date(`2026-02-02${DAY}`) },
    });

    await applyMigration();

    const converted = await prisma.placementMigration.count({ where: { planId } });
    const alreadyPlaced = await prisma.activity.count({
      where: {
        planId,
        constraintType: 'SNET',
        earlyStart: new Date(`2026-02-02${DAY}`),
        visualStart: { not: null },
      },
    });

    expect(bindingBefore).toBe(2);
    expect(converted + alreadyPlaced).toBe(bindingBefore);
  });
});
