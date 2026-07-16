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

  it('marks the baseline + the wired scenarios runnable; the rest are documented todo', () => {
    const runnable = Object.entries(SCENARIO_SUPPORT)
      .filter(([, s]) => s.runnable)
      .map(([id]) => id);
    // S06 became runnable at M3 (24-Hour lag); S05 at M5 (per-activity calendars → successor lag);
    // S02/S03/S04 at M2 (progress ingestion + the three recalc modes); S12 at M4 (Expected Finish).
    expect(runnable).toEqual([
      'S01_BASELINE_UNPROGRESSED',
      'S02_PROGRESSED_RETAINED_LOGIC',
      'S03_PROGRESS_OVERRIDE',
      'S04_ACTUAL_DATES',
      'S05_LAG_CALENDAR_SUCCESSOR',
      'S06_LAG_CALENDAR_24H',
      'S12_EXPECTED_FINISH_OFF',
    ]);

    for (const [id, support] of Object.entries(SCENARIO_SUPPORT)) {
      if (support.runnable) expect(support.reason).toBe('');
      else expect(support.reason, `${id} needs a deferral reason`).not.toBe('');
    }
  });

  it('runs S06 (24-Hour lag) as a differential — its dates differ from the S01 baseline', () => {
    const baseline = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    const lag24h = runScenario(fixture, 'S06_LAG_CALENDAR_24H');
    expect(baseline.ran && lag24h.ran).toBe(true);
    if (baseline.ran && lag24h.ran) {
      // Honouring the concrete-cure A4430→A4440 FS + 168h / 24H edge moves at least one date:
      // "flip the option, dates must change" (ADR-0034 §2).
      expect(resultsDiffer(lag24h.output, baseline.output)).toBe(true);
    }
  });

  it('runs S05 (successor lag calendar) as a differential — per-activity calendars move dates (M5)', () => {
    const baseline = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    const succ = runScenario(fixture, 'S05_LAG_CALENDAR_SUCCESSOR');
    expect(baseline.ran && succ.ran).toBe(true);
    if (baseline.ran && succ.ran) {
      // Turning on per-activity calendars + resolving relationship lag on the successor's calendar
      // (ADR-0037) moves dates vs the all-plan-calendar baseline — the M5 differential.
      expect(resultsDiffer(succ.output, baseline.output)).toBe(true);
    }
  });

  it('runs the M2 progressed scenarios as differentials — S02 differs from S01, S03 from S02', () => {
    const baseline = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    const retained = runScenario(fixture, 'S02_PROGRESSED_RETAINED_LOGIC');
    const override = runScenario(fixture, 'S03_PROGRESS_OVERRIDE');
    const actual = runScenario(fixture, 'S04_ACTUAL_DATES');
    expect(baseline.ran && retained.ran && override.ran && actual.ran).toBe(true);
    if (baseline.ran && retained.ran && override.ran && actual.ran) {
      // Feeding the fixture's progress at the data date (ADR-0035 §1–§2) moves dates vs the clean
      // unprogressed baseline — the M2 differential.
      expect(resultsDiffer(retained.output, baseline.output)).toBe(true);
      expect(resultsDiffer(actual.output, baseline.output)).toBe(true);
      // The definitive Retained-Logic vs Progress-Override discriminator: dropping A4220's incomplete
      // predecessor moves its downstream, so S03 ≠ S02 (ADR-0035 §1, fixture S03 assertion).
      expect(resultsDiffer(override.output, retained.output)).toBe(true);
    }
  });

  it('runs S12 (Expected Finish) as a differential — turning the option on differs from S02 (M4)', () => {
    const retained = runScenario(fixture, 'S02_PROGRESSED_RETAINED_LOGIC');
    const expectedFinish = runScenario(fixture, 'S12_EXPECTED_FINISH_OFF');
    expect(retained.ran && expectedFinish.ran).toBe(true);
    if (retained.ran && expectedFinish.ran) {
      // S12 runs the identical progressed Retained-Logic network as S02 with only the Expected-Finish
      // option flipped ON, so the fixture's A6200 lands on its expected finish instead of its logic
      // finish — the M4 differential (ADR-0035 §9): flip the one option, dates must move.
      expect(resultsDiffer(expectedFinish.output, retained.output)).toBe(true);
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
    // S07 (Longest Path) is an M6 rung — still honestly deferred.
    const run = runScenario(fixture, 'S07_LONGEST_PATH');
    expect(run.ran).toBe(false);
    if (!run.ran) expect(run.todo).toContain('M6');
  });

  it('resultsDiffer detects identity — the S01 run does not differ from itself', () => {
    const a = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    const b = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    expect(a.ran && b.ran).toBe(true);
    if (a.ran && b.ran) expect(resultsDiffer(a.output, b.output)).toBe(false);
  });
});
