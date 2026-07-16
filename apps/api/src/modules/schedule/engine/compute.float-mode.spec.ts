import { describe, expect, it } from 'vitest';

import { computeSchedule, type ComputeOptions } from './compute';
import type { EngineActivity, EngineResult, TotalFloatMode } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * Total-float mode goldens (M6-F3, ADR-0035 §18). `totalFloat` can be measured as late−early FINISH
 * (`FINISH`, the P6 default), late−early START (`START`), or the lesser (`SMALLEST`). On a single
 * calendar the start- and finish-side spans of an **unprogressed** activity are always equal (advancing
 * both ends by the duration preserves the working-time gap), so the three modes coincide — the
 * byte-identical default. They diverge for a **progressed** activity, whose late start is frozen on its
 * actual start (start float collapses to 0) while its finish float reflects the remaining work; the
 * fixture's divergence (S13) is the mixed-calendar analogue. 24/7 calendar, 1 day = 1440 minutes.
 */

const DATA_DATE = '2026-01-05';
const DAY = 1440;

const task = (
  id: string,
  durationDays: number,
  over: Partial<EngineActivity> = {},
): EngineActivity => ({
  id,
  durationMinutes: durationDays * DAY,
  type: 'TASK',
  ...over,
});

function run(
  activities: readonly EngineActivity[],
  mode: TotalFloatMode,
  extra: Partial<ComputeOptions> = {},
) {
  const output = computeSchedule(activities, [], {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
    totalFloatMode: mode,
    ...extra,
  });
  return new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
}

describe('computeSchedule — total-float mode (M6-F3)', () => {
  it('coincides across modes for an unprogressed activity (byte-identical default)', () => {
    // C(3) floats under the 10-day open-ended pole X. Start- and finish-side float are equal, so all
    // three modes report the same value — the parity guarantee for the all-inherit, unprogressed path.
    const activities = [task('C', 3), task('X', 10)];
    const finish = run(activities, 'FINISH').get('C')!.totalFloat;
    const start = run(activities, 'START').get('C')!.totalFloat;
    const smallest = run(activities, 'SMALLEST').get('C')!.totalFloat;
    expect(finish).toBe(7 * DAY); // 10-day pole − 3-day activity
    expect(start).toBe(finish);
    expect(smallest).toBe(finish);
  });

  it('diverges for a progressed activity: START collapses on the frozen actual start', () => {
    // A started 01-01 with 2 days left; it reschedules its remaining from the data date (→ finish 01-07)
    // and floats under the 10-day open-ended pole X (project finish 01-15). Its FINISH float is the
    // 8-day gap to the pole; its late start is frozen on the actual start, so START (and SMALLEST) is 0.
    const activities = [
      task('A', 5, { actualStart: '2026-01-01', remainingMinutes: 2 * DAY }),
      task('X', 10),
    ];
    expect(run(activities, 'FINISH').get('A')!.totalFloat).toBe(8 * DAY);
    expect(run(activities, 'START').get('A')!.totalFloat).toBe(0);
    expect(run(activities, 'SMALLEST').get('A')!.totalFloat).toBe(0);
  });

  it('SMALLEST takes the lesser of the two spans', () => {
    // Same progressed activity: SMALLEST = min(START 0, FINISH 8 days) = 0.
    const activities = [
      task('A', 5, { actualStart: '2026-01-01', remainingMinutes: 2 * DAY }),
      task('X', 10),
    ];
    const start = run(activities, 'START').get('A')!.totalFloat;
    const finish = run(activities, 'FINISH').get('A')!.totalFloat;
    expect(run(activities, 'SMALLEST').get('A')!.totalFloat).toBe(Math.min(start, finish));
  });
});
