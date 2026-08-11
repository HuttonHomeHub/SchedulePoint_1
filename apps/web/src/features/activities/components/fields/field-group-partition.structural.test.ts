import { describe, expect, it } from 'vitest';

import { ACCRUAL_FIELDS } from './ActivityAccrualField';
import { BREAKDOWN_FIELDS } from './ActivityBreakdownField';
import { CALENDAR_FIELDS } from './ActivityCalendarField';
import { CONSTRAINT_FIELDS } from './ActivityConstraintFields';
import { EXPENSE_FIELDS } from './ActivityExpenseFields';
import { EXTERNAL_DATES_FIELDS } from './ActivityExternalDatesFields';
import { IDENTITY_FIELDS } from './ActivityIdentityFields';
import { LEVELLING_FIELDS } from './ActivityLevellingField';
import { MEASURE_FIELDS } from './ActivityMeasureFields';
import { PLACEMENT_FIELDS } from './ActivityPlacementFields';
import { WORK_FIELDS } from './ActivityWorkFields';

import {
  activityCostShape,
  activityGeneralShape,
  activityMeasureShape,
  activitySchedulingShape,
} from '@/features/activities/schemas/activity-scope-schemas';

/**
 * **ADR-0089 D1: a field is rendered by exactly one component.** The groups partition the scope
 * shapes, which partition the field set — and this is the gate that makes "partition" a fact rather
 * than a description.
 *
 * It answers two questions the per-group suites structurally cannot, because each of those mounts
 * one group and can only see its own tuple:
 *
 * 1. **Is anything rendered twice?** Two groups claiming `expectedFinish` would each pass their own
 *    suite while a planner saw the field in two sections, editing one and confusing themselves with
 *    the other.
 * 2. **Is anything rendered at all?** A field added to a scope schema and to no group is the
 *    silent-drop failure this epic exists to remove, relocated one layer up: the scope's DTO would
 *    carry it, the save would send its seeded value forever, and nothing would fail.
 *
 * **The scope shapes are the authority, not a list restated here.** They are imported and their keys
 * read, so adding a field to a scope without giving it a home fails this test on the same commit
 * rather than at the next reconciliation pass.
 *
 * What it does **not** catch, stated rather than left to be discovered: a field named in a tuple and
 * never rendered — that is each group's own `it.each` render loop — and a field wired to the wrong
 * scope's form, which does not compile at all (RHF's generics are invariant, which is the only gate
 * here that cannot be talked around).
 */

/** Every group, named by the scope it partitions. The keys are the four scope shapes' own names. */
const GROUPS = {
  general: {
    ActivityIdentityFields: IDENTITY_FIELDS,
    ActivityWorkFields: WORK_FIELDS,
    ActivityBreakdownField: BREAKDOWN_FIELDS,
  },
  scheduling: {
    ActivityCalendarField: CALENDAR_FIELDS,
    ActivityConstraintFields: CONSTRAINT_FIELDS,
    ActivityPlacementFields: PLACEMENT_FIELDS,
    ActivityExternalDatesFields: EXTERNAL_DATES_FIELDS,
    ActivityLevellingField: LEVELLING_FIELDS,
  },
  cost: {
    ActivityExpenseFields: EXPENSE_FIELDS,
    ActivityAccrualField: ACCRUAL_FIELDS,
  },
  measure: {
    ActivityMeasureFields: MEASURE_FIELDS,
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

const SHAPES = {
  general: activityGeneralShape,
  scheduling: activitySchedulingShape,
  cost: activityCostShape,
  measure: activityMeasureShape,
} as const satisfies Record<keyof typeof GROUPS, Record<string, unknown>>;

const SCOPES = Object.keys(GROUPS) as (keyof typeof GROUPS)[];

describe('the activity field groups partition the scope shapes', () => {
  it.each(SCOPES)('%s — every field in the scope has exactly one group', (scope) => {
    const owners = new Map<string, string[]>();
    for (const [group, fields] of Object.entries(GROUPS[scope])) {
      for (const field of fields as readonly string[]) {
        owners.set(field, [...(owners.get(field) ?? []), group]);
      }
    }

    const scopeFields = Object.keys(SHAPES[scope]).sort();
    const claimed = [...owners.keys()].sort();

    // Stated as one equality rather than two subset checks: the failure message then names both
    // the field nobody renders and the field that is not in the scope, which are different bugs
    // with the same symptom in a subset assertion.
    expect(claimed).toEqual(scopeFields);

    const duplicated = [...owners.entries()].filter(([, groups]) => groups.length > 1);
    expect(duplicated).toEqual([]);
  });

  it('no field is claimed by groups in two different scopes', () => {
    // The cross-scope case the per-scope loop above cannot see. It would take a compiler error to
    // reach — a group's tuple is checked against its own scope's value type — but the tuples are
    // gathered here by hand, and this asserts that gathering is right.
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const scope of SCOPES) {
      for (const [group, fields] of Object.entries(GROUPS[scope])) {
        for (const field of fields as readonly string[]) {
          const previous = seen.get(field);
          if (previous !== undefined) clashes.push(`${field}: ${previous} and ${scope}/${group}`);
          seen.set(field, `${scope}/${group}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it('accounts for every scope, so a fifth could not be added unnoticed', () => {
    expect(SCOPES.sort()).toEqual(['cost', 'general', 'measure', 'scheduling']);
  });
});
