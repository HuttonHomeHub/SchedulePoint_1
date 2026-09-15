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
 * The four reasons are distinguishable and each is actionable in a different way: capture a
 * baseline, capture one that has a finish, recalculate, or add some activities.
 */
export type BaselineMovement =
  | { kind: 'MOVED'; workingDays: number; baselineFinish: string; baselineName: string }
  | { kind: 'UNCHANGED'; baselineFinish: string; baselineName: string }
  | {
      kind: 'NOT_ASSESSABLE';
      reason: 'NO_BASELINE' | 'BASELINE_HAS_NO_FINISH' | 'PLAN_NOT_SCHEDULED' | 'PLAN_EMPTY';
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
  movementDaysBetween: (from: string, to: string) => number = calendarDaysBetween,
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
