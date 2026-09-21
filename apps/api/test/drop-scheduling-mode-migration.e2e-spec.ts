import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * **Dropping `plans.scheduling_mode` and the `SchedulingMode` enum** (one-planning-surface
 * M-J-T2, ADR-0148).
 *
 * **The SQL is read from the shipped migration file, never restated here** — a copy would pass
 * while the file it claims to test drifted (`account-issuer-migration.e2e-spec.ts:29-31`).
 *
 * **It runs against a SCRATCH schema, and the design pass's recommendation to use the real one
 * does not survive this harness.** That recommendation — run the shipped SQL against the real
 * `plans` inside a transaction and `ROLLBACK` — was verified on a cluster where the column still
 * existed. It cannot work here: `scripts/e2e-local.sh` runs `prisma migrate deploy` before the
 * suite, so by the time this file executes the column and the type are ALREADY DROPPED. The first
 * version of this spec was written that way and failed exactly so, `42703`
 * (`column "scheduling_mode" of relation "plans" does not exist`) and `42704`
 * (`type "SchedulingMode" does not exist`). That is the `account-issuer` precedent's own reason for
 * a scratch schema, restated: a **DDL** migration's test needs the table in its PRE-migration
 * shape, and after deploy the real schema no longer has one.
 *
 * **`search_path` is set to the scratch schema ALONE and that is asserted, not assumed.** The
 * design pass measured the hazard: with `search_path` set to `scratch, public` and the objects
 * absent from the scratch schema, this migration silently drops the REAL `public` column and type —
 * no error, no warning. The hazard is currently inert here (deploy has already removed public's
 * copies, so a leak would error rather than destroy), and the guard is kept anyway because that
 * inertness is an accident of ordering rather than a property of the test.
 *
 * **What this does NOT establish, stated so nobody infers it.** This proves the shipped statements
 * do what they say against a table shaped like `plans`, in the order they are written. It does not
 * prove anything about the real table's data, because there is no data-dependent branch to prove:
 * the migration is metadata-only and behaves identically on empty and populated tables. Claiming
 * more would repeat the overclaim `strip-drag-constraints-migration.e2e-spec.ts:11-17` records
 * having shipped once.
 */
const MIGRATION = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260921180000_drop_scheduling_mode',
  'migration.sql',
);

/** The shipped file with its comment header stripped, split into its statements. */
function shippedStatements(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const SCHEMA = 'drop_scheduling_mode_probe';

describe('20260921180000_drop_scheduling_mode', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
    // A cut-down `plans` in its PRE-migration shape, in a schema of its own. Only the column this
    // migration touches and its enum need be faithful; the migration names nothing else.
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
    await prisma.$executeRawUnsafe(
      `CREATE TYPE "${SCHEMA}"."SchedulingMode" AS ENUM ('EARLY', 'VISUAL')`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${SCHEMA}"."plans" (
         id text PRIMARY KEY,
         name text NOT NULL,
         scheduling_mode "${SCHEMA}"."SchedulingMode" NOT NULL DEFAULT 'EARLY'
       )`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${SCHEMA}"."plans" (id, name) VALUES ('p1', 'One'), ('p2', 'Two')`,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it('ships exactly two statements, in the order the drop depends on', () => {
    const statements = shippedStatements();
    expect(statements).toHaveLength(2);
    // Asserted by READING THE FILE so a later reformat cannot silently reorder them: reversed,
    // the type drop fails 2BP01 because the column still depends on it.
    expect(statements[0]).toMatch(/ALTER TABLE "plans" DROP COLUMN "scheduling_mode"/);
    expect(statements[1]).toMatch(/DROP TYPE "SchedulingMode"/);
  });

  it('confines itself to the probe schema — `search_path` excludes public, asserted', async () => {
    // Not decoration. With `search_path` set to `probe, public` and the objects absent from the
    // probe schema, these statements silently drop the REAL column and type. Currently inert only
    // because deploy already removed public's copies, which is an accident of ordering.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
      // `SHOW search_path` echoes the name UNQUOTED when it needs no quoting, so assert the bare
      // name. The clause that matters is the second one: `public` must not be on the path at all.
      const path = await tx.$queryRawUnsafe<{ search_path: string }[]>(`SHOW search_path`);
      expect(path[0]!.search_path).toBe(SCHEMA);
      expect(path[0]!.search_path).not.toContain('public');
    });
  });

  it('removes the column, the type, its array type and its default — then rolls all of it back', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);

        const before = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM plans`);

        for (const statement of shippedStatements()) {
          await tx.$executeRawUnsafe(statement);
        }

        // --- every assertion is INSIDE the transaction; rollback restores all of it ---------
        const column = await tx.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM information_schema.columns
             WHERE table_schema = '${SCHEMA}' AND table_name = 'plans'
               AND column_name = 'scheduling_mode'`,
        );
        expect(Number(column[0]!.n)).toBe(0);

        // Both the base type AND the array type `_SchedulingMode` Postgres creates alongside it.
        const types = await tx.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = '${SCHEMA}'
               AND t.typname IN ('SchedulingMode', '_SchedulingMode')`,
        );
        expect(Number(types[0]!.n)).toBe(0);

        // The DEFAULT 'EARLY' goes with the column rather than surviving as an orphan.
        const defaults = await tx.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM pg_attrdef d
             JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
             WHERE d.adrelid = '${SCHEMA}.plans'::regclass AND a.attname = 'scheduling_mode'`,
        );
        expect(Number(defaults[0]!.n)).toBe(0);

        // The rows are untouched — metadata-only, not a rewrite.
        const after = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM plans`);
        expect(after[0]!.n).toBe(before[0]!.n);

        // Reads still work with the column gone.
        await tx.$queryRawUnsafe(`SELECT id, name FROM plans`);

        throw new Error('ROLLBACK');
      }),
    ).rejects.toThrow('ROLLBACK');

    // Outside the transaction it is all back, which is what lets this file run more than once.
    const restored = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.columns
         WHERE table_schema = '${SCHEMA}' AND table_name = 'plans'
           AND column_name = 'scheduling_mode'`,
    );
    expect(Number(restored[0]!.n)).toBe(1);
  });

  it('NEGATIVE CONTROL: dropping the type first fails, and the order is what is under test', async () => {
    // Asserting only "it throws" would pass against a typo in the type name, a missing schema or a
    // permissions error — it would not discriminate. 2BP01 is specifically "other objects depend
    // on it"; the dependency itself is named in DETAIL rather than the primary message.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
        await tx.$executeRawUnsafe(`DROP TYPE "SchedulingMode"`);
      }),
    ).rejects.toMatchObject({ meta: expect.objectContaining({ code: '2BP01' }) });

    // The control for the control: with the column dropped FIRST the same statement succeeds, so
    // the case above tests the ORDERING and not merely that the type exists.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
        await tx.$executeRawUnsafe(`ALTER TABLE "plans" DROP COLUMN "scheduling_mode"`);
        await tx.$executeRawUnsafe(`DROP TYPE "SchedulingMode"`);
        throw new Error('ROLLBACK');
      }),
    ).rejects.toThrow('ROLLBACK');
  });
});
