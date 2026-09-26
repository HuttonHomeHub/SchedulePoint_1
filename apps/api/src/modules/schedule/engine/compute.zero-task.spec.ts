import type { ActivityType, DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge } from './types';
import {
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * Zero-duration task ≠ milestone (M4-F1, ADR-0035 §22). A zero-duration `TASK` has an equal start and
 * finish (no work) but is scheduled as a **task**, not coerced to a milestone. The engine keeps the
 * task/milestone distinction by **TYPE** (`isMilestone`) — the project-finish tie-break's
 * "occupies its start instant" privilege keys off the milestone type, not `duration === 0`. The
 * distinction is **not** date-neutral: since ADR-0155 a finish milestone is dated by the day that
 * closes at its instant and a zero-duration task by the day that opens there, so after a task ending
 * Friday the two read Friday and Monday at the same instant (the project-finish case below asserts
 * exactly that). This docblock said "date-neutral" until 2026-09-26, and ADR-0155 and
 * `docs/TECH_DEBT.md` #384 attributed that phrase to ADR-0035 §22, which never carried it; §22 now
 * carries the date rule as an amendment (ADR-0162). The golden suite stays byte-identical because it
 * holds no finish milestone. Plan calendar: Mon–Fri full days, `DATA_DATE = 2026-01-05` (Mon).
 */
const DATA_DATE = '2026-01-05';
const DAY = 1440;
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);

function act(id: string, durationMinutes: number, type: ActivityType = 'TASK'): EngineActivity {
  return { id, durationMinutes, type };
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
  return computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar: FIVE_DAY });
}

describe('zero-duration task ≠ milestone (M4-F1, ADR-0035 §22)', () => {
  it('gives a zero-duration task an equal start and finish (no work), not a coerced milestone', () => {
    const z = run([act('Z', 0)]).results.find((r) => r.activityId === 'Z')!;
    expect(z.earlyStart).toBe('2026-01-05');
    expect(z.earlyFinish).toBe('2026-01-05'); // start = finish, but it is scheduled as a task
  });

  it('schedules a trailing zero-duration task as a real activity — its finish carries the project finish, like a milestone', () => {
    // A is a 5-day task: Mon 01-05 → Fri 01-09, its working time ending at the weekend. A FINISH
    // milestone and a zero-duration TASK FS-after A both sit at the same INSTANT (the next working
    // minute, Mon 01-12) and both carry the project finish — a zero-work marker still has a real finish.
    //
    // **Since #381 they no longer print the same day, and that is the change.** A finish milestone is
    // reported on the day it closes, its predecessor's last day (Fri 01-09), as P6 and NetPoint print
    // it. A zero-duration TASK keeps the start-dated reading (Mon 01-12): it is a task (§22), and moving
    // it too was decided against (ADR-0162 decision 1). This case said "both read Mon 01-12"
    // until the change; the instant, and so every successor, is unchanged.
    const withMilestone = run(
      [act('A', 5 * DAY), act('M', 0, 'FINISH_MILESTONE')],
      [edge('A', 'M')],
    );
    const withZeroTask = run([act('A', 5 * DAY), act('Z', 0, 'TASK')], [edge('A', 'Z')]);

    expect(withZeroTask.summary.projectFinish).toBe('2026-01-12');
    expect(withMilestone.summary.projectFinish).toBe('2026-01-09');
    // And the successor of a zero-duration task starts at its finish instant (it is a real activity).
    const chained = run(
      [act('A', 2 * DAY), act('Z', 0, 'TASK'), act('B', 1 * DAY)],
      [edge('A', 'Z'), edge('Z', 'B')],
    );
    const z = chained.results.find((r) => r.activityId === 'Z')!;
    const b = chained.results.find((r) => r.activityId === 'B')!;
    expect(z.earlyStart).toBe(z.earlyFinish); // zero work
    expect(b.earlyStart).toBe(z.earlyFinish); // B (FS) starts when Z finishes
  });
});
