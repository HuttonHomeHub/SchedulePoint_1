import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * **M3-T1 — the guarantee the standing read's baseline join rests on, asserted against a real
 * database.**
 *
 * `findPlanStanding` reaches the active baseline through a `LEFT JOIN LATERAL … LIMIT 1`, and the
 * `LIMIT 1` is belt-and-braces: what makes the join correct is that a plan can have **at most one**
 * active baseline, which `uq_baselines_plan_active` enforces. If that index were relaxed, the LIMIT
 * would keep the section from duplicating rows — and would silently pick *one of them*, so a plan
 * would report its movement against an arbitrary baseline with nothing anywhere looking wrong. That
 * is the failure this case exists to make loud.
 *
 * **Why `pg_indexes` and not the migration file** (ADR-0129's method, whose reasoning applies
 * unchanged): reading the migration would prove the index was once created and would pass happily
 * after a later migration dropped or relaxed it — an assertion describing history rather than the
 * running system. And the index is a **partial** unique, which Prisma cannot express, so it lives
 * in raw SQL and a `@@unique` grep structurally cannot see it either.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const INDEX = 'uq_baselines_plan_active';

/** Three properties, checked separately so a failure names which one went. */
function assertGuarantee(indexdef: string | undefined): void {
  expect(indexdef, `${INDEX} must exist on the running database`).toBeDefined();
  const def = indexdef ?? '';
  expect(
    def,
    'it must be UNIQUE — a plain index lets a plan hold two active baselines, and the join would ' +
      'then pick one of them silently',
  ).toContain('CREATE UNIQUE INDEX');
  expect(def, 'it must be keyed on plan_id alone — one active baseline PER PLAN').toMatch(
    /\(plan_id\)/,
  );
  expect(
    def,
    'the partial predicate must survive: only ACTIVE, non-deleted baselines are the key, or a ' +
      'plan could never hold a second superseded baseline at all',
  ).toMatch(/WHERE\s+\(\(is_active = true\) AND \(deleted_at IS NULL\)\)/);
}

const readIndexDef = async (prisma: PrismaClient): Promise<string | undefined> => {
  const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1`,
    INDEX,
  );
  return rows[0]?.indexdef;
};

describe.skipIf(!hasDatabase)('uq_baselines_plan_active — one active baseline per plan', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('is UNIQUE on (plan_id) with its partial predicate, on the running database', async () => {
    assertGuarantee(await readIndexDef(prisma));
  });

  it('would FAIL if the index were relaxed — proved by relaxing it in a rolled-back transaction', async () => {
    /**
     * The red check is part of the test rather than something somebody did once: an assertion that
     * has never been made to fail is indistinguishable from one that cannot. Postgres DDL is
     * transactional, so the fabricated index disappears on rollback and the real one is untouched;
     * the explicit throw is what guarantees the rollback even if an assertion inside fails.
     */
    let rejectedTheRelaxedIndex = false;

    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`DROP INDEX "${INDEX}"`);
        await tx.$executeRawUnsafe(
          `CREATE INDEX "${INDEX}" ON "baselines" ("plan_id") WHERE "is_active" = true AND "deleted_at" IS NULL`,
        );

        const relaxed = await tx.$queryRawUnsafe<{ indexdef: string }[]>(
          `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1`,
          INDEX,
        );
        try {
          assertGuarantee(relaxed[0]?.indexdef);
        } catch {
          rejectedTheRelaxedIndex = true;
        }

        throw new Error('rollback');
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== 'rollback') throw error;
      });

    expect(
      rejectedTheRelaxedIndex,
      'the guarantee assertion accepted a NON-UNIQUE index — it does not discriminate',
    ).toBe(true);

    // And the real index is back, which is the other half of "the rollback worked".
    assertGuarantee(await readIndexDef(prisma));
  });
});
