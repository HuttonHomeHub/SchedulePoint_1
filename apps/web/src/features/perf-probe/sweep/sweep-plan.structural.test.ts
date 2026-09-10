import { describe, expect, it } from 'vitest';

import { SCENARIOS, type ScenarioDefinition } from '../model/scenarios';

import { sweepPlan, SWEEP_PRESETS } from './sweep-plan';

/**
 * The sweep covers what the registry holds, and nothing is written twice.
 *
 * **The assertion that matters is the stub one.** Checking that today's registry yields four steps
 * would pass equally against a literal list of four — and a literal list is the defect: a scenario
 * added later stays measurable one at a time and is silently absent from the sweep, which nobody
 * notices because nothing is broken. So the pinning case hands this function a registry it has
 * never seen and requires the extra scenario to appear, which a literal cannot satisfy.
 */
const stub = (id: string): ScenarioDefinition =>
  ({
    id,
    label: id,
    question: 'stub',
    version: 1,
    limbs: [],
    gated: true,
    decision: 'stub',
  }) as unknown as ScenarioDefinition;

describe('sweepPlan', () => {
  it('yields every scenario at every framing — proved with a registry it has never seen', () => {
    // Three scenarios, two framings. A literal list of today's four steps returns four here.
    const plan = sweepPlan([stub('a'), stub('b'), stub('c')]);

    expect(plan).toHaveLength(6);
    expect(plan.map((step) => `${step.scenario.id}:${step.preset}`)).toEqual([
      'a:week',
      'a:fit',
      'b:week',
      'b:fit',
      'c:week',
      'c:fit',
    ]);
  });

  it('covers the real registry with no step repeated and none missing', () => {
    const plan = sweepPlan();
    const keys = plan.map((step) => `${step.scenario.id}:${step.preset}`);

    expect(new Set(keys).size, 'no step is planned twice').toBe(keys.length);
    expect(keys.length).toBe(SCENARIOS.length * SWEEP_PRESETS.length);
    for (const scenario of SCENARIOS) {
      for (const preset of SWEEP_PRESETS) {
        expect(keys, `${scenario.id} at ${preset} is planned`).toContain(
          `${scenario.id}:${preset}`,
        );
      }
    }
  });

  it('runs Week before Fit within a scenario, and keeps a scenario together', () => {
    // Week leads because it is the framing that can produce a verdict — `isGated` makes Fit ungraded
    // for every scenario — so a sweep stopped half way leaves the operator holding readings that
    // answer something. Scenario-major keeps a stopped sweep's kept readings about one subject.
    const plan = sweepPlan([stub('a'), stub('b')]);
    expect(plan.map((s) => `${s.scenario.id}:${s.preset}`)).toEqual([
      'a:week',
      'a:fit',
      'b:week',
      'b:fit',
    ]);
  });
});
