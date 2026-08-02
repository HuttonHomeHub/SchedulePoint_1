import { MINUTES_PER_CALENDAR_DAY, type CalendarShift, type CalendarWindow } from '@repo/types';

import { formatTimeOfDay } from './time-of-day';

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

/**
 * A window set as one readable line — `08:00–12:00, 13:00–17:00`.
 *
 * Used wherever hours are *shown* rather than edited (an exception row, a read-only day), so the
 * separator and the dash are decided once. A full day is named rather than printed as `00:00–24:00`,
 * which reads as a data artefact; an empty set returns `''` and the caller says what nothing means
 * in its own context ("Holiday" on an exception, "Not worked" on a weekday).
 */
export function formatWindowList(windows: readonly CalendarWindow[]): string {
  if (windows.length === 0) return '';
  if (
    windows.length === 1 &&
    windows[0]!.startMinute === 0 &&
    windows[0]!.endMinute === MINUTES_PER_CALENDAR_DAY
  ) {
    return 'All day';
  }
  return windows
    .map((window) => `${formatTimeOfDay(window.startMinute)}–${formatTimeOfDay(window.endMinute)}`)
    .join(', ');
}

/** How many windows the busiest weekday works — the "· N shifts" the library table appends (Q5). */
export function maxWindowsPerDay(shifts: readonly CalendarShift[]): number {
  const perWeekday = new Map<number, number>();
  for (const shift of shifts) {
    perWeekday.set(shift.weekday, (perWeekday.get(shift.weekday) ?? 0) + 1);
  }
  return Math.max(0, ...perWeekday.values());
}
