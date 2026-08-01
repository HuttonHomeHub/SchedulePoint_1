import { ValidationError } from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';

import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  EmptyWorkingTimeCalendarError,
  type ShiftWindow,
  type TimeException,
  type WorkingTimeCalendar,
} from './engine';

/**
 * The machine-readable reason on the rejection above. Declared here beside the only thing that
 * raises it — `SCHEDULE_ERROR` re-exports it so callers keep one import for schedule reasons.
 */
export const CALENDAR_HAS_NO_WORKING_TIME = 'CALENDAR_HAS_NO_WORKING_TIME';

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

/**
 * {@link buildPlanCalendar}, with the engine's "no working time at all" condition mapped to a 422
 * that names the calendar — the shape every service seam wants, stated once.
 *
 * Both seams that build a calendar port reach this state identically (recalculation and baseline
 * variance), so the mapping lives here rather than being caught twice: a second copy would be free
 * to drift, and the half that drifted would be the one nobody exercises. That is the same argument
 * as `shiftRowsFor`/`exceptionWindowRowsFor` in the calendar repository, one layer up.
 *
 * Reachable from ordinary input since the window-only base week was accepted at the DTO
 * (TECH_DEBT #79): an empty week is legitimate the moment a working exception gives it hours, and
 * nothing but a mistake until then. It answered an opaque 500 — a user-caused, user-fixable state
 * reported as a server fault.
 */
export function buildPlanCalendarOrReject(
  calendar: (PlanCalendarInput & { name?: string }) | null,
  calendarId: string | null,
): WorkingTimeCalendar {
  try {
    return buildPlanCalendar(calendar);
  } catch (error) {
    if (error instanceof EmptyWorkingTimeCalendarError) {
      throw new ValidationError(
        `The calendar “${calendar?.name ?? 'assigned to this plan'}” has no working time: its ` +
          'weekly pattern is empty and it has no working exception, so nothing can be scheduled ' +
          'on it. Add working days to the week, or a dated exception with hours.',
        { reason: CALENDAR_HAS_NO_WORKING_TIME, calendarId },
      );
    }
    throw error;
  }
}
