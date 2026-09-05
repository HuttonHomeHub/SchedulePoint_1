import type { CriticalPathDefinition, TotalFloatMode } from '@repo/types';

import type { ComputeOptions } from './engine';

/**
 * The criticality rule a recalculation runs with — the four plan settings that change
 * `is_critical` / `total_float` and move **no date** (verified against `engine/compute.ts:668-696`).
 *
 * **Every field is REQUIRED, and that is the point.** `ComputeOptions` declares all four as optional
 * and applies its own `??` fallbacks inside `computeSchedule` (`engine/compute.ts:149-152`), so a
 * mirror projected back OUT of `ComputeOptions` would be `undefined` wherever a caller omitted one —
 * a half-recorded rule, which `ck_plans_schedule_criticality_all_or_none` forbids and which would
 * force the engine's defaults to be re-applied at a second site. Building the rule first and
 * spreading it IN reverses that: the recalculation's engine input and the row it stamps are the same
 * four values, and the engine's fallbacks are unreachable from this call site.
 */
export type CriticalityRule = {
  readonly criticalPathDefinition: CriticalPathDefinition;
  readonly criticalFloatThresholdMinutes: number;
  readonly totalFloatMode: TotalFloatMode;
  readonly makeOpenEndsCritical: boolean;
};

/** The `ComputeOptions` keys this rule owns. Named once so the projection below is total over them. */
type CriticalityOptionKeys =
  | 'criticalDefinition'
  | 'criticalFloatThresholdMinutes'
  | 'totalFloatMode'
  | 'makeOpenEndsCritical';

/**
 * Project the rule onto the engine's own option names — the ONE place the two vocabularies meet
 * (the plan column is `criticalPathDefinition`; the engine option is `criticalDefinition`).
 *
 * The `Required<Pick<…>>` return type is the compiler-enforced half: add a fifth criticality option
 * to `ComputeOptions` and to {@link CriticalityOptionKeys}, and this function fails to typecheck
 * until it supplies one — so a new option cannot reach the engine while the mirror silently omits it.
 */
export function toCriticalityOptions(
  rule: CriticalityRule,
): Required<Pick<ComputeOptions, CriticalityOptionKeys>> {
  return {
    criticalDefinition: rule.criticalPathDefinition,
    criticalFloatThresholdMinutes: rule.criticalFloatThresholdMinutes,
    totalFloatMode: rule.totalFloatMode,
    makeOpenEndsCritical: rule.makeOpenEndsCritical,
  };
}

/**
 * The four columns as either source persists them — the **frozen** image on a baseline, or the
 * engine-owned **mirror** on a plan. All four nullable, all-or-none by CHECK constraint on both
 * tables, so testing one and being right about four is a property of the schema rather than a
 * convention here.
 */
export type NullableCriticalityColumns = {
  readonly criticalPathDefinition: CriticalPathDefinition | null;
  readonly criticalFloatThresholdMinutes: number | null;
  readonly totalFloatMode: TotalFloatMode | null;
  readonly makeOpenEndsCritical: boolean | null;
};

/**
 * Read a rule out of four nullable columns, or `null` when it was never recorded.
 *
 * **The null is a sentinel — "the rule is unknown" — and never a claim.** It is what a baseline
 * captured before the freeze shipped reports (permanently: a capture cannot be re-run), and what a
 * plan not recalculated since the mirror shipped reports (until its next recalculation). Nothing may
 * coalesce it to a default: after the four options became planner-writable, a default would tell an
 * old snapshot it was computed under a rule it may never have seen.
 *
 * Reads `criticalPathDefinition` as the discriminator and asserts the other three, which is exactly
 * what the all-or-none CHECK makes safe. There is deliberately no fifth `*_snapshot_level` column to
 * consult: a second source for the same fact is the defect the baselines docblock warns about.
 */
export function readCriticalityRule(row: NullableCriticalityColumns): CriticalityRule | null {
  if (row.criticalPathDefinition === null) return null;
  return {
    criticalPathDefinition: row.criticalPathDefinition,
    criticalFloatThresholdMinutes: row.criticalFloatThresholdMinutes!,
    totalFloatMode: row.totalFloatMode!,
    makeOpenEndsCritical: row.makeOpenEndsCritical!,
  };
}

/**
 * Whether two sides' numbers were computed under the same criticality rule — **three-valued**.
 *
 * `UNKNOWN` when either side never recorded one, and it must never render as `MATCH`. The reason is
 * the whole point of the columns: `is_critical` and `total_float` are the OUTPUT of a rule, so a
 * comparison across a changed rule reports a large, real-looking set as having entered the critical
 * path while every bar sits where it did. Saying "we cannot tell" is the only honest answer when one
 * side is silent, and it is a different fact from "they agree".
 */
export function compareCriticalityRules(
  a: CriticalityRule | null,
  b: CriticalityRule | null,
): 'MATCH' | 'DIFFERS' | 'UNKNOWN' {
  if (a === null || b === null) return 'UNKNOWN';
  return a.criticalPathDefinition === b.criticalPathDefinition &&
    a.criticalFloatThresholdMinutes === b.criticalFloatThresholdMinutes &&
    a.totalFloatMode === b.totalFloatMode &&
    a.makeOpenEndsCritical === b.makeOpenEndsCritical
    ? 'MATCH'
    : 'DIFFERS';
}
