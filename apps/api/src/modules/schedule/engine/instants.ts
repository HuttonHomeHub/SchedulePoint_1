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
 * negative float. The end of day D is midnight at the start of day D+1.
 *
 * **It is not rolled onto the milestone's calendar** (#539, ADR-0207 D2). A milestone keeps the instant
 * its logic gives it (D1), so a date given for it is an instant too: rolled to the next working minute
 * it would be Monday 08:00 for a Friday on a weekday calendar, which another calendar reads as a
 * weekend later than the moment the planner typed. On the milestone's own calendar nothing changes, as
 * no working minute lies between midnight and the minute it was rolled to.
 *
 * A date carrying a time of day is already an instant and is read as one.
 */
export function finishMilestoneDateInstant(date: string): number {
  const abs = instantToAbsMinutes(date);
  return date.length > 10 ? abs : abs + MINUTES_PER_DAY;
}

/**
 * The working-minute index a `FINISH_MILESTONE`'s instant is **reported** at: the minute before it,
 * i.e. the day whose working time ends there (#381). Never before the data date, so a milestone that
 * sits on the data date reads the data date rather than the day before it.
 */
export function finishMilestoneDisplayIndex(ownOffset: number): number {
  return Math.max(ownOffset - 1, 0);
}

/**
 * The calendar day of the working-minute at inclusive offset `index` on `calendar` (ADR-0023).
 * Take the instant one working-minute later (the exclusive boundary after `index`) and step back
 * a single real minute, so a start or finish that lands exactly on a **non-working gap** reads as
 * its true working day — the finish day for a finish, the next working day for a start — not the
 * empty gap instant. `index` is an offset **on `calendar`** (each activity uses its own).
 */
export function workingIndexDate(
  calendar: WorkingTimeCalendar,
  dataDate: string,
  index: number,
): string {
  const endBoundary = calendar.addWorkingTime(dataDate, index + 1);
  const iso = endBoundary.length > 10 ? `${endBoundary}:00Z` : `${endBoundary}T00:00:00Z`;
  const instant = new Date(iso);
  instant.setUTCMinutes(instant.getUTCMinutes() - 1);
  return instant.toISOString().slice(0, 10);
}

/**
 * **The day a `FINISH_MILESTONE` at `inst` is reported on** (#539, ADR-0207 D3; amends ADR-0155
 * decision 1). Read from the instant, because the working-minute offset cannot tell Friday 16:00 from
 * the Sunday 19:00 that weekend work ended at: on a weekday calendar both are the same offset.
 *
 * - An instant that opens a working minute on the milestone's own calendar reads the day of the
 *   working minute before it (ADR-0155: a lead or an `SS` link into a day's opening reads the day
 *   before), never before the data date.
 * - Any other instant sits in the calendar's non-working time, which only another calendar's work, an
 *   elapsed lag or a date given for it can put a finish milestone in; it reads the day of the real
 *   minute before it, again never before the data date. After a weekday task ending Friday 16:00 that
 *   is Friday, as before; after weekend work ending Sunday 19:00 it is Sunday.
 */
export function finishMilestoneReportedDate(
  cal: WorkingTimeCalendar,
  dataDate: string,
  dataDateAbs: number,
  inst: number,
): string {
  if (rollForwardToWorking(cal, inst) === inst) {
    return workingIndexDate(
      cal,
      dataDate,
      finishMilestoneDisplayIndex(offsetFromDataDate(cal, dataDateAbs, inst)),
    );
  }
  const day = absMinutesToInstant(inst - 1).slice(0, 10);
  return day < dataDate ? dataDate : day;
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
  if (type === 'FINISH_MILESTONE') return finishMilestoneDateInstant(date);
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
  if (type === 'FINISH_MILESTONE') return finishMilestoneDateInstant(date);
  if (durationMinutes === 0) return rollForwardToWorking(cal, instantToAbsMinutes(date));
  return rollBackwardToWorking(cal, anchorAbs, instantToAbsMinutes(nextCalendarDay(date)));
}

/**
 * **The one formatter for an instant handed to the engine's external-date seam** (#385, spec D7).
 * It always writes `YYYY-MM-DDTHH:MM`, including `T00:00`.
 *
 * {@link absMinutesToInstant} drops `T00:00` and returns a bare date, and a bare date for a finish
 * milestone means the END of that day ({@link finishMilestoneDateInstant}), so a midnight instant
 * formatted that way is read one day late (spec E12). On a 24-hour or full-day calendar every day
 * boundary is a midnight, so that is the common case there. Keeping the time makes the value an
 * instant for every reader: `clampExternalForwardStart` and `clampExternalBackwardFinish` both read a
 * value longer than ten characters as the instant it names.
 *
 * `external-instant.structural.spec.ts` holds this to being the only producer of a timed external
 * string, and the cross-plan derivation to being its only caller outside the engine.
 */
export function formatExternalInstant(abs: number): string {
  const instant = absMinutesToInstant(abs);
  return instant.length > 10 ? instant : `${instant}T00:00`;
}

const MINUTES_PER_DAY = 1440;
