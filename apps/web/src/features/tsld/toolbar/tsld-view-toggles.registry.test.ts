import { describe, expect, it } from 'vitest';

import { TSLD_VIEW_TOGGLE_KEYS } from './tsld-toolbar-items';

import { CANVAS_LIVE_FEEDBACK_ENABLED, SCHEDULING_MODES_ENABLED } from '@/config/env';

/**
 * Pins the `View▾` toggle registry (ADR-0054 §3–§5, tsld-toolbar-canvas-refinements F8).
 *
 * This test exists because of a real defect, not a hypothetical one: the `Float & drift` and
 * `Link slack` entries were silently dropped by a search-and-replace that matched nothing after
 * Prettier reflowed the array. Their paint passes shipped unreachable — no production code path
 * could set the scene flags — while the changeset and release notes claimed both toggles were
 * available. Everything else was green: types, lint and every painter unit test passed, because
 * the tests construct scenes directly and never went through the registry.
 *
 * A registry that decides which features are reachable, and whose omissions type-check, needs an
 * explicit assertion of its contents. `Late-start overlay` joined this list when the panel was
 * regrouped into Structure / Markers / Insight overlays: it used to be a special-cased checkbox
 * rendered outside `VIEW_TOGGLES` (and so outside this pin) — now it's an ordinary
 * `VIEW_TOGGLE_META` entry like every other insight layer, still gated on its own flag.
 */
describe('TSLD View▾ toggle registry', () => {
  it('offers every view layer the canvas can actually paint', () => {
    expect(TSLD_VIEW_TOGGLE_KEYS).toEqual([
      'dayGrid',
      'monthGrid',
      'yearGrid',
      'today',
      'nonWorking',
      'labels',
      // The ADR-0054 insight layers — each one's paint pass is dead code without its entry here.
      'dates',
      'floatTails',
      'linkSlack',
      // The ADR-0033 Late-start overlay — gated on VITE_SCHEDULING_MODES, not VITE_CANVAS_LIVE_FEEDBACK.
      'lateOverlay',
    ]);
  });

  it('gates the insight layers on their own flags, and nothing else', () => {
    // Guards the rollback contract from the other direction: both flags off must leave exactly
    // the six pre-epic layers, so a future entry added outside the gate is caught here rather
    // than in production.
    expect(CANVAS_LIVE_FEEDBACK_ENABLED).toBe(true);
    expect(SCHEDULING_MODES_ENABLED).toBe(true);
    expect(TSLD_VIEW_TOGGLE_KEYS).toHaveLength(10);
  });
});
