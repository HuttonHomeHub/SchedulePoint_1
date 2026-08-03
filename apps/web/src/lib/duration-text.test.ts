import { describe, expect, it } from 'vitest';

import { formatDurationText, formatWorkingMinutesNoDays, parseDurationText } from './duration-text';

/** An eight-hour working day — the calendar most of these cases are read on. */
const EIGHT = 8;

/** Parse and return the minutes, failing loudly rather than returning a sentinel. */
function minutes(text: string, hoursPerDay = EIGHT): number {
  const result = parseDurationText(text, hoursPerDay);
  if (!result.ok) throw new Error(`expected "${text}" to parse, got ${result.reason}`);
  return result.minutes;
}

/** The failure reason, failing loudly if the text unexpectedly parsed. */
function reason(text: string, hoursPerDay = EIGHT): string {
  const result = parseDurationText(text, hoursPerDay);
  if (result.ok) throw new Error(`expected "${text}" to fail, got ${String(result.minutes)}`);
  return result.reason;
}

describe('parseDurationText — a bare number is days', () => {
  it('reads a whole number as days on the activity’s own calendar', () => {
    // The contract that makes this not a migration: every value already typed keeps its meaning.
    expect(minutes('5')).toBe(5 * 8 * 60);
    expect(minutes('1')).toBe(480);
  });

  it('scales with hoursPerDay rather than assuming 1440 (ADR-0068)', () => {
    // The same "1" is a different number of minutes on a different calendar. This is the whole
    // reason hoursPerDay is a required parameter.
    expect(minutes('1', 8)).toBe(480);
    expect(minutes('1', 24)).toBe(1440);
    expect(minutes('1', 7.5)).toBe(450);
  });

  it('accepts a fractional day', () => {
    expect(minutes('0.5')).toBe(240);
    expect(minutes('2.5')).toBe(1200);
  });
});

describe('parseDurationText — units', () => {
  it('reads days, hours and minutes', () => {
    expect(minutes('5d')).toBe(2400);
    expect(minutes('4h')).toBe(240);
    expect(minutes('90m')).toBe(90);
  });

  it('reads a multi-part duration, with or without spaces', () => {
    expect(minutes('2d 4h')).toBe(2 * 480 + 240);
    expect(minutes('2d4h')).toBe(2 * 480 + 240);
    expect(minutes('1d 2h 30m')).toBe(480 + 120 + 30);
  });

  it('is case-insensitive and tolerates surrounding space', () => {
    expect(minutes('  2D 4H  ')).toBe(2 * 480 + 240);
  });

  it('accepts fractional parts', () => {
    expect(minutes('1.5h')).toBe(90);
    expect(minutes('0.5d')).toBe(240);
  });

  it('rounds to whole minutes, because minutes are what storage holds', () => {
    // 0.33h is 19.8 minutes; keeping the fraction would make a value that cannot be stored and
    // does not round-trip through the field it was typed into.
    expect(minutes('0.33h')).toBe(20);
  });

  it('an hour is an hour on every calendar — only DAYS are calendar-dependent', () => {
    expect(minutes('4h', 8)).toBe(240);
    expect(minutes('4h', 24)).toBe(240);
    expect(minutes('90m', 7.5)).toBe(90);
  });
});

