import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import {
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * Progress-ingestion tests (M2, ADR-0035 §1–§2). A **complete** activity freezes on its actual
 * start/finish (logic and the data date never move it); an **in-progress** one keeps its frozen
 * actual start while its remaining work reschedules forward, floored at the data date; an activity
 * with no actuals is the ordinary planned case (byte-identical — the golden suite is the gate).
 *
 * Plan calendar: **Mon–Fri, full days**. `DATA_DATE = 2026-01-05` is a Monday; `DAY = 1440`
 * working-minutes = one full day. Reference weekdays: 12-29 Mon … 01-02 Fri, 01-05 Mon … 01-09 Fri.
 */
const DATA_DATE = '2026-01-05';
const DAY = 1440;
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);

function task(
  id: string,
  durationMinutes: number,
  progress: Partial<EngineActivity> = {},
): EngineActivity {
  return { id, durationMinutes, type: 'TASK', ...progress };
}

function edge(
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
  lagMinutes = 0,
): EngineEdge {
  return { id: `${predecessorId}-${successorId}`, predecessorId, successorId, type, lagMinutes };
}

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[] = []) {
  const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: FIVE_DAY });
  return new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
}

describe('progress ingestion (M2, ADR-0035 §1–§2)', () => {
  it('freezes a completed activity on its actual dates, ignoring the data date and duration', () => {
    // A finished Mon 12-29 → Fri 01-02 (before the data date). Its planned duration is irrelevant:
    // it is frozen on the actuals, unlike an unprogressed activity which starts at the data date.
    const complete = run([
      task('A', 5 * DAY, { actualStart: '2025-12-29', actualFinish: '2026-01-02' }),
    ]).get('A')!;
    expect(complete.earlyStart).toBe('2025-12-29');
    expect(complete.earlyFinish).toBe('2026-01-02');
    expect(complete.totalFloat).toBe(0); // a completed activity carries zero float

    const planned = run([task('A', 5 * DAY)]).get('A')!;
    expect(planned.earlyStart).toBe('2026-01-05'); // the unprogressed baseline differs
    expect(complete.earlyStart).not.toBe(planned.earlyStart);
  });

  it('gates a not-started successor off the completed predecessor’s ACTUAL finish (retained logic)', () => {
    // A completed early (Mon–Tue actual, though planned 5 days). B (not started) starts the next
    // working day after A's ACTUAL finish — earlier than if A ran its full planned duration.
    const byId = run(
      [
        task('A', 5 * DAY, { actualStart: '2026-01-05', actualFinish: '2026-01-06' }),
        task('B', 3 * DAY),
      ],
      [edge('A', 'B')],
    );
    expect(byId.get('B')!.earlyStart).toBe('2026-01-07'); // Wed, day after the Tue actual finish
    expect(byId.get('B')!.earlyFinish).toBe('2026-01-09'); // + 3 working days

    // If A were unprogressed (Mon 01-05 → Fri 01-09), B would not start until Mon 01-12.
    const plannedB = run([task('A', 5 * DAY), task('B', 3 * DAY)], [edge('A', 'B')]).get('B')!;
    expect(plannedB.earlyStart).toBe('2026-01-12');
  });

  it('floors an in-progress activity’s REMAINING work at the data date, keeping the frozen start', () => {
    // A started Mon 12-29 with 2 days of work left. Its start is frozen in the past; the remaining
    // 2 days schedule from the data date (Mon 01-05) → inclusive Tue 01-06 — never before the data date.
    const inProgress = run([
      task('A', 5 * DAY, { actualStart: '2025-12-29', remainingMinutes: 2 * DAY }),
    ]).get('A')!;
    expect(inProgress.earlyStart).toBe('2025-12-29'); // frozen actual start (before the data date)
    expect(inProgress.earlyFinish).toBe('2026-01-06'); // data date + 2 remaining working days

    // Distinct from a full 5-day activity from the data date (which finishes Fri 01-09).
    expect(inProgress.earlyFinish).not.toBe(run([task('A', 5 * DAY)]).get('A')!.earlyFinish);
  });

  it('honours the explicit remaining duration over the planned duration', () => {
    // Same planned 5-day activity, two different remainings → different finishes from the data date.
    const oneLeft = run([
      task('A', 5 * DAY, { actualStart: '2025-12-29', remainingMinutes: 1 * DAY }),
    ]).get('A')!;
    const fourLeft = run([
      task('A', 5 * DAY, { actualStart: '2025-12-29', remainingMinutes: 4 * DAY }),
    ]).get('A')!;
    expect(oneLeft.earlyFinish).toBe('2026-01-05'); // 1 day from Mon 01-05 = Mon 01-05
    expect(fourLeft.earlyFinish).toBe('2026-01-08'); // 4 days from Mon 01-05 = Thu 01-08
  });

  it('clamps a lead (negative lag) into remaining work to the data date (N13)', () => {
    // B is in progress with a 1-day lead (FS −1d) from A, which finished in the past. The lead would
    // pull the remaining work before the data date; it is clamped to the data date (ADR-0035 §2).
    const byId = run(
      [
        task('A', 2 * DAY, { actualStart: '2025-12-29', actualFinish: '2025-12-31' }),
        task('B', 5 * DAY, { actualStart: '2025-12-30', remainingMinutes: 2 * DAY }),
      ],
      [edge('A', 'B', 'FS', -1 * DAY)],
    );
    expect(byId.get('B')!.earlyStart).toBe('2025-12-30'); // frozen actual start
    expect(byId.get('B')!.earlyFinish).toBe('2026-01-06'); // remaining floored at data date, +2d
  });

  it('is byte-identical to the pre-progress result when no activity carries actuals', () => {
    // Sanity: a network with progress fields all absent matches the plain planned computation
    // (the same guarantee the golden suite enforces across the whole fixture).
    const edges = [edge('A', 'B'), edge('B', 'C')];
    const activities = [task('A', 2 * DAY), task('B', 3 * DAY), task('C', 1 * DAY)];
    const byId = run(activities, edges);
    expect(byId.get('A')!.earlyStart).toBe('2026-01-05');
    expect(byId.get('C')!.earlyFinish).toBe('2026-01-12'); // A(2d)+B(3d)+C(1d) across the weekend
    // Every activity on this simple chain is on the single critical path → zero float.
    expect(byId.get('B')!.totalFloat).toBe(0);
  });
});
