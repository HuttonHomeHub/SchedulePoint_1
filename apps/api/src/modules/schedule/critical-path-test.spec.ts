import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  CRITICAL_PATH_TEST_INJECTED_DAYS,
  CRITICAL_PATH_TEST_TOLERANCE_DAYS,
  runCriticalPathTest,
} from './critical-path-test';
import type { EngineActivity, EngineEdge } from './engine/types';
import {
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './engine/working-time-calendar';

/**
 * **The metric-12 perturbation rule** (health M6-T1) — real engine, small graphs: an intact chain
 * passes with the finish moving in step; a mandatory pin masking downstream logic fails with the
 * movement absorbed; the three legitimate cannot-assess states are stated, never a crash.
 */

const DATA_DATE = '2026-01-05'; // a Monday
const DAY = 1440;

const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);

function task(
  id: string,
  durationMinutes: number,
  over: Partial<EngineActivity> = {},
): EngineActivity {
  return { id, durationMinutes, type: 'TASK', ...over };
}

function edge(predecessorId: string, successorId: string, type: DependencyType = 'FS'): EngineEdge {
  return { id: `${predecessorId}-${successorId}`, predecessorId, successorId, type, lagMinutes: 0 };
}

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[] = []) {
  return runCriticalPathTest({
    activities,
    edges,
    options: { dataDate: DATA_DATE, calendar: FIVE_DAY },
    dayFactorMinutesOf: () => DAY,
    labelOf: (id) => ({ code: id.toUpperCase(), name: `Activity ${id}` }),
  });
}

describe('health M6 — the critical-path what-if', () => {
  it('an intact chain PASSES: the finish moves by the injected amount', () => {
    const result = run([task('a', 5 * DAY), task('b', 5 * DAY)], [edge('a', 'b')]);
    expect(result.verdict).toBe('PASS');
    expect(result.reason).toBeNull();
    expect(result.threshold).toBeNull();
    // Same-calendar propagation is exact: delta = injection, ratio = 1.
    expect(result.detail?.deltaDays).toBe(CRITICAL_PATH_TEST_INJECTED_DAYS);
    expect(result.measured?.ratio).toBe(1);
    expect(result.offenders).toEqual([]);
  });

  it('picks the FRONT of the critical path deterministically and says which activity it perturbed', () => {
    const result = run([task('b', 5 * DAY), task('a', 5 * DAY)], [edge('a', 'b')]);
    expect(result.detail?.perturbedActivityId).toBe('a');
    expect(result.detail?.perturbedActivityName).toBe('Activity a');
    // The verdict is reproducible by hand: everything injected is in the payload.
    expect(result.detail?.injectedDays).toBe(CRITICAL_PATH_TEST_INJECTED_DAYS);
    expect(result.detail?.toleranceDays).toBe(CRITICAL_PATH_TEST_TOLERANCE_DAYS);
  });

  it('a mandatory pin masking downstream logic FAILS with the subject as the offender', () => {
    // `b` is pinned MANDATORY_START: the pin breaks logic (produce-and-flag, ADR-0035 §7), so
    // injecting 600 d into `a` moves the finish by nothing — the DCMA case verbatim: a schedule
    // whose dates look computed and are actually pinned.
    const result = run(
      [
        task('a', 5 * DAY),
        task('b', 5 * DAY, { constraintType: 'MANDATORY_START', constraintDate: '2026-01-12' }),
      ],
      [edge('a', 'b')],
    );
    expect(result.verdict).toBe('FAIL');
    expect(result.measured?.ratio).toBeLessThan(1);
    expect(result.offenderCount).toBe(1);
    expect(result.offenders[0]?.activityId).toBe(result.detail?.perturbedActivityId);
    expect(result.offenders[0]?.note).toMatch(/finish moved .* of 600 d injected/);
    // The COMPLETION CARRIER is what was watched — the pinned `b`, which finished last in the
    // control run and did not move. This fixture read PASS under the first draft's max-EF rule
    // (the subject's own +600 d finish became the new max), which is why the rule measures the
    // carrier: verified red against that draft before the carrier rule landed (ADR-0110 D5).
    expect(result.detail?.completionActivityId).toBe('b');
    expect(result.detail?.deltaDays).toBe(0);
  });

  it('an empty plan is EMPTY_PLAN, never a crash', () => {
    const result = run([]);
    expect(result.verdict).toBe('NOT_ASSESSABLE');
    expect(result.reason).toBe('EMPTY_PLAN');
    expect(result.measured).toBeNull();
    expect(result.detail).toBeNull();
  });

  it('an all-complete plan is NO_INCOMPLETE_ACTIVITIES — nothing remains to perturb', () => {
    const result = run(
      [
        task('a', 5 * DAY, { actualStart: '2026-01-05', actualFinish: '2026-01-09' }),
        task('b', 5 * DAY, { actualStart: '2026-01-12', actualFinish: '2026-01-16' }),
      ],
      [edge('a', 'b')],
    );
    expect(result.verdict).toBe('NOT_ASSESSABLE');
    expect(result.reason).toBe('NO_INCOMPLETE_ACTIVITIES');
  });

  it('incomplete work with no critical member is NO_CRITICAL_PATH — a fact, not a crash (M6-T1)', () => {
    // The critical chain is COMPLETE; the one incomplete activity floats free behind the frozen
    // finish, so nothing eligible is critical. A legitimately assessable-nothing state.
    const result = run(
      [
        task('a', 20 * DAY, { actualStart: '2026-01-05', actualFinish: '2026-02-27' }),
        task('b', 1 * DAY),
      ],
      [],
    );
    if (result.verdict === 'NOT_ASSESSABLE') {
      expect(result.reason).toBe('NO_CRITICAL_PATH');
    } else {
      // If the engine marks the open-ended `b` critical (TF≤0 to the project finish), this fixture
      // does not produce the state — fail loudly so the fixture is rebuilt, never skipped.
      throw new Error(`fixture did not produce NO_CRITICAL_PATH: got ${result.verdict}`);
    }
  });

  it('an in-progress subject is perturbed through its REMAINING work, not only its duration', () => {
    // `a` started and holds 2 d remaining; it is still the critical front. The engine schedules an
    // in-progress activity on `remainingMinutes`, so an injection that only widened
    // `durationMinutes` would vanish — the perturbed pass must extend BOTH.
    const result = run(
      [
        task('a', 5 * DAY, { actualStart: '2026-01-05', remainingMinutes: 2 * DAY }),
        task('b', 5 * DAY),
      ],
      [edge('a', 'b')],
    );
    expect(result.verdict).toBe('PASS');
    expect(result.detail?.deltaDays).toBe(CRITICAL_PATH_TEST_INJECTED_DAYS);
  });
});
