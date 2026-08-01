import { z } from 'zod';

import { SUB_DAY_DURATIONS_ENABLED } from '@/config/env';
import {
  DURATION_PARSE_MESSAGE,
  checkDurationText,
  formatDurationText,
  parseDurationText,
} from '@/lib/duration-text';

/**
 * The duration control, in the two shapes it is allowed to take (ADR-0070 §4).
 *
 * There is **one** field. Whether it reads the `d`/`h`/`m` grammar or plain whole working days is
 * decided by one question — *do we know how many hours this activity's day is worth?* — and that
 * question has three ways of answering "no": the flag is off, the calendar list has not resolved,
 * or the bound calendar is not in it. All three land on the same degraded control, deliberately:
 * the rollback contract and the not-yet-loaded state are then the same code, so neither can rot
 * while the other is exercised.
 *
 * Days is the fallback because it is the one unit that needs no factor. It is also what the field
 * has always been, so degrading costs a planner nothing they had before.
 */

/** The maximum whole days the degraded control accepts — mirrors the API's own `@Max`. */
const MAX_WHOLE_DAYS = 100_000;

/** Can this field read hours and minutes right now? Narrows `hoursPerDay` for the caller. */
export function canAuthorSubDay(hoursPerDay: number | undefined): hoursPerDay is number {
  return SUB_DAY_DURATIONS_ENABLED && hoursPerDay !== undefined;
}

/** The visible label. It states the unit when the unit is fixed, and doesn't when it isn't. */
export function durationLabel(hoursPerDay: number | undefined): string {
  return canAuthorSubDay(hoursPerDay) ? 'Duration' : 'Duration (working days)';
}

/**
 * The help line under the field — present only when there is something to say. Flag-off it is
 * absent, which keeps the degraded control byte-identical to the one that shipped.
 */
export function durationHelp(hoursPerDay: number | undefined): string | undefined {
  if (!canAuthorSubDay(hoursPerDay)) return undefined;
  // Naming the calendar's own day length is the whole point: "1d" means something different on an
  // eight-hour calendar and a 24-hour one, and the planner cannot see which they are on from here.
  const hours = Number.isInteger(hoursPerDay) ? String(hoursPerDay) : hoursPerDay.toFixed(1);
  return `Days, hours or minutes — for example 5d, 4h, 90m or 2d 4h. A day is ${hours} working hours on this activity’s calendar.`;
}

/**
 * The input's own props, as one object rather than three parallel ternaries at each call site.
 *
 * Text — not `type="number"` — once the factor is known: `2d 4h` is not a number, and a number input
 * refuses those characters before the parser ever sees them. Degraded (or flag-off) it goes back to
 * the bounded number spinner it has always been.
 *
 * Bundled because it was not: the two dialogs each branched on `hoursPerDay === undefined` while
 * their label and help branched on {@link canAuthorSubDay}, which also reads the flag — so flag-off
 * the field rendered as free text under a label promising whole days. One predicate, one shape.
 */
export function durationInputProps(
  hoursPerDay: number | undefined,
): { type: 'text'; inputMode: 'text' } | { type: 'number'; min: number } {
  return canAuthorSubDay(hoursPerDay)
    ? { type: 'text', inputMode: 'text' }
    : { type: 'number', min: 0 };
}

/** Seed the field from a saved row (or from the create default of one day). */
export function seedDurationText(
  activity: { durationDays: number; durationMinutes: number } | undefined,
  hoursPerDay: number | undefined,
): string {
  if (canAuthorSubDay(hoursPerDay)) {
    return formatDurationText(
      activity?.durationMinutes ?? Math.round(hoursPerDay * 60),
      hoursPerDay,
    );
  }
  return String(activity?.durationDays ?? 1);
}

/**
 * The write-DTO fragment a submit sends. Exactly one of the two mutually-exclusive fields — sending
 * both is a 422 by design (the API's `@IsMutuallyExclusiveWith`), which is why this returns a
 * union rather than an object with two optional keys.
 *
 * Returns `null` for text the schema would already have refused, so a caller that reached here with
 * an invalid value sends nothing rather than a silently wrong number.
 */
export function durationWriteFields(
  text: string,
  hoursPerDay: number | undefined,
): { durationDays: number } | { durationMinutes: number } | null {
  if (canAuthorSubDay(hoursPerDay)) {
    const parsed = parseDurationText(text, hoursPerDay);
    return parsed.ok ? { durationMinutes: parsed.minutes } : null;
  }
  // The degraded path: days is the one unit that needs no factor, so it is also the only unit this
  // path can accept. `4h` and `1.5` are well-formed durations it simply cannot express.
  const days = Number(text.trim());
  const usable =
    text.trim() !== '' && Number.isInteger(days) && days >= 0 && days <= MAX_WHOLE_DAYS;
  return usable ? { durationDays: days } : null;
}

/**
 * The zod rule for the field: **syntax only, and deliberately factor-independent**.
 *
 * The first draft made this a function of `hoursPerDay` so the rule and the control could not
 * disagree about which grammar was in force. That required the resolver to see a value only
 * available *after* `useForm` returns — a ref written during render, which the React Compiler
 * rejects outright, and rightly: a render-phase ref write is exactly the kind of hidden mutable
 * state that makes a component's output depend on when it happened to run.
 *
 * So the split is by *what the rule needs*. Everything the grammar can refuse — an empty field, a
 * negative value, an unknown unit, a repeated one, a magnitude that is plainly a typo — is decided
 * here, without a calendar. The one genuinely factor-dependent question ("does this text convert to
 * a whole number of days when hours are unavailable?") is answered by {@link durationWriteFields}
 * returning `null` at submit, where the factor is in hand. One rule each, neither guessing.
 */
export function durationTextField(): z.ZodString {
  return z.string().superRefine((value, ctx) => {
    const reason = checkDurationText(value);
    if (reason)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: DURATION_PARSE_MESSAGE[reason] });
  });
}

/**
 * The message shown when {@link durationWriteFields} refuses text the schema accepted — which can
 * only happen on the degraded whole-days path, where `4h` and `1.5` are well-formed durations this
 * field cannot express without a working-hours factor.
 */
export const DURATION_NEEDS_WHOLE_DAYS =
  'Enter a whole number of days — hours and minutes aren’t available for this activity’s calendar.';
