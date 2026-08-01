/**
 * Durations as a planner types them — `2d 4h`, `90m`, `1.5d` — and back again (ADR-0070).
 *
 * ## Why this exists
 *
 * ADR-0036 moved the engine and storage to working **minutes** a year ago. ADR-0068 made a *day* a
 * per-calendar quantity: one day is `hoursPerDay × 60` working minutes, so "1 day" on an eight-hour
 * calendar is 480 minutes and not 1,440. Both of those shipped, and the activity editor went on
 * offering a single whole-number **days** box — so a half-day inspection, a two-hour possession or a
 * commissioning step could be imported, scheduled and exported, but never typed. This module is the
 * missing half.
 *
 * ## The grammar, and what it deliberately excludes
 *
 * A duration is a sequence of `<number><unit>` parts, largest unit first, e.g. `2d 4h`, `4h 30m`,
 * `90m`. Whitespace between parts is optional (`2d4h` parses). A **bare number means days**, which
 * is what the field has always meant, so every value a planner has already learnt to type keeps
 * working and this is not a migration.
 *
 * Units are **`d`, `h`, `m` only**. Weeks are excluded on purpose: a construction week is five days
 * to one planner and seven to another, P6 makes it a project setting, and SchedulePoint has no such
 * setting — so `1w` would have to guess, and guessing a duration is worse than refusing one.
 *
 * ## The conversion is calendar-dependent, and that is the whole trap
 *
 * `hoursPerDay` is a **required** parameter of both functions rather than a defaulted one. There is
 * no sensible fallback: defaulting to 24 would read a planner's "1d" on an 8-hour calendar as three
 * days' work, and defaulting to 8 would do the reverse on a 24-hour one. A caller that cannot yet
 * resolve the activity's effective calendar must not call these — it must wait, which the compiler
 * enforces by giving it nothing to pass.
 */

/** Minutes in one hour — the only fixed factor here; days are per-calendar (ADR-0068). */
const MINUTES_PER_HOUR = 60;

/**
 * The longest a working day can be. Used by {@link checkDurationText} to bound a duration without
 * knowing the real factor: a bigger `hoursPerDay` yields more minutes for the same typed days, so
 * a value accepted at 24 is accepted on every shorter calendar too. Nothing rounds on this path —
 * it exists so form validation can run before the calendar list has resolved.
 */
const MAX_HOURS_PER_DAY = 24;

/** Why a duration string could not be read. Each maps to one sentence a planner can act on. */
export type DurationParseFailure =
  'empty' | 'unreadable' | 'negative' | 'unknown-unit' | 'repeated-unit' | 'too-large';

export type DurationParseResult =
  { ok: true; minutes: number } | { ok: false; reason: DurationParseFailure };

/** The sentence shown for each failure. Stated once so the field and its tests cannot disagree. */
export const DURATION_PARSE_MESSAGE: Record<DurationParseFailure, string> = {
  empty: 'Enter a duration, for example 5d, 4h or 2d 4h.',
  unreadable: 'Use a number and a unit — for example 5d, 4h, 90m or 2d 4h.',
  negative: 'A duration cannot be negative.',
  'unknown-unit': 'Use d for days, h for hours or m for minutes. Weeks are not supported.',
  'repeated-unit': 'Each unit can appear once — write 2d 4h rather than 1d 1d 4h.',
  'too-large': 'That duration is longer than this plan can hold.',
};

/**
 * A ceiling on a single activity's duration, in working minutes: 10,000 days at 24 h.
 *
 * Not a domain rule — a guard against a typo (a pasted phone number, a stray zero) becoming a plan
 * that spans centuries and a canvas that cannot be zoomed to. The API's own `@Max` is the enforcing
 * boundary; this exists so the planner is told at the field rather than by a 422.
 */
const MAX_DURATION_MINUTES = 10_000 * 24 * 60;

/** `2d`, `4.5h`, `90m` — a number (optionally fractional) followed by its unit. */
const PART = /^(\d+(?:\.\d+)?)([dhm])$/;

/**
 * Is this text a well-formed duration, **without** knowing the calendar it will be measured on?
 * Returns the failure reason, or `null` when it reads.
 *
 * Every rule the grammar has is factor-independent except the magnitude bound, which is checked
 * here at the longest possible day ({@link MAX_HOURS_PER_DAY}) — the strictest reading, so anything
 * this accepts is accepted for real. That is what lets the form's zod schema validate the field
 * before the calendar list has resolved, without the schema inventing a factor of its own.
 */
