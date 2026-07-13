---
'@repo/web': minor
---

feat(web): canvas-first plan authoring on by default (ADR-0032)

`VITE_CANVAS_AUTHORING` now defaults **on** (M1–M5 shipped with green a11y/ux/perf/e2e gates). A
planner builds a plan directly on the TSLD canvas: a blank draw-ready canvas on a new plan, an inline
timeline start-date, unified auto-recalculation after any structural edit, on-canvas activity types
(Task + Start/Finish milestone via the Add split-button), and a two-click Link tool in place of
edge-drag. It requires the toolbar + workspace flags (both default-on); turning either off disables
authoring too. Set `VITE_CANVAS_AUTHORING=false` to roll back to table-first authoring + edge-drag
linking, byte-for-byte.
