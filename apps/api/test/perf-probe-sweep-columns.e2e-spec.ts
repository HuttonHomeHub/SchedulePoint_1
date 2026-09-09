import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * **M4 — the two sitting columns, and the sanity bounds they extend, asserted against a real
 * database.**
 *
 * `20260909120000_perf_probe_sweep_columns` adds `sweep_id` and `frames_per_phase`, and gives the
 * second a sign bound by **DROP + ADD** of `ck_perf_probe_results_measurement_bounds` — the
 * `20260809150000_audit_actor_shape_staff` precedent, chosen so this table's sanity bounds stay in
 * one constraint rather than fragmenting into one per nullable int.
 *
 * **Restating ten clauses to add an eleventh is ten chances to silently drop one, and nothing else
 * in CI can see it.** `prisma migrate diff` compares the datamodel against the database and CHECK
 * constraints are absent from `schema.prisma` — they are raw SQL — so a dropped clause leaves the
 * drift check perfectly green while the database stops enforcing a bound the create migration
 * spent a paragraph justifying. That is the whole reason this file exists.
 *
 * **Why the database and not the migration file.** Reading the SQL would prove the constraint was
 * once written this way and would pass happily after a later migration relaxed it — the assertion
 * would describe history rather than the running system. This asks the database what it currently
 * enforces (`revision-compare-imported-index.e2e-spec.ts`, `account-issuer-migration.e2e-spec.ts`).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/**
 * The eleven clauses, each named so a failure says which one went.
 *
 * Written out rather than compared to a single golden string: `pg_get_constraintdef` normalises
 * casts and parenthesisation (`px_per_day > (0)::double precision`), so a whole-string equality
 * would be brittle against a Postgres upgrade while saying nothing useful when it broke.
 */
const CLAUSES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'scenario_version >= 1', pattern: /scenario_version >= 1/ },
  { name: 'px_per_day > 0', pattern: /px_per_day > \(0\)/ },
  { name: 'activity_count >= 0', pattern: /activity_count >= 0/ },
  { name: 'edge_count >= 0', pattern: /edge_count >= 0/ },
  { name: 'viewport_width > 0', pattern: /viewport_width > 0/ },
  { name: 'viewport_height > 0', pattern: /viewport_height > 0/ },
  { name: 'device_pixel_ratio > 0', pattern: /device_pixel_ratio > \(0\)/ },
  { name: 'idle_interval_ms > 0', pattern: /idle_interval_ms > \(0\)/ },
  {
    name: 'hardware_concurrency IS NULL OR > 0',
    pattern: /\(hardware_concurrency IS NULL\) OR \(hardware_concurrency > 0\)/,
  },
  {
    name: 'device_memory_gb IS NULL OR > 0',
    pattern: /\(device_memory_gb IS NULL\) OR \(device_memory_gb > \(0\)/,
  },
  {
    name: 'frames_per_phase IS NULL OR > 0',
    pattern: /\(frames_per_phase IS NULL\) OR \(frames_per_phase > 0\)/,
  },
];

const readConstraintDef = async (prisma: PrismaClient): Promise<string | undefined> => {
  const rows = await prisma.$queryRawUnsafe<{ def: string }[]>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conname = 'ck_perf_probe_results_measurement_bounds'`,
  );
  return rows[0]?.def;
};

const readColumn = async (
  prisma: PrismaClient,
  column: string,
): Promise<
  { data_type: string; is_nullable: string; column_default: string | null } | undefined
> => {
  const rows = await prisma.$queryRawUnsafe<
    { data_type: string; is_nullable: string; column_default: string | null }[]
  >(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'perf_probe_results' AND column_name = $1`,
    column,
  );
  return rows[0];
};

