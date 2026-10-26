import type { ActivityType, DependencyType } from '@repo/types';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import { buildWorkingTimeCalendar, type WorkingTimeCalendar } from './working-time-calendar';

/**
 * The `docs/TECH_DEBT.md` #539 fixture, shared by the two engine specs that pin it
 * (`compute.activity-calendar.spec.ts`, `compute.finish-milestone.spec.ts`;
 * `docs/specs/milestone-cross-calendar/`).
 *
 * Plan calendar Mon–Fri 08:00–16:00; a weekend calendar Sat–Sun 07:00–19:00; data date Monday
 * 2027-06-14. `A` (5 weekday days) → `W` (1,440 weekend minutes, `SNET` Sat 2027-06-26, so it works
 * Sat 07:00 to Sun 19:00) → `M` (zero duration, on whichever calendar the case names) → `K`
 * (5 weekday days) → `F`, a finish milestone with `FNLT` Fri 2027-07-09. All links are FS, no lag.
 */
export const CROSS_DATA_DATE = '2027-06-14';
/** One working day on the plan calendar (08:00–16:00). */
export const WEEKDAY_MINUTES = 480;

const WEEKDAY_WINDOW = [{ startMinute: 480, endMinute: 960 }];
const WEEKEND_WINDOW = [{ startMinute: 420, endMinute: 1140 }];

export const WEEKDAY_CAL: WorkingTimeCalendar = buildWorkingTimeCalendar(
  [WEEKDAY_WINDOW, WEEKDAY_WINDOW, WEEKDAY_WINDOW, WEEKDAY_WINDOW, WEEKDAY_WINDOW, [], []],
  [],
);
export const WEEKEND_CAL: WorkingTimeCalendar = buildWorkingTimeCalendar(
  [[], [], [], [], [], WEEKEND_WINDOW, WEEKEND_WINDOW],
  [],
);

export function link(
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
): EngineEdge {
  return {
    id: `${predecessorId}-${successorId}`,
    predecessorId,
    successorId,
    type,
    lagMinutes: 0,
  };
}

/** The zero-span activity in the middle: its type and calendar are what each case varies. */
export function middle(
  type: ActivityType,
  calendar?: WorkingTimeCalendar,
  extra: Partial<EngineActivity> = {},
): EngineActivity {
  return { id: 'M', durationMinutes: 0, type, ...(calendar ? { calendar } : {}), ...extra };
}

/** `A → W → M → K → F` with `M` supplied; `W`'s `SNET` and `F`'s `FNLT` as in the row. */
export function crossCalendarNetwork(m: EngineActivity): {
  activities: EngineActivity[];
  edges: EngineEdge[];
} {
  return {
    activities: [
      { id: 'A', durationMinutes: 5 * WEEKDAY_MINUTES, type: 'TASK' },
      {
        id: 'W',
        durationMinutes: 1440,
        type: 'TASK',
        calendar: WEEKEND_CAL,
        constraintType: 'SNET',
        constraintDate: '2027-06-26',
      },
      m,
      { id: 'K', durationMinutes: 5 * WEEKDAY_MINUTES, type: 'TASK' },
      {
        id: 'F',
        durationMinutes: 0,
        type: 'FINISH_MILESTONE',
        constraintType: 'FNLT',
        constraintDate: '2027-07-09',
      },
    ],
    edges: [link('A', 'W'), link('W', 'M'), link('M', 'K'), link('K', 'F')],
  };
}

export function runCrossCalendar(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
) {
  const out = computeSchedule(activities, edges, {
    dataDate: CROSS_DATA_DATE,
    calendar: WEEKDAY_CAL,
  });
  const byId = new Map<string, EngineResult>(out.results.map((r) => [r.activityId, r]));
  return { out, get: (id: string) => byId.get(id)! };
}
