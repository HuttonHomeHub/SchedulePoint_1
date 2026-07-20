---
'@repo/web': minor
---

feat(web): canvas resource view & over-allocation highlight on by default (VITE_CANVAS_RESOURCE_VIEW)

Turn the `resource-view` TSLD-toolbar placeholder into a real Look-row lens over
already-shipped engine output — no API/schema/`@repo/types`/CPM-engine change (the
recalc parity gate is untouched):

- **Resource view** — toggles a **canvas-axis-aligned demand strip**: a Canvas 2D
  sibling layer (the third ADR-0026 layer: scene · interaction · strip) painted by
  the existing TsldCanvas rAF loop from the same viewport, so bucketed
  resource-loading bars sit under the diagram's day/week/month columns and pan/zoom
  with zero desync. Strip chrome (resource picker + bucket-size select + accessible
  data table) is a DOM `ResourceStripPanel` docked above the reserved band; strip
  bars are canvas. Reads the shipped resource-histogram read-model.
- **Flag over-allocated** — a sibling lens that rings over-allocated activity bars
  with a rising-histogram shape badge (a non-colour-only cue distinct from the
  constraint pin / conflict / lane-overlap badges), plus a parallel listbox marker
  and a polite count announcement, derived from the shipped levelling flags
  (`levelingWindowExceeded`/`selfOverAllocated`). Independent of the demand strip;
  disabled-with-reason when nothing is over-allocated but stays clickable-to-off
  while active.

Behind `VITE_CANVAS_RESOURCE_VIEW` (on by default, gated on the resource-histogram
data source): set it to `false` to ship both ids as their "Coming soon"
placeholders and paint the canvas byte-for-byte as today (the rollback / parity
path). See ADR-0049. Stage E of the toolbar-placeholder burn-down.
