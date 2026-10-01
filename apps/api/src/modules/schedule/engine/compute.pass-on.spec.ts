import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge } from './types';
import { allMinutesWorkCalendar, instantToAbsMinutes } from './working-time-calendar';

/**
 * Pass 2's pass-on, exposed in memory for the levelling pass (`docs/specs/logic-aware-levelling/` §4.6,
 * M2-T1). Levelling must read what a follower's `logicEarliest` was measured from rather than re-derive
 * Pass 2's rule, so these pin the exposed instants to the values a follower actually used.
 */
const DATA_DATE = '2026-01-01';
const DAY = 1440;
const day = (iso: string): number => instantToAbsMinutes(iso);

const task = (id: string, days: number, extra: Partial<EngineActivity> = {}): EngineActivity => ({
  id,
  durationMinutes: days * DAY,
  type: 'TASK',
  ...extra,
});
const fs = (predecessorId: string, successorId: string): EngineEdge => ({
  id: `${predecessorId}-${successorId}`,
  predecessorId,
  successorId,
  type: 'FS',
  lagMinutes: 0,
});

const solve = (activities: EngineActivity[], edges: EngineEdge[]) => {
  const out = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
  });
  return new Map(out.results.map((r) => [r.activityId, r]));
};

describe('computeSchedule — the pass-on instants levelling reads', () => {
  it('an unplaced activity passes on its logic-earliest span, and a follower starts from its finish', () => {
    const r = solve([task('A', 2), task('B', 1)], [fs('A', 'B')]);
    expect(r.get('A')!.passOnStartInstant).toBe(day('2026-01-01'));
    expect(r.get('A')!.passOnFinishInstant).toBe(day('2026-01-03'));
    // B's own pass-on start is the bound A's pass-on finish imposed: the instants are the ones used.
    expect(r.get('B')!.passOnStartInstant).toBe(r.get('A')!.passOnFinishInstant);
  });

  it('a placement later than logic is passed on, and its follower is pushed from it', () => {
    const r = solve([task('A', 2, { visualStart: '2026-01-04' }), task('B', 1)], [fs('A', 'B')]);
    expect(r.get('A')!.passOnStartInstant).toBe(day('2026-01-04'));
    expect(r.get('A')!.passOnFinishInstant).toBe(day('2026-01-06'));
    expect(r.get('B')!.passOnStartInstant).toBe(day('2026-01-06'));
  });

  it('a placement EARLIER than logic passes on its logic-earliest, never the conflicted placement', () => {
    const r = solve(
      [task('A', 2), task('B', 1, { visualStart: '2026-01-02' }), task('C', 1)],
      [fs('A', 'B'), fs('B', 'C')],
    );
    expect(r.get('B')!.visualConflict).toBe(true);
    // Drawn on 2 Jan, but what C is measured from is logic: A finishes 3 Jan, B 4 Jan.
    expect(r.get('B')!.passOnStartInstant).toBe(day('2026-01-03'));
    expect(r.get('C')!.passOnStartInstant).toBe(day('2026-01-04'));
  });

  it('a started activity passes on Pass 1 instants, not its placement', () => {
    const r = solve(
      [task('A', 2, { actualStart: '2026-01-01', visualStart: '2026-01-09' }), task('B', 1)],
      [fs('A', 'B')],
    );
    expect(r.get('A')!.passOnStartInstant).toBe(day('2026-01-01'));
    expect(r.get('B')!.passOnStartInstant).toBeLessThan(day('2026-01-09'));
  });
});
