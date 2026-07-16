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
 * "occupies its start instant" privilege keys off the milestone type, not `duration === 0`. In the
 * current date model that distinction is **date-neutral** (a zero-duration task still has a real
 * finish, so it carries the project finish exactly as a milestone at the same instant would), which is
 * precisely why the golden suite stays byte-identical; the change expresses §22's intent in code and
 * future-proofs the type-vs-duration seam (resources, duration-type rules). Plan calendar: Mon–Fri
 * full days, `DATA_DATE = 2026-01-05` (Mon).
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
    // A is a 5-day task: Mon 01-05 → its finish rolls to Mon 01-12 (across the weekend). A FINISH
    // milestone and a zero-duration TASK FS-after A both sit at A's finish and carry the project finish
    // to Mon 01-12 — a zero-work marker still has a real finish. The §22 task-vs-milestone distinction
    // is kept by type in the engine and is date-neutral here (proven by the byte-identical golden suite).
    const withMilestone = run(
      [act('A', 5 * DAY), act('M', 0, 'FINISH_MILESTONE')],
      [edge('A', 'M')],
    );
    const withZeroTask = run([act('A', 5 * DAY), act('Z', 0, 'TASK')], [edge('A', 'Z')]);

    expect(withZeroTask.summary.projectFinish).toBe('2026-01-12');
    expect(withZeroTask.summary.projectFinish).toBe(withMilestone.summary.projectFinish);
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
