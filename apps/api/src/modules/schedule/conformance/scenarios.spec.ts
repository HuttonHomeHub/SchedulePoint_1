import { loadFixture } from '@repo/engine-conformance';
import { describe, expect, it } from 'vitest';

import { computeFloatPaths } from '../engine';

import { adaptFixture } from './adapter';
import { runScenario, resultsDiffer, criticalSetDiffers, SCENARIO_SUPPORT } from './scenarios';
import { toCalendarDay } from './type-map';

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
      'S07_LONGEST_PATH',
      'S08_OPEN_ENDS_CRITICAL',
      'S11_MULTIPLE_FLOAT_PATHS',
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

  it('runs S07 (Longest Path) as a criticality-only differential — critical set differs, dates do not', () => {
    const baseline = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    const longestPath = runScenario(fixture, 'S07_LONGEST_PATH');
    expect(baseline.ran && longestPath.ran).toBe(true);
    if (baseline.ran && longestPath.ran) {
      // Flipping ONLY the critical definition to Longest Path (ADR-0035 §17–§20) changes which
      // activities are critical — the fixture's open-ended negative-float A12700 drops off — while
      // every date is unchanged. This is why the criticality predicate is separate from the date one.
      expect(criticalSetDiffers(longestPath.output, baseline.output)).toBe(true);
      expect(resultsDiffer(longestPath.output, baseline.output)).toBe(false);
    }
  });

  it('runs S08 (make open ends critical) as a criticality-only differential', () => {
    const baseline = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    const openEnds = runScenario(fixture, 'S08_OPEN_ENDS_CRITICAL');
    expect(baseline.ran && openEnds.ran).toBe(true);
    if (baseline.ran && openEnds.ran) {
      // Turning the option on flags the fixture's open ends (A9500/A3900/A12700) critical — the
      // critical set grows while every date is unchanged (ADR-0035 §20).
      expect(criticalSetDiffers(openEnds.output, baseline.output)).toBe(true);
      expect(resultsDiffer(openEnds.output, baseline.output)).toBe(false);
    }
  });

  it('runs S11 (multiple float paths) as a path-shape analysis into A12500', () => {
    // The float-path analysis is a separate read-only pass (not a computeSchedule option), so S11 is
    // asserted directly: paths into the target must be CONTIGUOUS chains (not a total-float sort), path
    // 0 driving (relative float 0), ranked by non-decreasing relative float (ADR-0035 §19, M6-F6).
    const dataDate = toCalendarDay(fixture.project.planned_start);
    const { activities, edges, options } = adaptFixture(fixture, { dataDate });
    const paths = computeFloatPaths(activities, edges, options, 'A12500', 10);
    expect(paths.length).toBeGreaterThan(1);
    expect(paths[0]!.index).toBe(0);
    expect(paths[0]!.relativeFloat).toBe(0);
    expect(paths[0]!.activityIds[0]).toBe('A12500'); // target-first

    // Every path is a contiguous chain: each consecutive pair is linked by a real logic edge
    // (successor → predecessor, since chains are target-first).
    const edgeSet = new Set(edges.map((e) => `${e.predecessorId}>${e.successorId}`));
    for (const path of paths) {
      for (let i = 1; i < path.activityIds.length; i += 1) {
        expect(edgeSet.has(`${path.activityIds[i]}>${path.activityIds[i - 1]}`)).toBe(true);
      }
    }
    // Every activity appears on at most one path (a partition), and the branch paths (1+) are ranked
    // by non-decreasing relative float. Path 0 is the target's own driving chain (relative float 0);
    // a branch can carry NEGATIVE relative float when it is more critical than the floating target
    // (a constraint-broken predecessor) — a real, documented signal, so it is excluded from this bound.
    const seen = new Set<string>();
    let prev = Number.NEGATIVE_INFINITY;
    for (const path of paths) {
      if (path.index >= 1) {
        expect(path.relativeFloat).toBeGreaterThanOrEqual(prev);
        prev = path.relativeFloat;
      }
      for (const id of path.activityIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it('runs the S01 baseline against the real engine', () => {
    const run = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    expect(run.ran).toBe(true);
    if (run.ran) {
      expect(run.output.summary.activityCount).toBe(129);
      expect(run.output.summary.projectFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns a todo (not a fabricated run) for a not-yet-supported scenario', () => {
    // S10 (resource levelling) is deferred to the M7 resource epic — still honestly a todo.
    const run = runScenario(fixture, 'S10_LEVELLED');
    expect(run.ran).toBe(false);
    if (!run.ran) expect(run.todo).toContain('M7');
  });

  it('resultsDiffer detects identity — the S01 run does not differ from itself', () => {
    const a = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    const b = runScenario(fixture, 'S01_BASELINE_UNPROGRESSED');
    expect(a.ran && b.ran).toBe(true);
    if (a.ran && b.ran) expect(resultsDiffer(a.output, b.output)).toBe(false);
  });
});
