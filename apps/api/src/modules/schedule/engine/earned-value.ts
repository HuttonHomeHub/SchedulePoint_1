import type { AccrualType, ActivityType, EacMethod, PercentCompleteType } from '@repo/types';

import type { WorkingTimeCalendar } from './working-time-calendar';

/**
 * The **pure Earned-Value read-model** (EV2b-core, ADR-0042 §2 / ADR-0035 §29). A dependency-free
 * sibling of {@link import('./float-paths').computeFloatPaths} and the baseline-variance read: it
 * consumes the already-persisted CPM dates plus the cost / %-complete inputs and returns the P6
 * Earned-Value metric set (BAC, PV/BCWS, EV/BCWP, AC/ACWP → SV, CV, SPI, CPI → EAC, ETC, TCPI, VAC)
 * per activity, rolled up over the WBS tree, and as a plan total. It **schedules nothing** — this is
 * the key contrast with resource levelling ({@link import('./level').levelSchedule}): EV never enters
 * `computeSchedule`, adds no write pass, and owns no persisted column, so the recalc parity gate is
 * structurally trivial (ADR-0042 §2).
 *
 * Everything is computed **as of the data date** (the status date, ADR-0023/0033). All money is
 * **integer minor units** (ADR-0042 §7); each derived money output is rounded once with `Math.round`.
 * Ratios (SPI/CPI/TCPI) are 4-dp floats, not money. The function is **pure**: no I/O, no `Date.now`,
 * no mutation of its inputs.
 */

/**
 * One resource assignment's cost inputs (ADR-0042 §3). `budgetedCost` is the explicit override; when
 * null the budget derives from `budgetedUnits × (costPerUnit ?? 0)` (the ADR-0040 rate-on-the-assignment
 * precedent). All amounts are integer minor units; units are decimal quantities.
 */
export interface EvAssignmentInput {
  /** Explicit budgeted cost (minor units); null = derive `budgetedUnits × costPerUnit`. */
  budgetedCost: number | null;
  /** Actual cost booked against the assignment (minor units). */
  actualCost: number;
  /** Budgeted work quantity (units). */
  budgetedUnits: number;
  /** Actual work quantity to date (units). */
  actualUnits: number;
  /** The driving resource's price-per-unit rate; null = 0 (no cost). */
  costPerUnit: number | null;
}

/**
 * One weighted progress step (ADR-0044 §33). `weight` is a relative importance (≥ 0); `percentComplete`
 * is the step's own progress (0–100). The activity's physical %-complete is the weight-weighted mean of
 * its steps' `percentComplete`.
 */
export interface ActivityStepInput {
  weight: number;
  percentComplete: number;
}

/**
 * Resolve an activity's physical %-complete from its weighted steps, falling back to the manual value
 * (ADR-0044 §33). Steps **win** when present with a positive total weight: the result is the weighted
 * mean `Σ(wᵢ·pᵢ)/Σ(wᵢ)`, clamped to `[0, 100]`. With **no steps, or all-zero weights (N27)**, the
 * manual `physicalPercentComplete` stands (or 0 when unset) — the byte-identical no-steps path. Shared
 * by the EV read-model and the activity API so both read physical progress one way.
 */
export function rollupPhysicalPercent(
  steps: readonly ActivityStepInput[] | undefined,
  manualPercent: number | null,
): number {
  const manual = clamp(manualPercent ?? 0, 0, 100);
  if (!steps || steps.length === 0) return manual;
  let weightSum = 0;
  let weighted = 0;
  for (const step of steps) {
    weightSum += step.weight;
    weighted += step.weight * clamp(step.percentComplete, 0, 100);
  }
  if (weightSum <= 0) return manual; // N27 — all weights zero: fall back to the manual field.
  return clamp(weighted / weightSum, 0, 100);
}

/**
 * One activity's Earned-Value inputs. `percentComplete` is the M2 **schedule** %-complete (the
 * `DURATION` source); `physicalPercentComplete` is the ADR-0042 **performance** measure (the `PHYSICAL`
 * source). Baseline fields carry the ADR-0025 cost-baseline snapshot (null = missing → the live-budget
 * PV fallback); `earlyStart`/`earlyFinish` are the persisted CPM dates used for that fallback.
 */
