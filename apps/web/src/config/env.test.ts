import { describe, expect, it } from 'vitest';

import { UNDO_REDO_ENABLED, flagDefaultOff } from './env';

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

describe('UNDO_REDO_ENABLED', () => {
  it('is off by default (dark M1 — no VITE_UNDO_REDO set in the test env)', () => {
    // The undo/redo feature ships dark: with the flag unset, no command is recorded and behaviour
    // is byte-identical to today. A per-flag default guard mirroring the dark-by-default contract.
    expect(UNDO_REDO_ENABLED).toBe(false);
  });
});
