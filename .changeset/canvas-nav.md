---
'@repo/web': minor
---

feat(web): canvas navigation & authoring aids on by default (VITE_CANVAS_NAV)

Turn three shaded TSLD-toolbar placeholders into real client-side commands over
already-shipped engine output — no API/schema/`@repo/types`/CPM-engine change (the
recalc parity gate is untouched):

- **Isolate logic path** — a split button that dims every activity NOT on the
  selected activity's transitive predecessor+successor chain (full, or a
  driving-only sub-chain), reusing the canvas-lenses dim seam and marking the a11y
  listbox; the chevron picks Full / Driving / Stop, the main button toggles.
- **Next conflict** — cycles the plan's flagged activities (constraint violation,
  visual conflict, external-driven, levelling-window exceeded, negative total
  float), centring, selecting and announcing each, with a visible "Conflict i of n
  · reason" chip.
- **Snap to grid** — a Visual-mode, pen-gated session toggle that rounds a dropped
  `visualStart` to the nearest working day before the existing PATCH.

Set `VITE_CANVAS_NAV=false` to restore the toolbar, canvas paint and a11y tree
byte-for-byte (rollback / opt-out).
