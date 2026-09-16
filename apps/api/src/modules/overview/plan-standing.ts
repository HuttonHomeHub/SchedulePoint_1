import type { PlanStandingRow } from './overview.repository';

/**
 * How far a plan's finish has moved against what was committed — three-valued, never a nullable
 * number.
 *
 * **`NO_BASELINE` is a reason, not a zero.** A plan with nothing to measure against and a plan that
 * has not moved are different facts a planner acts on differently, and `?? 0` collapses the first
 * into the second — telling a reader their unbaselined programme is exactly on the plan they never
 * captured. The union has no numeric fallback, so the compiler refuses that shape rather than
 * leaving it to a reviewer to notice (ADR-0126's rule, and ADR-0098 D3's).
 *
 * The five reasons are distinguishable and each is actionable in a different way: capture a
 * baseline, capture one that has a finish, recalculate, add some activities, or give the plan's
 * calendar some working time.
 */
export type BaselineMovement =
  | { kind: 'MOVED'; workingDays: number; baselineFinish: string; baselineName: string }
  | { kind: 'UNCHANGED'; baselineFinish: string; baselineName: string }
  | {
      kind: 'NOT_ASSESSABLE';
      reason:
        | 'NO_BASELINE'
        | 'BASELINE_HAS_NO_FINISH'
        | 'PLAN_NOT_SCHEDULED'
        | 'PLAN_EMPTY'
        | 'CALENDAR_UNUSABLE';
    };

/**
 * Derive the movement for one plan.
 *
 * **`movementDaysBetween` is the injected measurement frame** — the ADR-0024 pure-port pattern, and
 * the only way this function can measure in WORKING days while staying pure and engine-free. The
 * frame is the one `schedule.service.ts:1758-1761` already uses for the revision comparison:
 * working days on the PLAN's calendar, converted with the BASELINE's frozen hours-per-day factor.
 * Two numbers on one product derived on different calendars is a worse defect than any residual in
 * either (ADR-0125 D4), so this reuses that frame rather than inventing a second one.
 *
 * **The default is calendar days and is NOT the shipped behaviour.** It exists so this module's own
 * unit cases can pin the reason ladder and the sign convention without standing up a calendar. No
 * caller in `apps/api` omits the argument, and a reader must not conclude from the default that the
 * product reports calendar days (the wording is `computeRevisionDelta`'s, deliberately).
 *
 * **The reason ladder is ordered by what the reader can do about it**, and the order is load-bearing
 * rather than arbitrary: a plan with no activities cannot be scheduled, and a plan that has not been
 * scheduled has no finish to compare — so checking "empty" before "not scheduled" before "no
 * baseline" reports the FIRST thing that needs doing rather than the last thing that failed.
 */
export function baselineMovementOf(
  row: Pick<
    PlanStandingRow,
    | 'activityCount'
    | 'projectFinish'
    | 'baselineFinish'
    | 'baselineName'
    | 'baselineHoursPerDayMinutes'
  >,
  movementDaysBetween: (from: string, to: string) => number | null = calendarDaysBetween,
): BaselineMovement {
  if (row.activityCount === 0) return { kind: 'NOT_ASSESSABLE', reason: 'PLAN_EMPTY' };
  if (row.projectFinish === null) {
    return { kind: 'NOT_ASSESSABLE', reason: 'PLAN_NOT_SCHEDULED' };
  }
  if (row.baselineName === null) return { kind: 'NOT_ASSESSABLE', reason: 'NO_BASELINE' };
  if (row.baselineFinish === null) {
    // An active baseline exists but froze no project finish — an older capture, or one taken before
    // the plan was calculated. Distinct from NO_BASELINE because the remedy differs: re-capture,
    // rather than capture.
    return { kind: 'NOT_ASSESSABLE', reason: 'BASELINE_HAS_NO_FINISH' };
  }

  const workingDays = movementDaysBetween(row.baselineFinish, row.projectFinish);
  // **The frame declining is a fifth reason, not a zero.** A plan whose calendar cannot be built or
  // walked has no working-day frame at all, and the only alternatives were both worse: falling back
  // to calendar days would print a number in a DIFFERENT frame from every other row on the screen
  // (the "two numbers meaning different things on one product" ADR-0125 D4 warns against), and
  // letting the throw out would answer the first screen after sign-in with a 422 because one plan
  // of eight sits on a calendar somebody emptied.
  if (workingDays === null) {
    return { kind: 'NOT_ASSESSABLE', reason: 'CALENDAR_UNUSABLE' };
  }
  if (workingDays === 0) {
    return {
      kind: 'UNCHANGED',
      baselineFinish: row.baselineFinish,
      baselineName: row.baselineName,
    };
  }
  return {
    kind: 'MOVED',
    workingDays,
    baselineFinish: row.baselineFinish,
    baselineName: row.baselineName,
  };
}

