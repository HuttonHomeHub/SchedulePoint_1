import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * The near-critical band is five working days of the activity's OWN calendar (`docs/TECH_DEBT.md`
 * #522, product-owner decision 2026-10-19), not a fixed 7,200 working minutes. On an eight-hour
 * calendar 7,200 minutes is fifteen days, so the old band flagged activities the planner reads as
 * having six, ten or fifteen days of float.
 */
const DATA_DATE = '2026-01-05';
const EIGHT_HOUR_MINUTES = 480;
const DEFAULT_DAY_MINUTES = 1440;

/** Every weekday 08:00–16:00: eight working hours, so one working day is 480 minutes. */
const EIGHT_HOUR_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(
  Array.from({ length: 7 }, () => [{ startMinute: 480, endMinute: 960 }]),
  [],
);

const edge = (predecessorId: string, successorId: string): EngineEdge => ({
  id: `${predecessorId}-${successorId}`,
  predecessorId,
  successorId,
  type: 'FS',
  lagMinutes: 0,
});

/**
 * A(10 days) is the critical chain; B(`bDays`) runs in parallel into the same finish milestone, so
 * B's float is (10 − bDays) days of the calendar they share.
 */
function floatOfB(
  bDays: number,
  dayMinutes: number,
  calendar: WorkingTimeCalendar,
  dayFactorMinutes?: number,
): EngineResult {
  const factor = dayFactorMinutes === undefined ? {} : { dayFactorMinutes };
  const activities: EngineActivity[] = [
    { id: 'A', durationMinutes: 10 * dayMinutes, type: 'TASK', ...factor },
    { id: 'B', durationMinutes: bDays * dayMinutes, type: 'TASK', ...factor },
    { id: 'E', durationMinutes: 0, type: 'FINISH_MILESTONE', ...factor },
  ];
  const output = computeSchedule(activities, [edge('A', 'E'), edge('B', 'E')], {
    dataDate: DATA_DATE,
    calendar,
  });
  return output.results.find((r) => r.activityId === 'B')!;
}

describe('near-critical band — five working days of the activity’s own calendar (#522)', () => {
  it('flags five days of float on an eight-hour calendar', () => {
    const b = floatOfB(5, EIGHT_HOUR_MINUTES, EIGHT_HOUR_DAY, EIGHT_HOUR_MINUTES);
    expect(b.totalFloat).toBe(5 * EIGHT_HOUR_MINUTES);
    expect(b.isNearCritical).toBe(true);
  });

  it('does not flag six days of float on an eight-hour calendar', () => {
    const b = floatOfB(4, EIGHT_HOUR_MINUTES, EIGHT_HOUR_DAY, EIGHT_HOUR_MINUTES);
    // 2,880 working minutes: inside the old fixed 7,200 band, outside five 480-minute days.
    expect(b.totalFloat).toBe(6 * EIGHT_HOUR_MINUTES);
    expect(b.isNearCritical).toBe(false);
  });

  it('keeps the 24-hour calendar on the five-day, 7,200-minute band', () => {
    const atEdge = floatOfB(5, DEFAULT_DAY_MINUTES, allMinutesWorkCalendar, DEFAULT_DAY_MINUTES);
    expect(atEdge.totalFloat).toBe(7200);
    expect(atEdge.isNearCritical).toBe(true);
    const past = floatOfB(4, DEFAULT_DAY_MINUTES, allMinutesWorkCalendar, DEFAULT_DAY_MINUTES);
    expect(past.totalFloat).toBe(8640);
    expect(past.isNearCritical).toBe(false);
  });

  it('treats an activity that states no day factor as a 24-hour day', () => {
    const b = floatOfB(5, DEFAULT_DAY_MINUTES, allMinutesWorkCalendar);
    expect(b.isNearCritical).toBe(true);
  });
});