export interface EvActivityInput {
  activityId: string;
  type: ActivityType;
  /** The WBS parent (ADR-0038); null = a top-level node. Summaries roll up their direct children. */
  parentId: string | null;
  /** Which measure feeds the EV performance % (ADR-0042 §1). */
  percentCompleteType: PercentCompleteType;
  /** Schedule %-complete 0–100 (M2) — the `DURATION` performance source. */
  percentComplete: number;
  /** Hand-entered physical %-complete 0–100, or null = unset — the `PHYSICAL` source. */
  physicalPercentComplete: number | null;
  /**
   * Weighted progress **steps** (M7 rung 5, ADR-0044 §33). When present with a positive total weight,
   * the activity's physical %-complete is their weighted mean `Σ(wᵢ·pᵢ)/Σ(wᵢ)` and **wins** over
   * {@link physicalPercentComplete}. **Optional — absent (or all-zero-weight, N27) ⇒ the manual field
   * stands**, the byte-identical pre-ADR-0044 path. Feeds the `PHYSICAL` measure only; no CPM effect.
   */
  steps?: ActivityStepInput[];
  /** Activity-level lump-sum budgeted expense (minor units; 0 if none). */
  budgetedExpense: number;
  /** Activity-level actual expense (minor units; 0 if none). */
  actualExpense: number;
  /**
   * How the activity's cost accrues across its span (ADR-0044 §32) — governs PV time-phasing only.
   * `START`/`END` recognise the whole cost at the start/finish; `UNIFORM` spreads it linearly, exactly
   * today's math. **Optional — absent ⇒ `UNIFORM`**, the byte-identical pre-ADR-0044 path, so a plan
   * with no accrual data reads identically.
   */
  accrualType?: AccrualType;
  assignments: EvAssignmentInput[];
  /** Cost-baseline start (`YYYY-MM-DD`); used for PV only when both baseline dates are present. */
  baselineStart: string | null;
  /** Cost-baseline finish (`YYYY-MM-DD`); used for PV only when both baseline dates are present. */
  baselineFinish: string | null;
  /** Cost-baseline budgeted cost (minor units); null = missing → PV falls back to live BAC + a plan flag. */
  baselineBudgetedCost: number | null;
  /** Live early start (`YYYY-MM-DD`) — the PV time-phasing anchor when no cost baseline exists. */
  earlyStart: string | null;
  /** Live early finish (`YYYY-MM-DD`) — the PV time-phasing anchor when no cost baseline exists. */
  earlyFinish: string | null;
}

/** The full input to {@link computeEarnedValue}. */
export interface EvInput {
  activities: EvActivityInput[];
  /** The EV status date (`YYYY-MM-DD`); null = no data date (planned value is 0 everywhere). */
  dataDate: string | null;
  /** The EAC forecast method (ADR-0042 §5). */
  eacMethod: EacMethod;
  /** The plan working-time calendar used to time-phase PV to the data date (ADR-0037). */
  calendar: WorkingTimeCalendar;
}

/** The P6 derived Earned-Value metric set for one level (activity, WBS summary, or plan total). */
export interface EvMetrics {
  /** Budget at Completion (minor units). */
  bac: number;
  /** Planned Value / BCWS (minor units). */
  pv: number;
  /** Earned Value / BCWP (minor units). */
  ev: number;
  /** Actual Cost / ACWP (minor units). */
  ac: number;
  /** Schedule Variance `EV − PV` (minor units). */
  sv: number;
  /** Cost Variance `EV − AC` (minor units). */
  cv: number;
  /** Schedule Performance Index `EV / PV`; null when PV = 0 (never `Infinity`). */
  spi: number | null;
  /** Cost Performance Index `EV / AC`; null when AC = 0 (never `Infinity`). */
  cpi: number | null;
  /** Estimate at Completion (minor units), per the plan's {@link EvInput.eacMethod}; always defined. */
  eac: number;
  /** Estimate to Complete `EAC − AC` (minor units). */
  etc: number;
  /** To-Complete Performance Index `(BAC − EV) / (BAC − AC)`; null when `BAC = AC`. */
  tcpi: number | null;
  /** Variance at Completion `BAC − EAC` (minor units). */
  vac: number;
}

