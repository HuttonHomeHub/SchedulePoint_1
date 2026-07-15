import { loadFixture } from '@repo/engine-conformance';
import { describe, expect, it } from 'vitest';

import { runScenario, resultsDiffer, SCENARIO_SUPPORT } from './scenarios';

/**
 * Differential-tier scaffold (ADR-0034 §2, §8). Today only the unprogressed
 * baseline (S01) runs; the other twelve scenarios are honestly `todo` with the
 * milestone that unlocks them. This suite is the **living gap map**: when a
 * milestone lands an option, its scenario flips to runnable and the assertion
 * below becomes "differs from the S02 baseline" — the drift is caught here.
 */
describe('conformance scenarios (differential scaffold)', () => {
  const fixture = loadFixture();

  it('has a support entry for every scenario in the fixture (no drift)', () => {
    for (const scenario of fixture.scenarios) {
      expect(
        SCENARIO_SUPPORT[scenario.id],
        `missing support entry for ${scenario.id}`,
      ).toBeDefined();
    }
    expect(Object.keys(SCENARIO_SUPPORT)).toHaveLength(fixture.scenarios.length);
  });

  it('marks exactly the unprogressed baseline runnable today; the rest are documented todo', () => {
    const runnable = Object.entries(SCENARIO_SUPPORT)
      .filter(([, s]) => s.runnable)
      .map(([id]) => id);
    expect(runnable).toEqual(['S01_BASELINE_UNPROGRESSED']);

    for (const [id, support] of Object.entries(SCENARIO_SUPPORT)) {
      if (support.runnable) expect(support.reason).toBe('');
      else expect(support.reason, `${id} needs a deferral reason`).not.toBe('');
    }
  });

  it('runs the S01 baseline against the real engine', () => {
    const run = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    expect(run.ran).toBe(true);
    if (run.ran) {
      expect(run.output.summary.activityCount).toBe(119);
      expect(run.output.summary.projectFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns a todo (not a fabricated run) for a not-yet-supported scenario', () => {
    const run = runScenario(fixture, 'S02_PROGRESSED_RETAINED_LOGIC');
    expect(run.ran).toBe(false);
    if (!run.ran) expect(run.todo).toContain('M2');
  });

  it('resultsDiffer detects identity — the S01 run does not differ from itself', () => {
    const a = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    const b = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    expect(a.ran && b.ran).toBe(true);
    if (a.ran && b.ran) expect(resultsDiffer(a.output, b.output)).toBe(false);
  });
});
