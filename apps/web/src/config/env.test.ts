import { describe, expect, it } from 'vitest';

import {
  CANVAS_ACTIVITY_TYPES_ENABLED,
  CANVAS_LENSES_ENABLED,
  CANVAS_NAV_ENABLED,
  CANVAS_RESOURCE_VIEW_ENABLED,
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
  it('is on by default (delivered & enabled, 2026-07-20; no VITE_EXPORT_PRINT set)', () => {
    // Export & print (CSV + PNG/PDF + browser Print) is on by default now that its six specialist
    // reviews (security / devops / performance / a11y / ux / component) are green (M5). Setting
    // VITE_EXPORT_PRINT=false resolves `export`/`print` to their "Coming soon" placeholders, loads no
    // export module or jsPDF chunk, and leaves the toolbar/canvas/a11y tree byte-for-byte — the
    // rollback path / parity gate.
    expect(EXPORT_PRINT_ENABLED).toBe(true);
  });
});

describe('CANVAS_RESOURCE_VIEW_ENABLED', () => {
  // The gate is `flagDefaultOff(VITE_CANVAS_RESOURCE_VIEW) && RESOURCE_CURVES_ENABLED` (ADR-0049, Task 1):
  // the new dark flag AND the resource-histogram data source. Exercise the composition's truth table
  // (flag off/on × curves off/on) against the same `flagDefaultOff` reader the constant uses.
  const gate = (flag: string | undefined, curves: boolean): boolean =>
    flagDefaultOff(flag) && curves;

  it('is true ONLY when the flag is explicitly on AND the curves data source is on', () => {
    expect(gate('true', true)).toBe(true);
    expect(gate('1', true)).toBe(true);
  });

  it('is false when the flag is off (dark by default) regardless of the data source', () => {
    expect(gate(undefined, true)).toBe(false);
    expect(gate(undefined, false)).toBe(false);
    expect(gate('false', true)).toBe(false);
  });

  it('is false when the flag is on but the curves data source is off (nothing to strip)', () => {
    expect(gate('true', false)).toBe(false);
    expect(gate('1', false)).toBe(false);
  });

  it('is OFF at the build default (dark until Task 6 flips it, gated on the data source)', () => {
    // No VITE_CANVAS_RESOURCE_VIEW set in the test env ⇒ the derived constant is false even though
    // RESOURCE_CURVES is on by default — the parity gate (placeholder + byte-for-byte canvas).
    expect(CANVAS_RESOURCE_VIEW_ENABLED).toBe(false);
  });
});

describe('CANVAS_ACTIVITY_TYPES_ENABLED', () => {
  it('is on by default (delivered & enabled, 2026-07-20; no VITE_CANVAS_ACTIVITY_TYPES set)', () => {
    // On-canvas advanced activity types (Stage D) is on by default now that its five specialist reviews
    // (a11y / ux / component / perf / test) are green (Task 4). Setting VITE_CANVAS_ACTIVITY_TYPES=false
    // keeps the Add menu's disabled "Soon" placeholders byte-for-byte and leaves the LOE endpoint-pick
    // tool unreachable — the rollback path / parity gate.
    expect(CANVAS_ACTIVITY_TYPES_ENABLED).toBe(true);
  });
});