/** One activity's EV result — the derived metric set plus its id and rolled performance %. */
export interface EvActivityResult extends EvMetrics {
  activityId: string;
  /** The performance % that earned this level's EV (0–100). A summary's is `EV / BAC × 100` (2 dp). */
  performancePercent: number;
}

/** The plan's Earned-Value analysis: per-activity rows (incl. WBS summaries) plus the plan total. */
export interface PlanEarnedValueResult {
  /** True when any leaf activity has no cost-baseline budget, so PV used the live-budget fallback. */
  costBaselineMissing: boolean;
  /**
   * The count of leaf activities that show booked actual cost/units while apparently **not started**
   * (ADR-0035 §29, N24) — a read-time **data-quality warning**, never a reject: EV still values the
   * activity normally (spend without recorded progress is exactly the CV signal, surfaced, not hidden).
   * "Not started" is read from the schedule/physical %-complete already on the row (both 0), since this
   * module carries no independent activity status.
   */
  costWarningCount: number;
  activities: EvActivityResult[];
  total: EvMetrics;
}

/** Round to 4 decimal places (ratios: SPI/CPI/TCPI). */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Round to 2 decimal places (a summary's rolled performance %). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Clamp to `[lo, hi]`. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** The four accumulating quantities that roll up over the WBS tree. */
interface EvBase {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
}

/**
 * Derive the full P6 metric set from the four accumulating quantities — reused at **every** level
 * (leaf, WBS summary, plan total) so the guards are identical everywhere (ADR-0035 §29). Ratios are
 * 4-dp floats; every money output is an integer (rounded once). Divide-by-zero is guarded to a defined
 * sentinel (null for an index) or the atypical `AC + (BAC − EV)` fallback for EAC — never `NaN`/`Infinity`.
 */
export function deriveMetrics(
  bac: number,
  pv: number,
  ev: number,
  ac: number,
  eacMethod: EacMethod,
): EvMetrics {
  const sv = ev - pv;
  const cv = ev - ac;
  const spi = pv > 0 ? round4(ev / pv) : null;
  const cpi = ac > 0 ? round4(ev / ac) : null;

  // The "atypical" remaining-work-at-budget forecast — also every guard's fallback.
  const atBudget = Math.round(ac + (bac - ev));
  let eac: number;
  switch (eacMethod) {
    case 'CPI':
      eac = cpi !== null && cpi > 0 ? Math.round(bac / cpi) : atBudget;
      break;
    case 'REMAINING_AT_BUDGET':
      eac = atBudget;
      break;
    case 'CPI_TIMES_SPI':
      eac =
        cpi !== null && spi !== null && cpi * spi > 0
          ? Math.round(ac + (bac - ev) / (cpi * spi))
          : atBudget;
      break;
  }

  const etc = eac - ac;
  const tcpi = bac - ac !== 0 ? round4((bac - ev) / (bac - ac)) : null;
  const vac = bac - eac;

  return { bac, pv, ev, ac, sv, cv, spi, cpi, eac, etc, tcpi, vac };
}

/**
 * Whether a leaf activity shows booked actual cost/units while apparently **not started** (N24,
 * ADR-0035 §29) — a read-time data-quality signal, never a reject. "Not started" is read from the
 * schedule/physical %-complete already on the row (both 0); "booked" is any actual expense or any
 * assignment actual cost/units greater than zero.
 */
function hasCostWarning(activity: EvActivityInput): boolean {
  const notStarted =
    activity.percentComplete === 0 && (activity.physicalPercentComplete ?? 0) === 0;
  if (!notStarted) return false;
  if (activity.actualExpense > 0) return true;
  return activity.assignments.some((a) => a.actualCost > 0 || a.actualUnits > 0);
}

/** BAC + AC for one leaf activity, from its assignments and activity-level expenses (ADR-0042 §3). */
function leafBudgetAndActual(activity: EvActivityInput): { bac: number; ac: number } {
  let bac = activity.budgetedExpense;
  let ac = activity.actualExpense;
  for (const a of activity.assignments) {
    bac += a.budgetedCost ?? Math.round(a.budgetedUnits * (a.costPerUnit ?? 0));
    ac += a.actualCost;
  }
  return { bac, ac };
}

/**
 * The EV performance % (0–100) for a leaf activity — which schedule/performance measure earns value,
 * per the activity **type** (milestones override), then its {@link PercentCompleteType} (ADR-0035 §29).
 */
function leafPerformancePercent(activity: EvActivityInput): number {
  // Milestones earn all-or-nothing on their schedule %-complete (the 0/100 rule).
  if (activity.type === 'START_MILESTONE' || activity.type === 'FINISH_MILESTONE') {
    return activity.percentComplete >= 100 ? 100 : 0;
  }
  // LOE has no independent progress; it earns on Duration (its schedule %-complete), ADR-0035 §21.
  if (activity.type === 'LEVEL_OF_EFFORT') {
    return activity.percentComplete;
  }
  switch (activity.percentCompleteType) {
    case 'DURATION':
      return activity.percentComplete;
    case 'UNITS': {
      let totalBudgeted = 0;
      let totalActual = 0;
      for (const a of activity.assignments) {
        totalBudgeted += a.budgetedUnits;
        totalActual += a.actualUnits;
      }
      return totalBudgeted > 0 ? clamp((totalActual / totalBudgeted) * 100, 0, 100) : 0;
    }
    case 'PHYSICAL':
      // Steps win when present (positive total weight); else the manual field (N27 fallback), ADR-0044 §33.
      return rollupPhysicalPercent(activity.steps, activity.physicalPercentComplete);
  }
}

/**
 * The planned % of a leaf's PV cost scheduled to be recognised by the data date — time-phased on the
 * plan calendar (working time, ADR-0037) per the activity's {@link AccrualType} (ADR-0044 §32).
 * Milestones are binary on their start (a zero-span event's cost lands at its instant regardless of
 * accrual). For a task: `START` recognises the whole cost once the data date reaches the start; `END`
 * only once it reaches the finish; `UNIFORM` (default) spreads it linearly across `[start, finish)` —
 * exactly the pre-ADR-0044 math, so a `UNIFORM` plan is byte-identical. Returns 0 when the data date or
 * the anchor dates are missing.
 */
function leafPlannedPercent(
  activity: EvActivityInput,
  start: string | null,
  finish: string | null,
  dataDate: string | null,
  calendar: WorkingTimeCalendar,
): number {
  const isMilestone = activity.type === 'START_MILESTONE' || activity.type === 'FINISH_MILESTONE';
  if (isMilestone) {
    return dataDate !== null && start !== null && dataDate >= start ? 100 : 0;
  }
  if (dataDate === null || start === null || finish === null) return 0;
  // START/END recognise the whole cost at a single endpoint — no spread (ADR-0044 §32).
  if (activity.accrualType === 'START') return dataDate >= start ? 100 : 0;
  if (activity.accrualType === 'END') return dataDate >= finish ? 100 : 0;
  // UNIFORM — the byte-identical linear path.
  if (dataDate <= start) return 0;
  if (dataDate >= finish) return 100;
  const span = calendar.workingTimeBetween(start, finish);
  if (span <= 0) return 100; // A degenerate/zero-length span past its start is fully planned.
  const elapsed = calendar.workingTimeBetween(start, dataDate);
  return clamp((elapsed / span) * 100, 0, 100);
}

/**
 * Compute the plan's Earned-Value analysis (ADR-0042). Pure: it reads `input` and returns a fresh
 * result, never mutating and never touching I/O. Every non-deleted activity — including WBS summaries —
 * appears in {@link PlanEarnedValueResult.activities}.
 *
 * Leaves (non-`WBS_SUMMARY`) compute BAC/AC from assignments + expenses, EV from `BAC × performance%`,
 * and PV by time-phasing the cost baseline (or the flagged live-budget fallback) to the data date. WBS
 * summaries sum their **direct** children's rolled BAC/PV/EV/AC (processed **deepest-first** so a nested
 * summary sees its children's rolled totals — the M5-epic rollup precedent), then derive their metrics;
 * a summary carries no cost of its own. The plan total sums the top-level (`parentId === null`) rows.
 */
export function computeEarnedValue(input: EvInput): PlanEarnedValueResult {
  const { activities, dataDate, eacMethod, calendar } = input;

  const byId = new Map(activities.map((a) => [a.activityId, a]));
  const directChildren = new Map<string, string[]>();
  for (const a of activities) {
    if (a.parentId != null) {
      const siblings = directChildren.get(a.parentId);
      if (siblings) siblings.push(a.activityId);
      else directChildren.set(a.parentId, [a.activityId]);
    }
  }

  /** Depth in the WBS containment tree (root = 0), bounded so a malformed cycle cannot loop forever. */
  const depthOf = (activity: EvActivityInput): number => {
    let depth = 0;
    let cursor = activity.parentId;
    while (cursor != null && depth <= activities.length) {
      depth += 1;
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    return depth;
  };

  // The rolled BAC/PV/EV/AC each activity contributes to its parent (its own for a leaf, the summed
  // children for a summary). Assembled results are keyed by id, emitted in the input order at the end.
  const rolled = new Map<string, EvBase>();
  const resultById = new Map<string, EvActivityResult>();
  let costBaselineMissing = false;
  let costWarningCount = 0;

  // Leaves first — they do not depend on the rollup.
  for (const activity of activities) {
    if (activity.type === 'WBS_SUMMARY') continue;

    const { bac, ac } = leafBudgetAndActual(activity);
    const performancePercent = leafPerformancePercent(activity);
    const ev = Math.round((bac * performancePercent) / 100);
    if (hasCostWarning(activity)) costWarningCount += 1;

    const useBaseline = activity.baselineStart !== null && activity.baselineFinish !== null;
    const start = useBaseline ? activity.baselineStart : activity.earlyStart;
    const finish = useBaseline ? activity.baselineFinish : activity.earlyFinish;
    if (activity.baselineBudgetedCost === null) costBaselineMissing = true;
    const pvCost = activity.baselineBudgetedCost ?? bac;
    const plannedPercent = leafPlannedPercent(activity, start, finish, dataDate, calendar);
    const pv = Math.round((pvCost * plannedPercent) / 100);

    rolled.set(activity.activityId, { bac, pv, ev, ac });
    resultById.set(activity.activityId, {
      activityId: activity.activityId,
      performancePercent,
      ...deriveMetrics(bac, pv, ev, ac, eacMethod),
    });
  }

  // WBS summaries deepest-first, so a summary sees its (already-rolled) children — incl. nested summaries.
  const summaries = activities
    .filter((a) => a.type === 'WBS_SUMMARY')
    .sort((a, b) => depthOf(b) - depthOf(a));
  for (const summary of summaries) {
    const base: EvBase = { bac: 0, pv: 0, ev: 0, ac: 0 };
    for (const childId of directChildren.get(summary.activityId) ?? []) {
      const child = rolled.get(childId);
      if (!child) continue;
      base.bac += child.bac;
      base.pv += child.pv;
      base.ev += child.ev;
      base.ac += child.ac;
    }
    rolled.set(summary.activityId, base);
    const performancePercent = base.bac > 0 ? round2((base.ev / base.bac) * 100) : 0;
    resultById.set(summary.activityId, {
      activityId: summary.activityId,
      performancePercent,
      ...deriveMetrics(base.bac, base.pv, base.ev, base.ac, eacMethod),
    });
  }

  // Plan total = the top-level (parentId === null) rolled rows.
  const totalBase: EvBase = { bac: 0, pv: 0, ev: 0, ac: 0 };
  for (const activity of activities) {
    if (activity.parentId != null) continue;
    const base = rolled.get(activity.activityId);
    if (!base) continue;
    totalBase.bac += base.bac;
    totalBase.pv += base.pv;
    totalBase.ev += base.ev;
    totalBase.ac += base.ac;
  }
  const total = deriveMetrics(totalBase.bac, totalBase.pv, totalBase.ev, totalBase.ac, eacMethod);

  return {
    costBaselineMissing,
    costWarningCount,
    activities: activities.map((a) => resultById.get(a.activityId)!),
    total,
  };
}
