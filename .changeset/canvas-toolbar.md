---
'@repo/web': minor
---

feat(web): canvas-maximal toolbar-hosted plan workspace (ADR-0031)

Build the future-proof Toolbar architecture and the canvas-maximal chrome reclaim behind the
`VITE_CANVAS_TOOLBAR` flag (default-off; layered on `VITE_CANVAS_WORKSPACE`):

- A generic APG `<Toolbar>` primitive + declarative item registry (7-group taxonomy, three
  prominence tiers, responsive overflow, pen-gated authoring group, and non-interactive
  presentational read-outs kept out of the roving-tabindex order).
- The TSLD command registry — every current canvas control (scale/zoom/fit, view toggles, add
  activity, auto-arrange, recalculate, baselines/calendar/plan-details, legend, summary + a pinned
  Project-finish chip) expressed as registry items over a `ToolbarContext`.
- A compact pen-status control (replacing the big edit-lock banner card) and a floating
  selection-actions bar, both reusing the ADR-0028 hand-off internals via one shared hook.
- The toolbar-hosted layout: a slim header + one command toolbar over a full-height **chromeless**
  canvas with the activities panel **collapsed by default**, and a below-`md` Diagram/Activities
  pane switch. Flag-off keeps the ADR-0030 workspace byte-for-byte (`TsldPanel` gains an optional
  controlled `canvasUi` + `chromeless` prop).

Includes the flag-on Playwright journey and the specialist-review remediation: a shared
recalculate command (loading + no-start hint restored), memoised toolbar context/UI-state so an
unrelated re-render no longer churns the toolbar's `ResizeObserver`, one CVA for every toolbar
control surface, and the accessibility fixes (presentational finish chip, disabled-overflow focus
ring, popover close-on-blur).

Frontend only. **ON by default** (`VITE_CANVAS_TOOLBAR`); set it to `false` to fall back to the
ADR-0030 workspace byte-for-byte (emergency rollback / opt-out). Remaining fast-follows: TECH_DEBT #31.
