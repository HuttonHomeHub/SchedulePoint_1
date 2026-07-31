import type { SeedSpec } from '@repo/seed';

import { activity, assignment, capabilityPlan, DAY, link, resource } from './builders.js';

/**
 * **Cost, accrual and Earned Value** (ADR-0066 M2).
 *
 * Earned Value is a **read-model**, not a schedule pass (ADR-0042): nothing here moves a date, and
 * that is the property to check. Money is stored in minor units (pence), so `costPerUnit: 4200` is
 * £42.00 per unit — a decimal here would be a defect, not a rounding.
 *
 * Every field in this plan is XER-unreachable (TECH_DEBT #77's groups 2 and 3): the format has no
 * rate column and no expense table at all, so an imported plan carries no cost whatsoever.
 */
export function costPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-cost-and-ev',
    name: 'Cost: expenses, accrual and earned value',
    description:
      'Q1 is half done and on budget; Q2 is half done having spent nearly all of it — the overrun ' +
      'the EV rollup exists to surface, and neither activity’s dates change because of it. The ' +
      'three accrual types spend the same £5,000 at the start, evenly, and at the end.',
    currencyCode: 'GBP',
    resources: [
      resource('Q_LAB', 'Costed labour', { kind: 'LABOUR', maxUnitsPerHour: 4, costPerUnit: 4200 }),
    ],
    activities: [
      // Budget and actual both present and consistent: 50% of the work, roughly 50% of the money.
      activity('Q1', {
        name: 'On budget at 50%',
        budgetedExpense: 1_000_00,
        actualExpense: 480_00,
        progress: {
          status: 'IN_PROGRESS',
          percentComplete: 50,
          percentCompleteType: 'DURATION',
          physicalPercentComplete: null,
          actualStart: '2026-02-23T00:00',
          actualFinish: null,
          remainingDurationMinutes: 3 * DAY,
          suspendDate: null,
          resumeDate: null,
          expectedFinish: null,
        },
        testTags: ['cost_actual', 'cost_expense'],
      }),
      // Half the work, 92% of the money. CPI well below 1, and the default `EAC = BAC / CPI` should
      // project a finish cost far above budget — the number a QS opens the screen for.
      activity('Q2', {
        name: 'Overrunning at 50%',
        budgetedExpense: 1_000_00,
        actualExpense: 920_00,
        progress: {
          status: 'IN_PROGRESS',
          percentComplete: 50,
          percentCompleteType: 'DURATION',
          physicalPercentComplete: null,
          actualStart: '2026-02-23T00:00',
          actualFinish: null,
          remainingDurationMinutes: 3 * DAY,
          suspendDate: null,
          resumeDate: null,
          expectedFinish: null,
        },
        testTags: ['cost_overrun'],
      }),
      // When the money lands, holding what and how much constant. Three identical activities that
      // differ only in accrual, so a curve that ignores the setting is visible at a glance.
      activity('Q_START', {
        name: 'Accrues at the start',
        accrualType: 'START',
        budgetedExpense: 5_000_00,
        testTags: ['accrual_start'],
      }),
      activity('Q_UNIFORM', {
        name: 'Accrues evenly',
        accrualType: 'UNIFORM',
        budgetedExpense: 5_000_00,
        testTags: ['accrual_uniform'],
      }),
      activity('Q_END', {
        name: 'Accrues at the end',
        accrualType: 'END',
        budgetedExpense: 5_000_00,
        testTags: ['accrual_end'],
      }),
    ],
    dependencies: [link('Q1', 'Q_START'), link('Q_START', 'Q_UNIFORM'), link('Q_UNIFORM', 'Q_END')],
    assignments: [
      assignment('Q1', 'Q_LAB', { budgetedUnits: 80, unitsPerHour: 2, actualUnits: 42 }),
      assignment('Q2', 'Q_LAB', { budgetedUnits: 80, unitsPerHour: 2, actualUnits: 76 }),
    ],
  });
}

/**
 * **External inter-project dates** (ADR-0043 M1): two imported instants standing in for a plan that
 * is not in this database. They are **soft** bounds — a hard pin still wins — and the plan-level
 * toggle drops both directions at once, which is why the ignore case is its own plan below.
 */
export function externalPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-external-dates',
    name: 'External: imported dates from another programme',
    description:
      'Y1 cannot start before 23 Mar because another programme hands over then, even though ' +
      'nothing in THIS plan stops it. Y2 must finish by 20 Mar for the same reason and cannot, so ' +
      'it carries negative float. Y3 has an external start and no predecessor at all — the ' +
      'external date is the only thing placing it.',
    activities: [
      activity('Y0', { name: 'Internal predecessor', durationMinutes: 2 * DAY }),
      activity('Y1', {
        name: 'Waits for an external handover',
        externalEarlyStart: '2026-03-23T00:00',
        testTags: ['interproject', 'net_external_early_start'],
      }),
      activity('Y2', {
        name: 'Owes an external deadline it cannot meet',
        externalLateFinish: '2026-03-20T00:00',
        testTags: ['net_external_late_finish'],
      }),
      activity('Y3', {
        name: 'Placed only by its external date',
        externalEarlyStart: '2026-03-30T00:00',
        testTags: ['net_external_open_start'],
      }),
      // Internal logic already pushes it past the external bound, so the external one is inert. The
      // rule is later-of-the-two-wins, and this is the half where the internal side wins — without
      // it a test cannot tell "applied correctly" from "applied always".
      activity('Y4', {
        name: 'Internal logic beats the external bound',
        externalEarlyStart: '2026-03-03T00:00',
        testTags: ['net_external_vs_internal'],
      }),
    ],
    dependencies: [link('Y0', 'Y2'), link('Y0', 'Y4')],
  });
}

/** The same plan with `ignoreExternalRelationships` on, so both directions drop together. */
export function externalIgnoredPlan(): SeedSpec {
  const base = externalPlan();
  return {
    ...base,
    seedName: 'capability-external-ignored',
    plan: {
      ...base.plan,
      name: 'External: the same dates, ignored',
      description:
        'Identical to the external-dates plan with `ignoreExternalRelationships` ON. Every ' +
        'external bound is dropped — BOTH directions, not just the inconvenient one — so Y1 starts ' +
        'at the data date and Y2’s negative float disappears. Same dates as the other plan means ' +
        'the toggle is not being read.',
      options: { ...base.plan.options, ignoreExternalRelationships: true },
    },
    // The tags live on the plan above; duplicating them here would double-count every key in the
    // coverage report and make the catalogue look broader than it is.
    activities: base.activities.map((item) => ({ ...item, testTags: [] })),
  };
}
