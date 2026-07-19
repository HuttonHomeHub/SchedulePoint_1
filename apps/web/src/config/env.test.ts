import { describe, expect, it } from 'vitest';

import {
  CANVAS_LENSES_ENABLED,
  TOOLBAR_QUICK_WINS_ENABLED,
  UNDO_REDO_ENABLED,
  flagDefaultOff,
} from './env';

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
  it('is on by default (delivered & enabled, 2026-07-19; no VITE_TOOLBAR_QUICK_WINS set)', () => {
    // The five quick-wins are wired to shipped features and on by default now that their specialist
    // reviews (a11y / ux / component / perf / security / test) are green (M3). Setting
    // VITE_TOOLBAR_QUICK_WINS=false ships the five ids as their "Coming soon" placeholders — the
    // byte-for-byte rollback path.
    expect(TOOLBAR_QUICK_WINS_ENABLED).toBe(true);
  });
});

describe('CANVAS_LENSES_ENABLED', () => {
  it('is OFF by default during build (flagDefaultOff; no VITE_CANVAS_LENSES set)', () => {
    // The canvas insight lenses ship dark during the build and flip on at M4 once the specialist
    // reviews are green. With no env set, `flagDefaultOff` keeps them off — so the search field is the
    // disabled stub, filter/colour-by/baseline-overlay are "Coming soon" placeholders, and the canvas
    // paints byte-for-byte today's.
    expect(CANVAS_LENSES_ENABLED).toBe(false);
  });
});
