---
'@repo/web': minor
---

The TSLD minimap (ADR-0100): a 200×120 overview panel in the diagram's bottom-right —
an invariant picture of the whole programme (critical path survives the merge, data-date
line included) with the live viewport as a rectangle on top. Drag the rectangle to pan,
click outside it to jump, or drive it from the keyboard (arrows page-pan, Home/End reach
the plan's first and last dated days) — the first unanchored keyboard pan the canvas has
had. Off by default under `View ▾ ▸ Panels ▸ Minimap`; selection marker and Today line
stay live without ever rebuilding the picture; measured to add nothing the eye can see to
the pan path (paired falsification runs recorded in the spec).
