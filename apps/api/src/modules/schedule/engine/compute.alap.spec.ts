import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * As-Late-As-Possible (ADR-0035 §11, M4-F4 + M6-F5). ALAP is a **display-only** placement preference: a
 * flagged activity is placed as late as its SUCCESSORS allow, so its **free float becomes 0** at that
 * placement (the M6-F5 refinement), while its `early*`/`late*`/`totalFloat` stay a pure function of the
 * network. These tests pin the non-interference contract (the flag never moves the pure schedule) and
 * the zero-free-float signal.
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const task = (id: string, durationDays: number, alap = false): EngineActivity => ({
  id,
  durationMinutes: durationDays * DAY,
  type: 'TASK',
  scheduleAsLateAsPossible: alap,
});

function run(activities: readonly EngineActivity[]) {
  const output = computeSchedule(activities, [], {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
  });
  return new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
}

describe('as-late-as-possible — display-only, never the pure passes (ADR-0035 §11)', () => {
  it('leaves the pure early/late/total-float byte-identical whether the flag is on or off', () => {
    // A(2) floats by 3 days against the 5-day B (both start at the data date; no logic ties).
    const off = run([task('A', 2, false), task('B', 5)]).get('A')!;
    const on = run([task('A', 2, true), task('B', 5)]).get('A')!;
    // The PURE schedule is untouched by the display flag (§11) …
    for (const k of [
      'earlyStart',
      'earlyFinish',
      'lateStart',
      'lateFinish',
      'totalFloat',
    ] as const) {
      expect(on[k]).toEqual(off[k]);
    }
    // … but the ALAP placement consumes its slack, so its free float is 0 (M6-F5); off it keeps its 3-day free float.
    expect(off.freeFloat).toBe(3 * DAY);
    expect(on.freeFloat).toBe(0);
  });

  it('the ALAP render target is the activity’s late-based position (its late dates)', () => {
    const byId = run([task('A', 2, true), task('B', 5)]);
    const a = byId.get('A')!;
    // A carries 3 days of float; its late start (offset 3 days) is where an ALAP bar renders — as late
    // as the network allows without moving the project finish. Total float is unchanged.
    expect(a.earlyStartOffset).toBe(0);
    expect(a.lateStartOffset).toBe(3 * DAY);
    expect(a.lateFinishOffset).toBe(5 * DAY);
    expect(a.totalFloat).toBe(3 * DAY);
  });

  it('an ALAP flag on a zero-float (critical) activity is a no-op — it is already as late as possible', () => {
    const byId = run([task('B', 5, true)]);
    const b = byId.get('B')!;
    expect(b.earlyStartOffset).toBe(0);
    expect(b.lateStartOffset).toBe(0);
    expect(b.totalFloat).toBe(0);
    expect(b.isCritical).toBe(true);
  });
});
