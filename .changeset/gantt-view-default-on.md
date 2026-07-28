---
'@repo/web': minor
---

Turn the Gantt view on by default (ADR-0059 M6, `VITE_GANTT_VIEW`).

The plan workspace now carries a **Diagram | Gantt** switch. The Gantt is a grid-and-bar
projection of the same schedule — WBS summary rows, criticality, float tails, progress, the
baseline variance bar, and a printed programme — for the audience that does not read logic
diagrams. The view choice lives in the URL, so it is deep-linkable and survives a reload.

Read-only by design: editing stays in the diagram. Rendered as virtualized DOM rows rather than
canvas, so the grid is keyboard-navigable and screen-reader-readable natively, and the live row
count stays bounded by the viewport whatever the plan holds.

The enablement pass fixed a control that was lit but did nothing: the zoom presets delegated only
to the canvas, which is not mounted while the Gantt is showing. They now drive both views. Zoom
in/out, Fit and Go-to-date are canvas-only and say so rather than sitting enabled and inert.

Set `VITE_GANTT_VIEW=false` to roll back to the diagram-only workspace.
