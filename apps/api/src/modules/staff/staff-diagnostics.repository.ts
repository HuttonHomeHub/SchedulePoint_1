import { Injectable } from '@nestjs/common';

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
@Injectable()
export class StaffDiagnosticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** How many rows the question is asked of. */
  async examined(entry: DiagnosticEntry): Promise<number> {
    const rows = await this.prisma.$queryRaw(entry.denominator);
    return toCount(firstRow(rows, entry.id), 'examined', entry.id);
  }

  /** How many answer it, and how far they spread. */
  async affected(
    entry: DiagnosticEntry,
  ): Promise<{ affected: number; affectedPlans: number; affectedOrganizations: number }> {
    const row = firstRow(await this.prisma.$queryRaw(entry.numerator), entry.id);
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
