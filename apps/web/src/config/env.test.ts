import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_ACTIVITY_TYPES_ENABLED,
  CANVAS_LENSES_ENABLED,
  CANVAS_NAV_ENABLED,
  CANVAS_RESOURCE_VIEW_ENABLED,
  CANVAS_TIME_AXIS_ENABLED,
  EXPORT_PRINT_ENABLED,
  SCHEDULE_INTERCHANGE_ENABLED,
  TOOLBAR_QUICK_WINS_ENABLED,
  UNDO_REDO_ENABLED,
  flagDefaultOff,
  flagDefaultOn,
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
  // The gate is `flagDefaultOn(VITE_CANVAS_RESOURCE_VIEW) && RESOURCE_CURVES_ENABLED` (ADR-0049; on by
  // default 2026-07-20 after the five reviews went green): the flag AND the resource-histogram data
  // source. Exercise the composition's truth table (flag off/on × curves off/on) against the same
  // `flagDefaultOn` reader the constant now uses.
  const gate = (flag: string | undefined, curves: boolean): boolean =>
    flagDefaultOn(flag) && curves;

  it('is true when the flag is on/absent (default-on) AND the curves data source is on', () => {
    expect(gate(undefined, true)).toBe(true);
    expect(gate('true', true)).toBe(true);
    expect(gate('1', true)).toBe(true);
  });

  it('is false ONLY when explicitly disabled — the rollback path — regardless of the data source', () => {
    expect(gate('false', true)).toBe(false);
    expect(gate('0', true)).toBe(false);
  });

  it('is false when the flag is on but the curves data source is off (nothing to strip)', () => {
    expect(gate(undefined, false)).toBe(false);
    expect(gate('true', false)).toBe(false);
  });

  it('is ON at the build default (delivered & enabled; no VITE_CANVAS_RESOURCE_VIEW set, curves on)', () => {
    // On by default now that the resource strip + over-allocation highlight reviews are green (Stage E).
    // Setting VITE_CANVAS_RESOURCE_VIEW=false ships the resource-view/over-allocation ids as their
    // "Coming soon" placeholders and the canvas paints byte-for-byte today's — the rollback / parity path.
    expect(CANVAS_RESOURCE_VIEW_ENABLED).toBe(true);
  });
});

