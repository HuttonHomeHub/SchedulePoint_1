import { z } from 'zod';

import { canAuthorSubDay } from './duration-field';

import {
  DURATION_PARSE_MESSAGE,
  checkDurationText,
  formatDurationText,
  parseDurationText,
} from '@/lib/duration-text';

/**
 * The **remaining duration** control — the duration field's sibling, one field along (surface
 * audit F3).
 *
 * ADR-0070 made an activity's duration sub-day authorable; its remaining work stayed a whole-number
 * days box, so a planner could type `4h` for the duration and then report the remainder only as `0`
 * or `1` day. On an incomplete activity `0` is not a rounding artefact — it is also the value that
 * means *no work left*, so the box could not distinguish "four hours to go" from "done". The
 * asymmetry sharpened it: the **derived** remaining (percent × duration) is minute-exact, so
 * stating the remainder explicitly was less precise than saying nothing.
 *
 * ## What this shares with {@link ./duration-field}, and what it cannot
 *
 * The grammar, the degrade rule and the flag are the duration field's — deliberately, via
 * {@link canAuthorSubDay}, because two readings of `2d 4h` on one screen is exactly the drift
 * ADR-0070 §5 refused for lag. What differs is that a remaining duration is **optional**: blank is a
 * real, common and meaningful state ("derive it from percent complete"), whereas a duration always
 * has a value. So this module owns the empty case and nothing else.
 */

/** The maximum whole days the degraded control accepts — mirrors the API's own `@Max`. */
const MAX_WHOLE_DAYS = 10_000;

/** The visible label. States the unit when the unit is fixed, and doesn't when it isn't. */
export function remainingLabel(hoursPerDay: number | undefined): string {
  return canAuthorSubDay(hoursPerDay) ? 'Remaining duration' : 'Remaining duration (days)';
}

/**
 * The help line. The "leave blank" half is present in both shapes — it is the field's most useful
 * state and has nothing to do with the factor. The grammar half appears only when the grammar does.
 */
export function remainingHelp(hoursPerDay: number | undefined): string {
  const blank = 'Leave blank to derive the remaining work from the percent complete.';
  if (!canAuthorSubDay(hoursPerDay)) return blank;
  const hours = Number.isInteger(hoursPerDay) ? String(hoursPerDay) : hoursPerDay.toFixed(1);
  return `${blank} Days, hours or minutes — for example 5d, 4h or 90m. A day is ${hours} working hours on this activity’s calendar.`;
}

/**
 * Seed the field from a saved row. Reads the row's **minutes** where it can, so a four-hour
 * remainder opens as `4h` rather than as the `0` its day field rounds to.
 */
export function seedRemainingText(
  activity: {
    remainingDurationDays: number | null;
    remainingDurationMinutes: number | null;
  },
  hoursPerDay: number | undefined,
): string {
  // `?? null` rather than `=== null`: "no explicit remaining" reaches here as `null` from the API
  // and as `undefined` from any partially-built row, and both must seed a blank field. Reading them
  // differently produced the literal text `"undefined"`, which the schema then refused — blocking
  // a save on a field the planner had not touched.
  const minutes = activity.remainingDurationMinutes ?? null;
  const days = activity.remainingDurationDays ?? null;
  if (canAuthorSubDay(hoursPerDay)) {
    return minutes === null ? '' : formatDurationText(minutes, hoursPerDay);
  }
  return days === null ? '' : String(days);
}

/** Exactly one of the two mutually-exclusive API fields — sending both is a 422 by design. */
export type RemainingWrite =
  { remainingDurationMinutes: number | null } | { remainingDurationDays: number | null };

/**
 * The write-DTO fragment a submit sends.
 *
 * Blank is `null` rather than an omitted key: the API reads `null` as "derive the remainder from
 * percent complete", and a planner who clears the field means exactly that. Omitting it would mean
 * "leave whatever is stored", which is the opposite.
 *
 * Returns `null` for text the schema would already have refused, so a caller that reached here with
 * an invalid value sends nothing rather than a silently wrong number.
 */
export function remainingWriteFields(
  text: string,
  hoursPerDay: number | undefined,
): RemainingWrite | null {
  const trimmed = text.trim();
  if (canAuthorSubDay(hoursPerDay)) {
    if (trimmed === '') return { remainingDurationMinutes: null };
    const parsed = parseDurationText(trimmed, hoursPerDay);
    return parsed.ok ? { remainingDurationMinutes: parsed.minutes } : null;
  }
  if (trimmed === '') return { remainingDurationDays: null };
  // The degraded path: days is the one unit that needs no factor, so it is the only unit this path
  // can accept. `4h` is a well-formed remainder it simply cannot express.
  const days = Number(trimmed);
  const usable = Number.isInteger(days) && days >= 0 && days <= MAX_WHOLE_DAYS;
  return usable ? { remainingDurationDays: days } : null;
}

/**
 * A stored remaining duration as a **reader** sees it. Empty string when there is none — the caller
 * decides how absence reads, because a table cell and a summary line want different words for it.
 */
export function formatRemainingRead(
  activity: { remainingDurationDays: number | null; remainingDurationMinutes: number | null },
  hoursPerDay: number | undefined,
): string {
  if (activity.remainingDurationMinutes === null && activity.remainingDurationDays === null) {
    return '';
  }
  if (!canAuthorSubDay(hoursPerDay) || activity.remainingDurationMinutes === null) {
    return `${String(activity.remainingDurationDays ?? 0)} d`;
  }
  const minutesPerDay = Math.round(hoursPerDay * 60);
  // The whole-day branch prints the row's OWN `remainingDurationDays`, for the same reason the
  // duration read-out does: the server computed it on the activity's calendar, and re-dividing here
  // would disagree whenever the client's factor is a step behind.
  if (minutesPerDay <= 0 || activity.remainingDurationMinutes % minutesPerDay === 0) {
    return `${String(activity.remainingDurationDays ?? 0)} d`;
  }
  return formatDurationText(activity.remainingDurationMinutes, hoursPerDay);
}

/**
 * The zod rule: **syntax only, factor-independent**, and blank-tolerant — the split ADR-0070 §4
 * settled for the duration field, with the one difference that empty is valid here rather than the
 * `'empty'` failure it is there.
 */
export function remainingTextField(): z.ZodString {
  return z.string().superRefine((value, ctx) => {
    if (value.trim() === '') return;
    const reason = checkDurationText(value);
    if (reason)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: DURATION_PARSE_MESSAGE[reason] });
  });
}

/**
 * The message shown when {@link remainingWriteFields} refuses text the schema accepted — which can
 * only happen on the degraded whole-days path.
 */
export const REMAINING_NEEDS_WHOLE_DAYS =
  'Enter a whole number of days — hours and minutes aren’t available for this activity’s calendar.';
