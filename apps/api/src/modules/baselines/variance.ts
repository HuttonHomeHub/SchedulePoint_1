import type { BaselineVarianceRow } from '@repo/types';

import { MINUTES_PER_DAY } from '../schedule/day-compat-calendar';
import type { WorkingTimeCalendar } from '../schedule/engine';

import { compareFloat, floatDaysOnFrame } from './float-movement';

/** A baseline snapshot row projected to the fields variance needs (dates as `YYYY-MM-DD`). */
export interface VarianceBaselineRow {
  sourceActivityId: string;
  code: string | null;
  name: string;
  baselineStart: string | null;
  baselineFinish: string | null;
  totalFloat: number | null;
  /** Unrounded working minutes (#318); null exactly when `totalFloat` is. */
  totalFloatMinutes: number | null;
}

/**
 * A live activity projected to the fields variance needs (dates as `YYYY-MM-DD`).
 *
 * `start`/`finish` rather than `earlyStart`/`earlyFinish` (`placement-baseline-variance`):
 * this function is basis-blind, and the caller projects the live row onto the basis
 * `meta.basis` names before calling it — a field named "early" that holds a PLACED date is
 * the silent redefinition ADR-0148 refused elsewhere.
 */
export interface VarianceLiveRow {
  id: string;
  code: string | null;
  name: string;
  start: string | null;
  finish: string | null;
  totalFloat: number | null;
  /** Unrounded working minutes (#318); null exactly when `totalFloat` is. */
  totalFloatMinutes: number | null;
}

/** The plan-level roll-up computed alongside the rows (the summary lacks the baseline identity). */
export interface VarianceRollup {
  worstFinishSlipDays: number | null;
  behindCount: number;
  addedCount: number;
  removedCount: number;
}

/** The plan-level finish comparison: where the last bar ends now against where it ended at capture. */
export interface ProjectFinishVariance {
  baselineProjectFinish: string | null;
  currentProjectFinish: string | null;
  projectFinishVarianceDays: number | null;
}

export interface VarianceResult {
  rows: BaselineVarianceRow[];
  rollup: VarianceRollup;
}

/**
 * The signed working-day variance from `baseline` to `current` on `calendar`
 * (positive = current later than baseline, i.e. behind). Null when either date is
 * absent — a not-yet-computed live date or an unbaselined activity is not comparable.
 */
export function workingDiff(
  calendar: WorkingTimeCalendar,
  baseline: string | null,
  current: string | null,
  dayFactorMinutes: number,
): number | null {
  if (baseline === null || current === null) return null;
  // The engine calendar is minute-granular (ADR-0036); variance stays day-denominated (ADR-0036 §7)
  // via the factor CAPTURED AT FREEZE (ADR-0068 §5) — never the live calendar's. Editing a
  // calendar's hours-per-day must not retroactively change what a frozen baseline reports.
  return Math.round(calendar.workingTimeBetween(baseline, current) / dayFactorMinutes);
}

/**
 * Pure variance diff (ADR-0025). Joins the plan's live activities against the active
 * baseline's snapshot on `sourceActivityId` and computes start/finish/float variance in
 * **working days** on the plan's calendar. The sign convention is **positive = current
 * later than baseline (behind schedule)**; `floatVarianceDays = current − baseline`
 * total float, compared in minutes and converted once on the baseline's frozen day length
 * (positive = more float now). A live activity added after capture is
 * `inBaseline: false` (variance null); a baselined activity no longer live is a
 * `removed: true` row (current fields null). Live rows keep their input order; removed
 * rows follow.
 *
 * **Basis-blind** (`placement-baseline-variance`, amending ADR-0025): this function has no
 * idea whether `baselineStart`/`start` are placed or network dates — the caller projects
 * both inputs onto the basis the active baseline's `placementSnapshotLevel` selects
 * (`meta.basis`) before calling it. Keeping the maths blind is the same property that let
 * baseline-vs-baseline come free for the revision delta (`schedule.service.ts`): one join,
 * two possible projections of its inputs, chosen once by the caller.
 */
