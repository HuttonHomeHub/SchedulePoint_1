import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type { DiagnosticEntry } from './staff-diagnostics.registry';

/**
 * **The one place under `modules/staff/` allowed to run raw SQL, and the reason is the boundary.**
 *
 * `staff-boundary.structural.spec.ts` bans `$queryRaw` everywhere here with a single exception
 * naming this file by path and carrying its reason inline. That exception exists because the
 * alternative is worse for exactly the property under debate (ADR-0140 D5): the predicate compares
 * `hours_per_day_minutes` on two different calendar rows resolved through a three-rung `COALESCE`
 * chain per activity, which the Prisma query API cannot express — so the typed route would mean
 * loading candidate activity rows **into this process** and comparing them in TypeScript. Raw SQL
 * keeps every customer value inside Postgres and lets only integers cross.
 *
 * `$queryRawUnsafe` and `$executeRaw` have **no** exception at any path. The query takes no
 * parameters at all, so injection is structurally impossible rather than parameterised away.
 *
 * **The row type below is an ASSERTION, not a check** — and it is labelled as one because ADR-0140
 * D3 point 2 is exactly this: `$queryRaw<T>` is an unchecked cast, so TypeScript validates what
 * this file *declares* and never what Postgres *returns*. Two things make that survivable. Gate S-4
 * asserts the SQL's projection list contains only aliased `count(...)` expressions, so a column
 * cannot be added without something going red; and {@link toCount} converts at the boundary rather
 * than trusting the declared type, so a `bigint`, a numeric string or a missing key each produce a
 * loud failure instead of a plausible wrong number or a `JSON.stringify` throw.
 */
/**
 * **One press is one transaction** (`docs/TECH_DEBT.md` #456, ADR-0140 amendment). The 32 statements
 * of a press used to run on the shared client, each with its own snapshot and no time bound:
 *
 * - **One reading.** `REPEATABLE READ` gives every `examined` and `affected` the same snapshot, so an
 *   entry's numerator can no longer count rows its denominator never saw. The block a staff member
 *   pastes into a measurement record is one observation, which it was only ever presented as.
 * - **Provably read-only.** `SET TRANSACTION READ ONLY` makes Postgres itself refuse a write (25006),
 *   whatever a future registry entry contains. Gate S-3 bans `$executeRaw` here, and `$queryRaw` of a
 *   `SET` is not a way round it: the two setup statements are fixed text with no interpolation.
 * - **Bounded.** `SET LOCAL statement_timeout` cancels a statement at three seconds (57014), about
 *   5.5 times the slowest measured at a million rows (524 to 538 ms), and the setting dies with the
 *   transaction so it never reaches the pool. A timed-out entry fails the whole press with the
 *   route's existing 500: per-entry failure would change the row shape and is an ADR-0140 decision.
 *
 * The transaction's own 60 s ceiling is far above the worst case (32 statements at the bound would
 * be 96 s, but nothing near it has been measured); it exists so a hung connection cannot pin a pooled
 * client for ever.
 *
 * The setup deliberately contains no `SELECT`, so the registry stays the only file the projection
 * gate (S-4) has to read.
 */
const PRESS_TRANSACTION_TIMEOUT_MS = 60_000;

@Injectable()
export class StaffDiagnosticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Run `read` inside the press's single, read-only, time-bounded snapshot. */
  reading<T>(read: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SET TRANSACTION READ ONLY`;
        await tx.$queryRaw`SET LOCAL statement_timeout = '3s'`;
        return read(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: PRESS_TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  /** How many rows the question is asked of. */
  async examined(entry: DiagnosticEntry, db: Prisma.TransactionClient): Promise<number> {
    const rows = await db.$queryRaw(entry.denominator);
    return toCount(firstRow(rows, entry.id), 'examined', entry.id);
  }

  /** How many answer it, and how far they spread. */
  async affected(
    entry: DiagnosticEntry,
    db: Prisma.TransactionClient,
  ): Promise<{ affected: number; affectedPlans: number; affectedOrganizations: number }> {
    const row = firstRow(await db.$queryRaw(entry.numerator), entry.id);
    return {
      affected: toCount(row, 'affected', entry.id),
      affectedPlans: toCount(row, 'affected_plans', entry.id),
      affectedOrganizations: toCount(row, 'affected_organizations', entry.id),
    };
  }
}

/** An aggregate over zero rows still returns one row; no row at all means the SQL is not an aggregate. */
function firstRow(rows: unknown, id: string): Record<string, unknown> {
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    typeof rows[0] !== 'object' ||
    rows[0] === null
  ) {
    throw new Error(`diagnostic ${id}: expected exactly one aggregate row`);
  }
  return rows[0] as Record<string, unknown>;
}

/**
 * `count(*)` returns **`bigint`**, and `JSON.stringify` throws on one — so the conversion is not
 * housekeeping, it is the difference between a working route and a 500 no unit test would catch
 * (every unit test here mocks Prisma, which is how ADR-0086's M2 shipped a route unable to serve a
 * single request with 1,589 tests green).
 *
 * It is bounded as well as converted. A count above `Number.MAX_SAFE_INTEGER` cannot be represented
 * exactly, and a silently rounded population figure in a document somebody pastes into a measurement
 * record is worse than a failure — the whole point of this console is that its numbers can be
 * trusted without a shell.
 */
function toCount(row: Record<string, unknown>, key: string, id: string): number {
  const value = row[key];
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`diagnostic ${id}: ${key} exceeds the safe integer range`);
    }
    return Number(value);
  }
  // Not expected from `count(*)`, and accepted rather than rejected because a driver or a future
  // Prisma version returning a plain integer is a change in representation and not in meaning.
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new Error(`diagnostic ${id}: ${key} was not a count (got ${typeof value})`);
}