/**
 * Whole calendar days between two `YYYY-MM-DD` dates, signed. The unit-test default only — see
 * {@link baselineMovementOf}.
 */
function calendarDaysBetween(from: string, to: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * The engine-flagged counts worth showing, with zero-valued keys OMITTED.
 *
 * A zero flag is not news — it is the healthy state of every plan for every flag it does not have —
 * and a row printing four zeroes would bury the one that is not. Omission here is the payload
 * saying "nothing to report", which is a different statement from "reported: none".
 */
export function flagsOf(
  row: Pick<
    PlanStandingRow,
    | 'constraintViolatedCount'
    | 'loeNoSpanCount'
    | 'resourceDriverMissingCount'
    | 'visualConflictCount'
  >,
): Record<string, number> {
  const all = {
    constraintViolated: row.constraintViolatedCount,
    loeNoSpan: row.loeNoSpanCount,
    resourceDriverMissing: row.resourceDriverMissingCount,
    visualConflict: row.visualConflictCount,
  };
  return Object.fromEntries(Object.entries(all).filter(([, count]) => count > 0));
}

/**
 * Whether a row has anything the engine flagged.
 *
 * It reads {@link flagsOf}'s OUTPUT rather than the raw counts, and that is the whole reason it is
 * a function instead of an inline `length > 0` at the one call site. `flagsOf` is where "which
 * counts are worth showing" is decided — it omits zeroes, and a future flag joins its table. A
 * predicate written against `PlanStandingRow` would restate that decision, and the two would drift
 * silently the first time the table gained a member: the row would render a flag and sort as
 * healthy, or sort as flagged and render nothing. One rule, one home (ADR-0065, ADR-0121).
 */
export function isFlagged(row: { flags: Record<string, number> }): boolean {
  return Object.keys(row.flags).length > 0;
}

/**
 * Promote the flagged rows to the front, leaving everything else exactly where it was.
 *
 * **This is the section's first opinion about its own subject, not a second opinion about the
 * plan's.** "Where the work stands" used to be ordered by the recently-changed list, with the
 * argument that the reader had just read that order and a second ordering rule would be a second
 * opinion about which work matters most. The first half was true and the second was not: recency is
 * intrinsic to "Recently changed", which answers *what happened and who*, and it is BORROWED here,
 * where the question is *is the programme healthy*. A borrowed rule is not a neutral one — it meant
 * the only section on the landing about programme health had no say in what a reader sees first, so
 * the one plan with a broken constraint sat sixth, 1,398 px down and below the fold, under five
 * healthy ones (`m7-flagged-first.md`).
 *
 * **Stable, and that is what keeps the old argument's good half.** `Array.prototype.sort` has been
 * required to be stable since ES2019, so within each group the recently-changed order survives
 * untouched: a reader still gets recency, applied twice — once to the rows that need them, once to
 * the rest. The rank is deliberately a BOOLEAN and not a count or a severity: a plan with four
 * conflicts is not more urgent than one with a broken constraint, the flag kinds are not
 * comparable, and ranking them would be exactly the invented opinion the original argument warned
 * about.
 *
 * **What it costs, stated rather than buried.** Since the two-column landing, this section and
 * "Recently changed" sit side by side rather than stacked, so their orders now disagree where a
 * reader can see both at once. That is a real cost and it is accepted: the two lists answer
 * different questions, and matching orders bought agreement by making one of them answer neither.
 *
 * Returns a new array; the input is not mutated, because `sort` in place would reorder the caller's
 * array and this one belongs to `toStanding`'s result rather than to this function.
 */
export function orderByFlaggedFirst<T extends { flags: Record<string, number> }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => Number(isFlagged(b)) - Number(isFlagged(a)));
}
