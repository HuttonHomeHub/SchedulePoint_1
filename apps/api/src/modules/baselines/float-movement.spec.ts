import { describe, expect, it } from 'vitest';

import { compareFloat, floatDaysOnFrame } from './float-movement';

describe('compareFloat', () => {
  it('subtracts minutes when both sides hold them', () => {
    expect(compareFloat({ days: 5, minutes: 2400 }, { days: 3, minutes: 1440 })).toEqual({
      kind: 'COMPARABLE',
      movementMinutes: -960,
    });
  });

  it('treats zero movement as a movement, not as absence', () => {
    expect(compareFloat({ days: 5, minutes: 2400 }, { days: 2, minutes: 2400 })).toEqual({
      kind: 'COMPARABLE',
      movementMinutes: 0,
    });
  });

  it('is not comparable when a side has days but no minutes', () => {
    expect(compareFloat({ days: 5, minutes: null }, { days: 5, minutes: 2400 }).kind).toBe(
      'NOT_COMPARABLE',
    );
    expect(compareFloat({ days: 5, minutes: 2400 }, { days: 5, minutes: null }).kind).toBe(
      'NOT_COMPARABLE',
    );
  });

  it('is not calculated when a side has no days, whatever the other holds', () => {
    expect(compareFloat({ days: null, minutes: null }, { days: 5, minutes: null }).kind).toBe(
      'NOT_CALCULATED',
    );
  });
});

describe('floatDaysOnFrame', () => {
  it('rounds once, on the frame', () => {
    expect(floatDaysOnFrame(2400, 480)).toBe(5);
    expect(floatDaysOnFrame(2400, 1440)).toBe(2);
    expect(floatDaysOnFrame(-960, 480)).toBe(-2);
  });

  it('keeps no minutes as null, never zero', () => {
    expect(floatDaysOnFrame(null, 480)).toBeNull();
  });
});
