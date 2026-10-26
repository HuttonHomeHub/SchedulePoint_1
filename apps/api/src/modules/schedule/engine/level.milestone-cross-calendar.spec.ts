import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import {
  CROSS_DATA_DATE,
  link,
  middle,
  WEEKDAY_CAL,
  WEEKDAY_MINUTES,
  WEEKEND_CAL,
} from './compute.cross-calendar.fixture';
import { levelSchedule } from './level';
import type { EngineActivity } from './types';

/**
 * **The levelling overlay keeps a milestone's instant too** (#539 M2, ADR-0207 D1; `level.ts` link
 * push and zero-duration short-cut).
 *
 * Two weekend jobs share a crew, so one is pushed from Saturday to Sunday. The milestone that closes
 * it sits on the weekend calendar and the weekday work after it follows. Rolling the milestone's
 * pushed instant onto the weekend calendar put it at the NEXT weekend's opening, so the weekday work
 * after it started a week late in the overlay even though the unlevelled schedule, and the push itself,
 * only cost a day.
 */
const weekendJob = (id: string): EngineActivity => ({
  id,
  durationMinutes: 720,
  type: 'TASK',
  calendar: WEEKEND_CAL,
  constraintType: 'SNET',
  constraintDate: '2027-06-26',
});

describe('levelling a milestone between calendars (#539)', () => {
  const activities: EngineActivity[] = [
    weekendJob('V'),
    weekendJob('W'),
    middle('FINISH_MILESTONE', WEEKEND_CAL),
    { id: 'K', durationMinutes: 5 * WEEKDAY_MINUTES, type: 'TASK' },
  ];
  const edges = [link('W', 'M'), link('M', 'K')];
  const options = { dataDate: CROSS_DATA_DATE, calendar: WEEKDAY_CAL };
  const network = computeSchedule(activities, edges, options);

  it('pushes the weekend job a day and the weekday work after it no more than that', () => {
    const output = levelSchedule(
      activities,
      network,
      edges,
      [
        { activityId: 'V', resourceId: 'CREW', unitsPerHour: 1 },
        { activityId: 'W', resourceId: 'CREW', unitsPerHour: 1 },
      ],
      [{ id: 'CREW', capacity: 1 }],
      {
        levelWithinFloatOnly: false,
        dataDate: CROSS_DATA_DATE,
        planCalendar: WEEKDAY_CAL,
        anchor: 'PLACED',
      },
    );
    const byId = new Map(output.results.map((r) => [r.activityId, r]));
    const delayed = [byId.get('V')!, byId.get('W')!].filter((r) => (r.levelingDelay ?? 0) > 0);
    expect(delayed).toHaveLength(1);
    // Unlevelled, K starts Monday 2027-06-28. The crew conflict costs a day at most, so K may not
    // start later than Tuesday 06-29; with the milestone rolled to the next weekend it started 07-05.
    expect(byId.get('K')!.earlyStart).toBe('2027-06-28');
    const kLevelled = byId.get('K')!.leveledStart ?? byId.get('K')!.earlyStart;
    expect(kLevelled <= '2027-06-29').toBe(true);
  });
});

describe('levelling a finish milestone on the plan calendar after weekend work (#539)', () => {
  // V and W each work one weekend window (Sat 06-26 07:00-19:00) and share a crew, so one is pushed to Sun
  // 07:00-19:00. M, a finish milestone on the WEEKDAY plan calendar, follows W, and K, weekday work, follows M.
  const activities: EngineActivity[] = [
    { ...weekendJob('V'), durationMinutes: 720 },
    { ...weekendJob('W'), durationMinutes: 720 },
    middle('FINISH_MILESTONE'),
    { id: 'K', durationMinutes: 5 * WEEKDAY_MINUTES, type: 'TASK' },
  ];
  const edges = [link('W', 'M'), link('M', 'K')];
  const network = computeSchedule(activities, edges, {
    dataDate: CROSS_DATA_DATE,
    calendar: WEEKDAY_CAL,
  });

  it('dates the levelled milestone by the real minute before its instant, on a day its calendar does not work', () => {
    const output = levelSchedule(
      activities,
      network,
      edges,
      [
        { activityId: 'V', resourceId: 'CREW', unitsPerHour: 1 },
        { activityId: 'W', resourceId: 'CREW', unitsPerHour: 1 },
      ],
      [{ id: 'CREW', capacity: 1 }],
      {
        levelWithinFloatOnly: false,
        dataDate: CROSS_DATA_DATE,
        planCalendar: WEEKDAY_CAL,
        anchor: 'PLACED',
      },
    );
    const byId = new Map(output.results.map((r) => [r.activityId, r]));
    // Unlevelled M closes Saturday 19:00; W moves to Sunday, so levelled M closes Sunday 19:00. Neither is a
    // working minute on the plan calendar, so the dates are the real minute before each: Saturday, Sunday.
    expect(byId.get('M')!.earlyFinish).toBe('2027-06-26');
    expect(byId.get('M')!.leveledStart).toBe('2027-06-27');
    expect(byId.get('M')!.leveledFinish).toBe('2027-06-27');
    // K opens Monday 08:00 whether the milestone closes Saturday or Sunday evening, so it is not moved.
    expect(byId.get('K')!.leveledStart ?? byId.get('K')!.earlyStart).toBe('2027-06-28');
  });
});
