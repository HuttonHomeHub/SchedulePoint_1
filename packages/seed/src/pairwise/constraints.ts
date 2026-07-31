import type { DimensionAssignment } from './dimensions.js';

/**
 * The **declared illegal combinations** (ADR-0066 M3.1).
 *
 * A pairwise array over the raw table would generate cases the product refuses — a milestone with a
 * ten-day duration, a MATERIAL resource driving an activity's dates — and every one of those would
 * fail the differential for a reason that says nothing about scheduling. Excluding them is
 * necessary; excluding them **silently** is the risk M3.1 names, because an excluded pair and an
 * uncovered pair look identical from the outside.
 *
 * So each rule is a named object with a reason, the generator reports which pairs each one removed,
 * and the report distinguishes "excluded by rule X" from "not covered".
 *
 * Every rule here states a **product invariant**, not a preference. If one of these ever stops being
 * true, the rule should fail rather than quietly narrow the array — which is what the structural
 * test beside this file checks.
 */
export interface PairwiseRule {
  id: string;
  reason: string;
  /** `false` ⇒ this (possibly partial) assignment is illegal and must not be generated. */
  permits: (assignment: DimensionAssignment) => boolean;
}

/** A milestone takes no time, so nothing that describes duration applies to one. */
const MILESTONES = new Set(['START_MILESTONE', 'FINISH_MILESTONE']);

export const PAIRWISE_RULES: readonly PairwiseRule[] = [
  {
    id: 'milestone-has-no-duration-type',
    reason:
      'a milestone has zero duration, so the duration/units/rate triad has nothing to hold fixed ' +
      '(ADR-0040); any duration type but the default would be inert rather than tested',
    permits: (a) =>
      a.activityType === undefined ||
      !MILESTONES.has(a.activityType) ||
      a.durationType === undefined ||
      a.durationType === 'FIXED_DURATION_AND_UNITS_TIME',
  },
  {
    id: 'milestone-has-no-loading-curve',
    reason:
      'a loading curve spreads units across a span, and a milestone has none — the web surface ' +
      'hides the picker for exactly this reason (ADR-0044)',
    permits: (a) =>
      a.activityType === undefined ||
      !MILESTONES.has(a.activityType) ||
      a.curveType === undefined ||
      a.curveType === 'UNIFORM',
  },
  {
    id: 'level-of-effort-takes-its-dates-from-its-logic',
    reason:
      'an LOE spans the logic it hangs off and has no dates of its own (ADR-0035 §21), so a ' +
      'constraint on one would be clamping a value the engine derives',
    permits: (a) =>
      a.activityType !== 'LEVEL_OF_EFFORT' || a.constraint === undefined || a.constraint === 'none',
  },
  {
    id: 'material-resources-do-not-drive',
    reason:
      'a MATERIAL resource is a quantity, not a calendar — it has no working time to drive an ' +
      "activity's dates with (ADR-0039)",
    permits: (a) => a.resourceKind !== 'MATERIAL' || a.driving !== 'yes',
  },
  {
    id: 'resource-dependent-needs-a-driver',
    reason:
      'a RESOURCE_DEPENDENT activity schedules on its DRIVING resource’s calendar (ADR-0039 §23); ' +
      'without one there is no calendar to be dependent on and the engine flags it instead',
    permits: (a) => a.activityType !== 'RESOURCE_DEPENDENT' || a.driving !== 'no',
  },
  {
    id: 'unstarted-work-has-no-suspend',
    reason:
      'a suspend/resume pair describes an interruption to work that has started; on a NOT_STARTED ' +
      'activity it is a rejected input, not a schedule',
    permits: (a) => a.status !== 'NOT_STARTED' || a.suspendResume !== 'present',
  },
  {
    id: 'completed-work-has-no-suspend-either',
    reason:
      'the interruption is already reflected in the actual finish; a suspend on a COMPLETE ' +
      'activity would describe a gap in work that has demonstrably ended',
    permits: (a) => a.status !== 'COMPLETE' || a.suspendResume !== 'present',
  },
  {
    id: 'milestones-carry-no-progress-measure-but-duration',
    reason:
      'UNITS and PHYSICAL percent complete are measured against work; a milestone is an instant, ' +
      'so only the duration measure is meaningful on one (ADR-0042)',
    permits: (a) =>
      a.activityType === undefined ||
      !MILESTONES.has(a.activityType) ||
      a.percentCompleteType === undefined ||
      a.percentCompleteType === 'DURATION',
  },
  {
    id: 'level-within-float-needs-levelling-on',
    reason:
      '`levelWithinFloatOnly` narrows what the levelling pass may do; with `levelResources` off ' +
      'the pass never runs, so the flag is inert and the case tests nothing (ADR-0041)',
    permits: (a) => a.levelResources !== 'off' || a.levelWithinFloatOnly !== 'on',
  },
];

/**
 * Does this (possibly partial) assignment break a declared rule? Partial assignments matter: the
 * generator prunes while it builds a row, so a rule has to answer honestly about a half-built one —
 * which is why every rule above tolerates `undefined` rather than assuming a full row.
 */
export function violatedRule(assignment: DimensionAssignment): PairwiseRule | null {
  return PAIRWISE_RULES.find((rule) => !rule.permits(assignment)) ?? null;
}

export function isLegal(assignment: DimensionAssignment): boolean {
  return violatedRule(assignment) === null;
}
