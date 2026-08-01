import {
  DEFAULT_HOURS_PER_DAY_MINUTES,
  deriveHoursPerDayMinutes,
  WorkingWeekdays,
  type CalendarShift,
} from '@repo/types';

const MINUTES_PER_HOUR = 60;

/**
 * The calendar's standard working day, in minutes, for a create or an update (ADR-0068 §1).
 *
 * **This is the whole safety argument for `hours_per_day_minutes NOT NULL DEFAULT 1440`.** The
 * column is not derived on read — a standing derivation would make the day↔minute factor a
 * function of the shift rows, so shortening one Friday would silently reinterpret the stored
 * duration of every activity on the calendar. Instead the factor is co-written with the pattern,
 * here, at the two seams that write one. A pattern stored without its factor is exactly the trap
 * this decision exists to close, which is why the seam set is pinned by a structural test rather
 * than left to care.
 *
 * Precedence:
 * 1. an explicit `hoursPerDay` from the client always wins — P6 users type this number;
 * 2. otherwise, if a weekly pattern is being written, derive a default from it;
 * 3. otherwise keep what the row already holds (an edit that only renames the calendar must not
 *    move its durations), falling back to the 24-hour constant for a create.
 */
export function resolveHoursPerDayMinutes(input: {
  hoursPerDay?: number | undefined;
  workingWeekdays?: number | undefined;
  shifts?: readonly CalendarShift[] | undefined;
  current?: number | undefined;
}): number {
  if (input.hoursPerDay !== undefined) return Math.round(input.hoursPerDay * MINUTES_PER_HOUR);
  const pattern = patternOf(input);
  if (pattern !== undefined) return deriveHoursPerDayMinutes(pattern);
  return input.current ?? DEFAULT_HOURS_PER_DAY_MINUTES;
}

/**
 * The week being written, in the storage form, or `undefined` when this write does not touch it.
 *
 * Mirrors the repository's `shiftRowsFor` precedence (explicit shifts win; a mask expands to
 * full-day windows) rather than restating it loosely: the factor must be derived from the *same*
 * rows that are about to be stored, or it describes a week the calendar does not have.
 */
function patternOf(input: {
  workingWeekdays?: number | undefined;
  shifts?: readonly CalendarShift[] | undefined;
}): readonly CalendarShift[] | undefined {
  if (input.shifts !== undefined) return input.shifts;
  if (input.workingWeekdays !== undefined)
    return WorkingWeekdays.toFullDayShifts(input.workingWeekdays);
  return undefined;
}
