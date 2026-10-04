import type { ActivityPatch } from '../../modules/activities/activity.repository';
import type { DependencyPatch } from '../../modules/dependencies/dependency.repository';
import type { PlanPatch } from '../../modules/plans/plan.repository';
import type { AssignmentPatch } from '../../modules/resources/resource-assignment.repository';

/**
 * Whether the CPM engine reads a field. A field is an INPUT if and only if the engine loads it:
 * for an activity, the keys of `ENGINE_ACTIVITY_SELECT`, which a structural spec holds this map to.
 * Everything else — a lane, a name, a cost, a step — cannot move a date, so writing it must not
 * make the overview say the figures may have moved.
 */
export type InputClass = 'INPUT' | 'NOT_INPUT';

/**
 * Typed as a `Record` over the patch's own keys, so a field added to `ActivityPatch` fails to
 * compile until somebody classifies it. That is the observer: the alternative is a forgotten field
 * that silently never flags (or always flags) a plan.
 */
export const ACTIVITY_FIELD_CLASS: Record<keyof ActivityPatch, InputClass> = {
  name: 'NOT_INPUT',
  code: 'NOT_INPUT',
  description: 'NOT_INPUT',
  type: 'INPUT',
  durationMinutes: 'INPUT',
  // A triad edit that matters to a date writes `durationMinutes`, which is an INPUT.
  durationType: 'NOT_INPUT',
  constraintType: 'INPUT',
  constraintDate: 'INPUT',
  secondaryConstraintType: 'INPUT',
  secondaryConstraintDate: 'INPUT',
  externalEarlyStart: 'INPUT',
  externalLateFinish: 'INPUT',
  calendarId: 'INPUT',
  parentId: 'INPUT',
  laneIndex: 'NOT_INPUT',
  scheduleAsLateAsPossible: 'INPUT',
  visualStart: 'INPUT',
  levelingPriority: 'INPUT',
  percentCompleteType: 'NOT_INPUT',
  physicalPercentComplete: 'NOT_INPUT',
  budgetedExpense: 'NOT_INPUT',
  actualExpense: 'NOT_INPUT',
  accrualType: 'NOT_INPUT',
  status: 'NOT_INPUT',
  percentComplete: 'INPUT',
  actualStart: 'INPUT',
  actualFinish: 'INPUT',
  remainingDurationMinutes: 'INPUT',
  suspendDate: 'NOT_INPUT',
  resumeDate: 'INPUT',
  expectedFinish: 'INPUT',
};

export const PLAN_FIELD_CLASS: Record<keyof PlanPatch, InputClass> = {
  name: 'NOT_INPUT',
  description: 'NOT_INPUT',
  status: 'NOT_INPUT',
  progressRecalcMode: 'INPUT',
  useExpectedFinishDates: 'INPUT',
  criticalPathDefinition: 'INPUT',
  criticalFloatThresholdMinutes: 'INPUT',
  totalFloatMode: 'INPUT',
  makeOpenEndsCritical: 'INPUT',
  levelResources: 'INPUT',
  levelWithinFloatOnly: 'INPUT',
  ignoreExternalRelationships: 'INPUT',
  eacMethod: 'NOT_INPUT',
  currencyCode: 'NOT_INPUT',
  plannedStart: 'INPUT',
  calendarId: 'INPUT',
};

/** The DTO's `editedField` is a control field for the triad recompute, not persisted state. */
export const ASSIGNMENT_FIELD_CLASS: Record<keyof AssignmentPatch, InputClass> = {
  budgetedUnits: 'INPUT',
  unitsPerHour: 'INPUT',
  isDriving: 'INPUT',
  curveType: 'NOT_INPUT',
  lagMinutes: 'INPUT',
  budgetedCost: 'NOT_INPUT',
  actualCost: 'NOT_INPUT',
  actualUnits: 'NOT_INPUT',
};

export const DEPENDENCY_FIELD_CLASS: Record<keyof DependencyPatch, InputClass> = {
  type: 'INPUT',
  lagMinutes: 'INPUT',
  lagCalendar: 'INPUT',
};

/** Equal by value: a `Date` by instant, a `Decimal` by `.equals`, `null` and `undefined` alike. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  const decimalA = a as { equals?: (other: unknown) => boolean };
  if (typeof decimalA.equals === 'function') return decimalA.equals(b);
  const decimalB = b as { equals?: (other: unknown) => boolean };
  if (typeof decimalB.equals === 'function') return decimalB.equals(a);
  return false;
}

/**
 * Whether a patch changes the value of at least one INPUT field of the row it replaces. A field the
 * patch leaves `undefined` is untouched (the repositories' patch semantics); a field written with
 * the value the row already holds is not a change, so re-saving an unchanged editor flags nothing.
 *
 * `before` is the row as it stood before the write, read inside the same transaction.
 */
export function changedInputs<P extends object>(
  classes: { readonly [K in keyof P]-?: InputClass },
  before: object,
  patch: P,
): boolean {
  const current = before as Record<string, unknown>;
  return (Object.keys(patch) as (keyof P & string)[]).some((key) => {
    const next = patch[key];
    if (next === undefined || classes[key] !== 'INPUT') return false;
    return !sameValue(current[key], next);
  });
}
