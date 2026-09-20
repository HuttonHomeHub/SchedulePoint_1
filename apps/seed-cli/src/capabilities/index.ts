import type { SeedSpec } from '@repo/seed';

import { calendarsPlan } from './calendars.js';
import { constraintsPlan, expectedFinishPlan, snetEffectsPlan } from './constraints.js';
import { costPlan, externalIgnoredPlan, externalPlan } from './cost.js';
import { logicFfSfPlan, logicFsSsPlan } from './logic.js';
import { floatPlan, networkShapePlan } from './network.js';
import { progressOverridePlan, progressPlan, retainedLogicPlan } from './progress.js';
import { levellingPlan, resourcesPlan } from './resources.js';
import { shiftCalendarsPlan } from './shift-calendars.js';
import { typesAndWbsPlan } from './types-wbs.js';
import { placementOnEarlyPlan, visualPlacementsPlan } from './visual-placements.js';

/**
 * The Tier-2 **capability plans** (ADR-0066 M2): one small plan per family, each with a
 * one-sentence expected outcome stored on the plan itself.
 *
 * ### Why there are ten families and not seven
 *
 * The implementation plan named seven — constraints, calendars, progress, LOE & WBS, resources &
 * levelling, cost & EV, external & programme. Mapped against the fixture's `coverage_index` that
 * list leaves about thirty keys with nowhere to live: the four relationship types, the twelve lag
 * cases, the network shapes (merge, dangle, open end, redundant logic) and the float cases. So
 * `logic` and `network` are added rather than squeezed into a neighbouring family, where they would
 * have made two plans too big to read — which is the one thing this tier must not be.
 *
 * `placement` is the tenth, added by the one-planning-surface epic's M-B-T3: `visualStart` has
 * existed on `SeedSpec` since it was added, and nothing in the catalogue had ever set it to anything
 * but `null` (spec §0's C16). It could not be squeezed into `constraints` either — a placement is not
 * a constraint, and the two are read differently (a constraint's effect is visible under EARLY; a
 * placement's is not, until the plan is VISUAL or until the collapse ships).
 *
 * ### Why some families ship as pairs
 *
 * Retained Logic / Progress Override, external / external-ignored, and resources / levelling are
 * each **two plans over the same activities**, differing only in one plan-level switch. A setting
 * that changes every date in a plan cannot be demonstrated inside one plan: you would see an answer
 * with no way to tell whether the other setting produces a different one. The pair is the evidence.
 * `placement`'s two plans are NOT such a pair — they differ in more than one switch (the plan's mode
 * AND which activities carry a placement) because the two questions they answer are different: what
 * a placement looks like where it is read, and what it looks like where it currently is not.
 */
export interface CapabilityFamily {
  /** Stable id, and the `--family` filter's value. */
  key: string;
  label: string;
  build: () => SeedSpec;
}

export const CAPABILITY_FAMILIES: readonly CapabilityFamily[] = [
  { key: 'logic', label: 'Relationship types and lag', build: logicFsSsPlan },
  { key: 'logic', label: 'Relationship types and lag (FF/SF)', build: logicFfSfPlan },
  { key: 'network', label: 'Network shape and open ends', build: networkShapePlan },
  { key: 'network', label: 'Float', build: floatPlan },
  { key: 'constraints', label: 'Constraints', build: constraintsPlan },
  { key: 'constraints', label: 'Expected finish', build: expectedFinishPlan },
  { key: 'constraints', label: 'SNET effect classes', build: snetEffectsPlan },
  { key: 'calendars', label: 'Calendars', build: calendarsPlan },
  { key: 'calendars', label: 'Shift calendars', build: shiftCalendarsPlan },
  { key: 'progress', label: 'Progress', build: progressPlan },
  { key: 'progress', label: 'Retained Logic', build: retainedLogicPlan },
  { key: 'progress', label: 'Progress Override', build: progressOverridePlan },
  { key: 'types', label: 'Activity types, LOE and WBS', build: typesAndWbsPlan },
  { key: 'resources', label: 'Resources, curves and duration types', build: resourcesPlan },
  { key: 'resources', label: 'Levelling', build: levellingPlan },
  { key: 'cost', label: 'Cost, accrual and earned value', build: costPlan },
  { key: 'external', label: 'External inter-project dates', build: externalPlan },
  { key: 'external', label: 'External dates ignored', build: externalIgnoredPlan },
  { key: 'placement', label: 'Visual placement varieties', build: visualPlacementsPlan },
  { key: 'placement', label: 'Placement left on an Early plan', build: placementOnEarlyPlan },
];

/** Every capability plan, or just one family's. An unknown family yields an empty list. */
export function capabilitySpecs(family?: string): SeedSpec[] {
  return CAPABILITY_FAMILIES.filter((entry) => family === undefined || entry.key === family).map(
    (entry) => entry.build(),
  );
}

/** The distinct `--family` values, for the CLI's usage text and its error message. */
export function capabilityFamilyKeys(): string[] {
  return [...new Set(CAPABILITY_FAMILIES.map((entry) => entry.key))];
}
