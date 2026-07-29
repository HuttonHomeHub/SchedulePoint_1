import { isDurationDerivedType } from '../schemas/activity-schemas';
import type {
  ActivityCostValues,
  ActivityGeneralValues,
  ActivityMeasureValues,
  ActivitySchedulingValues,
} from '../schemas/activity-scope-schemas';

import { majorInputToMinor } from '@/lib/format-money';

/**
 * Per-scope PATCH bodies for the tabbed activity editor (ADR-0060 §4).
 *
 * `UpdateActivityDto` already documents "every field is optional; send only what changes", and
 * partial PATCHes are already in production (`useSetActivityVisualStart`, `useRepositionLane`), so
 * saving one scope needs **no API change** — only a body carrying that scope's keys and no others.
 *
 * **Each builder's exact key set is asserted in tests, not just its values.** A builder that leaked
 * a key from another scope would let a user save a tab they cannot write — the capability-regression
 * vector this whole split exists to avoid. Values are ported unchanged from `updateBody`: the same
 * blank→null rules, the same "clear both sides of a constraint together", the same money
 * major→minor conversion.
 */

const optional = (value: string | undefined): string | undefined =>
  value && value.length > 0 ? value : undefined;

/** Identity, duration, hierarchy, description. */
export function generalBody(values: ActivityGeneralValues): Record<string, unknown> {
  return {
    name: values.name,
    code: optional(values.code) ?? null,
    type: values.type,
    durationType: values.durationType,
    // A duration-derived type (milestone / LOE / WBS summary) always stores 0 — the engine owns
    // its span, so sending the field's stale number would be a lie the API would have to reject.
    durationDays: isDurationDerivedType(values.type) ? 0 : values.durationDays,
    parentId: values.parentId ? values.parentId : null,
    description: optional(values.description) ?? null,
  };
}

/** Calendar, both constraint pairs, placement targets, external dates, levelling tie-break. */
export function schedulingBody(values: ActivitySchedulingValues): Record<string, unknown> {
  const hasConstraint = Boolean(values.constraintType);
  const hasSecondary = Boolean(values.secondaryConstraintType);
  return {
    calendarId: values.calendarId ? values.calendarId : null,
    // Both sides clear together — the API pairs them, so sending a stale date with a cleared type
    // would 422 on a field the user did not touch.
    constraintType: hasConstraint ? values.constraintType : null,
    constraintDate: hasConstraint ? values.constraintDate : null,
    secondaryConstraintType: hasSecondary ? values.secondaryConstraintType : null,
    secondaryConstraintDate: hasSecondary ? values.secondaryConstraintDate : null,
    scheduleAsLateAsPossible: values.scheduleAsLateAsPossible ?? false,
    expectedFinish: values.expectedFinish ? values.expectedFinish : null,
    externalEarlyStart: values.externalEarlyStart ? values.externalEarlyStart : null,
    externalLateFinish: values.externalLateFinish ? values.externalLateFinish : null,
    levelingPriority: values.levelingPriority === undefined ? null : values.levelingPriority,
  };
}

/** Lump-sum expense (MAJOR units in the form, minor over the wire) and its accrual. */
export function costBody(values: ActivityCostValues): Record<string, unknown> {
  return {
    budgetedExpense: majorInputToMinor(values.budgetedExpense) ?? null,
    actualExpense: majorInputToMinor(values.actualExpense) ?? null,
    accrualType: values.accrualType,
  };
}

/** The EV performance source and its manual physical % — saved from the Progress tab. */
export function measureBody(values: ActivityMeasureValues): Record<string, unknown> {
  return {
    percentCompleteType: values.percentCompleteType,
    physicalPercentComplete:
      values.physicalPercentComplete === undefined ? null : values.physicalPercentComplete,
  };
}
