import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

const MILLIS_PER_DAY = 86_400_000;

/**
 * The engine's seam onto the working-day calendar (ADR-0023). The CPM passes
 * work in continuous working-day **offsets** from the data date; this port maps
 * those offsets to and from real calendar days, and converts a constraint's
 * calendar date into an offset. Keeping the surface to just add/between means the
 * M5 Calendars slice can supply a real calendar (weekends, holidays, per-activity
 * calendars) with **no change to the engine**.
 *
 * All dates are strict `YYYY-MM-DD` calendar days (no time, no timezone).
 */
export interface WorkingDayCalendar {
  /**
   * The calendar day `n` working days from `date` (negative `n` walks backward).
   * Zero returns `date`. Inverse of {@link workingDaysBetween}:
   * `addWorkingDays(from, workingDaysBetween(from, to)) === to`.
   */
  addWorkingDays(date: string, n: number): string;

  /**
   * The signed number of working days from `from` to `to` — how many
   * {@link addWorkingDays} steps carry `from` to `to`. Positive when `to` is
   * later, negative when earlier, zero when equal.
   */
  workingDaysBetween(from: string, to: string): number;
}

/**
 * The trivial calendar where **every calendar day is a working day**, so a
 * working-day offset maps 1:1 onto a calendar-day offset. This is the MVP
 * implementation (M6); the real M5 calendar replaces it behind the same port
 * without touching the engine.
 */
export const allDaysWorkCalendar: WorkingDayCalendar = {
  addWorkingDays(date: string, n: number): string {
    const d = parseCalendarDate(date);
    d.setUTCDate(d.getUTCDate() + n);
    return formatCalendarDate(d);
  },

  workingDaysBetween(from: string, to: string): number {
    const millis = parseCalendarDate(to).getTime() - parseCalendarDate(from).getTime();
    return Math.round(millis / MILLIS_PER_DAY);
  },
};
