import { MINUTES_PER_CALENDAR_DAY } from '@repo/types';

/**
 * `HH:MM` ↔ minutes-from-midnight, the editor's only translation between what a planner types and
 * what storage holds.
 *
 * **`24:00` is a real value, and it is why this exists.** Storage ends a full day at minute 1440,
 * and that is also the end of the first half of a night shift (ADR-0036 §2). `<input type="time">`
 * maxes out at 23:59 and cannot express it, so the editor uses a text field and parses here
 * (spec Q2). The rejected alternative — read `00:00` in an end field back as 1440 — is read-time
 * inference: it makes the form disagree with what was stored, and 00:00 is a legitimate *start*.
 */

/** A parse that failed, with the reason a planner needs rather than "invalid". */
export type TimeParseResult =
  { ok: true; minutes: number } | { ok: false; reason: 'empty' | 'format' | 'range' };

const HH_MM = /^(\d{1,2}):(\d{2})$/;

/**
 * Parse `HH:MM` into minutes from midnight. Accepts `8:00` as well as `08:00` — a planner typing
 * quickly should not be corrected for a leading zero — and `24:00` exactly, but nothing beyond it
 * (`24:30` is past the end of the day, not a long day).
 */
export function parseTimeOfDay(raw: string): TimeParseResult {
  const text = raw.trim();
  if (text === '') return { ok: false, reason: 'empty' };

  const match = HH_MM.exec(text);
  if (!match) return { ok: false, reason: 'format' };

  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (mins > 59) return { ok: false, reason: 'range' };

  const minutes = hours * 60 + mins;
  if (minutes > MINUTES_PER_CALENDAR_DAY) return { ok: false, reason: 'range' };
  return { ok: true, minutes };
}

/** Minutes from midnight as `HH:MM`, zero-padded. 1440 formats as `24:00`, never `00:00`. */
export function formatTimeOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** The message shown for each parse failure. Shared so the field and its tests cannot disagree. */
export const TIME_PARSE_MESSAGE: Record<Exclude<TimeParseResult, { ok: true }>['reason'], string> =
  {
    empty: 'Enter a time.',
    format: 'Use 24-hour HH:MM, for example 08:00.',
    range: 'Times run from 00:00 to 24:00.',
  };
