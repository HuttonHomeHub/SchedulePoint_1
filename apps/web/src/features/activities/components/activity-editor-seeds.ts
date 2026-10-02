import type { ActivitySummary } from '@repo/types';

import { seedDurationText } from '../model/duration-field';
import { seedRemainingText } from '../model/remaining-field';
import type { ProgressFormValues } from '../schemas/activity-schemas';
import type {
  ActivityCostValues,
  ActivityGeneralValues,
  ActivityMeasureValues,
  ActivitySchedulingValues,
} from '../schemas/activity-scope-schemas';

import { minorToMajorInput } from '@/lib/format-money';

/**
 * Per-scope seeds for the tabbed editor's forms (ADR-0060 §4).
 *
 * Every scope seeds **from the row, always** — including fields whose inputs are hidden behind an
 * off flag. That rule predates this epic and is load-bearing: a hidden field that seeds as blank
 * and then saves would silently clear a stored value (un-nesting a WBS child, dropping a levelling
 * priority). Because each scope now saves alone, the rule matters more, not less: a Cost save must
 * not be able to touch a Scheduling field, and it cannot, because `costBody` only emits cost keys.
 *
 * A create seeds the API defaults, so an unopened tab saves exactly what the server would default.
 *
 * **An optional field's key is always PRESENT, as `undefined` when unset — never omitted.** A
 * registered input that holds nothing reports `undefined` for it, so react-hook-form gives the live
 * values an explicit key the defaults lacked, and its deep-equal counts the key sets as different:
 * the form reads dirty, and closing an editor nobody touched asks to discard (found by the journey
 * that opens Progress and presses Escape).
 */

export function seedGeneral(
  activity: ActivitySummary | undefined,
  hoursPerDay?: number,
): ActivityGeneralValues {
  return {
    name: activity?.name ?? '',
    code: activity?.code ?? '',
    type: activity?.type ?? 'TASK',
    durationType: activity?.durationType ?? 'FIXED_DURATION_AND_UNITS_TIME',
    duration: seedDurationText(activity, hoursPerDay),
    parentId: activity?.parentId ?? '',
    description: activity?.description ?? '',
  };
}

export function seedScheduling(activity: ActivitySummary | undefined): ActivitySchedulingValues {
  return {
    calendarId: activity?.calendarId ?? '',
    constraintType: activity?.constraintType ?? '',
    constraintDate: activity?.constraintDate ?? '',
    secondaryConstraintType: activity?.secondaryConstraintType ?? '',
    secondaryConstraintDate: activity?.secondaryConstraintDate ?? '',
    scheduleAsLateAsPossible: activity?.scheduleAsLateAsPossible ?? false,
    expectedFinish: activity?.expectedFinish ?? '',
    externalEarlyStart: activity?.externalEarlyStart ?? '',
    externalLateFinish: activity?.externalLateFinish ?? '',
    levelingPriority: activity?.levelingPriority ?? undefined,
  };
}

export function seedCost(activity: ActivitySummary | undefined): ActivityCostValues {
  return {
    accrualType: activity?.accrualType ?? 'UNIFORM',
    budgetedExpense: minorToMajorInput(activity?.budgetedExpense ?? null),
    actualExpense: minorToMajorInput(activity?.actualExpense ?? null),
  };
}

export function seedMeasure(activity: ActivitySummary | undefined): ActivityMeasureValues {
  return {
    percentCompleteType: activity?.percentCompleteType ?? 'DURATION',
    physicalPercentComplete: activity?.physicalPercentComplete ?? undefined,
  };
}

/**
 * The Reported-progress scope. `remaining` reads the working-hours factor known **at open**; the
 * editor re-seeds it once if the calendar list lands later (`useLateSeed`), exactly as General's
 * duration is.
 */
export function seedProgress(
  activity: ActivitySummary | undefined,
  hoursPerDay: number | undefined,
): ProgressFormValues {
  return {
    percentComplete: activity?.percentComplete ?? 0,
    actualStart: activity?.actualStart ?? '',
    actualFinish: activity?.actualFinish ?? '',
    remaining: activity === undefined ? '' : seedRemainingText(activity, hoursPerDay),
    suspendDate: activity?.suspendDate ?? '',
    resumeDate: activity?.resumeDate ?? '',
  };
}
