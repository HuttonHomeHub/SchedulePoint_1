import { describe, expect, it } from 'vitest';

import { isGated, SCENARIOS, scenarioById } from './scenarios';

/**
 * The registry, and in particular the floors — because a floor that drifts from its source is a gate
 * that has quietly stopped asking the ADR's question.
 */
describe('the scenario registry', () => {
  it('carries BOTH of ADR-0026 §9’s floors for the draw budget, at the right scales', () => {
    // **A PINNED POSITIVE CASE, transcribed from `docs/adr/0026-*.md:346-347`:** "Canvas 2D passes
    // if it sustains >= 45 fps @ 500 and >= 30 fps @ 2,000 during those gestures".
    //
    // This is the assertion that would have caught M1's own mistake. A single `minFps: 30` per
    // scenario judged the 500-activity case against the 2,000-activity floor — a third easier than
    // the gate is — and nothing would have failed, because 30 is a real number that a real run can
    // clear. The defect was a missing distinction, not a wrong value, which is why it needs a test
    // that names both halves rather than one that checks a number is present.
    const draw = scenarioById('canvas-draw');
    expect(draw.limbs.map((l) => [l.activities, l.minFps])).toEqual([
      [500, 45],
      [2000, 30],
    ]);
  });

  it('orders limbs smallest first, so the first limb is the single-limb answer', () => {
    // The CLI reads `limbs[0]`. If the order ever inverted, `measure-revision-diff` would silently
    // start judging against a different floor — and its output would still look entirely normal.
    for (const scenario of SCENARIOS) {
      const scales = scenario.limbs.map((l) => l.activities);
      expect(scales).toEqual([...scales].sort((a, b) => a - b));
    }
  });

  it('keeps the revision overlay on the floor the CLI has always applied', () => {
    // F1's constraint expressed as a test: the extraction and the registry must not have changed
    // what the existing instrument judges against. 30 fps at the 2,000 ceiling is what it used.
    const [limb, ...rest] = scenarioById('revision-diff').limbs;
    expect(rest).toHaveLength(0);
    expect(limb?.minFps).toBe(30);
    expect(limb?.activities).toBe(2000);
  });

  it('gives every limb a source a reader can go and check', () => {
    // Not decoration. Every floor in this file is a claim about another document, and this
    // repository's recurring failure is a number that resolves at its origin and stops resolving
    // once copied (#75's own retraction is exactly that shape).
    for (const scenario of SCENARIOS) {
      for (const limb of scenario.limbs) {
        expect(limb.source).toMatch(/ADR-\d{4}/);
      }
    }
  });

  it('never gates the Fit framing, whatever the scenario says', () => {
    // The shipped painter already drops ~10 % of frames at Fit on real hardware with no treatment at
    // all, so a gate there fails on day one — and a gate that does that gets deleted rather than
    // fixed (ADR-0058). The rule used to live inline in the CLI as `preset !== 'fit'`.
    for (const scenario of SCENARIOS) {
      expect(isGated(scenario, 'fit')).toBe(false);
      expect(isGated(scenario, 'week')).toBe(scenario.gated);
    }
  });

  it('throws on an unknown id rather than returning undefined', () => {
    // `ScenarioId` is a compile-time promise. A stored row's id or a URL parameter has been checked
    // by nothing, and `SCENARIOS.find()` answers a bad one with `undefined` — which reads as "no
    // limbs, no bar" and would judge a run against nothing at all.
    expect(() => scenarioById('nope' as never)).toThrow(/Unknown scenario/);
  });
});
