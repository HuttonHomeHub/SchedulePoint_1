import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * **M-A — the placement schema's two UNGATED decisions, asserted against a real database.**
 *
 * One-planning-surface M-A ships dark: three migrations add columns and a table, and nothing
 * computes or reads any of them. So this file deliberately does not restate the whole shape —
 * **it asserts only what no other gate can see.**
 *
 * **What the drift check already covers, measured rather than assumed** (2026-09-20, against this
 * repository's own `prisma:check-drift` command). A raw-SQL `CREATE INDEX` on `remaining_float` and
 * a raw-SQL `CREATE UNIQUE INDEX` on `placement_migrations(plan_id, activity_id)` were added by
 * hand and `prisma migrate diff --from-url … --to-schema-datamodel --exit-code` reported both
 * (`[-] Removed index on columns (remaining_float)`, `[-] Removed unique index …`) and exited **2**.
 * So the migrations' "no index" and "no unique constraint" decisions are gated, and asserting them
 * here would be decoration. They are named so the next reader does not add them back as though
 * nothing watched.
 *
 * **What it CANNOT see is a CHECK constraint** — the same run reported the hand-added
 * `ck_probe_rf` **not at all**, which is this repository's documented position (`docs/DATABASE.md`:
 * Prisma cannot express CHECK, so those live in raw SQL with no declaration, TECH_DEBT #54) seen
 * from the other side. A later migration can therefore add a CHECK to any of these columns, and
 * every gate in CI stays green while the database starts refusing rows the product decided to
 * accept. That is not hypothetical here: **negative float is the feature** (US-5 — a placement past
 * a "no later than" ceiling), and a well-meant `CHECK (remaining_float >= 0)` turns it into a failed
 * recalculation on the batched engine write.
 *
 * **Why the database and not the migration file.** Reading the SQL would prove a constraint was
 * once absent and would pass happily after a later migration added one — the assertion would
 * describe history rather than the running system (`perf-probe-sweep-columns.e2e-spec.ts`,
 * `account-issuer-migration.e2e-spec.ts`).
 *
 * The column-shape cases below are a weaker instrument and are labelled as one: a database drifted
 * BY HAND fails them, and a schema changed CONSISTENTLY does not. They are kept because the
 * no-DEFAULT rule is the most load-bearing decision in M-A — a baseline cannot be backfilled, so a
 * default would state as history something the capture never saw — and stating it at the point of
 * enforcement is worth more than the case catches.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

type ColumnRow = { data_type: string; is_nullable: string; column_default: string | null };

const readColumn = async (
  prisma: PrismaClient,
  table: string,
  column: string,
): Promise<ColumnRow | undefined> => {
  const rows = await prisma.$queryRawUnsafe<ColumnRow[]>(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    table,
    column,
  );
  return rows[0];
};

/** Every CHECK constraint on `table` whose definition mentions `column`. */
const checksMentioning = async (
  prisma: PrismaClient,
  table: string,
  column: string,
): Promise<string[]> => {
  const rows = await prisma.$queryRawUnsafe<{ conname: string; def: string }[]>(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype = 'c'`,
    table,
  );
  return rows.filter((r) => r.def.includes(column)).map((r) => `${r.conname}: ${r.def}`);
};

describe.skipIf(!hasDatabase)('the placement schema (one-planning-surface M-A)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('leaves remaining_float UNCONSTRAINED — negative float is the feature', async () => {
    const checks = await checksMentioning(prisma, 'activities', 'remaining_float');

    // `total_float` is unconstrained for exactly this reason (schema.prisma: "negative float is
    // valid"), and remaining float can go negative wherever total float can — plus once more, on a
    // bar placed past a "no later than" ceiling, which is the state US-5 exists to make visible.
    expect(checks, 'a CHECK on remaining_float would refuse the state US-5 renders').toEqual([]);
  });

  it('leaves the three frozen placement columns UNCONSTRAINED', async () => {
    for (const column of ['placed_start', 'placed_finish', 'visual_start'] as const) {
      const checks = await checksMentioning(prisma, 'baseline_activities', column);
      // ADR-0126's four CHECKs on this table each mirror a LIVE constraint, on the rule that a
      // frozen copy must not hold a value its source would refuse. These three copy columns that
      // carry none. The rule's second half is what this case guards: a frozen copy must equally
      // never REFUSE a plan the product allows — and in particular nothing may assert
      // `placed_finish >= placed_start`, because a zero-length milestone makes them equal and an
      // engine change could then FAIL a capture rather than record it.
      expect(checks, `a CHECK on ${column} would let a capture fail rather than record`).toEqual(
        [],
      );
    }
  });

  it('the negative control: the assertion goes red against a relaxed database', async () => {
    // A case that cannot be made to fail is not a case (M-J-T2). Inside a rolled-back transaction,
    // add exactly the CHECK a well-meaning reader would add and confirm the query above finds it.
    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `ALTER TABLE activities ADD CONSTRAINT ck_probe_remaining_float_nonneg
           CHECK (remaining_float IS NULL OR remaining_float >= 0)`,
        );
        const rows = await tx.$queryRawUnsafe<{ conname: string; def: string }[]>(
          `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
           WHERE conrelid = 'activities'::regclass AND contype = 'c'`,
        );
        const found = rows.filter((r) => r.def.includes('remaining_float')).map((r) => r.conname);
        expect(found, 'the discriminating query must SEE a CHECK when one exists').toContain(
          'ck_probe_remaining_float_nonneg',
        );
        // Roll the probe back by throwing — the database is left exactly as it was found.
        throw new Error('rollback the probe');
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== 'rollback the probe') throw error;
      });

    // And the real assertion is green again afterwards, so the probe left nothing behind.
    expect(await checksMentioning(prisma, 'activities', 'remaining_float')).toEqual([]);
  });

  it('the three frozen placement columns are NULLABLE dates with NO default', async () => {
    for (const column of ['placed_start', 'placed_finish', 'visual_start'] as const) {
      const shape = await readColumn(prisma, 'baseline_activities', column);

      expect(shape, `${column} must exist on the running database`).toBeDefined();
      // `@db.Date` — the schedule is measured in calendar days (ADR-0023), like every CPM column
      // beside these. Not timestamptz.
      expect(shape?.data_type).toBe('date');
      expect(shape?.is_nullable).toBe('YES');
      // THE LOAD-BEARING ONE. A capture cannot be re-run, so a backfill could only write TODAY's
      // placement as history — what ADR-0025's copy-not-reference rule exists to prevent. The
      // `hours_per_day_minutes DEFAULT 1440` precedent licenses nothing: that default was legal
      // because 1440 was TRUE of every pre-existing row, and none of these values is knowable for
      // any row that exists. Same rule as `lane_index`, `percent_complete` and `budgeted_expense`.
      expect(shape?.column_default, `a DEFAULT on ${column} would fabricate history`).toBeNull();
    }
  });

  it("placement_snapshot_level is NOT NULL and defaults to 'NONE'", async () => {
    const shape = await readColumn(prisma, 'baselines', 'placement_snapshot_level');

    expect(shape, 'placement_snapshot_level must exist on the running database').toBeDefined();
    expect(shape?.is_nullable).toBe('NO');
    // 'NONE' is the literal truth of every baseline captured before this column, and a constant
    // default is what makes the ADD COLUMN metadata-only. It is also the CONSERVATIVE value: a
    // write path not yet taught the capture reads as "no placement recorded", never as
    // recorded-but-empty — which is the distinction no per-row test and no row count can make,
    // because every one of the three columns above has a legitimate NULL under 'FULL'.
    expect(shape?.column_default).toContain("'NONE'");
  });

  it('remaining_float is a NULLABLE integer with NO default', async () => {
    const shape = await readColumn(prisma, 'activities', 'remaining_float');

    expect(shape, 'remaining_float must exist on the running database').toBeDefined();
    expect(shape?.data_type).toBe('integer');
    // NULL = "not yet calculated", the same null `total_float`/`free_float` carry on a plan that
    // has never been recalculated — and unlike the baseline columns above, this one fills itself in
    // on the next recalculation, so nothing here is permanent.
    expect(shape?.is_nullable).toBe('YES');
    expect(shape?.column_default).toBeNull();
  });
});
