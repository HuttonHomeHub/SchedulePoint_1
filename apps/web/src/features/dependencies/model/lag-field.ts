import type { LagCalendarSource } from '@repo/types';
import { z } from 'zod';

import { SUB_DAY_DURATIONS_ENABLED } from '@/config/env';
import {
  DURATION_PARSE_MESSAGE,
  checkSignedDurationText,
  formatSignedDurationText,
  parseSignedDurationText,
} from '@/lib/duration-text';

/**
 * The lag control, in the two shapes it is allowed to take (ADR-0070 §5).
 *
 * This is `duration-field.ts` one field along, and deliberately the same shape: one field, whose
 * grammar is decided by the single question *do we know how many hours this lag's day is worth?* —
 * with the same three ways of answering no (flag off, calendar list unresolved, bound calendar
 * absent) landing on the same degraded whole-days control that flag-off produces.
 *
 * The one difference from a duration is the **sign**: a lead is negative, which is the existing
 * convention and unchanged.
 */

/** The API's own `@Min`/`@Max` on `lagDays` — mirrored so the degraded path refuses before a 422. */
const MAX_WHOLE_DAYS = 3650;

/** Can this field read hours and minutes right now? Narrows `hoursPerDay` for the caller. */
export function canAuthorSubDayLag(hoursPerDay: number | undefined): hoursPerDay is number {
  return SUB_DAY_DURATIONS_ENABLED && hoursPerDay !== undefined;
}

/**
 * The visible label. The unit a lag is counted in has always tracked its calendar — 24-hour is
 * elapsed, everything else is working time — so the label keeps saying which, and stops naming
 * *days* only when days are no longer the only thing the field takes.
 *
 * The degraded wording is the sentence that shipped, character for character: it is what a rollback
 * restores, so changing it here would make the flag-off path differ from the one it is meant to be.
 */
export function lagFieldLabel(
  lagCalendar: LagCalendarSource,
  hoursPerDay: number | undefined,
): string {
  const elapsed = lagCalendar === 'TWENTY_FOUR_HOUR';
  if (!canAuthorSubDayLag(hoursPerDay)) {
    return `Lag (${elapsed ? 'calendar days' : 'working days'}, negative for a lead)`;
  }
  return `Lag (${elapsed ? 'elapsed time' : 'working time'}, negative for a lead)`;
}

/**
 * The help line under the field — present only when there is something to say, so flag-off the
 * degraded control is byte-identical to the one that shipped.
 */
export function lagFieldHelp(
  lagCalendar: LagCalendarSource,
  hoursPerDay: number | undefined,
): string | undefined {
  if (!canAuthorSubDayLag(hoursPerDay)) return undefined;
  const example = 'Days, hours or minutes — for example 2d, 4h, 90m or -1d 4h for a lead.';
  // The 24-hour case says *elapsed* rather than naming a working-hours figure, because that is the
  // whole meaning of the option: its day is 24 hours no matter what any calendar's day is worth.
  if (lagCalendar === 'TWENTY_FOUR_HOUR') {
    return `${example} A day here is 24 elapsed hours.`;
  }
  const hours = Number.isInteger(hoursPerDay) ? String(hoursPerDay) : hoursPerDay.toFixed(1);
  return `${example} A day is ${hours} working hours on this link’s lag calendar.`;
}

/**
 * The input's own props, bundled for the same reason `durationInputProps` is: a label that reads the
 * flag beside a `type` that does not is how flag-off ends up rendering a free-text box under a label
 * promising whole days.
 */
export function lagInputProps(
  hoursPerDay: number | undefined,
): { type: 'text'; inputMode: 'text' } | { type: 'number' } {
  // No `min` on the degraded path — a lead is negative, so the spinner's floor is the API's bound
  // and not zero.
  return canAuthorSubDayLag(hoursPerDay) ? { type: 'text', inputMode: 'text' } : { type: 'number' };
}

/** Seed the field from a saved edge (or from the create default of no lag). */
export function seedLagText(
  dependency: { lagDays: number; lagMinutes: number } | undefined,
  hoursPerDay: number | undefined,
): string {
  if (canAuthorSubDayLag(hoursPerDay)) {
    return formatSignedDurationText(dependency?.lagMinutes ?? 0, hoursPerDay);
  }
  return String(dependency?.lagDays ?? 0);
}

/**
 * The write-DTO fragment a submit sends. Exactly one of the two mutually-exclusive fields — sending
 * both is a 422 by design (the API's `@IsMutuallyExclusiveWith`), which is why this returns a union.
 *
 * Returns `null` for text the schema would already have refused, so a caller that reached here with
 * an invalid value sends nothing rather than a silently wrong number.
 */
export function lagWriteFields(
  text: string,
  hoursPerDay: number | undefined,
): { lagDays: number } | { lagMinutes: number } | null {
  if (canAuthorSubDayLag(hoursPerDay)) {
    const parsed = parseSignedDurationText(text, hoursPerDay);
    return parsed.ok ? { lagMinutes: parsed.minutes } : null;
  }
  // The degraded path: days is the one unit that needs no factor, so it is the only unit this path
  // can accept. `-4h` and `1.5` are well-formed lags it simply cannot express.
  const days = Number(text.trim());
  const usable =
    text.trim() !== '' &&
    Number.isInteger(days) &&
    days >= -MAX_WHOLE_DAYS &&
    days <= MAX_WHOLE_DAYS;
  return usable ? { lagDays: days } : null;
}

/**
 * The zod rule for the field: **syntax only, and deliberately factor-independent** — the same split
 * `durationTextField` makes, for the same reason. Everything the grammar can refuse without a
 * calendar (an empty field, an unknown unit, a repeated one, a magnitude that is plainly a typo) is
 * decided here; the one factor-dependent question is answered by {@link lagWriteFields} returning
 * `null` at submit, where the factor is in hand.
 */
export function lagTextField(): z.ZodString {
  return z.string().superRefine((value, ctx) => {
    const reason = checkSignedDurationText(value);
    if (reason)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: DURATION_PARSE_MESSAGE[reason] });
  });
}

/**
 * The message shown when {@link lagWriteFields} refuses text the schema accepted — which can only
 * happen on the degraded whole-days path, where `-4h` and `1.5` are well-formed lags this field
 * cannot express without a working-hours factor.
 */
export const LAG_NEEDS_WHOLE_DAYS =
  'Enter a whole number of days — hours and minutes aren’t available for this link’s lag calendar.';
