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

/**
 * The **levelled finish** of one activity, as SQL — the same thing the engine's roll-up states
 * (`engine/level.ts`, "The leveled project finish"): where the activity ends under levelling if it
 * was levelled, else where its bar is DRAWN ({@link placedFinishSql}). The old summary fell back to
 * `early_finish`, so a hand-placed bar that holds no capped resource was counted where logic puts it
 * and the strip's "Levelled finish" could read earlier than its own "Finish"
 * (`docs/specs/logic-aware-levelling/` C7, `docs/TECH_DEBT.md` #427).
 *
 * The caller restricts the rows to non-LOE, non-summary activities — the engine's roll-up skips both
 * — see {@link LEVELLED_FINISH_EXCLUDED_TYPES}. Same alias rule as {@link placedFinishSql}.
 */
export function leveledFinishSql(alias?: string): Prisma.Sql {
  if (alias === undefined) return Prisma.sql`COALESCE(leveled_finish, ${placedFinishSql()})`;
  return Prisma.sql`COALESCE(${Prisma.raw(`${alias}.leveled_finish`)}, ${placedFinishSql(alias)})`;
}

/** The activity types the levelled finish never counts: a derived span and a roll-up, not work. */
export const LEVELLED_FINISH_EXCLUDED_TYPES = ['LEVEL_OF_EFFORT', 'WBS_SUMMARY'] as const;

/**
 * The same list as SQL literals — raw, not bound, because a bound parameter reaches Postgres as text
 * and `type` is an enum. Built from the constant above, never from input.
 */
export const LEVELLED_FINISH_EXCLUDED_TYPES_SQL = Prisma.raw(
  LEVELLED_FINISH_EXCLUDED_TYPES.map((t) => `'${t}'`).join(', '),
);

/**
 * The in-memory twin of {@link leveledFinishSql}'s `MAX` over the non-LOE, non-summary rows, so a unit
 * test can pin the SQL's definition to the engine's. Null when no activity counts.
 */
export function leveledProjectFinishOf(
  rows: ReadonlyArray<{
    type: string;
    leveledFinish?: string | null;
    visualEffectiveFinish: string;
    earlyFinish: string;
  }>,
): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    if ((LEVELLED_FINISH_EXCLUDED_TYPES as readonly string[]).includes(r.type)) continue;
    const finish = r.leveledFinish || r.visualEffectiveFinish || r.earlyFinish;
    if (latest === null || finish > latest) latest = finish;
  }
  return latest;
}
