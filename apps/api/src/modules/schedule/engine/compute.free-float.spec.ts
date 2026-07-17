import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * Free float goldens (M6-F1, ADR-0035 §17–§20). Every expectation is hand-verified below in **working
 * days** and asserted in minutes (a 24/7 calendar, so 1 day = 1440). Free float is the working time
 * an activity can slip its finish **without delaying the early start of any successor**; total float
 * is the slip that keeps the whole plan on time. The two differ whenever an activity shares its slack
 * with a downstream chain — the case these goldens pin. Free float is always ≤ total float.
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const task = (id: string, durationDays: number): EngineActivity => ({
  id,
  durationMinutes: durationDays * DAY,
  type: 'TASK',
});
const finishMilestone = (id: string): EngineActivity => ({
  id,
  durationMinutes: 0,
  type: 'FINISH_MILESTONE',
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

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[]) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
  });
  return new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
}

const floats = (r: EngineResult) => ({ tf: r.totalFloat, ff: r.freeFloat });

describe('computeSchedule — free float (M6-F1)', () => {
  it('separates free float from total float when an activity shares slack with its successor', () => {
    // A(2)→B(2)→D(1); C(6)→D. C drives D (finishes day 6); B finishes day 4, so B — and the A→B
    // chain — carries 2 days of total float. But A's successor B starts the instant A finishes, so A
    // has ZERO free float (any slip pushes B); B's free float is the full 2-day gap to D's start.
    const byId = run(
      [task('A', 2), task('B', 2), task('C', 6), task('D', 1)],
      [edge('A', 'B'), edge('B', 'D'), edge('C', 'D')],
    );
    expect(floats(byId.get('A')!)).toEqual({ tf: 2 * DAY, ff: 0 });
    expect(floats(byId.get('B')!)).toEqual({ tf: 2 * DAY, ff: 2 * DAY });
    expect(floats(byId.get('C')!)).toEqual({ tf: 0, ff: 0 });
    expect(floats(byId.get('D')!)).toEqual({ tf: 0, ff: 0 });
  });

  it('gives an open end its total float (the tail identity FF = TF)', () => {
    // Two independent chains: A(5) fixes the project finish at day 5; B(2) is a shorter open end, so
    // it can slip 3 days before it would push the finish — free float equals total float at the tail.
    const byId = run([task('A', 5), task('B', 2)], []);
    expect(floats(byId.get('A')!)).toEqual({ tf: 0, ff: 0 });
    expect(floats(byId.get('B')!)).toEqual({ tf: 3 * DAY, ff: 3 * DAY });
  });

  it('takes the tightest gap across multiple successors, and never exceeds total float', () => {
    // A(2) drives nothing directly: B waits on P(4), C waits on Q(6). A→B gap = 2 days, A→C gap = 4
    // days, so A's free float is the smaller, 2 days — while its total float is 4 (it can drift until
    // it would push the day-7 finish). FF < TF, and FF is the min over successors.
    const byId = run(
      [task('A', 2), task('B', 1), task('C', 1), task('P', 4), task('Q', 6)],
      [edge('A', 'B'), edge('A', 'C'), edge('P', 'B'), edge('Q', 'C')],
    );
    expect(floats(byId.get('A')!)).toEqual({ tf: 4 * DAY, ff: 2 * DAY });
    // Invariant across the whole network: free float never exceeds total float.
    for (const r of byId.values()) expect(r.freeFloat).toBeLessThanOrEqual(r.totalFloat);
  });

  it('measures the gap across an FS lag', () => {
    // A(2) →(FS +2) B, and C(6)→B. B starts on day 6 (C drives it); A finishes day 2 and its lagged
    // bound on B is day 4, so A can slip 2 days before that bound reaches C's day-6 start.
    const byId = run(
      [task('A', 2), task('B', 1), task('C', 6)],
      [edge('A', 'B', 'FS', 2), edge('C', 'B')],
    );
    expect(byId.get('A')!.freeFloat).toBe(2 * DAY);
  });

  it('honours an SS relationship: a driven start leaves no free float', () => {
    // A(4) →(SS +1) B(2): B must start no earlier than A's start + 1, and it does — so A drives B and
    // cannot slip its start without pushing it. Free float is zero even though B itself carries float.
    const byId = run([task('A', 4), task('B', 2)], [edge('A', 'B', 'SS', 1)]);
    expect(byId.get('A')!.freeFloat).toBe(0);
  });

  it('treats a finish milestone open end like any other tail (FF = TF)', () => {
    // A(3)→M (finish milestone). M sits at day 3 as the sole open end (zero float); A drives it, so A
    // has zero free float too.
    const byId = run([task('A', 3), finishMilestone('M')], [edge('A', 'M')]);
    expect(byId.get('A')!.freeFloat).toBe(0);
    expect(floats(byId.get('M')!)).toEqual({ tf: 0, ff: 0 });
  });

  it('reports zero free float for a lone critical activity (single-node guard)', () => {
    const byId = run([task('A', 3)], []);
    expect(floats(byId.get('A')!)).toEqual({ tf: 0, ff: 0 });
  });
});