export function computeVariance(
  baselineRows: readonly VarianceBaselineRow[],
  liveRows: readonly VarianceLiveRow[],
  calendar: WorkingTimeCalendar,
  /** The plan calendar's hours-per-day AT CAPTURE, in minutes (ADR-0068 §5). */
  dayFactorMinutes: number = MINUTES_PER_DAY,
): VarianceResult {
  const baselineById = new Map(baselineRows.map((b) => [b.sourceActivityId, b]));
  const liveIds = new Set(liveRows.map((l) => l.id));

  const rows: BaselineVarianceRow[] = [];
  let worstFinishSlipDays: number | null = null;
  let behindCount = 0;
  let addedCount = 0;

  for (const live of liveRows) {
    const base = baselineById.get(live.id) ?? null;
    const startVarianceDays = base
      ? workingDiff(calendar, base.baselineStart, live.start, dayFactorMinutes)
      : null;
    const finishVarianceDays = base
      ? workingDiff(calendar, base.baselineFinish, live.finish, dayFactorMinutes)
      : null;
    // Float is compared in MINUTES and converted once, on the frame the start/finish variance above
    // already uses (ADR-0214): subtracting two day figures, each rounded on its own day length,
    // reported a calendar edit as float movement.
    const floatComparison = base
      ? compareFloat(
          { days: base.totalFloat, minutes: base.totalFloatMinutes },
          { days: live.totalFloat, minutes: live.totalFloatMinutes },
        )
      : null;
    const floatVarianceMinutes =
      floatComparison?.kind === 'COMPARABLE' ? floatComparison.movementMinutes : null;
    const floatVarianceDays = floatDaysOnFrame(floatVarianceMinutes, dayFactorMinutes);

    if (base === null) addedCount += 1;
    if (finishVarianceDays !== null && finishVarianceDays > 0) {
      behindCount += 1;
      if (worstFinishSlipDays === null || finishVarianceDays > worstFinishSlipDays) {
        worstFinishSlipDays = finishVarianceDays;
      }
    }

    rows.push({
      activityId: live.id,
      code: live.code,
      name: live.name,
      inBaseline: base !== null,
      removed: false,
      currentStart: live.start,
      currentFinish: live.finish,
      currentTotalFloat: live.totalFloat,
      baselineStart: base?.baselineStart ?? null,
      baselineFinish: base?.baselineFinish ?? null,
      baselineTotalFloat: base?.totalFloat ?? null,
      startVarianceDays,
      finishVarianceDays,
      floatVarianceDays,
      floatVarianceMinutes,
    });
  }

  let removedCount = 0;
  for (const base of baselineRows) {
    if (liveIds.has(base.sourceActivityId)) continue;
    removedCount += 1;
    rows.push({
      activityId: base.sourceActivityId,
      code: base.code,
      name: base.name,
      inBaseline: true,
      removed: true,
      currentStart: null,
      currentFinish: null,
      currentTotalFloat: null,
      baselineStart: base.baselineStart,
      baselineFinish: base.baselineFinish,
      baselineTotalFloat: base.totalFloat,
      startVarianceDays: null,
      finishVarianceDays: null,
      floatVarianceDays: null,
      floatVarianceMinutes: null,
    });
  }

  return {
    rows,
    rollup: { worstFinishSlipDays, behindCount, addedCount, removedCount },
  };
}

/** The latest of a set of `YYYY-MM-DD` days (they order lexically), ignoring nulls; null when none. */
function latestDay(days: Iterable<string | null>): string | null {
  let latest: string | null = null;
  for (const d of days) {
    if (d !== null && (latest === null || d > latest)) latest = d;
  }
  return latest;
}

/**
 * The plan's finish against the baseline's (`baseline-slip-and-pinned-names` §4.2): the latest frozen
 * placed finish over EVERY snapshot row, the latest live placed finish over every live row, and their
 * working-day difference through {@link workingDiff} — the arithmetic every row's variance uses, on
 * the baseline's frozen day length. Deliberately not the activities' own roll-up: an activity added
 * after capture, or the baselined last activity removed, moves the plan's finish while no matched row
 * does. A sub-day slip rounds to 0 (the same rounding as a row's); null when either side is null.
 */
export function computeProjectFinishVariance(
  baselineFinishes: Iterable<string | null>,
  liveFinishes: Iterable<string | null>,
  calendar: WorkingTimeCalendar,
  dayFactorMinutes: number = MINUTES_PER_DAY,
): ProjectFinishVariance {
  const baselineProjectFinish = latestDay(baselineFinishes);
  const currentProjectFinish = latestDay(liveFinishes);
  const days = workingDiff(calendar, baselineProjectFinish, currentProjectFinish, dayFactorMinutes);
  return {
    baselineProjectFinish,
    currentProjectFinish,
    // `|| 0` only for a number: a sub-day slip earlier than baseline rounds to -0, which is not the
    // 0 a reader (or `Object.is`) compares against; null must stay null, never become "On baseline".
    projectFinishVarianceDays: days === null ? null : days || 0,
  };
}
