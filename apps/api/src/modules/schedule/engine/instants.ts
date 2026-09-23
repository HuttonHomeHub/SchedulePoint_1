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

/**
 * **A date given for a `FINISH_MILESTONE` means the END of that day** (#381; amends ADR-0023 §4).
 *
 * A finish milestone marks the moment work finishes, and the work before it finishes at the END of
 * its last day. Reading the milestone's own dates (placement, constraints, external dates) as the
 * START of their day put it a day before that moment: a planner who dropped it on its predecessor's
 * last day got "placed earlier than logic allows", and an `FNLT` on that day gave a false day of
 * negative float. The end of day D is the start of day D+1, rolled forward to the next working minute
 * — exactly where the engine puts a finish milestone after a task ending on D.
 *
 * A date carrying a time of day is already an instant and is read as one.
 */
export function finishMilestoneDateInstant(cal: WorkingTimeCalendar, date: string): number {
  const abs = instantToAbsMinutes(date);
  return rollForwardToWorking(cal, date.length > 10 ? abs : abs + MINUTES_PER_DAY);
}

/**
 * The working-minute index a `FINISH_MILESTONE`'s instant is **reported** at: the minute before it,
 * i.e. the day whose working time ends there (#381). Never before the data date, so a milestone that
 * sits on the data date reads the data date rather than the day before it.
 */
export function finishMilestoneDisplayIndex(ownOffset: number): number {
  return Math.max(ownOffset - 1, 0);
}

const MINUTES_PER_DAY = 1440;
