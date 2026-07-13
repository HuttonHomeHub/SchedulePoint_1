---
'@repo/web': minor
---

feat(web): canvas-first plan workspace — M2 resizable/collapsible activity panel (ADR-0030)

With `VITE_CANVAS_WORKSPACE` on, the bottom activity panel can now be **dragged up/down to
resize** and **collapsed to a handle** (pointer + keyboard), with its height and collapsed state
persisted. The panel's height is clamped against the live workspace height so the canvas always
keeps a minimum, and the canvas no longer **jumps/re-fits** while the panel is dragged (the TSLD
canvas preserves its viewport across a surface resize; explicit Fit and a data-date change still
re-frame).

Per the product-owner steer, this extracts a single **orientation-aware resizable-panel
primitive** — `PanelResizer` (a WAI-ARIA window splitter) + `useResizablePanelPrefs` (clamp +
persist + reset-on-corrupt) — and **refactors the Project Explorer rail onto it**, so the rail
(vertical splitter → width) and the activity panel (horizontal splitter → height) share one
implementation. No behaviour change to the rail. Frontend only; still off by default.
