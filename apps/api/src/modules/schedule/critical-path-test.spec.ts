import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  CRITICAL_PATH_TEST_INJECTED_DAYS,
  CRITICAL_PATH_TEST_TOLERANCE_DAYS,
  runCriticalPathTest,
} from './critical-path-test';
import type { EngineActivity, EngineAssignment, EngineEdge, EngineResource } from './engine/types';
import {
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './engine/working-time-calendar';
import type { LevelingDemand } from './level-if-enabled';

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

function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[] = [],
  leveling: {
    demand: LevelingDemand | null;
    levelWithinFloatOnly?: boolean;
  } = { demand: null },
) {
  return runCriticalPathTest({
    activities,
    edges,
    options: { dataDate: DATA_DATE, calendar: FIVE_DAY },
    leveling: leveling.demand,
    levelWithinFloatOnly: leveling.levelWithinFloatOnly ?? false,
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

  // ── `docs/TECH_DEBT.md` #248 — the what-if levels BOTH passes when the plan does ─────────────

  /**
   * One fixture, read two ways: an a→b critical chain (10 working days) whose front, `a`, is the
   * subject perturbed — exactly the PASS fixture above — PLUS three disconnected 4-day activities
   * (`c1`/`c2`/`c3`) sharing ONE unit of a finite resource, none of them critical and none on
   * `a`/`b`'s path, so subject selection is untouched by any of this.
   *
   * **Unlevelled, `c1`/`c2`/`c3` each finish on day 4 — well short of `b`'s day-10 network finish**,
   * so `selectCompletionCarrier` (reading raw `earlyFinishOffset`) picks `b`, and injecting into `a`
   * moves `b` by the full 600 d: PASS. That PASS is `leveling: null` below — the route's behaviour
   * before this fix, and still its behaviour on a plan that does not opt into levelling.
   *
   * **Levelled, the resource has room for only one at a time**: the composite priority order
   * (`docs/TECH_DEBT.md` #248 / ADR-0041 §1 — no `levelingPriority`, equal total float, equal early
   * start, so id ascending) serialises them `c1 → c2 → c3`, and `levelWithinFloatOnly: false` lets
   * the last one extend past its own float rather than being capped — `c3` finishes LEVELLED on day
   * 12, a day past `b`. `selectCompletionCarrier` now picks `c3`. `c3` shares no logic and no
   * resource with `a`/`b`, so injecting 600 d into `a` moves it by exactly **zero**: FAIL. Same
   * activities, same injection, opposite verdict — because the plan's real completion (what a
   * levelled recalculation persists and the product shows) was never on the chain the test was
   * measuring against.
   */
  const CHAIN_AND_CONTENDED_RESOURCE = [
    task('a', 5 * DAY),
    task('b', 5 * DAY),
    task('c1', 4 * DAY),
    task('c2', 4 * DAY),
    task('c3', 4 * DAY),
  ];
  const CHAIN_EDGE = [edge('a', 'b')];
  const RESOURCE: EngineResource = { id: 'r', capacity: 1 };
  const CONTENDED_ASSIGNMENTS: readonly EngineAssignment[] = (['c1', 'c2', 'c3'] as const).map(
    (activityId) => ({ activityId, resourceId: 'r', unitsPerHour: 1 }),
  );
  const CONTENDED_DEMAND: LevelingDemand = {
    assignments: CONTENDED_ASSIGNMENTS,
    resources: [RESOURCE],
  };

  it('UNLEVELLED: the resource contention is invisible, and the chain’s own movement PASSES', () => {
    const result = run(CHAIN_AND_CONTENDED_RESOURCE, CHAIN_EDGE, { demand: null });
    expect(result.verdict).toBe('PASS');
    expect(result.detail?.completionActivityId).toBe('b');
    expect(result.detail?.deltaDays).toBe(CRITICAL_PATH_TEST_INJECTED_DAYS);
  });

  it('LEVELLED: the same plan FAILS — the true completion carrier never moves (#248)', () => {
    const unlevelled = run(CHAIN_AND_CONTENDED_RESOURCE, CHAIN_EDGE, { demand: null });
    const result = run(CHAIN_AND_CONTENDED_RESOURCE, CHAIN_EDGE, {
      demand: CONTENDED_DEMAND,
      levelWithinFloatOnly: false,
    });
    // The subject is still `a` — levelling never changes which activity is perturbed (`isCritical`
    // / `earlyStartOffset` are network-pure and untouched by the overlay).
    expect(result.detail?.perturbedActivityId).toBe('a');
    // The carrier FLIPPED from `b` to the resource-serialised `c3` — the whole point of #248.
    expect(result.detail?.completionActivityId).toBe('c3');
    expect(result.detail?.deltaDays).toBe(0);
    expect(result.verdict).toBe('FAIL');
    expect(result.offenders[0]?.activityId).toBe('a');
    // `controlCompletionFinish` must be `c3`'s LEVELLED finish (day 12), not its raw network finish
    // (day 4, same as `c1`/`c2`) — printing the raw date would make the payload's own numbers
    // disagree with its verdict (`docs/TECH_DEBT.md` #248's `effectiveFinish` fix). `c3` levelled is
    // later than `b`'s own raw/unlevelled finish (day 10), which only holds if the reported date
    // really is the levelled one.
    const levelledFinish = result.detail?.controlCompletionFinish;
    const unlevelledFinish = unlevelled.detail?.controlCompletionFinish;
    expect(levelledFinish).toBeDefined();
    expect(unlevelledFinish).toBeDefined();
    expect(levelledFinish! > unlevelledFinish!).toBe(true);
  });

  /**
   * **Levelling follows the links, so metric 12's verdict can change on a levelled plan** (`docs/specs/
   * logic-aware-levelling/` C18): the completion carrier is read from LEVELLED results on both sides, and
   * a follower of a delayed activity now carries the knock-on in its levelled finish.
   *
   * `a → b` is the critical chain (10 days). `c1` and `c2` share one resource and `c1` has the priority, so
   * `c2` is levelled to days 4 to 8, and `d` (four days, no resource) follows `c2`. Before Pass C `d` had no levelled position and
   * finished on day 8, inside `b`'s day 10, so the carrier was `b` and the verdict PASS. Now `d` finishes
   * on day 12, after `b`: it is the carrier, shares no logic with `a`, and the verdict is FAIL.
   */
  it('LEVELLED: a follower pushed past the chain becomes the completion carrier (C18)', () => {
    const activities = [
      task('a', 5 * DAY),
      task('b', 5 * DAY),
      task('c1', 4 * DAY, { levelingPriority: 1 }),
      task('c2', 4 * DAY, { levelingPriority: 2 }),
      task('d', 4 * DAY),
    ];
    const edges = [edge('a', 'b'), edge('c2', 'd')];
    const demand: LevelingDemand = {
      assignments: (['c1', 'c2'] as const).map((activityId) => ({
        activityId,
        resourceId: 'r',
        unitsPerHour: 1,
      })),
      resources: [RESOURCE],
    };
    const unlevelled = run(activities, edges, { demand: null });
    expect(unlevelled.verdict).toBe('PASS');
    expect(unlevelled.detail?.completionActivityId).toBe('b');

    const result = run(activities, edges, { demand, levelWithinFloatOnly: false });
    expect(result.detail?.completionActivityId).toBe('d');
    expect(result.detail?.deltaDays).toBe(0);
    expect(result.verdict).toBe('FAIL');
  });

  it('LEVELLED with a plan that does not opt in stays byte-identical (control)', () => {
    // Same topology, `plan.levelResources` off in spirit (`leveling: null`, exactly what
    // `buildEngineGraph` returns for an opted-out or assignment-free plan) — must read identically
    // to the pre-#248 route on every field, not merely the verdict.
    const before = run(CHAIN_AND_CONTENDED_RESOURCE, CHAIN_EDGE, { demand: null });
    const after = run(CHAIN_AND_CONTENDED_RESOURCE, CHAIN_EDGE, {
      demand: null,
      levelWithinFloatOnly: false,
    });
    expect(after).toEqual(before);
    expect(after.verdict).toBe('PASS');
  });
});