describe('parseDurationText — refusals', () => {
  it('refuses an empty field', () => {
    expect(reason('')).toBe('empty');
    expect(reason('   ')).toBe('empty');
  });

  it('refuses a negative duration', () => {
    expect(reason('-1d')).toBe('negative');
    expect(reason('-5')).toBe('negative');
  });

  it('names an unknown unit as its own problem, because "1w" is a reasonable thing to try', () => {
    // Weeks are deliberately unsupported: a construction week is five days to one planner and seven
    // to another, and SchedulePoint has no setting to disambiguate it.
    expect(reason('1w')).toBe('unknown-unit');
    expect(reason('2y')).toBe('unknown-unit');
  });

  it('refuses a repeated unit rather than silently summing it', () => {
    expect(reason('1d 1d')).toBe('repeated-unit');
    expect(reason('2h 30h')).toBe('repeated-unit');
  });

  it('refuses text it cannot read at all', () => {
    expect(reason('soon')).toBe('unknown-unit');
    // A whole word for a unit gets the units message, not the generic one — the planner's intent is
    // plain and the fix is "write 2d".
    expect(reason('2 days')).toBe('unknown-unit');
    // A unit with no number is a DIFFERENT mistake: the message that helps is "use a number and a
    // unit", so this deliberately does not collapse into `unknown-unit`.
    expect(reason('d')).toBe('unreadable');
    expect(reason('--')).toBe('negative');
  });

  it('refuses a duration long enough to be a typo rather than a plan', () => {
    expect(reason('99999999d')).toBe('too-large');
  });
});

describe('formatDurationText', () => {
  it('renders the shortest text that means the stored minutes', () => {
    expect(formatDurationText(2400, EIGHT)).toBe('5d');
    expect(formatDurationText(480, EIGHT)).toBe('1d');
    expect(formatDurationText(240, EIGHT)).toBe('4h');
    expect(formatDurationText(90, EIGHT)).toBe('1h 30m');
  });

  it('omits zero components — 1d, never 1d 0h 0m', () => {
    expect(formatDurationText(480 + 30, EIGHT)).toBe('1d 30m');
    expect(formatDurationText(480 + 120, EIGHT)).toBe('1d 2h');
  });

  it('renders zero as 0d rather than blank, because a milestone carries a real zero', () => {
    expect(formatDurationText(0, EIGHT)).toBe('0d');
  });

  it('follows the calendar — the same minutes read differently on a different day length', () => {
    expect(formatDurationText(480, 8)).toBe('1d');
    expect(formatDurationText(480, 24)).toBe('8h');
    expect(formatDurationText(450, 7.5)).toBe('1d');
  });
});

describe('the round trip', () => {
  it('format → parse returns the original minutes, exactly', () => {
    // Exact for any minute count, because whatever days and hours do not account for is emitted as
    // minutes — the unit storage is in.
    for (const hoursPerDay of [7.5, 8, 12, 24]) {
      for (const original of [0, 1, 59, 60, 90, 240, 450, 480, 481, 1200, 2400, 12345]) {
        const text = formatDurationText(original, hoursPerDay);
        const parsed = parseDurationText(text, hoursPerDay);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) continue;
        expect(parsed.minutes).toBe(original);
      }
    }
  });
});

describe('formatWorkingMinutesNoDays', () => {
  it('spells minutes in hours and minutes, never days', () => {
    // The degraded rendering, for a caller that cannot resolve `hoursPerDay` yet. It must never
    // emit a `d` part: days are exactly what it does not know how to measure.
    expect(formatWorkingMinutesNoDays(480)).toBe('8h');
    expect(formatWorkingMinutesNoDays(150)).toBe('2h 30m');
    expect(formatWorkingMinutesNoDays(45)).toBe('45m');
    expect(formatWorkingMinutesNoDays(2400)).toBe('40h');
  });

  it('renders zero and negative input as `0d`, the canonical zero', () => {
    // The one place a `d` appears, deliberately: `0d` is what `formatDurationText` emits for zero
    // and what the lag field seeds, so a zero must round-trip identically through both. "0h" would
    // be a second spelling of zero that only this path produces.
    expect(formatWorkingMinutesNoDays(0)).toBe('0d');
    expect(formatWorkingMinutesNoDays(-5)).toBe('0d');
  });

  it('never emits a day part for any non-zero magnitude', () => {
    for (const minutes of [1, 59, 60, 480, 1440, 100_000]) {
      expect(formatWorkingMinutesNoDays(minutes)).not.toMatch(/d/);
    }
  });
});
