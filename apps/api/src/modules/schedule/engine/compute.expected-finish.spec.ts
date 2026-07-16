import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * Expected Finish (ADR-0035 §9, M4-F5). With the plan option `useExpectedFinishDates` on, any
 * **incomplete** activity that carries an `expectedFinish` has its work recomputed so its early finish
 * lands on that date (its working-end boundary) — an in-progress activity's remaining, a not-started
 * one's full duration (the ADR §9 example A6200 is not-started). Floored at the scheduled start — a
 * past target collapses to zero. Off, or for a complete activity, the target is ignored and the
 * schedule is byte-identical to the pure-progress path.
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const inProgress = (id: string, overrides: Partial<EngineActivity> = {}): EngineActivity => ({
  id,
  durationMinutes: 10 * DAY,
  type: 'TASK',
  actualStart: '2025-12-20', // started before the data date → its remaining reschedules forward
  remainingMinutes: 4 * DAY,
  ...overrides,
});

function run(activities: readonly EngineActivity[], useExpectedFinishDates: boolean) {
  const output = computeSchedule(activities, [], {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
    useExpectedFinishDates,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

describe('expected finish — remaining resize (ADR-0035 §9)', () => {
  it('with the option ON, resizes the remaining so the early finish lands on the expected date', () => {
    const a = inProgress('A', { expectedFinish: '2026-01-08' });
    const on = run([a], true);
    expect(on.byId.get('A')!.earlyFinish).toBe('2026-01-08');
    expect(on.summary.expectedFinishAppliedCount).toBe(1);
  });

  it('with the option OFF, the pure-progress remaining stands (a different, logic-driven finish)', () => {
    const a = inProgress('A', { expectedFinish: '2026-01-08' });
    const off = run([a], false);
    // 4 working days remain from the data date → inclusive finish 2026-01-04 (not the 01-08 target).
    expect(off.byId.get('A')!.earlyFinish).toBe('2026-01-04');
    expect(off.summary.expectedFinishAppliedCount).toBe(0);
  });

  it('floors a past expected finish at the rescheduled start (zero remaining), still counted', () => {
    const a = inProgress('A', { expectedFinish: '2025-12-28' }); // before the data date
    const on = run([a], true);
    // The remaining collapses to zero → the finish is floored at the data date (offset 0), never earlier.
    expect(on.byId.get('A')!.earlyFinishOffset).toBe(0);
    expect(on.summary.expectedFinishAppliedCount).toBe(1);
  });

  it('resizes a NOT-started activity’s full duration to the expected finish (ADR §9 A6200 is not-started)', () => {
    const notStarted: EngineActivity = {
      id: 'A',
      durationMinutes: 3 * DAY,
      type: 'TASK',
      expectedFinish: '2026-01-20',
    };
    const on = run([notStarted], true);
    // The full duration is recomputed so the finish lands on the target (01-20), not the 3-day plan.
    expect(on.byId.get('A')!.earlyStart).toBe('2026-01-01');
    expect(on.byId.get('A')!.earlyFinish).toBe('2026-01-20');
    expect(on.summary.expectedFinishAppliedCount).toBe(1);

    // With the option off it takes its ordinary 3-day duration → inclusive finish 2026-01-03.
    const off = run([notStarted], false);
    expect(off.byId.get('A')!.earlyFinish).toBe('2026-01-03');
    expect(off.summary.expectedFinishAppliedCount).toBe(0);
  });

  it('ignores an expected finish on a COMPLETE activity (frozen on its actuals)', () => {
    const complete: EngineActivity = {
      id: 'A',
      durationMinutes: 3 * DAY,
      type: 'TASK',
      actualStart: '2025-12-20',
      actualFinish: '2025-12-30',
      expectedFinish: '2026-01-20',
    };
    const on = run([complete], true);
    expect(on.byId.get('A')!.earlyFinish).toBe('2025-12-30'); // frozen actual finish
    expect(on.summary.expectedFinishAppliedCount).toBe(0);
  });
});
