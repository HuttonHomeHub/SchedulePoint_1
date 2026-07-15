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

| Id                       | Group   | Placement    | Intended feature                                                                                                                                           |
| ------------------------ | ------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `undo`                   | history | inline       | Undo the last structural edit (needs an edit-history stack).                                                                                               |
| `redo`                   | history | inline       | Redo a reverted edit.                                                                                                                                      |
| `today`                  | frame   | `⋯` overflow | **Recenter on today** — pan the viewport to the today line (distinct from the "Today line" _display_ toggle in `View▾`).                                   |
| `filter`                 | find    | `⋯` overflow | **Filter / Critical-only** — narrow the canvas to a subset (e.g. critical path, a WBS branch, a search).                                                   |
| `snap-to-grid`           | lens    | `⋯` overflow | Snap hand-placed (Visual-mode) bars to working-day gridlines while dragging.                                                                               |
| `clear-visual-placement` | tools   | `⋯` overflow | Drop a bar's hand-placed `visualStart` so it falls back to the computed date (Visual mode).                                                                |
| `next-conflict`          | find    | `⋯` overflow | Step the viewport through engine-flagged Visual-planning conflicts.                                                                                        |
| `search`                 | find    | `⋯` overflow | **Search** — jump to an activity by name or code.                                                                                                          |
| `isolate-logic`          | find    | `⋯` overflow | **Isolate logic path** — highlight the driving/longest path, or a selection's predecessors & successors.                                                   |
| `colour-by`              | lens    | `⋯` overflow | **Colour by** — recolour bars by status / WBS / critical / resource.                                                                                       |
| `baseline-overlay`       | lens    | `⋯` overflow | **Baseline overlay** — ghost the active baseline's bars behind the live ones (baselines are captured; not yet drawn). Becomes a `View▾` toggle when built. |
| `resource-view`          | lens    | `⋯` overflow | **Resource view** — a second lens (resource histogram / over-allocation); the real `view-mode` lens switch.                                                |
| `add-note`               | tools   | `⋯` overflow | **Add note** — a free-text annotation / callout pinned to the canvas or an activity (review markup).                                                       |
| `export`                 | object  | `⋯` overflow | **Export** — the diagram (PDF/PNG) or the schedule (XER/MSP/CSV).                                                                                          |
| `print`                  | object  | `⋯` overflow | **Print**.                                                                                                                                                 |
| `share`                  | object  | `⋯` overflow | **Share** — surface the ADR-0012 per-plan External-Guest link as a toolbar action.                                                                         |
| `comments`               | object  | `⋯` overflow | **Comments** — activity comment threads (leans on the multi-tenant + guest-share model).                                                                   |
| `update-progress`        | object  | `⋯` overflow | **Update progress** — apply actuals and advance the data date (the "status the plan" workflow).                                                            |

## Notes

- The Visual-planning placeholders (`snap-to-grid`, `clear-visual-placement`, `next-conflict`) are
  only meaningful in **Visual** scheduling mode (ADR-0033). When built, they should follow the
  shade-don't-hide rule: shown disabled in Early mode rather than removed.
- `resource-view` is the visible "Coming soon" preview of a second lens; the `view-mode` slot remains a
  genuinely-reserved **hidden** stub (`isVisible: () => false`) that becomes the real lens **switch**
  (TSLD / Gantt / Resource) once more than one view exists — at which point `resource-view` folds into it.
- Several placeholders become **`View▾` toggles** rather than toolbar buttons when built (`baseline-overlay`,
  and a future show/hide-notes toggle for `add-note`); the button is a stand-in for the affordance, not a
  commitment to its final shape.
