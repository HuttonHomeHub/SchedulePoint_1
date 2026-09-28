import type { BaselineVarianceRow } from '@repo/types';

import { MINUTES_PER_DAY } from '../schedule/day-compat-calendar';
import type { WorkingTimeCalendar } from '../schedule/engine';

/** A baseline snapshot row projected to the fields variance needs (dates as `YYYY-MM-DD`). */
export interface VarianceBaselineRow {
  sourceActivityId: string;
  code: string | null;
  name: string;
  baselineStart: string | null;
  baselineFinish: string | null;
  totalFloat: number | null;
}

/**
 * A live activity projected to the fields variance needs (dates as `YYYY-MM-DD`).
 *
 * `start`/`finish` rather than `earlyStart`/`earlyFinish` (`placement-baseline-variance`):
 * this function is basis-blind, and the caller projects the live row onto whichever basis
 * `meta.basis` names before calling it — a field named "early" that sometimes holds a
 * PLACED date is the silent redefinition ADR-0148 refused elsewhere.
 */
export interface VarianceLiveRow {
  id: string;
  code: string | null;
  name: string;
  start: string | null;
  finish: string | null;
  totalFloat: number | null;
}

/** The plan-level roll-up computed alongside the rows (the summary lacks the baseline identity). */
export interface VarianceRollup {
  worstFinishSlipDays: number | null;
  behindCount: number;
  addedCount: number;
  removedCount: number;
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
function workingDiff(
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
 * total float (positive = more float now). A live activity added after capture is
 * `inBaseline: false` (variance null); a baselined activity no longer live is a
 * `removed: true` row (current fields null). Live rows keep their input order; removed
 * rows follow.
 *
 * **Basis-blind** (`placement-baseline-variance`, amending ADR-0025): this function has no
 * idea whether `baselineStart`/`start` are placed or network dates — the caller projects
 * both inputs onto whichever basis the active baseline's `placementSnapshotLevel` selects
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
    const floatVarianceDays =
      base && live.totalFloat !== null && base.totalFloat !== null
        ? live.totalFloat - base.totalFloat
        : null;

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
    });
  }

  return { rows, rollup: { worstFinishSlipDays, behindCount, addedCount, removedCount } };
}
