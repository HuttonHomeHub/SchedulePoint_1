import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * **M1-T2 — the guarantee the cross-plan matching contract rests on, asserted against a real
 * database.**
 *
 * Spec §2.4 D1c says a code duplicated within one side is **not a case to repair** — it is a case
 * the database refuses. That turns a whole branch of the correlation into a **test**, and this is
 * it: `uq_activities_plan_code` must keep existing, keep being UNIQUE, keep covering
 * `(plan_id, code)`, and keep its partial predicate.
 *
 * **Why `pg_indexes` and not the migration file.** Reading
 * `20260710092048_add_activities/migration.sql` would prove the index was once created and would
 * pass happily after a later migration dropped or relaxed it — the assertion would describe history
 * rather than the running system. This asks the database what it currently enforces.
 *
 * **Why it is asserted at all**, when it has been true since the activities table was created:
 * because the brief that started this epic said the opposite. The claim "`Activity.code` has no
 * unique constraint" was made and its method named — grepping for `@@unique`/`@unique` — and that
 * method **structurally cannot see the answer here**, since Prisma cannot express a partial unique
 * and every one of them lives in raw SQL. A silent relaxation would not break a test anywhere else;
 * it would quietly hand the correlation two rows for one key.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** The four properties the contract depends on, each checked separately so a failure names which. */
function assertGuarantee(indexdef: string | undefined): void {
  expect(indexdef, 'uq_activities_plan_code must exist on the running database').toBeDefined();
  const def = indexdef ?? '';
  expect(
    def,
    'it must be UNIQUE — a plain index permits the duplicate D1c relies on refusing',
  ).toContain('CREATE UNIQUE INDEX');
  expect(def, 'it must cover (plan_id, code) — the correlation key, scoped per plan').toMatch(
    /\(plan_id,\s*code\)/,
  );
  expect(
    def,
    'the partial predicate must survive: a soft-deleted row must not block a live code, and NULL codes are not a key',
  ).toMatch(/WHERE\s+\(\(deleted_at IS NULL\) AND \(code IS NOT NULL\)\)/);
}

const readIndexDef = async (prisma: PrismaClient): Promise<string | undefined> => {
  const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uq_activities_plan_code'`,
  );
  return rows[0]?.indexdef;
};

describe.skipIf(!hasDatabase)(
  'uq_activities_plan_code — the correlation key is unique per plan',
  () => {
    let prisma: PrismaClient;

    beforeAll(() => {
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('is UNIQUE on (plan_id, code) with its partial predicate, on the running database', async () => {
      assertGuarantee(await readIndexDef(prisma));
    });

    it('would FAIL if the index were relaxed — proved by relaxing it inside a rolled-back transaction', async () => {
      /**
       * **The red check is part of the test rather than something somebody did once.**
       *
       * A guarantee-assertion that has never been made to fail is indistinguishable from one that
       * cannot fail, and this repository has shipped that twice — a census whose glob matched zero
       * files and passed for having found nothing, and a target-size sweep that could not see the
       * control class it existed to protect. So the relaxation is performed here, against a real
       * database, and the assertion is required to reject it.
       *
       * Postgres DDL is transactional, so the drop and the fabricated index both disappear on
       * rollback and the real index is untouched. `$transaction` with an explicit throw is what
       * guarantees the rollback even if an assertion inside it fails.
       */
      let rejectedTheRelaxedIndex = false;

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`DROP INDEX "uq_activities_plan_code"`);
          await tx.$executeRawUnsafe(
            `CREATE INDEX "uq_activities_plan_code" ON "activities" ("plan_id", "code") WHERE "deleted_at" IS NULL AND "code" IS NOT NULL`,
          );

          const relaxed = await tx.$queryRawUnsafe<{ indexdef: string }[]>(
            `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uq_activities_plan_code'`,
          );
          try {
            assertGuarantee(relaxed[0]?.indexdef);
          } catch {
            // The assertion refused a non-unique index, which is the whole point of this case.
            rejectedTheRelaxedIndex = true;
          }

          // Always roll back. The fabricated index must never outlive this transaction.
          throw new Error('rollback');
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error) || error.message !== 'rollback') throw error;
        });

      expect(
        rejectedTheRelaxedIndex,
        'the guarantee assertion accepted a NON-UNIQUE index — it does not discriminate and proves nothing',
      ).toBe(true);

      // And the real index is back, which is the other half of "the rollback worked".
      assertGuarantee(await readIndexDef(prisma));
    });
  },
);
