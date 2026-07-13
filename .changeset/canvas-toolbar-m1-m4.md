---
'@repo/web': minor
---

feat(web): canvas-maximal toolbar-hosted plan workspace (ADR-0031, M1–M4)

Build the future-proof Toolbar architecture and the canvas-maximal chrome reclaim behind the new
`VITE_CANVAS_TOOLBAR` flag (default-off; layered on `VITE_CANVAS_WORKSPACE`):

- A generic APG `<Toolbar>` primitive + declarative item registry (7-group taxonomy, three
  prominence tiers, responsive overflow, pen-gated authoring group).
- The TSLD command registry — every current canvas control (scale/zoom/fit, view toggles, add
  activity, auto-arrange, recalculate, baselines/calendar/plan-details, legend, summary + a pinned
  Project-finish chip) expressed as registry items over a `ToolbarContext`.
- A compact pen-status control (replacing the big edit-lock banner card) and a floating
  selection-actions bar, both reusing the ADR-0028 hand-off internals via one shared hook.
- The toolbar-hosted layout: a slim header + one command toolbar over a full-height **chromeless**
  canvas with the activities panel **collapsed by default**. Flag-off keeps the ADR-0030 workspace
  byte-for-byte (`TsldPanel` gains an optional controlled `canvasUi` + `chromeless` prop).

Frontend only; still dark behind the flag. Flips default-on at M5 once the a11y/e2e/perf gates pass.
