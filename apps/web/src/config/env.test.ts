import { describe, expect, it } from 'vitest';

import {
  CANVAS_LENSES_ENABLED,
  CANVAS_NAV_ENABLED,
  EXPORT_PRINT_ENABLED,
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
  it('is on by default (delivered & enabled, 2026-07-19; no VITE_CANVAS_LENSES set)', () => {
    // The three canvas insight lenses are wired to shipped data and on by default now that their
    // specialist reviews (perf / a11y / ux / component / security / test) are green (M4). Setting
    // VITE_CANVAS_LENSES=false ships the four ids as their disabled/"Coming soon" stubs and the canvas
    // paints byte-for-byte today's — the rollback path.
    expect(CANVAS_LENSES_ENABLED).toBe(true);
  });
});

describe('CANVAS_NAV_ENABLED', () => {
  it('is on by default (delivered & enabled, 2026-07-20; no VITE_CANVAS_NAV set)', () => {
    // Canvas nav (isolate / next-conflict / snap) is on by default now that its specialist reviews
    // (a11y / ux / component / perf / security / test) are green (M4). Setting VITE_CANVAS_NAV=false
    // resolves the three ids to their "Coming soon" placeholders, adds no new dimmedIds, and leaves the
    // Visual drag path byte-for-byte today's — the rollback path / parity gate.
    expect(CANVAS_NAV_ENABLED).toBe(true);
  });
});

describe('EXPORT_PRINT_ENABLED', () => {
  it('is OFF during build (dark, no VITE_EXPORT_PRINT set) — it flips on at M5', () => {
    // Export & print ships DARK behind `flagDefaultOff` while its specialist reviews run; it flips to
    // `flagDefaultOn` at the M5 enablement milestone. Until then `export`/`print` resolve to their
    // "Coming soon" placeholders (byte-for-byte today's toolbar) — the dark-by-default guard.
    expect(EXPORT_PRINT_ENABLED).toBe(false);
  });
});
