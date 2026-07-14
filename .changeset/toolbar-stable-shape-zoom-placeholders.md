---
'@repo/web': minor
---

feat(web): consolidate the plan toolbar — one zoom dropdown, a stable shape, and future-feature placeholders (ADR-0031 amendment)

Refines the TSLD plan toolbar so it stops "changing what's visible" as plan/mode state shifts:

- **One zoom control.** The five scale buttons (Day/Week/Month/Quarter/Year) collapse into a single
  `Zoom: <level> ▾` dropdown. This removes the Frame-group overload that made the width-based
  overflow silently demote Year/Quarter into the `⋯` at common widths.
- **Shade, don't hide.** Zoom/Fit (and View/Legend/Shortcuts) now stay on the bar from the empty
  canvas onward — the zoom cluster is _disabled with a reason_ until a diagram is computed, rather
  than vanishing. The toolbar's silhouette no longer shifts between planning states.
- **Future-feature placeholders.** Reserved slots now render as disabled "Coming soon" controls so
  the toolbar reads as fully designed: Undo/Redo inline; Recenter-on-today, Filter, Snap-to-grid,
  Clear-visual-placement and Next-conflict in the `⋯` overflow. Catalogue: `docs/TOOLBAR_ROADMAP.md`.

Frontend only, within the existing `VITE_CANVAS_TOOLBAR` surface; the flag-off `TsldViewControls`
fallback is unchanged. No API/DB/type change.
