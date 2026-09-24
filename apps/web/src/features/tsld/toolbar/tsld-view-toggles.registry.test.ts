import { describe, expect, it } from 'vitest';

import { TSLD_VIEW_TOGGLE_KEYS } from './tsld-toolbar-items';

import {
  CANVAS_LIVE_FEEDBACK_ENABLED,
  CANVAS_VISUAL_LANGUAGE_ENABLED,
  CANVAS_DATA_DATE_ENABLED,
  WBS_IMPROVEMENTS_ENABLED,
} from '@/config/env';

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
 *
 * `Month bands` (tsld-toolbar-canvas-refinements M5, F7b) joined the Structure group the same
 * way — gated on `VITE_CANVAS_VISUAL_LANGUAGE`, which decides whether the ground layer exists at
 * all; the toggle only lets a user switch an existing layer off for the session.
 *
 * `WBS band` (ADR-0063) is the newest Structure member, gated on `VITE_WBS_IMPROVEMENTS`. It is
 * the entry this test was written for: the band's whole paint layer is unreachable without it.
 */
describe('TSLD View▾ toggle registry', () => {
  it('offers every view layer one of the two views can actually draw', () => {
    expect(TSLD_VIEW_TOGGLE_KEYS).toEqual([
      'dayGrid',
      'monthGrid',
      'yearGrid',
      // The alternating month-band ground (F7b) — gated on VITE_CANVAS_VISUAL_LANGUAGE.
      'monthBands',
      // The ADR-0063 pinned WBS band — gated on VITE_WBS_IMPROVEMENTS. It sits with its Structure
      // group-mates rather than at the end: the order here is the order of the menu.
      'wbsBand',
      // **The first member this menu holds that the CANVAS does not paint** (Gantt editing M4).
      // The diagram has always drawn its logic; this switches the GANTT's dependency arrows, and
      // is inert on the canvas. That is why this test's name changed from "every view layer the
      // canvas can actually paint" — the premise was true for thirteen entries and stopped being
      // true for the fourteenth, which is worth stating rather than quietly widening.
      //
      // It is also the only entry that defaults OFF (the product owner's Q1 answer): logic on a
      // dense programme is a thicket, and a selected row's own links draw regardless, so the
      // off-state still answers "why is this bar here?".
      'logicLinks',
      // The data-date status line (canvas status & feedback M1) — gated on VITE_CANVAS_DATA_DATE,
      // default-on 2026-08-07. It sits immediately before Today because the two are one decision:
      // they are the canvas's two vertical time markers and a planner reads them as a pair.
      'dataDate',
      'today',
      'nonWorking',
      'labels',
      // NetPoint grammar M4-T1: the canvas label's code, and the centre item, both default off.
      'activityCodes',
      'centreItem',
      // The ADR-0054 insight layers — each one's paint pass is dead code without its entry here.
      'dates',
      // **The key is `floatTails` and the LABEL is "Feasible window"** (one-planning-surface M-E).
      // The window replaced the float and drift tails — one fact that had been drawn twice — and
      // the key deliberately did not move with the copy: renaming it would touch three consumers
      // and the whole `TsldViewToggles` contract to describe the same overlay.
      'floatTails',
      'linkSlack',
      // The ADR-0033 Late-start overlay. It was gated on `VITE_SCHEDULING_MODES` rather than on
      // `VITE_CANVAS_LIVE_FEEDBACK`; the collapse (M-F-T5) left it ungated, because it reads the
      // LATE dates and never once consulted `schedulingMode`.
      'lateOverlay',
    ]);
  });

  it('gates the insight layers (and Month bands) on their own flags, and nothing else', () => {
    // Guards the rollback contract from the other direction: every flag off must leave exactly
    // the six pre-epic layers, so a future entry added outside the gate is caught here rather
    // than in production.
    //
    // `logicLinks` is deliberately NOT in this list of gated entries: the Gantt-editing epic has no
    // feature flag at all (the product owner's Q4 choice), so it is offered wherever the menu is.
    // Counted below rather than gated above — the count is what catches an entry added by
    // accident, and an ungated entry still has to be added on purpose.
    expect(CANVAS_LIVE_FEEDBACK_ENABLED).toBe(true);
    expect(CANVAS_VISUAL_LANGUAGE_ENABLED).toBe(true);
    expect(WBS_IMPROVEMENTS_ENABLED).toBe(true);
    expect(CANVAS_DATA_DATE_ENABLED).toBe(true);
    // 16 since NetPoint grammar M4-T1 added `activityCodes` and `centreItem`, both ungated: they
    // switch text on an existing layer, so there is no flag for them to follow.
    expect(TSLD_VIEW_TOGGLE_KEYS).toHaveLength(16);
  });
});
