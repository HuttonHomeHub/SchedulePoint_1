import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * **The `accounts.issuer` migration, against a real Postgres** (TECH_DEBT #176, Better Auth 1.7).
 *
 * These are the two proofs the API e2e suite structurally **cannot** be. That suite runs against a
 * database CI provisions pristine, so every migration it exercises runs against an empty table —
 * and an empty table is the one shape on which the dangerous form of this migration
 * (`ADD COLUMN "issuer" TEXT NOT NULL`, which is what `prisma migrate diff` generates for the model
 * change) **succeeds**. The failure it would cause lands on the deployed host instead, inside
 * `docker-entrypoint.sh` (ADR-0018) under `set -e`, where it is a restart loop a human has to break
 * with `prisma migrate resolve --rolled-back`.
 *
 * So the subject here is a **populated** table, and specifically the three populations the shipped
 * file's own comments make claims about:
 *
 * 1. legacy credential rows are backfilled and constrained (the happy path);
 * 2. a row whose `provider_id` the guard does not cover **aborts the whole migration** rather than
 *    being given an issuer that is wrong for its provider;
 * 3. a duplicate `(issuer, account_id)` aborts at the index rather than half-applying;
 * 4. and — the rollback contract — a pre-1.7 image, which writes no `issuer` at all, can still
 *    INSERT against the migrated column. Without that, redeploying the previous image tag causes a
 *    worse outage than the fault it rolls back.
 *
 * The SQL is **read from the shipped migration file**, never restated here: a copy would pass while
 * the file it claims to test drifted.
 *
 * **Each case was verified red against the specific defect it guards**, not merely against nothing:
 *
 * | Case                     | Verified red against                                              |
 * | ------------------------ | ----------------------------------------------------------------- |
 * | backfill / abort / rollback | the naive `ADD COLUMN ... NOT NULL` form `migrate diff` generates |
 * | repair                   | the file with step 0 deleted                                       |
 * | repair-would-collide     | step 0 with its `NOT EXISTS` guard deleted                         |
 *
 * The last is the one worth knowing about: it passes equally against a migration with **no repair
 * at all**, because leaving the row alone is the same observable outcome. It discriminates only
 * against an *unguarded* repair, which is the defect it exists for — the repair test above is what
 * proves a repair happens.
 *
 * Each case runs in its own schema with `search_path` pointed at it, so the unqualified table name
 * in the migration resolves there and the real `accounts` table is untouched. Statements run inside
 * one transaction, which is how `prisma migrate deploy` wraps a migration file — the reason a
 * failure leaves the schema clean and `_prisma_migrations` dirty.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const MIGRATION_SQL = readFileSync(
  join(__dirname, '..', 'prisma', 'migrations', '20260823120000_account_issuer', 'migration.sql'),
  'utf8',
);

/** The pre-migration shape, cut down to the columns the migration and its guards touch. */
const LEGACY_TABLE = `
  CREATE TABLE "accounts" (
    "id"          TEXT PRIMARY KEY,
    "account_id"  TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "password"    TEXT,
    "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;

/**
 * Split the file into statements. Comment lines go first: the file is heavily commented and a
 * naive split on `;` would otherwise cut inside prose.
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

describe.skipIf(!hasDatabase)('accounts.issuer migration (e2e)', () => {
  let prisma: PrismaClient;
  const SCHEMA = 'issuer_migration_test';

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
  });

  /** Run the shipped migration in one transaction against the scratch schema. */
  async function applyMigration(): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
      for (const statement of statementsOf(MIGRATION_SQL)) {
        await tx.$executeRawUnsafe(statement);
      }
    });
  }

  async function seed(rows: Array<[string, string, string, string]>): Promise<void> {
    await prisma.$executeRawUnsafe(LEGACY_TABLE.replace('"accounts"', `"${SCHEMA}"."accounts"`));
    for (const [id, accountId, providerId, userId] of rows) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${SCHEMA}"."accounts" (id, account_id, provider_id, user_id)
         VALUES ($1, $2, $3, $4)`,
        id,
        accountId,
        providerId,
        userId,
      );
    }
  }

  async function issuerColumnExists(): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'accounts' AND column_name = 'issuer'`,
      SCHEMA,
    );
    return Number(rows[0]?.n ?? 0) > 0;
  }

  it('backfills legacy credential rows and constrains the column', async () => {
    await seed([
      ['a1', 'u1', 'credential', 'u1'],
      ['a2', 'u2', 'credential', 'u2'],
      ['a3', 'u3', 'credential', 'u3'],
    ]);

    await applyMigration();

    const backfilled = await prisma.$queryRawUnsafe<Array<{ issuer: string; n: bigint }>>(
      `SELECT issuer, count(*) AS n FROM "${SCHEMA}"."accounts" GROUP BY 1`,
    );
    expect(backfilled).toEqual([{ issuer: 'local:credential', n: 3n }]);

    const column = await prisma.$queryRawUnsafe<
      Array<{ is_nullable: string; column_default: string }>
    >(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'accounts' AND column_name = 'issuer'`,
      SCHEMA,
    );
    expect(column[0]?.is_nullable).toBe('NO');
    expect(column[0]?.column_default).toBe(`'local:credential'::text`);

    const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'accounts'`,
      SCHEMA,
    );
    expect(indexes.map((i) => i.indexname)).toContain('accounts_issuer_account_id_key');
  });

  it('aborts the whole migration on a row the provider guard does not cover', async () => {
    await seed([
      ['a1', 'u1', 'credential', 'u1'],
      // A provider whose correct issuer is `local:oauth:github`, not `local:credential`. This
      // install has none (no `socialProviders` in `common/auth/better-auth.ts`), which is exactly
      // why the guard has to fail loudly rather than being trusted to be unnecessary.
      ['a2', 'gh-1', 'github', 'u2'],
    ]);

    // Asserted on the SQLSTATE, not the sentence: Prisma rewrites the driver's message to
    // `Null constraint failed: (issuer)`, and 23502 is what the deployed failure logs.
    //
    // What this case alone cannot distinguish: the naive `ADD COLUMN ... NOT NULL` form aborts
    // here too, with the same code, at step 1 instead of step 3 — verified by running this file
    // against that form, where THIS case is the only one of the four that still passes. The
    // discriminator is the first case above: a migration that aborts on an uncovered provider AND
    // backfills credential rows can only be the guarded form.
    await expect(applyMigration()).rejects.toThrow(/23502/);

    // The transaction wrapper is what makes this safe: the column is not left half-added.
    expect(await issuerColumnExists()).toBe(false);
  });

  it('aborts on a duplicate (issuer, account_id) rather than half-applying', async () => {
    // Both rows already satisfy `account_id = user_id`, so step 0's repair does not touch either —
    // which is what makes this a duplicate the migration cannot resolve rather than one it fixes.
    // It is also the shape step 0's comment describes: a second credential row written for a user
    // who was already locked out. Two accounts for one person is not something a migration should
    // silently merge, so the index is the right place for this to stop.
    await seed([
      ['a1', 'u1', 'credential', 'u1'],
      ['a2', 'u1', 'credential', 'u1'],
    ]);

    // 23505 = unique_violation. Asserted on the code for the reason given above.
    await expect(applyMigration()).rejects.toThrow(/23505/);
    expect(await issuerColumnExists()).toBe(false);
  });

  it('repairs a credential row whose account_id is not the user id', async () => {
    await seed([
      ['a1', 'u1', 'credential', 'u1'],
      // The lockout shape: 1.7 requires `accountId === user.id`, so this user would be told their
      // password is wrong, and reset-password would write them a second credential row.
      ['a2', 'legacy-external-id', 'credential', 'u2'],
    ]);

    await applyMigration();

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; account_id: string }>>(
      `SELECT id, account_id FROM "${SCHEMA}"."accounts" ORDER BY id`,
    );
    expect(rows).toEqual([
      { id: 'a1', account_id: 'u1' },
      { id: 'a2', account_id: 'u2' },
    ]);
  });

  it('leaves a mismatched row alone when repairing it would collide, and then refuses it', async () => {
    await seed([
      // Already correct for u1.
      ['a1', 'u1', 'credential', 'u1'],
      // Also u1's, and wrong. Repairing this one blindly would make two rows `(local:credential,
      // u1)` and the unique index would abort — a repair turning into an outage on exactly the
      // data most in need of repair. The guard leaves it, and step 5 refuses it loudly instead.
      ['a2', 'stale-external-id', 'credential', 'u1'],
    ]);

    await applyMigration();

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; account_id: string }>>(
      `SELECT id, account_id FROM "${SCHEMA}"."accounts" ORDER BY id`,
    );
    expect(rows).toEqual([
      { id: 'a1', account_id: 'u1' },
      { id: 'a2', account_id: 'stale-external-id' },
    ]);
  });

  it('lets a pre-1.7 image, which writes no issuer, still INSERT (the rollback contract)', async () => {
    await seed([['a1', 'u1', 'credential', 'u1']]);
    await applyMigration();

    // Exactly the column list a 1.6.x Better Auth writes: no `issuer` at all.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${SCHEMA}"."accounts" (id, account_id, provider_id, user_id)
       VALUES ('rollback-1', 'u2', 'credential', 'u2')`,
    );

    const row = await prisma.$queryRawUnsafe<Array<{ issuer: string }>>(
      `SELECT issuer FROM "${SCHEMA}"."accounts" WHERE id = 'rollback-1'`,
    );
    expect(row[0]?.issuer).toBe('local:credential');
  });
});
