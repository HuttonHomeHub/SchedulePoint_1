import { describe, expect, it } from 'vitest';

import {
  checkSignedDurationText,
  formatSignedDurationText,
  parseSignedDurationText,
} from './duration-text';

/**
 * The **signed** half of the duration grammar — a relationship lag (ADR-0070 §5).
 *
 * Its own file because the questions are different: the magnitude rules are already exhaustively
 * covered by `duration-text.test.ts`, and what matters here is the sign — that it is read, that it
 * round-trips through a field a planner has to be able to retype, and that a lead is not mistaken
 * for the `'negative'` refusal a *duration* would (rightly) give.
 */

/** An eight-hour working day — 480 minutes, not 1440 (ADR-0068). */
const EIGHT = 8;
/** The 24-hour lag calendar's day: elapsed, and pinned regardless of any calendar. */
const ELAPSED = 24;

describe('parseSignedDurationText', () => {
  it('reads a lag as positive and a lead as negative', () => {
    expect(parseSignedDurationText('2d', EIGHT)).toEqual({ ok: true, minutes: 960 });
    expect(parseSignedDurationText('-2d', EIGHT)).toEqual({ ok: true, minutes: -960 });
    expect(parseSignedDurationText('-4h', EIGHT)).toEqual({ ok: true, minutes: -240 });
    expect(parseSignedDurationText('0d', EIGHT)).toEqual({ ok: true, minutes: 0 });
  });

  it('accepts the typographic minus, so a value copied off the screen pastes back', () => {
    // `formatLag` has always rendered a real U+2212 for read-only display; a planner who copies one
    // and pastes it into the field must not be told their own value is unreadable.
    expect(parseSignedDurationText('−90m', EIGHT)).toEqual({ ok: true, minutes: -90 });
  });

  it('accepts a leading + and treats it as no sign at all', () => {
    expect(parseSignedDurationText('+3d', EIGHT)).toEqual({ ok: true, minutes: 1440 });
  });

  it('does NOT report a lead as the duration parser’s “negative” refusal', () => {
    // The magnitude parser rejects a leading `-` outright — correct for a duration, wrong for a lag.
    expect(parseSignedDurationText('-1d', EIGHT).ok).toBe(true);
    // A bare sign has no magnitude, and "enter a duration" is the useful sentence for that.
    expect(parseSignedDurationText('-', EIGHT)).toEqual({ ok: false, reason: 'empty' });
  });

  it('keeps the grammar’s refusals — weeks are named, not guessed', () => {
    expect(parseSignedDurationText('-1w', EIGHT)).toEqual({ ok: false, reason: 'unknown-unit' });
    expect(parseSignedDurationText('-2d 2d', EIGHT)).toEqual({
      ok: false,
      reason: 'repeated-unit',
    });
  });

  it('measures a day on the calendar it is handed, elapsed included', () => {
    // The trap this ADR exists to prevent: 24-hour is elapsed time, so `1d` is 1,440 minutes there
    // and 480 on an eight-hour calendar — the same text, two different lags.
    expect(parseSignedDurationText('1d', ELAPSED)).toEqual({ ok: true, minutes: 1440 });
    expect(parseSignedDurationText('1d', EIGHT)).toEqual({ ok: true, minutes: 480 });
  });
});

describe('formatSignedDurationText', () => {
  it('renders the shortest text that parses back to the same minutes', () => {
    expect(formatSignedDurationText(960, EIGHT)).toBe('2d');
    expect(formatSignedDurationText(-960, EIGHT)).toBe('-2d');
    expect(formatSignedDurationText(-90, EIGHT)).toBe('-1h 30m');
    expect(formatSignedDurationText(0, EIGHT)).toBe('0d');
  });

  it('uses an ASCII hyphen, because the planner has to be able to retype it', () => {
    // Not the typographic minus the read-only display uses: no keyboard produces U+2212, so a value
    // rendered with one is a value that cannot be corrected.
    expect(formatSignedDurationText(-480, EIGHT)).toBe('-1d');
    expect(formatSignedDurationText(-480, EIGHT)).not.toContain('−');
  });

  it('round-trips any signed minute count through the field it was typed into', () => {
    for (const minutes of [-5000, -481, -120, -1, 0, 1, 120, 481, 5000]) {
      const text = formatSignedDurationText(minutes, EIGHT);
      expect(parseSignedDurationText(text, EIGHT)).toEqual({ ok: true, minutes });
    }
  });
});

describe('checkSignedDurationText', () => {
  it('answers without a calendar, so a form can validate before the list resolves', () => {
    expect(checkSignedDurationText('-2d 4h')).toBeNull();
    expect(checkSignedDurationText('90m')).toBeNull();
    expect(checkSignedDurationText('1w')).toBe('unknown-unit');
    expect(checkSignedDurationText('')).toBe('empty');
  });
});
