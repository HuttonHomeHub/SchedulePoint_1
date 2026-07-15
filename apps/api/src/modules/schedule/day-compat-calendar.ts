import { WorkingWeekdays } from '@repo/types';

import { formatCalendarDate } from '../../common/validation/calendar-date';

import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './engine';

/** Minutes in one full calendar day — the fixed day↔minute factor (ADR-0036 §4.2, `M = 1440`). */
export const MINUTES_PER_DAY = 1440;

/** A stored calendar's current day-granular shape (7-bit weekday mask + whole-day exceptions). */
export interface DayCalendarInput {
  workingWeekdays: number;
  exceptions: readonly { date: Date; isWorking: boolean }[];
}

/**
 * The **M1 compatibility shim** (ADR-0036 §4.2): project a still-day-granular stored
 * calendar (weekday mask + whole-day exceptions) onto the minute-native engine port.
 * Each working weekday becomes a full 24 h window `[0, 1440)` and each whole-day
 * exception becomes a single-day range (worked ⇒ one full-day window; holiday ⇒ no
 * windows). Because the factor `M = 1440` equals the per-day window length, a plan's
 * dates are identical to the working-day engine — the golden-suite invariant.
 *
 * This shim exists only while the storage is still mask-based; the storage rework
 * (schema → shift tables) replaces it with the real shift pattern.
 */
export function buildDayCompatCalendar(calendar: DayCalendarInput | null): WorkingTimeCalendar {
  if (!calendar) return allMinutesWorkCalendar;
  return buildWorkingTimeCalendar(
    fullDayWeek(WorkingWeekdays.toIndices(calendar.workingWeekdays)),
    calendar.exceptions.map((e) => {
      const date = formatCalendarDate(e.date);
      return {
        startDate: date,
        endDate: date,
        windows: e.isWorking ? [{ startMinute: 0, endMinute: MINUTES_PER_DAY }] : [],
      };
    }),
  );
}