export function checkDurationText(text: string): DurationParseFailure | null {
  const result = parseDurationText(text, MAX_HOURS_PER_DAY);
  return result.ok ? null : result.reason;
}

/**
 * Read a typed duration into whole working minutes on a calendar of `hoursPerDay` hours.
 *
 * Rounds to the nearest minute, because minutes are what storage holds — `0.7h` is 42 minutes
 * exactly, but `0.33h` is 19.8, and silently keeping the fraction would make a value that cannot be
 * stored and does not round-trip through the field it was typed into.
 */
export function parseDurationText(text: string, hoursPerDay: number): DurationParseResult {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (trimmed.startsWith('-')) return { ok: false, reason: 'negative' };

  // Any character outside the unit alphabet means a word or a unit we do not have — `1w`, `2 days`,
  // `soon`. Checked BEFORE anything else so those get the message that names the units, rather than
  // the generic one they would collect from whichever part happened to fail first. (`2 days` used to
  // report "unreadable", because the bare `2` was tried before the `days` was ever looked at.)
  if (/[^0-9.\s dhm]/.test(trimmed)) return { ok: false, reason: 'unknown-unit' };

  const minutesPerDay = hoursPerDay * MINUTES_PER_HOUR;

  // A bare number is days — what this field has always meant.
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return bounded(Number(trimmed) * minutesPerDay);
  }

  // Split on whitespace, and also between a unit and the next digit so `2d4h` reads like `2d 4h`.
  const parts = trimmed.replace(/([dhm])(?=\d)/g, '$1 ').split(/\s+/);
  const seen = new Set<string>();
  let minutes = 0;

  for (const part of parts) {
    const match = PART.exec(part);
    // Anything reaching here uses only alphabet characters — the unknown-unit case was decided
    // above — so a part that will not match is malformed rather than mis-united: `d` with no
    // number, `1.` with no digits after the point. "Use a number and a unit" is the message that
    // helps, and keeping a second trailing-letter heuristic here would answer `d` with "use d for
    // days", which is advice it is already following.
    if (!match) return { ok: false, reason: 'unreadable' };
    const [, value, unit] = match as unknown as [string, string, 'd' | 'h' | 'm'];
    if (seen.has(unit)) return { ok: false, reason: 'repeated-unit' };
    seen.add(unit);
    minutes +=
      unit === 'd'
        ? Number(value) * minutesPerDay
        : unit === 'h'
          ? Number(value) * MINUTES_PER_HOUR
          : Number(value);
  }

  return bounded(minutes);
}

function bounded(minutes: number): DurationParseResult {
  if (!Number.isFinite(minutes)) return { ok: false, reason: 'unreadable' };
  const rounded = Math.round(minutes);
  if (rounded > MAX_DURATION_MINUTES) return { ok: false, reason: 'too-large' };
  return { ok: true, minutes: rounded };
}

/**
 * Render stored minutes as the shortest text that parses back to them.
 *
 * Largest unit first, zero components omitted — 480 minutes at 8 h/day is `1d`, not `1d 0h 0m`, and
 * 510 is `1d 30m` rather than `1d 0h 30m`. A zero duration is `0d`: it is a real value (a milestone
 * carries it) and rendering it as an empty field would read as "not set".
 *
 * The round trip is exact for any minute count, because whatever the days and hours do not account
 * for is emitted as minutes — which is the unit storage is in.
 */
export function formatDurationText(minutes: number, hoursPerDay: number): string {
  const minutesPerDay = Math.round(hoursPerDay * MINUTES_PER_HOUR);
  if (minutes <= 0 || minutesPerDay <= 0) return '0d';

  const days = Math.floor(minutes / minutesPerDay);
  const afterDays = minutes - days * minutesPerDay;
  const hours = Math.floor(afterDays / MINUTES_PER_HOUR);
  const remainder = afterDays - hours * MINUTES_PER_HOUR;

  const parts = [
    days > 0 ? `${String(days)}d` : '',
    hours > 0 ? `${String(hours)}h` : '',
    remainder > 0 ? `${String(remainder)}m` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0d';
}
