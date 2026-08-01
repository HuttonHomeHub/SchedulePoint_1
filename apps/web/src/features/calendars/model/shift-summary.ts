import { MINUTES_PER_CALENDAR_DAY, type CalendarShift } from '@repo/types';

/**
 * Does this calendar's week carry detail the 7-bit weekday mask cannot express?
 *
 * True when any day works partial hours, or works more than one window (a split shift). The mask
 * can only say *whether* a weekday works, so for these calendars it is a lossy summary — and the
 * form's seven checkboxes are a lossy editor.
 *
 * This is the predicate behind two behaviours that must agree: the advisory telling a planner their
 * week is shown simplified, and (Q5) the library table's "· 2 shifts" suffix. One derivation rather
 * than two, because a table that says "Mon–Fri" beside a form that says "simplified" is worse than
 * either alone.
 */
export function hasIntradayDetail(shifts: readonly CalendarShift[]): boolean {
  const perWeekday = new Map<number, number>();
  for (const shift of shifts) {
    if (shift.startMinute !== 0 || shift.endMinute !== MINUTES_PER_CALENDAR_DAY) return true;
    perWeekday.set(shift.weekday, (perWeekday.get(shift.weekday) ?? 0) + 1);
  }
  return [...perWeekday.values()].some((count) => count > 1);
}

/** How many windows the busiest weekday works — the "· N shifts" the library table appends (Q5). */
export function maxWindowsPerDay(shifts: readonly CalendarShift[]): number {
  const perWeekday = new Map<number, number>();
  for (const shift of shifts) {
    perWeekday.set(shift.weekday, (perWeekday.get(shift.weekday) ?? 0) + 1);
  }
  return Math.max(0, ...perWeekday.values());
}
