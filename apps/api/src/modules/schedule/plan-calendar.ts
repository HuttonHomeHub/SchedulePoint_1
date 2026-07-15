import { formatCalendarDate } from '../../common/validation/calendar-date';

import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  type ShiftWindow,
  type TimeException,
  type WorkingTimeCalendar,
} from './engine';

/** One weekday shift window as loaded from the `calendar_shifts` table (minute-granular). */
export interface PlanCalendarShift {
  /** Monday = 0 … Sunday = 6. */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** One dated exception as loaded from `calendar_exceptions` + its replacement `windows`. */
export interface PlanCalendarException {
  startDate: Date;
  endDate: Date;
  windows: readonly { startMinute: number; endMinute: number }[];
}

/** A plan's stored calendar (the real shift/window rows) as the engine port needs it. */
export interface PlanCalendarInput {
  shifts: readonly PlanCalendarShift[];
  exceptions: readonly PlanCalendarException[];
}

/**
 * Build the engine's minute-granular working-time calendar (ADR-0036 §2) DIRECTLY
 * from a plan calendar's stored shift + exception-window rows. A null calendar (no
 * `calendarId`, or a missing/soft-deleted calendar) falls back to the all-minutes
 * calendar, so the null path stays byte-identical to the working-day engine and the
 * golden suite holds.
 *
 * The weekly pattern is a 7-element array (index `w` = weekday `w`'s sorted windows);
 * each exception becomes a `TimeException` over its inclusive `[startDate, endDate]`
 * range with its sorted replacement windows (zero windows = a holiday).
 */
export function buildPlanCalendar(calendar: PlanCalendarInput | null): WorkingTimeCalendar {
  if (!calendar) return allMinutesWorkCalendar;

  const weekly: ShiftWindow[][] = Array.from({ length: 7 }, () => []);
  for (const shift of [...calendar.shifts].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
  )) {
    weekly[shift.weekday]?.push({ startMinute: shift.startMinute, endMinute: shift.endMinute });
  }

  const exceptions: TimeException[] = calendar.exceptions.map((exception) => ({
    startDate: formatCalendarDate(exception.startDate),
    endDate: formatCalendarDate(exception.endDate),
    windows: [...exception.windows]
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((w) => ({ startMinute: w.startMinute, endMinute: w.endMinute })),
  }));

  return buildWorkingTimeCalendar(weekly, exceptions);
}
