import {
  absMinutesToInstant,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * Absolute-working-instant arithmetic for the CPM engine (ADR-0037). Positions are
 * **minutes-from-epoch** (calendar-agnostic, monotonic — see {@link instantToAbsMinutes}), so
 * activities on different calendars are comparable in one frame. Each helper resolves the
 * start-vs-finish gap ambiguity the offset axis papered over: an activity's **start** sits at
 * the post-gap beginning of a working minute (`rollForwardToWorking`), its **finish** at the
 * pre-gap end boundary (`rollBackwardToWorking`). Getting this wrong makes the forward and
 * backward passes non-inverse across a non-working gap (spurious float).
 */

/** First working-minute START at or after `abs` on `cal` (identity when `abs` already is one). */
export function rollForwardToWorking(cal: WorkingTimeCalendar, abs: number): number {
  // Advance one working minute (lands at the end of the first working minute ≥ abs), then step
  // back a single real minute to its start. Identity when abs is already a working-minute start.
  return instantToAbsMinutes(cal.addWorkingTime(absMinutesToInstant(abs), 1)) - 1;
}

/** Largest working-minute END boundary at or before `abs` on `cal`, measured from `dataDateAbs`. */
export function rollBackwardToWorking(
  cal: WorkingTimeCalendar,
  dataDateAbs: number,
  abs: number,
): number {
  // The count of working minutes up to `abs` pins it to the last whole working minute ≤ abs; its
  // end boundary is that count of working-minutes from the data date. Mirrors the forward roll.
  const from = absMinutesToInstant(dataDateAbs);
  const n = cal.workingTimeBetween(from, absMinutesToInstant(abs));
  return instantToAbsMinutes(cal.addWorkingTime(from, n));
}

/** The instant `minutes` working-minutes from `abs` on `cal` (negative walks backward). */
export function advanceWorking(cal: WorkingTimeCalendar, abs: number, minutes: number): number {
  if (minutes === 0) return abs;
  return instantToAbsMinutes(cal.addWorkingTime(absMinutesToInstant(abs), minutes));
}

/** Working-minutes from `dataDateAbs` to `abs` on `cal` — the position as a calendar offset. */
export function offsetFromDataDate(
  cal: WorkingTimeCalendar,
  dataDateAbs: number,
  abs: number,
): number {
  return cal.workingTimeBetween(absMinutesToInstant(dataDateAbs), absMinutesToInstant(abs));
}
