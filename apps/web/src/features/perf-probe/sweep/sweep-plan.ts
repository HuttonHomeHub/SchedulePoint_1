import { SCENARIOS, type ScenarioDefinition, type ScenarioPreset } from '../model/scenarios';

/**
 * What one press of **Run all measurements** works through.
 *
 * **Derived from the registry, never written out.** A hard-coded list of steps goes stale the day a
 * scenario is added, and it goes stale silently: the new scenario is measurable one at a time and
 * simply absent from the sweep, which is the shape `docs/TECH_DEBT.md` #259 and ADR-0073 C4 both
 * record — a vocabulary that grew while an inventory beside it did not. `sweep-plan.structural.test.ts`
 * pins that by handing this a stub registry of three scenarios and requiring six steps.
 *
 * Pure: no clock, no DOM, no network. It reads the registry and returns an ordering.
 */

/**
 * Both framings, Week first.
 *
 * **Week leads because it is the one that answers a question.** `isGated` makes Fit ungraded for
 * every scenario — the shipped painter already drops ~10 % of frames there with no treatment at all,
 * so a gate would fail on day one (ADR-0058) — and an operator who stops the sweep half way should
 * be left holding the readings that can produce a verdict rather than the ones that cannot.
 */
export const SWEEP_PRESETS: readonly ScenarioPreset[] = ['week', 'fit'];

export interface SweepStep {
  readonly scenario: ScenarioDefinition;
  readonly preset: ScenarioPreset;
}

/**
 * The steps, in the order they run.
 *
 * Scenario-major rather than preset-major: the two framings of one measurement share a scene, so
 * running them together keeps a stopped sweep's kept readings about one subject rather than one
 * framing of two.
 */
export function sweepPlan(scenarios: readonly ScenarioDefinition[] = SCENARIOS): SweepStep[] {
  return scenarios.flatMap((scenario) => SWEEP_PRESETS.map((preset) => ({ scenario, preset })));
}
