import { describe, expect, it } from 'vitest';

import {
  formatRemainingRead,
  remainingHelp,
  remainingLabel,
  remainingTextField,
  remainingWriteFields,
  seedRemainingText,
} from './remaining-field';

/** An eight-hour working day — the shape that makes the day field lossy in the first place. */
const EIGHT = 8;

function row(
  remainingDurationMinutes: number | null,
  remainingDurationDays: number | null = remainingDurationMinutes === null
    ? null
    : Math.round(remainingDurationMinutes / (EIGHT * 60)),
) {
  return { remainingDurationMinutes, remainingDurationDays };
}

describe('remainingWriteFields', () => {
  it('sends minutes converted on the activity’s calendar', () => {
    expect(remainingWriteFields('4h', EIGHT)).toEqual({ remainingDurationMinutes: 240 });
    expect(remainingWriteFields('1d', EIGHT)).toEqual({ remainingDurationMinutes: 480 });
    expect(remainingWriteFields('90m', EIGHT)).toEqual({ remainingDurationMinutes: 90 });
  });

  it('sends null for a blank field — "derive it from percent complete"', () => {
    // Null, not an omitted key: absent would mean "leave whatever is stored", which is the
    // opposite of what clearing the field says.
    expect(remainingWriteFields('', EIGHT)).toEqual({ remainingDurationMinutes: null });
    expect(remainingWriteFields('   ', EIGHT)).toEqual({ remainingDurationMinutes: null });
  });

  it('refuses text it cannot read rather than sending a wrong number', () => {
    expect(remainingWriteFields('1w', EIGHT)).toBeNull();
    expect(remainingWriteFields('soon', EIGHT)).toBeNull();
  });

  it('falls back to whole days when the calendar’s hours are unknown', () => {
    expect(remainingWriteFields('3', undefined)).toEqual({ remainingDurationDays: 3 });
    expect(remainingWriteFields('', undefined)).toEqual({ remainingDurationDays: null });
    // Days is the one unit that needs no factor, so it is the only one this path can accept.
    expect(remainingWriteFields('4h', undefined)).toBeNull();
    expect(remainingWriteFields('1.5', undefined)).toBeNull();
  });
});

describe('seedRemainingText', () => {
  it('opens a sub-day remainder as itself, not as the 0 its day field rounds to', () => {
    expect(seedRemainingText(row(240), EIGHT)).toBe('4h');
  });

  it('opens a blank field when there is no explicit remaining', () => {
    expect(seedRemainingText(row(null), EIGHT)).toBe('');
    expect(seedRemainingText(row(null), undefined)).toBe('');
  });

  it('treats an ABSENT field the same as a null one', () => {
    // A partially-built row reaches here with `undefined`. Reading that differently produced the
    // literal text "undefined", which the schema refused — blocking a save on an untouched field.
    const partial = {} as {
      remainingDurationMinutes: number | null;
      remainingDurationDays: number | null;
    };
    expect(seedRemainingText(partial, EIGHT)).toBe('');
    expect(seedRemainingText(partial, undefined)).toBe('');
  });

  it('degrades to the row’s own whole days when the factor is unknown', () => {
    expect(seedRemainingText(row(240, 0), undefined)).toBe('0');
    expect(seedRemainingText(row(960, 2), undefined)).toBe('2');
  });
});

describe('formatRemainingRead', () => {
  it('prints nothing when there is no explicit remaining', () => {
    expect(formatRemainingRead(row(null), EIGHT)).toBe('');
  });

  it('prints the row’s own days for a whole-day remainder', () => {
    expect(formatRemainingRead(row(960, 2), EIGHT)).toBe('2 d');
  });

  it('prints the finer text only when the value actually is finer', () => {
    expect(formatRemainingRead(row(240, 0), EIGHT)).toBe('4h');
  });
});

describe('remainingLabel / remainingHelp', () => {
  it('states the unit only when the unit is fixed', () => {
    expect(remainingLabel(EIGHT)).toBe('Remaining duration');
    expect(remainingLabel(undefined)).toBe('Remaining duration (days)');
  });

  it('always says what a blank field means, and names the day only when it can', () => {
    expect(remainingHelp(undefined)).toBe(
      'Leave blank to derive the remaining work from the percent complete.',
    );
    expect(remainingHelp(EIGHT)).toContain('Leave blank');
    expect(remainingHelp(EIGHT)).toContain('8 working hours');
  });
});

describe('remainingTextField', () => {
  const schema = remainingTextField();

  it('accepts a blank field — unlike the duration rule, empty is a real value here', () => {
    expect(schema.safeParse('').success).toBe(true);
    expect(schema.safeParse('  ').success).toBe(true);
  });

  it('accepts the grammar and refuses what it cannot read', () => {
    expect(schema.safeParse('2d 4h').success).toBe(true);
    expect(schema.safeParse('1w').success).toBe(false);
  });
});
