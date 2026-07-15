# TSLD toolbar roadmap — future-feature placeholders

The plan toolbar (ADR-0031, two-row amendment 2026-07-15) shows a curated set of **future-feature
placeholders**: controls that are part of the intended design but whose behaviour isn't built yet.
Each renders as a permanently-disabled button with a **"Coming soon"** tooltip, so the toolbar reads
as fully designed and the roadmap is visible in-product. They are defined via `placeholderItem(...)`
in `apps/web/src/features/tsld/toolbar/tsld-toolbar-items.tsx`.

**Two rows (ADR-0031 two-row amendment).** Each item carries a `row: 'look' | 'do'`. **Row 1 · Look**
is always live (view/navigate/find); **Row 2 · Do** is build/manage, whose pen-gated authoring cluster
shades as a set. Placeholders now render **inline** (tier 2 icon buttons) on their row so a normal
desktop shows the whole intended command set — the `⋯` overflow only appears when a row is too narrow
to fit (e.g. below `md`), at which point tier-2 items demote into it.

**Turning one on:** replace its `placeholderItem({...})` stub with a real `ToolbarItem` (wire
`onActivate`/`render`, `isEnabled`, `disabledReason`, and a context seam), add tests, and remove the
row from the table below. No taxonomy or primitive change is required — the slot already exists.

**Placeholder vs. capability-unavailable.** A disabled placeholder ("Coming soon") is distinct from a
control that is merely _temporarily_ unavailable (e.g. zoom before a diagram is computed, which reads
"Add an activity to enable zoom") or an authoring tool shaded while viewing. All look greyed; the
tooltip copy differentiates them.

## Catalogue

| Id                       | Group  | Row  | Placement    | Intended feature                                                                                                                                         |
| ------------------------ | ------ | ---- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `undo`                   | tools  | do   | inline       | Undo the last structural edit (needs an edit-history stack).                                                                                             |
| `redo`                   | tools  | do   | inline       | Redo a reverted edit.                                                                                                                                    |
| `today`                  | frame  | look | inline       | **Recenter on today** — pan the viewport to the today line (distinct from the "Today line" _display_ toggle in `View▾`).                                 |
| `search`                 | find   | look | inline field | **Search / filter** — leads the Find cluster as a real (disabled) search input; jump to an activity by name or code.                                     |
| `filter`                 | find   | look | inline       | **Filter / Critical-only** — narrow the canvas to a subset (e.g. critical path, a WBS branch).                                                           |
| `isolate-logic`          | find   | look | inline       | **Isolate logic path** — highlight the driving/longest path, or a selection's predecessors & successors.                                                 |
| `next-conflict`          | find   | look | inline       | Step the viewport through engine-flagged Visual-planning conflicts.                                                                                      |
| `colour-by`              | lens   | look | inline       | **Colour by** — recolour bars by status / WBS / critical / resource.                                                                                     |
| `baseline-overlay`       | lens   | look | inline       | **Baseline overlay** — ghost the active baseline's bars behind the live ones (captured; not yet drawn). Becomes a `View▾` toggle when built.             |
| `resource-view`          | lens   | look | inline       | **Resource view** — a second lens (resource histogram / over-allocation); the real `view-mode` lens switch.                                              |
| `snap-to-grid`           | tools  | do   | inline       | Snap hand-placed (Visual-mode) bars to working-day gridlines while dragging.                                                                             |
| `clear-visual-placement` | tools  | do   | inline       | Drop a bar's hand-placed `visualStart` so it falls back to the computed date (Visual mode).                                                              |
| `add-note`               | tools  | do   | inline       | **Add note** — a free-text annotation / callout pinned to the canvas or an activity (review markup).                                                     |
| `update-progress`        | object | do   | inline       | **Update progress** — apply actuals and advance the data date (the "status the plan" workflow; becomes the home of the data date).                       |
| `export`                 | object | do   | inline       | **Export** — the diagram (PDF/PNG) or the schedule (XER/MSP/CSV).                                                                                        |
| `print`                  | object | do   | inline       | **Print**.                                                                                                                                               |
| `share`                  | object | do   | inline       | **Share** — surface the ADR-0012 per-plan External-Guest link as a toolbar action.                                                                       |
| `comments`               | object | do   | inline       | **Comments** — activity comment threads (leans on the multi-tenant + guest-share model).                                                                 |
| `hammock` / `loe`        | (Add▾) | do   | Add menu     | **Span between activities** — Hammock + Level-of-effort, created by picking two endpoints (not point-and-draw). Previewed as disabled "Soon" menu items. |

## Notes

- The Visual-planning placeholders (`snap-to-grid`, `clear-visual-placement`, `next-conflict`) are
  only meaningful in **Visual** scheduling mode (ADR-0033). When built, they should follow the
  shade-don't-hide rule: shown disabled in Early mode rather than removed.
- `resource-view` is the visible "Coming soon" preview of a second lens; the `view-mode` slot remains a
  genuinely-reserved **hidden** stub (`isVisible: () => false`) that becomes the real lens **switch**
  (TSLD / Gantt / Resource) once more than one view exists — at which point `resource-view` folds into
  it. The Gantt/Resource switch is intentionally **not** surfaced as a visible control until then.
- Several placeholders become **`View▾` toggles** rather than toolbar buttons when built (`baseline-overlay`,
  and a future show/hide-notes toggle for `add-note`); the button is a stand-in for the affordance, not a
  commitment to its final shape.
- **Hammock / Level of effort** are not `placeholderItem`s — they are disabled `MenuItem`s in the Add
  split-button's "Span between activities" section (they're derived from two endpoints, not drawn). When
  built, they arm an endpoint-pick flow rather than a draw mode.
- **Zoom pad (deferred, not a placeholder).** The zoom controls stay a horizontal group; a literal 2×2
  pad would need a composite widget with its own internal roving focus (one toolbar stop, four buttons),
  which the flat one-control-per-stop registry can't express. Revisit if the compact geometry is worth a
  bespoke primitive.