describe.skipIf(!hasDatabase)('perf_probe_results — the sitting columns', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sweep_id is a NULLABLE uuid with NO default', async () => {
    const column = await readColumn(prisma, 'sweep_id');

    expect(column, 'sweep_id must exist on the running database').toBeDefined();
    // `uuid` rather than `text` for a reason stronger than storage: Postgres normalises `uuid` to
    // canonical lowercase, so a client that posts one casing on one step and another on the next
    // still groups. Under `text` that silently becomes TWO sittings.
    expect(column?.data_type).toBe('uuid');
    // NULL means "this reading was a single press" — true of every pre-existing row. A DEFAULT
    // would claim membership of a sitting that does not exist (the ADR-0126 rule).
    expect(column?.is_nullable).toBe('YES');
    expect(column?.column_default).toBeNull();
  });

  it('frames_per_phase is a NULLABLE integer with NO default', async () => {
    const column = await readColumn(prisma, 'frames_per_phase');

    expect(column, 'frames_per_phase must exist on the running database').toBeDefined();
    expect(column?.data_type).toBe('integer');
    // NULL means "not recorded". Inferring it from `samples.length` would write a fact derived
    // from a bundle version into a column readers will trust.
    expect(column?.is_nullable).toBe('YES');
    expect(column?.column_default).toBeNull();
  });

  it('keeps ALL ELEVEN sanity bounds after the DROP + ADD', async () => {
    const def = await readConstraintDef(prisma);
    expect(def, 'the bounds constraint must exist on the running database').toBeDefined();

    for (const clause of CLAUSES) {
      expect(def ?? '', `the "${clause.name}" bound must survive the restatement`).toMatch(
        clause.pattern,
      );
    }
  });

  it('has NO upper bound on frames_per_phase — a range is a protocol, not a fact', async () => {
    // The create migration's own argument, applied one column along: encoding a protocol in the
    // schema means the day the product widens it, the database silently refuses rows the product
    // decided to accept, and a migration becomes the cost of changing a guard. The ceiling lives
    // on the DTO, where it is required rather than decorative — this is int4 and `@IsInt()` passes
    // `1e12`, which would reach Postgres as an unmapped 500.
    const def = (await readConstraintDef(prisma)) ?? '';
    expect(def).not.toMatch(/frames_per_phase\s*<=?/);
  });

  it('would FAIL if a bound were dropped — proved by dropping one inside a rolled-back transaction', async () => {
    /**
     * **The red check is part of the test rather than something somebody did once.**
     *
     * An assertion that has never been made to fail is indistinguishable from one that cannot,
     * and this repository has shipped that more than once — a census whose glob matched zero files
     * and passed for having found nothing, and a target-size sweep blind to the control class it
     * existed to protect. The precedent for doing it this way is
     * `revision-compare-imported-index.e2e-spec.ts`.
     *
     * Postgres DDL is transactional, so the relaxed constraint disappears on rollback and the real
     * one is untouched. The explicit throw is what guarantees the rollback even if an assertion
     * inside the transaction fails.
     */
    const ROLLBACK = 'intentional rollback — the relaxed constraint must not survive this test';

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `ALTER TABLE perf_probe_results DROP CONSTRAINT ck_perf_probe_results_measurement_bounds`,
        );
        // The eleventh clause dropped — the exact mistake a verbatim restatement can make.
        await tx.$executeRawUnsafe(
          `ALTER TABLE perf_probe_results ADD CONSTRAINT ck_perf_probe_results_measurement_bounds
           CHECK (scenario_version >= 1 AND px_per_day > 0 AND activity_count >= 0
             AND edge_count >= 0 AND viewport_width > 0 AND viewport_height > 0
             AND device_pixel_ratio > 0 AND idle_interval_ms > 0
             AND (hardware_concurrency IS NULL OR hardware_concurrency > 0)
             AND (device_memory_gb IS NULL OR device_memory_gb > 0))`,
        );

        const relaxed =
          (
            await tx.$queryRawUnsafe<{ def: string }[]>(
              `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
               WHERE conname = 'ck_perf_probe_results_measurement_bounds'`,
            )
          )[0]?.def ?? '';

        // The assertion above must reject this, or it is not protecting anything.
        const survives = CLAUSES.every((clause) => clause.pattern.test(relaxed));
        expect(survives, 'a dropped bound must be detected, not tolerated').toBe(false);

        throw new Error(ROLLBACK);
      }),
    ).rejects.toThrow(ROLLBACK);

    // And the real constraint is intact afterwards — the rollback did its job.
    const def = (await readConstraintDef(prisma)) ?? '';
    for (const clause of CLAUSES) {
      expect(def, `"${clause.name}" must be intact after the rollback`).toMatch(clause.pattern);
    }
  });
});
