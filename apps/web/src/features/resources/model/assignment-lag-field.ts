import { ASSIGNMENT_LAG_MINUTES_MAX } from '@repo/types';
import { z } from 'zod';

import { ASSIGNMENT_LAG_ENABLED } from '@/config/env';
import {
  DURATION_PARSE_MESSAGE,
  checkDurationText,
  formatDurationText,
  namesDays,
  parseDurationText,
} from '@/lib/duration-text';

/**
 * The per-assignment **join lag** control (ADR-0071 §1 / F6 M4) — how far into an activity a
 * particular resource arrives.
 *
 * ## Why this is not `lag-field.ts`
 *
 * A relationship lag degrades to a whole-number **days** box when the working-hours factor cannot be
 * resolved, because the dependency DTO carries `lagDays` as well as `lagMinutes` and days is the one
 * unit that needs no factor. **The assignment DTO carries only `lagMinutes`** — deliberately, since
 * the field was added after ADR-0036 and there was no day-denominated history to keep — so that
 * escape route does not exist here.
 *
 * The degraded state is therefore different, and better than hiding the field: **hours and minutes
 * need no factor either**. With the factor unresolved the grammar keeps `h` and `m` and refuses `d`
 * (and the bare number that means days), naming the reason. A planner can still type `4h` while the
 * calendar list is in flight; only `2d` has to wait for the one fact that makes it meaningful.
 *
 * ## The factor is the activity's SAVED calendar, not a pending selection
 *
 * `duration-field.ts` reads the calendar the form has currently **selected**, because a duration and
 * a calendar save together and the field must agree with the picker above it. An assignment lag
 * saves through a different endpoint and does not carry the calendar with it, so converting against
 * an unsaved selection would store minutes measured on a calendar the activity does not have. The
 * host passes the saved factor, and that difference is the reason this module exists rather than a
 * third caller of `durationInputProps`.
 */

/** Can this field read **days** right now? Narrows `hoursPerDay` for the caller. */
export function canAuthorLagDays(hoursPerDay: number | undefined): hoursPerDay is number {
  return hoursPerDay !== undefined;
}

/** Is the control shown at all? One place, so the row, the form and their tests cannot disagree. */
export function assignmentLagEnabled(): boolean {
  return ASSIGNMENT_LAG_ENABLED;
}

/** The visible label. Names the unit only while the unit is restricted — otherwise it just says what it is. */
export function assignmentLagLabel(hoursPerDay: number | undefined): string {
  return canAuthorLagDays(hoursPerDay) ? 'Joins after' : 'Joins after (hours or minutes)';
}

/** The help line: what the field takes, and what a day is worth when it takes one. */
export function assignmentLagHelp(hoursPerDay: number | undefined): string {
  if (!canAuthorLagDays(hoursPerDay)) {
    return 'Working time from the activity’s start until this resource arrives — for example 4h or 90m. Days need this activity’s calendar, which hasn’t loaded yet.';
  }
  const hours = Number.isInteger(hoursPerDay) ? String(hoursPerDay) : hoursPerDay.toFixed(1);
  return `Working time from the activity’s start until this resource arrives — for example 2d, 4h or 90m. Leave 0d if it starts with the activity. A day is ${hours} working hours on this activity’s calendar.`;
}

/**
 * The message shown when the text is well-formed but names days the field cannot convert. Its own
 * sentence rather than a reused parse failure, because nothing is wrong with what was typed — the
 * app simply does not know yet what a day is worth here.
 */
export const LAG_DAYS_UNAVAILABLE =
  'That’s in days — enter hours or minutes instead, for example 4h or 90m.';

/** The API's `@Max` on `lagMinutes`, mirrored so the field refuses before a 422. */
export const LAG_TOO_LARGE = 'That’s longer than a resource can be delayed.';

/**
 * Read the field into working minutes, or say why not.
 *
 * On the degraded path the factor passed to {@link parseDurationText} is **provably unused**: days
 * have already been refused above it, and `h`/`m` are fixed multiples of a minute. The 24 is there
 * because the signature requires a number, not because anything is being assumed — which is the
 * distinction ADR-0070 makes the compiler enforce everywhere it matters.
 */
export function parseAssignmentLag(
  text: string,
  hoursPerDay: number | undefined,
): { ok: true; minutes: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  // Blank is "joins with the activity" — the default, and the value the field seeds to as `0d`.
  if (trimmed === '') return { ok: true, minutes: 0 };
  if (!canAuthorLagDays(hoursPerDay) && namesDays(trimmed)) {
    return { ok: false, message: LAG_DAYS_UNAVAILABLE };
  }
  const parsed = parseDurationText(trimmed, hoursPerDay ?? 24);
  if (!parsed.ok) return { ok: false, message: DURATION_PARSE_MESSAGE[parsed.reason] };
  if (parsed.minutes > ASSIGNMENT_LAG_MINUTES_MAX) return { ok: false, message: LAG_TOO_LARGE };
  return { ok: true, minutes: parsed.minutes };
}

/** Seed the field from a saved assignment (or from the create default of no lag). */
export function seedAssignmentLag(
  lagMinutes: number | undefined,
  hoursPerDay: number | undefined,
): string {
  const minutes = lagMinutes ?? 0;
  if (canAuthorLagDays(hoursPerDay)) return formatDurationText(minutes, hoursPerDay);
  // With no factor, days cannot be RENDERED either — and rendering them anyway would print a value
  // the field is about to refuse, which is worse than a long one. So the degraded seed spells the
  // same minutes in hours and minutes, the two units both halves of this module agree on.
  if (minutes <= 0) return '0d';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes - hours * 60;
  const parts = [
    hours > 0 ? `${String(hours)}h` : '',
    remainder > 0 ? `${String(remainder)}m` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * A read-only rendering for the non-writable row. Returns `null` for no lag, so a caller appends
 * nothing rather than a "· 0d" that reads like a setting somebody chose.
 */
export function formatAssignmentLagRead(
  lagMinutes: number,
  hoursPerDay: number | undefined,
): string | null {
  if (lagMinutes <= 0) return null;
  return ` · joins after ${seedAssignmentLag(lagMinutes, hoursPerDay)}`;
}

/**
 * The zod rule for the assign form's field: **syntax only, and factor-independent** — the same split
 * `durationTextField` and `lagTextField` make. Everything decidable without a calendar (an unknown
 * unit, a repeat, a negative, a magnitude that is plainly a typo) is decided here; the one
 * factor-dependent question is answered by {@link parseAssignmentLag} at submit, where the factor is
 * in hand. An empty field is allowed and means no lag.
 */
export function assignmentLagTextField(): z.ZodString {
  return z.string().superRefine((value, ctx) => {
    if (value.trim() === '') return;
    const reason = checkDurationText(value);
    if (reason)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: DURATION_PARSE_MESSAGE[reason] });
  });
}
