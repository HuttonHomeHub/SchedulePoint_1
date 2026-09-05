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
