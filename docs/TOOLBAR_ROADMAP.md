# TSLD toolbar roadmap — future-feature placeholders

The plan toolbar (ADR-0031) shows a curated set of **future-feature placeholders**: controls that
are part of the intended design but whose behaviour isn't built yet. Each renders as a
permanently-disabled button with a **"Coming soon"** tooltip, so the toolbar reads as fully designed
and the roadmap is visible in-product. They are defined via `placeholderItem(...)` in
`apps/web/src/features/tsld/toolbar/tsld-toolbar-items.tsx`.

**Turning one on:** replace its `placeholderItem({...})` stub with a real `ToolbarItem` (wire
`onActivate`/`render`, `isEnabled`, `disabledReason`, and a context seam), add tests, and remove the
row from the table below. No taxonomy or primitive change is required — the slot already exists.

**Placeholder vs. capability-unavailable.** A disabled placeholder ("Coming soon") is distinct from a
control that is merely _temporarily_ unavailable (e.g. zoom before a diagram is computed, which reads
"Add an activity to enable zoom"). Both look greyed; the tooltip copy differentiates them.

## Catalogue

| Id                       | Group   | Placement    | Intended feature                                                                                                         |
| ------------------------ | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `undo`                   | history | inline       | Undo the last structural edit (needs an edit-history stack).                                                             |
| `redo`                   | history | inline       | Redo a reverted edit.                                                                                                    |
| `today`                  | frame   | `⋯` overflow | **Recenter on today** — pan the viewport to the today line (distinct from the "Today line" _display_ toggle in `View▾`). |
| `filter`                 | find    | `⋯` overflow | **Filter / Critical-only** — narrow the canvas to a subset (e.g. critical path, a WBS branch, a search).                 |
| `snap-to-grid`           | lens    | `⋯` overflow | Snap hand-placed (Visual-mode) bars to working-day gridlines while dragging.                                             |
| `clear-visual-placement` | tools   | `⋯` overflow | Drop a bar's hand-placed `visualStart` so it falls back to the computed date (Visual mode).                              |
| `next-conflict`          | find    | `⋯` overflow | Step the viewport through engine-flagged Visual-planning conflicts.                                                      |

## Notes

- The Visual-planning placeholders (`snap-to-grid`, `clear-visual-placement`, `next-conflict`) are
  only meaningful in **Visual** scheduling mode (ADR-0033). When built, they should follow the
  shade-don't-hide rule: shown disabled in Early mode rather than removed.
- `view-mode` remains a genuinely-reserved hidden slot (TSLD is the only lens today); it stays hidden
  via `isVisible: () => false` until a second view (e.g. Gantt/table) is designed, at which point it
  becomes a real lens switch rather than a placeholder.
