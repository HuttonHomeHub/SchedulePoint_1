/**
 * **M0-T3 — the Revision Compare attribution prototype.** Outside the product, deliberately.
 *
 * It answers one question: does one-change-at-a-time replay produce an attribution complete and
 * stable enough to show a planner as a verdict? The predicate it is judged against is committed in
 * `docs/specs/revision-compare/m0-condition.md`, BEFORE this file existed.
 *
 * ## Where this bypasses the product, stated plainly (ADR-0081 §3)
 *
 * This script does **not** go through the REST API, the service layer, the plan edit-lock or the
 * database. It builds the engine graph from the fixture's `SeedSpec` and calls `computeSchedule`
 * directly. That is deliberate and it is the ADR-0066 rule — the pairwise differential builds engine
 * input from the `SeedSpec` and never from persisted rows, because reading the database back reuses
 * the very assembly under test and the comparison then agrees with itself.
 *
 * The cost of that choice is real and is the reason this paragraph exists: **a PASS here says the
 * METHOD works. It says nothing about a write path, a DTO, a guard, or the route's end-to-end cost.**
 * A measurement harness that bypasses the product makes a milestone look more finished than it is —
 * `measure-band-copy` did exactly that — so nothing here should be read as evidence that Revision
 * Compare works.
 *
 * ## The harness does NOT reproduce the product's schedule — measured, and it invalidates the run
 *
 * **This section previously claimed the opposite and the claim was false.** It read: "So this IS the
 * network the product schedules, which is what the committed Subject names." That was verified on
 * **counts and types only** — `fixtureSpec()` → `specToEngineInput()` does yield 147 activities /
 * 188 edges with a type breakdown byte-identical to `GET …/activities`. Necessary, and nowhere near
 * sufficient. Measured against the same plan through the API:
 *
 * | | in-process | API (and `docs/TEST_PLAYBOOK.md:43`) |
 * | --- | --- | --- |
 * | `activityCount` | 147 | 147 ✓ |
 * | **`projectFinish`** | **2026-10-27** | **2027-03-12** ✗ |
 * | **`criticalCount`** | **100** | **87** ✗ |
 * | `nearCriticalCount` | 2 | 9 ✗ |
 * | `resourceDriverMissingCount` | 0 | 2 ✗ |
 * | `constraintViolationCount` | 1 | 1 ✓ |
 *
 * So the two networks schedule **differently**, and every number this harness produces is about a
 * plan that is not the Subject `m0-condition.md` names. That is disqualifying for M0 as it stands.
 *
 * **The cause is not yet diagnosed and is deliberately not guessed at here.** `spec-to-engine.ts`
 * exists for the pairwise differential and openly approximates in at least one place it names
 * (`roundToWholeDays`, because no DTO accepts minutes — TECH_DEBT #78); the divergent counts point
 * at driving-resource calendar resolution (`resourceDriverMissingCount` 0 vs 2) and at criticality,
 * but pointing is not diagnosing.
 *
 * **What it costs.** A harness that is not measuring the Subject cannot produce a verdict about the
 * Subject. Either the engine input is built the way the service builds it, or `m0-condition.md`'s
 * Subject is restated to name this network and the difference from the product is stated — and the
 * second is much weaker, because the whole point of naming the seeded plan was to measure
 * attribution on a network a planner could actually be looking at.
 *
 * ## What M0 CANNOT test on this subject
 *
 * **The `RESOURCE` class is untested here, and that is structural, not an oversight.** The fixture
 * carries `levelResources: false` (`fixture.ts:329`), and resource-levelling inputs do not reach
 * `computeSchedule` at all — they feed `levelSchedule`, a **second** pass run afterwards. So a
 * replay built on `computeSchedule` alone cannot attribute a levelling change on any plan, and
 * certainly not on one with levelling switched off. M0 therefore exercises **7 of the 8 replayable
 * classes**; the eighth is M4's to prove, and a PROCEED verdict here must say so rather than imply a
 * complete vocabulary was validated.
 */
import { fixtureSpec } from '../../seed-cli/src/fixture.js';
import {
  measureCarrierMovementDays,
  selectCompletionCarrier,
  isPerturbableType,
} from '../src/modules/schedule/completion-carrier.js';
import { computeSchedule } from '../src/modules/schedule/engine/compute.js';
import type { EngineActivity, EngineEdge } from '../src/modules/schedule/engine/types.js';
import { specToEngineInput, type EngineInput } from '../test/pairwise/spec-to-engine.js';

/**
 * The **replayable** change classes, settled at 8 (spec §4.5). `DATE` and `WBS_PARENT` are in the
 * change LIST and are deliberately absent here: `DATE` is derived and has no input delta to apply,
 * and a WBS reparent cannot move the carrier, which is selected from non-summary rows only.
 */
