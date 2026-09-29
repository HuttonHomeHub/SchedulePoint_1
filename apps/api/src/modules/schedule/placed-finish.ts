import { Prisma } from '@prisma/client';

/**
 * The **placed finish** — where an activity's bar is DRAWN ends (ADR-0148: Visual is the plan) — as
 * ONE SQL expression, so every reader that states "the project finishes on…" measures the same thing
 * (`docs/TECH_DEBT.md` #404, and #405(b) for the landing).
 *
 * `visual_effective_finish` is the engine-written drawn finish; the `early_finish` fallback covers a
 * row nobody has recalculated since the column was added, where the drawn bar IS the early one.
 * Taking the MAX of this rather than of `early_finish` is the fix: a hand-placed bar can end later
 * than the network's earliest finish, and a header that reads `MAX(early_finish)` then states a
 * finish earlier than the last bar on screen.
 *
 * `alias` qualifies both columns for a query that joins `activities` under a name. It is spliced as
 * raw SQL, so it is refused unless it is a bare lower-case identifier — never a caller's input.
 */
export function placedFinishSql(alias?: string): Prisma.Sql {
  if (alias === undefined) return Prisma.raw('COALESCE(visual_effective_finish, early_finish)');
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) {
    throw new Error(`placedFinishSql: "${alias}" is not a bare SQL identifier.`);
  }
  return Prisma.raw(`COALESCE(${alias}.visual_effective_finish, ${alias}.early_finish)`);
}

/**
 * The in-memory twin of {@link placedFinishSql}'s `MAX`, over one recalculation's results — so the
 * recalculate response states the same finish the summary read will. Dates are `YYYY-MM-DD`, which
 * order lexically. Null for an empty plan.
 */
export function placedProjectFinishOf(
  results: ReadonlyArray<{ visualEffectiveFinish: string; earlyFinish: string }>,
): string | null {
  let latest: string | null = null;
  for (const r of results) {
    const finish = r.visualEffectiveFinish || r.earlyFinish;
    if (latest === null || finish > latest) latest = finish;
  }
  return latest;
}