describe('SCHEDULE_INTERCHANGE_ENABLED', () => {
  it('is on by default (delivered & enabled, 2026-07-20; no VITE_SCHEDULE_INTERCHANGE set)', () => {
    // The schedule-interchange (P6 XER import) web review UI is on by default now that its five
    // specialist reviews (security / backend-performance / a11y / api / devops) are green (ADR-0050,
    // Stage C2 M1). Setting VITE_SCHEDULE_INTERCHANGE=false renders the plan-create surface byte-for-byte
    // today's — no "Import from file…" entry, no dialog, the review code unreached — the rollback path.
    expect(SCHEDULE_INTERCHANGE_ENABLED).toBe(true);
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

describe('CANVAS_TIME_AXIS_ENABLED', () => {
  it('is on by default (delivered & enabled, 2026-07-27; no VITE_CANVAS_TIME_AXIS set)', () => {
    // Range-anchored zoom presets, tiered gridlines, the interpolated Today marker/pill and
    // ground-vs-non-working shading (M2-M5) are on by default now that the M7 enablement gate
    // (ux/accessibility/component/performance reviews) is green. Setting
    // VITE_CANVAS_TIME_AXIS=false keeps ZOOM_STOPS, the single grid pass, whole-day Today, and the
    // flat non-working fill byte-for-byte — the rollback path / parity gate.
    expect(CANVAS_TIME_AXIS_ENABLED).toBe(true);
  });
});

describe('ACTIVITY_EDITOR_CONVERGENCE_ENABLED', () => {
  // The convergence flag is DERIVED from the tabbed-editor flag, not read beside it. With tabs off
  // and convergence on, the row menu's Logic and Resources items would build an editor intent for a
  // dialog that never renders — both entry points stranded on a surface that opens nothing. The
  // security review asked for the two to be coupled; deriving the constant makes that combination
  // unrepresentable rather than merely untested.
  it('is off whenever the tabbed editor is off, however it is set', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ACTIVITY_EDITOR_TABS', 'false');
    vi.stubEnv('VITE_ACTIVITY_EDITOR_CONVERGENCE', 'true');
    const env = await import('./env');
    expect(env.ACTIVITY_EDITOR_TABS_ENABLED).toBe(false);
    expect(env.ACTIVITY_EDITOR_CONVERGENCE_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('CANVAS_AUTHORING_FLOW_ENABLED', () => {
  // Derived from the canvas-authoring flag, not read beside it: every surface behind it states or
  // steers a canvas-first authoring tool, so with canvas authoring off there is no armed tool to
  // state and the band/confirmation/quiescence would be inert scaffolding. Deriving the constant
  // makes that pair unrepresentable; this asserts the `&&` is actually the right way round.
  it('is off whenever canvas authoring is off, however it is set', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CANVAS_AUTHORING', 'false');
    vi.stubEnv('VITE_CANVAS_AUTHORING_FLOW', 'true');
    const env = await import('./env');
    expect(env.CANVAS_AUTHORING_ENABLED).toBe(false);
    expect(env.CANVAS_AUTHORING_FLOW_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults ON when nothing is set', async () => {
    vi.resetModules();
    const env = await import('./env');
    expect(env.CANVAS_AUTHORING_FLOW_ENABLED).toBe(true);
    vi.resetModules();
  });
});

describe('CANVAS_LINK_ROUTING_ENABLED', () => {
  // Derived from the direct-manipulation flag for a structural reason, not a stylistic one: the
  // routing is reached only through the refreshed link path's fanned anchors (`scene.visualRefresh`),
  // which is the sole branch composing `routeOrthogonal` directly. With direct manipulation off
  // there is no branch to enter, so the pair would be silently inert rather than merely unused.
  it('is off whenever direct manipulation is off, however it is set', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CANVAS_DIRECT_MANIPULATION', 'false');
    vi.stubEnv('VITE_CANVAS_LINK_ROUTING', 'true');
    const env = await import('./env');
    expect(env.CANVAS_DIRECT_MANIPULATION_ENABLED).toBe(false);
    expect(env.CANVAS_LINK_ROUTING_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('can be switched off on its own — the rollback contract', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CANVAS_LINK_ROUTING', 'false');
    const env = await import('./env');
    expect(env.CANVAS_DIRECT_MANIPULATION_ENABLED).toBe(true);
    expect(env.CANVAS_LINK_ROUTING_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('CANVAS_MULTI_SELECT_ENABLED', () => {
  // Derived from direct manipulation because of a KEYBOARD COLLISION, not a layering preference:
  // the legacy edge-drag reads `Shift` as the start-to-start chord, and the multi-select epic gives
  // `Shift`+click the span meaning (spec `docs/specs/canvas-multi-select/` CQ-2). A standalone flag
  // would let both be live at once, so the `&&` makes that state unrepresentable — and this test is
  // what stops the `&&` being "simplified" away by someone who reads it as decoration.
  it('is off whenever direct manipulation is off, however it is set', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CANVAS_DIRECT_MANIPULATION', 'false');
    vi.stubEnv('VITE_CANVAS_MULTI_SELECT', 'true');
    const env = await import('./env');
    expect(env.CANVAS_DIRECT_MANIPULATION_ENABLED).toBe(false);
    expect(env.CANVAS_MULTI_SELECT_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults OFF — the epic is mid-build', async () => {
    vi.resetModules();
    const env = await import('./env');
    expect(env.CANVAS_DIRECT_MANIPULATION_ENABLED).toBe(true);
    expect(env.CANVAS_MULTI_SELECT_ENABLED).toBe(false);
    vi.resetModules();
  });

  it('opts in on "true" or "1", and on nothing else', async () => {
    for (const [value, expected] of [
      ['true', true],
      ['1', true],
      // The helper's documented trap: a shouted "TRUE" reads as OFF. Asserted rather than assumed,
      // because an operator who sets it that way gets silence, not an error.
      ['TRUE', false],
      ['yes', false],
      ['false', false],
    ] as const) {
      vi.resetModules();
      vi.stubEnv('VITE_CANVAS_MULTI_SELECT', value);
      const env = await import('./env');
      expect(env.CANVAS_MULTI_SELECT_ENABLED, `VITE_CANVAS_MULTI_SELECT=${value}`).toBe(expected);
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