export const REPLAYABLE_CLASSES = [
  'SCOPE',
  'DURATION',
  'LOGIC',
  'BOUNDS',
  'CALENDAR',
  'PROGRESS',
  'PLAN_OPTION',
  'RESOURCE',
] as const;
export type ReplayableClass = (typeof REPLAYABLE_CLASSES)[number];

/** One class's edit, applied to a copy of the engine input. A TOTAL map — a missing class is a typecheck failure. */
type ClassEdit = (input: EngineInput) => EngineInput;

const clone = (input: EngineInput): EngineInput => ({
  activities: input.activities.map((a) => ({ ...a })),
  edges: input.edges.map((e) => ({ ...e })),
  options: { ...input.options },
});

/**
 * **Type-aware candidate selection — never an index into the fixture array.**
 *
 * A duration change applied to a `WBS_SUMMARY` (no logic, ADR-0038), a `LEVEL_OF_EFFORT` (span
 * derived — its duration is an output) or a milestone (zero duration by definition) is **silently
 * inert**: the schedule does not move and nothing reports that the perturbation did nothing. C4-c
 * exists because that inertness would let a class contribute exactly zero while the aggregate bar
 * still passed. `isPerturbableType` is imported rather than restated.
 */
function perturbableOnCriticalPath(input: EngineInput, count: number): EngineActivity[] {
  const control = computeSchedule(input.activities, input.edges, input.options);
  const byId = new Map(input.activities.map((a) => [a.id, a]));
  return control.results
    .filter((r) => {
      const a = byId.get(r.activityId);
      return a !== undefined && r.isCritical && isPerturbableType(a.type);
    })
    .sort((x, y) => x.earlyStartOffset - y.earlyStartOffset || x.activityId.localeCompare(y.activityId))
    .slice(0, count)
    .map((r) => byId.get(r.activityId)!)
    .filter((a): a is EngineActivity => a !== undefined);
}

/**
 * **Targets that can actually move the carrier — walked BACK from it, not taken from the front of
 * the critical path.**
 *
 * This function exists because the obvious reuse is wrong, and measurement caught it. The first
 * generator selected `perturbableOnCriticalPath` — the earliest-starting critical activities, which
 * is exactly DCMA metric 12's rule — and **five of seven change classes moved the carrier by 0
 * days**, so C4 correctly rejected the change set as vacuous.
 *
 * The cause is in the fixture and is realistic: it carries two mandatory constraints
 * (`A10100:MANDATORY_START`, `A10500:MANDATORY_FINISH`), and a mandatory constraint **breaks logic**
 * (ADR-0035 §7). Work pushed in front of the pin does not propagate past it, so the completion
 * carrier never moves. That is precisely the masking the carrier rule was written to expose — here
 * it is masking the measurement instead of a defect.
 *
 * **So the two rules are genuinely different and must not be shared.** Metric 12 wants the longest
 * downstream chain from ONE injection, which is the front of the path. Attribution needs changes
 * that reach the thing whose movement it reports, which is the carrier's own ancestry. Walking back
 * from the carrier is the only selection that guarantees a non-vacuous change set on a plan
 * containing a hard pin.
 */
export function perturbableAncestorsOfCarrier(input: EngineInput, count: number): EngineActivity[] {
  const control = computeSchedule(input.activities, input.edges, input.options);
  const carrier = selectCompletionCarrier(input.activities, control.results);
  if (carrier === undefined) return [];
  const byId = new Map(input.activities.map((a) => [a.id, a]));
  const predecessorsOf = new Map<string, string[]>();
  for (const e of input.edges) {
    const list = predecessorsOf.get(e.successorId);
    if (list) list.push(e.predecessorId);
    else predecessorsOf.set(e.successorId, [e.predecessorId]);
  }
  // Breadth-first back from the carrier, so the nearest ancestors come first: the closer to the
  // carrier, the less logic there is in between to absorb the change.
  const seen = new Set<string>([carrier.activityId]);
  const queue = [carrier.activityId];
  const out: EngineActivity[] = [];
  while (queue.length > 0 && out.length < count) {
    const id = queue.shift()!;
    for (const p of predecessorsOf.get(id) ?? []) {
      if (seen.has(p)) continue;
      seen.add(p);
      queue.push(p);
      const a = byId.get(p);
      if (a !== undefined && isPerturbableType(a.type)) out.push(a);
      if (out.length >= count) break;
    }
  }
  return out;
}

export { clone, perturbableOnCriticalPath, computeSchedule, selectCompletionCarrier, measureCarrierMovementDays };
export type { EngineInput, EngineActivity, EngineEdge, ClassEdit };
export { fixtureSpec, specToEngineInput };
