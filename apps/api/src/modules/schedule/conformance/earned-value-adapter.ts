import type { ConformanceFixture, FixtureActivity } from '@repo/engine-conformance';

import type { EvActivityInput, EvAssignmentInput } from '../engine';

import { mapActivityType } from './type-map';

/**
 * The **fixture→EV adapter** (EV3 conformance slice, ADR-0042 / ADR-0035 §29). A sibling of
 * `adapter.ts`, but scoped to Earned Value: the P6-class conformance fixture (`p6_torture_test_v1.json`)
 * **predates the ADR-0025 cost-baseline amendment**, so it carries no `baseline_activities.budgeted_cost`
 * snapshot — there is no committed PV curve to read. Rather than inventing one, this adapter grounds the
 * EV3 proof in the fixture's **real** cost + %-complete data for a curated subset of its own
 * `pct_physical` / `pct_units` / `cost_expense`-tagged activities, and reports honestly (like `adapter.ts`)
 * what is and is not fixture-real:
 *
 * 1. **No cost baseline on this fixture.** Every activity here reads `baselineBudgetedCost: null`, so
 *    `computeEarnedValue` correctly reports `costBaselineMissing: true` and falls back to the live-budget
 *    PV path (ADR-0042 §Q2 default) — asserted, not hidden, in `earned-value-conformance.spec.ts`. The
 *    companion first-principles PV/SPI/EAC goldens (that spec's differential cases) supply a synthetic
 *    baseline window explicitly, documented at the point of use.
 * 2. **Actual cost is derived, not read.** The fixture models per-assignment `actual_units` but has no
 *    `actual_cost` column, so this adapter derives `actualCost = round(actualUnits × resource.price_per_unit)`
 *    — the alternate ADR-0042 §1 (Q8) names ("derive from `actualUnits × rate`"), not the entered-cost
 *    default. Recorded here rather than silently assumed.
 *
 * Every other number — BAC, budgeted/actual expense, the WBS parentage, and each activity's own
 * `percent_complete_type` / `duration_percent_complete` / `physical_percent_complete` — is read straight
 * from the fixture, unmodified.
 */

/**
 * The curated fixture activities this EV3 slice values: the two real `TASK_DEPENDENT`
 * `pct_physical` cases (`A4200` — the fixture's own `prog_rd_vs_pct_divergence` discriminator, physical
 * 35% deliberately ≠ duration 40%; `A7100`), the real `pct_units` case (`A8010`), three real
 * `cost_expense` cases spanning a `RESOURCE_DEPENDENT` activity (`A6100`), a completed/over-run activity
 * (`A3010`, the fixture's own `cost_overrun` case), and a window-calendar activity (`A10300`) — plus
 * their two real WBS-summary ancestors (`W4000`/`W7000`, ADR-0035 §24) so the rollup is genuine, not
 * synthetic.
 */
export const EV_FIXTURE_ACTIVITY_IDS = [
  'W4000',
  'W7000',
  'A4200',
  'A7100',
  'A8010',
  'A6100',
  'A3010',
  'A10300',
] as const;

/**
 * The nearest WBS-summary ancestor of `activity` among the curated `summaries`, by the same
 * strict/segment-aligned dotted-code prefix match `adapter.ts` uses for the CPM network (ADR-0035 §24) —
 * duplicated narrowly here because this adapter selects a different (cost-focused) activity subset, not
 * the whole fixture.
 */
function resolveParentId(activity: FixtureActivity, summaries: FixtureActivity[]): string | null {
  let best: FixtureActivity | undefined;
  for (const summary of summaries) {
    if (
      activity.wbs.startsWith(`${summary.wbs}.`) &&
      (best === undefined || summary.wbs.length > best.wbs.length)
    ) {
      best = summary;
    }
  }
  return best?.id ?? null;
}

/**
 * Build the {@link EvActivityInput} rows for the curated fixture subset (EV3). BAC derives from each
 * activity's real assignments (`budgetedUnits × resource.price_per_unit`) plus any real fixture
 * `expenses` row for it (ADR-0042 §1 Q1's "both" default); AC likewise, with the actual-cost derivation
 * documented above. `percentCompleteType` / `percentComplete` / `physicalPercentComplete` are the
 * fixture's own fields, unmodified — the exact vocabulary `@repo/types`' `PercentCompleteType` uses.
 * No cost baseline and no CPM dates are fed (this adapter never runs `computeSchedule`), so every row's
 * `earlyStart`/`earlyFinish`/`baseline*` are null — the live-budget PV fallback with no anchor at all,
 * i.e. `PV = 0` until a caller supplies one explicitly (the conformance spec's baseline differential).
 */
export function buildEvActivityInputsFromFixture(fixture: ConformanceFixture): EvActivityInput[] {
  const selected = new Set<string>(EV_FIXTURE_ACTIVITY_IDS);
  const activities = fixture.activities.filter((a) => selected.has(a.id));
  const summaries = activities.filter((a) => a.activity_type === 'WBS_SUMMARY');

  const priceByResource = new Map(fixture.resources.map((r) => [r.id, r.price_per_unit]));

  const expenseByActivity = new Map<string, { budgeted: number; actual: number }>();
  for (const expense of fixture.expenses) {
    if (!selected.has(expense.activity)) continue;
    const existing = expenseByActivity.get(expense.activity) ?? { budgeted: 0, actual: 0 };
    existing.budgeted += expense.budgeted_cost;
    existing.actual += expense.actual_cost;
    expenseByActivity.set(expense.activity, existing);
  }

  const assignmentsByActivity = new Map<string, EvAssignmentInput[]>();
  for (const asg of fixture.assignments) {
    if (!selected.has(asg.activity)) continue;
    const price = priceByResource.get(asg.resource) ?? null;
    const list = assignmentsByActivity.get(asg.activity) ?? [];
    list.push({
      budgetedCost: null, // derive budgetedUnits × costPerUnit (ADR-0042 §1 Q1 default)
      actualCost: price !== null ? Math.round(asg.actual_units * price) : 0, // §1 Q8 alternate — see module doc
      budgetedUnits: asg.budgeted_units,
      actualUnits: asg.actual_units,
      costPerUnit: price,
    });
    assignmentsByActivity.set(asg.activity, list);
  }

  return activities.map((activity): EvActivityInput => {
    const typeResult = mapActivityType(activity.activity_type);
    if (!typeResult.supported) {
      // Every id in EV_FIXTURE_ACTIVITY_IDS is a real, supported fixture type; a failure here means the
      // curated selection drifted from the fixture, which is a reviewed regression, not a runtime path.
      throw new Error(
        `EV3 fixture selection "${activity.id}" is an unsupported activity type: ${typeResult.reason}`,
      );
    }
    const expense = expenseByActivity.get(activity.id) ?? { budgeted: 0, actual: 0 };
    return {
      activityId: activity.id,
      type: typeResult.value,
      parentId: resolveParentId(activity, summaries),
      percentCompleteType: activity.percent_complete_type,
      percentComplete: activity.duration_percent_complete,
      physicalPercentComplete: activity.physical_percent_complete,
      budgetedExpense: expense.budgeted,
      actualExpense: expense.actual,
      assignments: assignmentsByActivity.get(activity.id) ?? [],
      baselineStart: null,
      baselineFinish: null,
      baselineBudgetedCost: null,
      earlyStart: null,
      earlyFinish: null,
    };
  });
}
