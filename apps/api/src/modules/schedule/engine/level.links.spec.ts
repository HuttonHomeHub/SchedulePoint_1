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
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * **Pass C, the levelling pass that follows the links** (`docs/specs/logic-aware-levelling/` §4.6): the
 * structural claims, as opposed to the shapes and snapshots in `level.links.parity.spec.ts`.
 *
 * The one comparison most of this file leans on is `levelSchedule` with and without `edges`. With none,
 * Pass C has nothing to walk, so the answer IS Passes A and B (today's code, unchanged): it is the
 * "before" the spec's Gate D argument is stated against, available without keeping a second copy of the
 * old engine.
 */
const DATA_DATE = '2026-01-01';
const DAY = 1440;
const CAL = allMinutesWorkCalendar;

const task = (
  id: string,
  days: number,
  overrides: Partial<EngineActivity> = {},
): EngineActivity => ({
  id,
  durationMinutes: days * DAY,
  type: 'TASK',
  ...overrides,
});
const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
  lagDays = 0,
): EngineEdge => ({
  id: `${predecessorId}-${successorId}-${type}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: lagDays * DAY,
});
const on = (activityId: string, resourceId: string, unitsPerHour = 1): EngineAssignment => ({
  activityId,
  resourceId,
  unitsPerHour,
});
const CRANE: EngineResource = { id: 'CRANE', capacity: 1 };

interface Plan {
  activities: readonly EngineActivity[];
  edges: readonly EngineEdge[];
  assignments: readonly EngineAssignment[];
  resources: readonly EngineResource[];
  levelWithinFloatOnly?: boolean;
}

function level(
  plan: Plan,
  edges: readonly EngineEdge[] = plan.edges,
  anchor: 'PLACED' | 'NETWORK' = 'PLACED',
) {
  const output = computeSchedule(plan.activities, plan.edges, {
    dataDate: DATA_DATE,
    calendar: CAL,
  });
  const leveled = levelSchedule(plan.activities, output, edges, plan.assignments, plan.resources, {
    levelWithinFloatOnly: plan.levelWithinFloatOnly ?? false,
    dataDate: DATA_DATE,
    planCalendar: CAL,
    anchor,
  });
  return {
    ...leveled,
    byId: new Map<string, EngineResult>(leveled.results.map((r) => [r.activityId, r])),
  };
}

/** The fields levelling owns, in the shape a comparison reads. */
const overlayOf = (r: EngineResult) => ({
  id: r.activityId,
  start: r.leveledStartOffset ?? null,
  finish: r.leveledFinishOffset ?? null,
  delay: r.levelingDelay ?? null,
  window: r.levelingWindowExceeded ?? null,
  selfOver: r.selfOverAllocated ?? null,
});

// ── Gate D, as a property ─────────────────────────────────────────────────────────────────────────

/** mulberry32: a seeded generator, so the corpus is the same on every machine and every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPlan(seed: number): Plan {
  const next = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const n = int(3, 8);
  const activities: EngineActivity[] = [];
  for (let i = 0; i < n; i += 1) {
    activities.push(
      task(`A${i}`, int(1, 3), {
        ...(next() < 0.7 ? { levelingPriority: int(1, 4) } : {}),
        ...(next() < 0.2 ? { visualStart: `2026-01-0${int(1, 9)}` } : {}),
        ...(next() < 0.1 ? { type: 'FINISH_MILESTONE', durationMinutes: 0 } : {}),
      }),
    );
  }
  const types: DependencyType[] = ['FS', 'FS', 'SS', 'FF', 'SF'];
  const edges: EngineEdge[] = [];
  for (let j = 1; j < n; j += 1) {
    for (let i = 0; i < j; i += 1) {
      if (next() < 0.3) edges.push(edge(`A${i}`, `A${j}`, types[int(0, 4)], int(-1, 2)));
    }
  }
  const resources: EngineResource[] = [CRANE, { id: 'PUMP', capacity: 1 }];
  const assignments: EngineAssignment[] = [];
  for (const a of activities) {
    if (a.durationMinutes === 0) continue;
    if (next() < 0.55) assignments.push(on(a.id, next() < 0.7 ? 'CRANE' : 'PUMP'));
  }
  return { activities, edges, assignments, resources, levelWithinFloatOnly: next() < 0.3 };
}

/** Every activity reachable from `seeds` by following links forward (the seeds excluded). */
function downstreamOf(seeds: ReadonlySet<string>, edges: readonly EngineEdge[]): Set<string> {
  const reached = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const e of edges) {
      if (e.predecessorId === id && !reached.has(e.successorId)) {
        reached.add(e.successorId);
        queue.push(e.successorId);
      }
    }
  }
  return reached;
}

describe('Gate D: Pass C moves only what is downstream of what Passes A and B delayed', () => {
  it('holds over a seeded corpus, and the corpus really exercises it', () => {
    let plansWherePassCMoved = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const plan = randomPlan(seed);
      const passAB = level(plan, []);
      const full = level(plan);
      const delayedByAB = new Set(
        passAB.results.filter((r) => (r.levelingDelay ?? 0) > 0).map((r) => r.activityId),
      );
      const closure = downstreamOf(delayedByAB, plan.edges);
      const moved = passAB.results
        .map((r) => r.activityId)
        .filter(
          (id) =>
            JSON.stringify(overlayOf(passAB.byId.get(id)!)) !==
            JSON.stringify(overlayOf(full.byId.get(id)!)),
        );
      for (const id of moved) {
        expect(
          closure.has(id),
          `seed ${seed}: ${id} moved but is not downstream of a delayed bar`,
        ).toBe(true);
      }
      // The converse, stated as the spec states it: nothing delayed, nothing moves.
      if (delayedByAB.size === 0) expect(moved, `seed ${seed}`).toEqual([]);
      if (moved.length > 0) plansWherePassCMoved += 1;
    }
    // A property over a corpus that never moves anything proves nothing.
    // Measured: 64 of 400 plans.
    expect(plansWherePassCMoved).toBeGreaterThan(40);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────────────────────────

describe('Pass C is as deterministic as Pass 2 (ADR-0041 invariant (a))', () => {
  it('returns the same answer for the same plan handed over in any order', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const plan = randomPlan(seed);
      const forward = level(plan);
      const shuffled = level({
        ...plan,
        activities: [...plan.activities].reverse(),
        edges: [...plan.edges].reverse(),
        assignments: [...plan.assignments].reverse(),
        resources: [...plan.resources].reverse(),
      });
      const byId = (r: EngineResult[]) => r.map(overlayOf).sort((a, b) => a.id.localeCompare(b.id));
      expect(byId(shuffled.results), `seed ${seed}`).toEqual(byId(forward.results));
    }
  });
});

// ── Which activities a link moves, and which it never does ────────────────────────────────────────

/** Q holds the crane for three days, so P is levelled to 4-6 January; everything below follows P. */
const behindP = (follower: EngineActivity, extra: Partial<Plan> = {}): Plan => ({
  activities: [
    task('Q', 3, { levelingPriority: 1 }),
    task('P', 3, { levelingPriority: 2 }),
    follower,
  ],
  edges: [edge('P', follower.id)],
  assignments: [on('Q', 'CRANE'), on('P', 'CRANE')],
  resources: [CRANE],
  ...extra,
});

describe('what a link does and does not move (spec D-2)', () => {
  it('a mandatory-constrained follower is not moved, and keeps its overlay absent', () => {
    const { byId } = level(
      behindP(task('S', 1, { constraintType: 'MANDATORY_START', constraintDate: '2026-01-02' })),
    );
    expect(byId.get('P')!.leveledStart).toBe('2026-01-04');
    expect(byId.get('S')!.leveledStart ?? null).toBeNull();
  });

  it('a started follower is not moved', () => {
    const { byId } = level(behindP(task('S', 2, { actualStart: '2026-01-02' })));
    expect(byId.get('S')!.leveledStart ?? null).toBeNull();
  });

  it('a follower on no capped resource gets an overlay at its link floor, flagged as following', () => {
    const { byId } = level(behindP(task('S', 2)));
    const s = byId.get('S')!;
    expect([s.leveledStart, s.leveledFinish]).toEqual(['2026-01-07', '2026-01-08']);
    expect(s.leveledFollowsLinks).toBe(true);
    // Measured from where S is drawn (4 January, when P would have finished) to where P really does.
    expect(s.levelingDelay).toBe(3 * DAY);
    expect(s.levelingWindowExceeded).toBe(false);
    expect(s.selfOverAllocated).toBe(false);
  });

  it('a follower its own resource already holds past its link is left where Pass B put it', () => {
    const plan: Plan = {
      activities: [
        task('Q', 3, { levelingPriority: 1 }),
        task('P', 3, { levelingPriority: 2 }),
        task('R', 8, { levelingPriority: 1 }),
        task('S', 2, { levelingPriority: 2 }),
      ],
      edges: [edge('P', 'S')],
      assignments: [on('Q', 'CRANE'), on('P', 'CRANE'), on('R', 'PUMP'), on('S', 'PUMP')],
      resources: [CRANE, { id: 'PUMP', capacity: 1 }],
    };
    const s = level(plan).byId.get('S')!;
    expect(s.leveledStart).toBe('2026-01-09');
    // Pass B's answer already clears P's finish (7 January), so Pass C leaves it: no link flag at all.
    expect(s.leveledFollowsLinks).toBeUndefined();
  });

  it('a self-over-allocated follower moves to its link floor and stays flagged', () => {
    const plan = behindP(task('S', 1), {
      assignments: [on('Q', 'CRANE'), on('P', 'CRANE'), on('S', 'CRANE', 3)],
    });
    const { byId } = level(plan);
    const s = byId.get('S')!;
    expect(s.selfOverAllocated).toBe(true);
    // S's own demand occupies the crane where it is drawn, so P is levelled around it; S then follows P.
    expect(s.leveledStartOffset).toBe(byId.get('P')!.leveledFinishOffset);
    expect(s.leveledFollowsLinks).toBe(true);
  });

  it('a finish milestone behind P is levelled to the day P closes, and carries the levelled finish', () => {
    const plan = behindP({ id: 'M', durationMinutes: 0, type: 'FINISH_MILESTONE' });
    const { byId, summary } = level(plan);
    // P finishes on 6 January; a finish milestone is reported on the day it closes (#381).
    expect(byId.get('M')!.leveledStart).toBe('2026-01-06');
    expect(byId.get('M')!.leveledFinish).toBe('2026-01-06');
    expect(summary.leveledProjectFinish).toBe('2026-01-06');
  });

  it('a start milestone behind P is levelled to the instant P finishes', () => {
    const plan = behindP({ id: 'M', durationMinutes: 0, type: 'START_MILESTONE' });
    const { byId } = level(plan);
    expect(byId.get('M')!.leveledStart).toBe('2026-01-07');
  });

  it('with levelling-free links (no delayed activity), Pass C changes nothing at all', () => {
    const plan: Plan = {
      activities: [task('A', 2), task('B', 2), task('C', 1)],
      edges: [edge('A', 'B'), edge('B', 'C', 'SS', 1)],
      assignments: [on('A', 'CRANE')],
      resources: [CRANE],
    };
    expect(level(plan).results).toEqual(level(plan, []).results);
  });

  it('under the NETWORK anchor a follower is pushed from the early dates, not the drawn ones', () => {
    const plan = behindP(task('S', 2, { visualStart: '2026-01-03' }));
    const network = level(plan, plan.edges, 'NETWORK');
    expect(network.byId.get('S')!.leveledStart).toBe('2026-01-07');
  });
});

// ── The cost is per link, not per minute ──────────────────────────────────────────────────────────

describe('Pass C: cost is bounded by links, not by time (ADR-0041 §F)', () => {
  /**
   * A counting stub over the real calendar, the same instrument as `level.spec.ts`'s gates. The shape
   * under test is a long chain behind one delayed lift: every link is walked, and a regression to a
   * per-minute walk, or to a search per link over the whole profile, would show as an order of magnitude.
   */
  it('a chain of 200 followers costs a handful of calendar walks per link', () => {
    const counts = { addWorkingTime: 0, workingTimeBetween: 0 };
    const calendar = {
      addWorkingTime(from: string, minutes: number): string {
        counts.addWorkingTime += 1;
        return CAL.addWorkingTime(from, minutes);
      },
      workingTimeBetween(from: string, to: string): number {
        counts.workingTimeBetween += 1;
        return CAL.workingTimeBetween(from, to);
      },
    };
    const N = 200;
    const activities: EngineActivity[] = [
      task('Q', 3, { levelingPriority: 1 }),
      task('P', 3, { levelingPriority: 2 }),
    ];
    const edges: EngineEdge[] = [edge('P', 'C0')];
    for (let i = 0; i < N; i += 1) {
      activities.push(task(`C${i}`, 2));
      if (i > 0) edges.push(edge(`C${i - 1}`, `C${i}`));
    }
    const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar });
    const before = counts.addWorkingTime + counts.workingTimeBetween;
    const leveled = levelSchedule(
      activities,
      output,
      edges,
      [on('Q', 'CRANE'), on('P', 'CRANE')],
      [CRANE],
      {
        levelWithinFloatOnly: false,
        dataDate: DATA_DATE,
        planCalendar: calendar,
        anchor: 'PLACED',
      },
    );
    const spent = counts.addWorkingTime + counts.workingTimeBetween - before;
    // The precondition the bound is about: the whole chain really moved.
    expect(leveled.results.filter((r) => r.leveledFollowsLinks === true)).toHaveLength(N);
    // Measured: 2,623 (about 13 per link); the bound is set between that and a per-minute walk.
    expect(spent).toBeLessThan(N * 30);
  });
});
