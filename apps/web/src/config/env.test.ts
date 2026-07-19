import { describe, expect, it } from 'vitest';

import { TOOLBAR_QUICK_WINS_ENABLED, UNDO_REDO_ENABLED, flagDefaultOff } from './env';

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
  it('is on by default (delivered & enabled, 2026-07-19; no VITE_UNDO_REDO set in the test env)', () => {
    // Undo/redo is on by default now that its gates are green (ADR-0048). Setting VITE_UNDO_REDO=false
    // ships it inert (no store/keys, placeholder toolbar items) — the rollback path.
    expect(UNDO_REDO_ENABLED).toBe(true);
  });
});

describe('TOOLBAR_QUICK_WINS_ENABLED', () => {
  it('is a flagDefaultOff flag — OFF during build with no VITE_TOOLBAR_QUICK_WINS set', () => {
    // The toolbar quick-wins flag is dark by default this build (it flips on after the specialist
    // reviews, M3). With no env set, the five ids stay their "Coming soon" placeholders — byte-for-byte
    // today's toolbar. It must NOT default on.
    expect(TOOLBAR_QUICK_WINS_ENABLED).toBe(false);
  });
});
