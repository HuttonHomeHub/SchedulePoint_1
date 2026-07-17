import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import { levelSchedule } from './level';
import type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
  EngineResource,
  EngineResult,
} from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
} from './working-time-calendar';

/**
 * Resource-levelling pass tests (ADR-0041). All first-principles: a single-unit resource forces an
 * exact serialisation whose leveled offsets/dates we hand-verify. The plan calendar is 24/7
 * (`allMinutesWorkCalendar`) so one working day = 1440 minutes and a plan-frame offset equals the
 * absolute minute delta — the arithmetic is transparent. Data date is 2026-01-01.
 */
const DATA_DATE = '2026-01-01';
const DAY = 1440;
const CAL = allMinutesWorkCalendar;

const task = (
  id: string,
  durationDays: number,
  overrides: Partial<EngineActivity> = {},
): EngineActivity => ({ id, durationMinutes: durationDays * DAY, type: 'TASK', ...overrides });

const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
): EngineEdge => ({
  id: `${predecessorId}-${successorId}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: 0,
});

const assign = (
  activityId: string,
  resourceId: string,
  unitsPerHour: number,
): EngineAssignment => ({
  activityId,
  resourceId,
  unitsPerHour,
});

function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  assignments: readonly EngineAssignment[],
  resources: readonly EngineResource[],
  levelWithinFloatOnly = false,
) {
  const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: CAL });
  const leveled = levelSchedule(activities, output, assignments, resources, {
    levelWithinFloatOnly,
    dataDate: DATA_DATE,
    planCalendar: CAL,
  });
  return {
    output,
    leveled,
    byId: new Map<string, EngineResult>(leveled.results.map((r) => [r.activityId, r])),
  };
}

describe('levelSchedule — two overlapping equal activities on a single-unit resource (§1–§4)', () => {
  // A6100/A6200 crane shape: two 2-day activities both start at the data date and both demand the
  // capacity-1 crane. Levelling must serialise them; the lower-priority one delays by exactly the
  // first's duration.
  const A = task('A', 2, { levelingPriority: 1 });
  const B = task('B', 2, { levelingPriority: 2 });
  const resources: EngineResource[] = [{ id: 'R', capacity: 1 }];
  const assignments = [assign('A', 'R', 1), assign('B', 'R', 1)];

  it('leaves the higher-priority activity at its early start and serialises the other exactly', () => {
    const { byId } = run([A, B], [], assignments, resources);
    // A keeps its network position (delay 0), occupying the crane on days 1–2.
    expect(byId.get('A')!.leveledStartOffset).toBe(0);
    expect(byId.get('A')!.levelingDelay).toBe(0);
    expect(byId.get('A')!.leveledStart).toBe('2026-01-01');
    expect(byId.get('A')!.leveledFinish).toBe('2026-01-02');
    // B is pushed to the day after A frees the crane: exactly A's duration of delay.
    expect(byId.get('B')!.leveledStartOffset).toBe(2 * DAY);
    expect(byId.get('B')!.leveledFinishOffset).toBe(4 * DAY);
    expect(byId.get('B')!.levelingDelay).toBe(2 * DAY);
    expect(byId.get('B')!.leveledStart).toBe('2026-01-03');
    expect(byId.get('B')!.leveledFinish).toBe('2026-01-04');
  });

  it('never recomputes the network float/critical (Q2 — leveled dates are an additive overlay)', () => {
    const { byId } = run([A, B], [], assignments, resources);
    // Both still start at the data date in the pure network; levelling did not touch early*/float.
    expect(byId.get('A')!.earlyStartOffset).toBe(0);
    expect(byId.get('B')!.earlyStartOffset).toBe(0);
    expect(byId.get('A')!.totalFloat).toBe(byId.get('B')!.totalFloat);
  });
});

describe('levelSchedule — float-first vs extend (§4)', () => {
  it('spends float first: a delay within total float preserves the project finish', () => {
    // Z(4) gives A and B two days of float (project finish day 4). Serialising B to days 3–4 fits
    // within its float, so the leveled project finish equals the network project finish.
    const A = task('A', 2, { levelingPriority: 1 });
    const B = task('B', 2, { levelingPriority: 2 });
    const Z = task('Z', 4);
    const resources: EngineResource[] = [{ id: 'R', capacity: 1 }];
    const assignments = [assign('A', 'R', 1), assign('B', 'R', 1)];
    const { byId, leveled, output } = run([A, B, Z], [], assignments, resources);
    const b = byId.get('B')!;
    expect(b.leveledStartOffset).toBe(2 * DAY);
    expect(b.leveledFinishOffset).toBeLessThanOrEqual(b.lateFinishOffset); // within float
    expect(leveled.summary.leveledProjectFinishOffset).toBe(output.summary.projectFinishOffset);
    expect(leveled.summary.leveledProjectFinish).toBe(output.summary.projectFinish);
  });

  it('extends when float is exhausted: the leveled finish grows past the network project finish', () => {
    // No slack — A and B are both the whole plan. Serialising B extends the project two days.
    const A = task('A', 2, { levelingPriority: 1 });
    const B = task('B', 2, { levelingPriority: 2 });
    const resources: EngineResource[] = [{ id: 'R', capacity: 1 }];
    const assignments = [assign('A', 'R', 1), assign('B', 'R', 1)];
    const { leveled, output } = run([A, B], [], assignments, resources);
    expect(output.summary.projectFinishOffset).toBe(2 * DAY);
    expect(leveled.summary.leveledProjectFinishOffset).toBe(4 * DAY);
    expect(leveled.summary.leveledProjectFinish).toBe('2026-01-04');
    expect(leveled.summary.leveledActivityCount).toBe(1); // only B was delayed
  });
});

describe('levelSchedule — determinism (§1 invariant)', () => {
  it('produces byte-identical output regardless of activity/assignment input order', () => {
    const activities = [
      task('A', 2, { levelingPriority: 2 }),
      task('B', 3, { levelingPriority: 1 }),
      task('C', 1, { levelingPriority: 3 }),
      task('D', 2),
    ];
    const resources: EngineResource[] = [
      { id: 'R1', capacity: 1 },
      { id: 'R2', capacity: 2 },
    ];
    const assignments = [
      assign('A', 'R1', 1),
      assign('B', 'R1', 1),
      assign('C', 'R2', 2),
      assign('D', 'R2', 1),
    ];
    const first = run(activities, [], assignments, resources).leveled.results;
    const second = run(
      [...activities].reverse(),
      [],
      [...assignments].reverse(),
      [...resources].reverse(),
    ).leveled.results;
    const key = (rs: EngineResult[]) =>
      [...rs].sort((a, b) => (a.activityId < b.activityId ? -1 : 1));
    expect(key(second)).toEqual(key(first));
  });
});

describe('levelSchedule — exclusions never move (§5)', () => {
  it('never delays a mandatory-constrained activity; others level around it', () => {
    // A is MANDATORY_START-pinned on the data date and holds the crane there. B — even at higher
    // priority — is placed AFTER A, because a pinned activity is never moved (§5).
    const A = task('A', 2, {
      constraintType: 'MANDATORY_START',
      constraintDate: DATA_DATE,
    });
    const B = task('B', 2, { levelingPriority: 1 });
    const resources: EngineResource[] = [{ id: 'R', capacity: 1 }];
    const assignments = [assign('A', 'R', 1), assign('B', 'R', 1)];
    const { byId } = run([A, B], [], assignments, resources);
    expect(byId.get('A')!.leveledStart).toBe(byId.get('A')!.earlyStart); // unmoved
    expect(byId.get('A')!.levelingDelay).toBe(0);
    expect(byId.get('B')!.leveledStartOffset).toBe(2 * DAY); // levelled around the pinned A
  });

  it('never delays a progressed (started) activity', () => {
    const A = task('A', 2, { actualStart: DATA_DATE, levelingPriority: 5 });
    const B = task('B', 2, { levelingPriority: 1 });
    const resources: EngineResource[] = [{ id: 'R', capacity: 1 }];
    const assignments = [assign('A', 'R', 1), assign('B', 'R', 1)];
    const { byId } = run([A, B], [], assignments, resources);
    expect(byId.get('A')!.levelingDelay).toBe(0);
    expect(byId.get('B')!.leveledStartOffset).toBe(2 * DAY);
  });
});

describe('levelSchedule — availability-window conflict (§6, Q1 = extend-and-flag)', () => {
  it('extends past a window-only resource that runs out, flags it, and never hangs', () => {
    // The crane is on hire only 2026-01-01…02 (a window-only calendar). A takes the crane on those
    // two days; B is serialised to days 3–4 — past the hire window — so it is placed there and flagged.
    const craneCal = buildWorkingTimeCalendar(fullDayWeek([]), [
      {
        startDate: '2026-01-01',
        endDate: '2026-01-02',
        windows: [{ startMinute: 0, endMinute: DAY }],
      },
    ]);
    const A = task('A', 2, { levelingPriority: 1 });
    const B = task('B', 2, { levelingPriority: 2 });
    const resources: EngineResource[] = [{ id: 'R', capacity: 1, calendar: craneCal }];
    const assignments = [assign('A', 'R', 1), assign('B', 'R', 1)];
    const { byId, leveled } = run([A, B], [], assignments, resources);
    expect(byId.get('A')!.levelingWindowExceeded).toBe(false);
    expect(byId.get('B')!.leveledStart).toBe('2026-01-03'); // still placed (extended)
    expect(byId.get('B')!.levelingWindowExceeded).toBe(true); // flagged
    expect(leveled.summary.levelingWindowExceededCount).toBe(1);
  });
});

describe('levelSchedule — self-over-allocation (§2)', () => {
  it('flags an activity whose own demand exceeds capacity, places it at its early start, does not split', () => {
    const A = task('A', 2);
    const resources: EngineResource[] = [{ id: 'R', capacity: 1 }];
    const assignments = [assign('A', 'R', 2)]; // 2 units on a capacity-1 resource
    const { byId, leveled } = run([A], [], assignments, resources);
    expect(byId.get('A')!.selfOverAllocated).toBe(true);
    expect(byId.get('A')!.leveledStartOffset).toBe(0); // early start, not delayed
    expect(byId.get('A')!.leveledFinishOffset).toBe(2 * DAY); // full 2-day run, not split
    expect(byId.get('A')!.levelingDelay).toBe(0);
    expect(leveled.summary.selfOverAllocatedCount).toBe(1);
  });
});

describe('levelSchedule — levelWithinFloatOnly residual contract (§4)', () => {
  // A(2), B(2) share a capacity-1 resource; Z(3) gives them one day of float (late finish day 3).
  // Fully serialising B needs a 2-day delay (finish day 4) which EXCEEDS its float.
  const A = task('A', 2, { levelingPriority: 1 });
  const B = task('B', 2, { levelingPriority: 2 });
  const Z = task('Z', 3);
  const resources: EngineResource[] = [{ id: 'R', capacity: 1 }];
  const assignments = [assign('A', 'R', 1), assign('B', 'R', 1)];

  it('with the option OFF, B extends past its float to fully resolve the conflict', () => {
    const { byId } = run([A, B, Z], [], assignments, resources, false);
    expect(byId.get('B')!.leveledStartOffset).toBe(2 * DAY); // serialised, past float
  });

  it('with the option ON, B stays within float and the residual over-allocation is left unresolved', () => {
    const { byId } = run([A, B, Z], [], assignments, resources, true);
    const a = byId.get('A')!;
    const b = byId.get('B')!;
    // Capped at its within-float latest (late start = 1 day delay), never extended past total float.
    expect(b.leveledFinishOffset).toBe(b.lateFinishOffset);
    expect(b.leveledFinishOffset).toBe(3 * DAY);
    expect(b.leveledStartOffset).toBe(1 * DAY);
    expect(b.levelingDelay).toBe(1 * DAY);
    // Documented contract: the residual over-allocation is LEFT (leveled intervals still overlap on R)
    // and is NOT flagged by a boolean (no residual column exists).
    expect(b.leveledStartOffset).toBeLessThan(a.leveledFinishOffset!); // A [0,2) and B [1,3) overlap
    expect(b.levelingWindowExceeded).toBe(false);
    expect(b.selfOverAllocated).toBe(false);
  });
});

describe('levelSchedule — parity (§8)', () => {
  it('all-uncapped resources ⇒ leveled overlay absent and results equal the network', () => {
    const A = task('A', 2);
    const B = task('B', 2);
    const resources: EngineResource[] = [{ id: 'R', capacity: null }]; // uncapped
    const assignments = [assign('A', 'R', 1), assign('B', 'R', 1)];
    const { byId, leveled, output } = run([A, B], [], assignments, resources);
    expect(byId.get('A')!.leveledStart).toBeUndefined();
    expect(byId.get('A')!.levelingDelay).toBeUndefined();
    expect(leveled.results).toEqual(output.results); // byte-identical network overlay
    expect(leveled.summary.leveledActivityCount).toBe(0);
  });

  it('no assignments ⇒ leveled overlay absent, results equal the network', () => {
    const A = task('A', 2);
    const B = task('B', 3);
    const { leveled, output } = run([A, B], [edge('A', 'B')], [], []);
    expect(leveled.results).toEqual(output.results);
    expect(leveled.summary.leveledActivityCount).toBe(0);
  });
});

describe('levelSchedule — performance (2,000 activities, ADR-0041 §2)', () => {
  it('levels 2,000 activities across 200 capacity-1 resources well under budget', () => {
    // 10 activities per resource all start at the data date → each resource serialises its 10. The
    // per-resource interval sweep keeps this bounded (contention is local); assert completion + shape,
    // not a CI wall-clock — a generous 5 s guard that only trips on a pathological blow-up.
    const activities: EngineActivity[] = [];
    const assignments: EngineAssignment[] = [];
    const resources: EngineResource[] = [];
    const RES = 200;
    for (let i = 0; i < RES; i += 1) resources.push({ id: `R${i}`, capacity: 1 });
    for (let i = 0; i < 2000; i += 1) {
      activities.push(task(`N${i}`, 1, { levelingPriority: i }));
      assignments.push(assign(`N${i}`, `R${i % RES}`, 1));
    }
    const started = performance.now();
    const { leveled } = run(activities, [], assignments, resources);
    const elapsedMs = performance.now() - started;
    expect(leveled.results).toHaveLength(2000);
    // Each resource's 10th activity is serialised behind the first nine → a real delay was applied.
    expect(leveled.summary.leveledActivityCount!).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(5000);
  });
});
