import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeFloatPaths } from './float-paths';
import type { EngineActivity, EngineEdge } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * Multiple-float-path goldens (M6-F6, ADR-0035 §19). A float path is a **contiguous driving chain**
 * into the target, ranked by relative float — NOT activities sorted by total float. Path 0 is the
 * driving path (relative float 0); later paths are branches entered at increasing total float. Every
 * activity belongs to exactly one path. 24/7 calendar, 1 day = 1440 minutes.
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const task = (id: string, durationDays: number): EngineActivity => ({
  id,
  durationMinutes: durationDays * DAY,
  type: 'TASK',
});
const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
): EngineEdge => ({
  id: `${predecessorId}-${successorId}-${type}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: 0,
});

function paths(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  target: string,
  maxPaths = 5,
) {
  return computeFloatPaths(
    activities,
    edges,
    { dataDate: DATA_DATE, calendar: allMinutesWorkCalendar },
    target,
    maxPaths,
  );
}

// Driving spine A(2)→B(2)→T(1); X(1)→B is a branch that floats 1 day into B.
const ACTIVITIES = [task('A', 2), task('B', 2), task('T', 1), task('X', 1)];
const EDGES = [edge('A', 'B'), edge('B', 'T'), edge('X', 'B')];

describe('computeFloatPaths (M6-F6)', () => {
  it('path 0 is the driving chain into the target (relative float 0)', () => {
    const result = paths(ACTIVITIES, EDGES, 'T');
    expect(result[0]!.index).toBe(0);
    expect(result[0]!.relativeFloat).toBe(0);
    // Target-first, contiguous down the driving ties T ← B ← A.
    expect(result[0]!.activityIds).toEqual(['T', 'B', 'A']);
  });

  it('the floaty branch is a later path entered at its total float', () => {
    const result = paths(ACTIVITIES, EDGES, 'T');
    expect(result).toHaveLength(2);
    expect(result[1]!.activityIds).toEqual(['X']);
    expect(result[1]!.relativeFloat).toBe(1 * DAY); // X carries 1 day of float into the driving chain
  });

  it('ranks paths by non-decreasing relative float', () => {
    const result = paths(ACTIVITIES, EDGES, 'T');
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i]!.relativeFloat).toBeGreaterThanOrEqual(result[i - 1]!.relativeFloat);
    }
  });

  it('assigns every activity to exactly one path (a partition, not a total-float sort)', () => {
    const result = paths(ACTIVITIES, EDGES, 'T');
    const all = result.flatMap((p) => p.activityIds);
    expect(new Set(all).size).toBe(all.length); // no activity repeats across paths
    expect(new Set(all)).toEqual(new Set(['A', 'B', 'T', 'X']));
  });

  it('respects the maxPaths bound', () => {
    expect(paths(ACTIVITIES, EDGES, 'T', 1)).toHaveLength(1);
  });

  it('returns an empty list for an unknown target', () => {
    expect(paths(ACTIVITIES, EDGES, 'NOPE')).toEqual([]);
  });

  it('a lone target has a single path of just itself', () => {
    const result = paths([task('Solo', 3)], [], 'Solo');
    expect(result).toEqual([{ index: 0, relativeFloat: 0, activityIds: ['Solo'] }]);
  });
});
