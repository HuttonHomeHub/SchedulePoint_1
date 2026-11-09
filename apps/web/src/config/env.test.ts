import { describe, expect, it } from 'vitest';

import { flagDefaultOff, flagDefaultOn } from './env';

describe('flagDefaultOn', () => {
  it('is on unless the operator explicitly opts out with "false" or "0"', () => {
    expect(flagDefaultOn(undefined)).toBe(true);
    expect(flagDefaultOn('')).toBe(true);
    expect(flagDefaultOn('true')).toBe(true);
    expect(flagDefaultOn('false')).toBe(false);
    expect(flagDefaultOn('0')).toBe(false);
  });
});

describe('flagDefaultOff', () => {
  it('is on ONLY for an explicit opt-in ("true"/"1")', () => {
    expect(flagDefaultOff('true')).toBe(true);
    expect(flagDefaultOff('1')).toBe(true);
  });

  it('stays off for undefined, blank, and anything else — the dark-by-default guard', () => {
    expect(flagDefaultOff(undefined)).toBe(false);
    expect(flagDefaultOff('')).toBe(false);
    expect(flagDefaultOff('false')).toBe(false);
    expect(flagDefaultOff('0')).toBe(false);
    expect(flagDefaultOff('TRUE')).toBe(false); // case-sensitive: only the literal "true"
    expect(flagDefaultOff('yes')).toBe(false);
  });
});
