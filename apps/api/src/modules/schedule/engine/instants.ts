import type { ActivityType } from '@repo/types';

import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

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

/** The calendar day after `date` (a `YYYY-MM-DD`), at 00:00 — the exclusive end of the day. */
function nextCalendarDay(date: string): string {
  const d = parseCalendarDate(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatCalendarDate(d);
}

/**
 * **The instant a date given for an activity's START means**, on the activity's calendar (#385, spec
 * D3). One of the two date readers, lifted verbatim from `resolvePair` in `constraints.ts` so the
 * engine's constraint and external clamps and the cross-plan derivation read a date one way.
 *
 * A finish milestone's date means the END of that day (#381, {@link finishMilestoneDateInstant});
 * every other type reads the first working minute at or after the start of the day.
 */
export function startDateInstant(
  cal: WorkingTimeCalendar,
  date: string,
  type: ActivityType,
): number {
  if (type === 'FINISH_MILESTONE') return finishMilestoneDateInstant(cal, date);
  return rollForwardToWorking(cal, instantToAbsMinutes(date));
}

/**
 * **The instant a date given for an activity's FINISH means**, on the activity's calendar (#385, spec
 * D3): the exclusive end of that day's working time (its last working minute + 1). Lifted verbatim
 * from `resolvePair` and `clampExternalBackwardFinish` in `constraints.ts`.
 *
 * A finish milestone reads the end of the day as above; a zero-duration activity finishes at its
 * start instant; everything else rolls back from the next calendar day's midnight.
 *
 * `anchorAbs` is where `rollBackwardToWorking` counts working minutes from (the engine passes its
 * data date). The result does not depend on it **provided the anchor is at or before the answer**:
 * the last working end boundary at or before the end of that day. An anchor later than that, in the
 * non-working gap that closes the day, is returned as it is, because `addWorkingTime(anchor, 0)` is
 * the anchor normalised; so "any anchor at or before the date's end" is not enough
 * (`instants.readers.spec.ts` pins both halves). A caller outside the engine should pass the anchor
 * the engine itself used, the remote plan's data date.
 */
export function finishDateInstant(
  cal: WorkingTimeCalendar,
  anchorAbs: number,
  date: string,
  type: ActivityType,
  durationMinutes: number,
): number {
  if (type === 'FINISH_MILESTONE') return finishMilestoneDateInstant(cal, date);
  if (durationMinutes === 0) return rollForwardToWorking(cal, instantToAbsMinutes(date));
  return rollBackwardToWorking(cal, anchorAbs, instantToAbsMinutes(nextCalendarDay(date)));
}

const MINUTES_PER_DAY = 1440;
