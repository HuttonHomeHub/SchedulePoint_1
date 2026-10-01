import { levelSchedule } from './engine/level';
import type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
  EngineResource,
  EngineResult,
  EngineSummary,
  LevelingOptions,
} from './engine/types';

/**
 * **The resource-levelling demand model** (ADR-0041) — `buildEngineGraph`'s `leveling` field,
 * carried verbatim so this is the one shape every caller reads: `null` means the plan did not opt
 * in, or opted in with zero assignments (ADR-0041 §7), and is the byte-identical fast path.
 */
export interface LevelingDemand {
  readonly assignments: readonly EngineAssignment[];
  readonly resources: readonly EngineResource[];
}

/**
 * **Run the opt-in resource-levelling pass, or don't — ONE rule for every caller** (`docs/TECH_DEBT.md`
 * #248, ADR-0041). `recalculate` (`schedule.service.ts`'s `recalculateInLock`) and the DCMA metric-12
 * what-if (`critical-path-test.ts`'s `runCriticalPathTest`) both need exactly the same thing done to a
 * network `computeSchedule` output: when `leveling` is non-null, run {@link levelSchedule} and merge
 * its additive overlay onto the result; when it is null, hand the network output back untouched. A
 * second, inline copy of that four-line `if` — which is what the what-if had instead, by never taking
 * `leveling` at all — is exactly how the two came to disagree about what "levelled" means: the what-if
 * measured a levelled plan's completion against the pure-network baseline the product never persists
 * or displays.
 *
 * **`leveling === null` returns `output` by reference, unchanged** — not a shallow copy — so a caller
 * that never levels pays nothing beyond the `if` and a levelling-off plan's what-if stays exactly the
 * comparison it always was (the control below).
 *
 * Pure, like {@link levelSchedule} itself: no lock, no read, no write. The caller owns building
 * `activities`/`output`/`edges`/`leveling` and owns what it does with the merged result. `edges` are the
 * links `output` was computed from: levelling now pushes a follower no earlier than they allow
 * (`docs/specs/logic-aware-levelling/`), so a caller cannot level a network it did not solve.
 */
export function levelIfEnabled(
  activities: readonly EngineActivity[],
  output: { readonly results: readonly EngineResult[]; readonly summary: EngineSummary },
  edges: readonly EngineEdge[],
  leveling: LevelingDemand | null,
  options: LevelingOptions,
): { results: readonly EngineResult[]; summary: EngineSummary } {
  if (!leveling) return output;
  const leveled = levelSchedule(
    activities,
    output,
    edges,
    leveling.assignments,
    leveling.resources,
    options,
  );
  return { results: leveled.results, summary: { ...output.summary, ...leveled.summary } };
}
