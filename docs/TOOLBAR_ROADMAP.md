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

**Wired behind a flag (in-progress).** The **TSLD toolbar quick-wins** slice
(`docs/specs/toolbar-quick-wins/`) wires five of the ids below — `today`, `comments`,
`update-progress`, `add-note`, `clear-visual-placement` — to already-shipped features. Each resolves at
build time to its **real** `ToolbarItem` when `VITE_TOOLBAR_QUICK_WINS` is on, and to its existing
`placeholderItem()` "Coming soon" stub when off. So while the flag is off (its build default) the table
below still describes today's bar exactly; the rows are annotated _Wired (quick-wins)_ and their
descriptions updated to what they actually do.

**Placeholder vs. capability-unavailable.** A disabled placeholder ("Coming soon") is distinct from a
control that is merely _temporarily_ unavailable (e.g. zoom before a diagram is computed, which reads
"Add an activity to enable zoom") or an authoring tool shaded while viewing. All look greyed; the
tooltip copy differentiates them.

## Catalogue

| Id                       | Group  | Row  | Placement    | Intended feature                                                                                                                                                                                                         |
| ------------------------ | ------ | ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `undo`                   | tools  | do   | inline       | Undo the last structural edit (needs an edit-history stack).                                                                                                                                                             |
| `redo`                   | tools  | do   | inline       | Redo a reverted edit.                                                                                                                                                                                                    |
| `today`                  | frame  | look | inline       | _Wired (quick-wins)._ **Go to today** — pan the viewport so today sits at the left edge (not centred; reuses `goToDate`), distinct from the "Today line" _display_ toggle in `View▾`. View-only (every role).            |
| `search`                 | find   | look | inline field | **Search / filter** — ✅ **Wired (`VITE_CANVAS_LENSES`, on by default).** A live search field that dims non-matching bars.                                                                                               |
| `filter`                 | find   | look | inline       | **Filter** — ✅ **Wired (`VITE_CANVAS_LENSES`).** A Filter menu (Critical / Has constraint / Has conflict) that dims non-matches.                                                                                        |
| `isolate-logic`          | find   | look | inline       | **Isolate logic path** — ✅ **Wired (`VITE_CANVAS_NAV`).** Dim everything not on a selection's logic chain (full or driving-only). Split button: main toggles isolate, chevron picks the mode. View-only.                |
| `next-conflict`          | find   | look | inline       | **Next conflict** — ✅ **Wired (`VITE_CANVAS_NAV`).** Cycle the engine-flagged activities (constraint / visual / external / levelling / negative-float), each centred + selected, with a visible status chip. View-only. |
| `colour-by`              | lens   | look | inline       | **Colour by** — ✅ **Wired (`VITE_CANVAS_LENSES`).** Criticality / Total-float bucket / WBS group (driving-resource deferred, needs `VITE_RESOURCES`).                                                                   |
| `baseline-overlay`       | lens   | look | inline       | **Baseline overlay** — ✅ **Wired (`VITE_CANVAS_LENSES`).** Ghost outline bars at the active baseline's captured dates.                                                                                                  |
| `resource-view`          | lens   | look | inline       | **Resource view** — a second lens (resource histogram / over-allocation); the real `view-mode` lens switch.                                                                                                              |
| `snap-to-grid`           | tools  | do   | inline       | **Snap to grid** — ✅ **Wired (`VITE_CANVAS_NAV`).** Round hand-placed (Visual-mode) bars to the nearest working day on drop. Pen-gated + Visual-mode (shade-don't-hide).                                                |
| `clear-visual-placement` | tools  | do   | inline       | _Wired (quick-wins)._ Drop a bar's hand-placed `visualStart` so it falls back to the computed date. **Shaded, not hidden, in Early mode** (shade-don't-hide); Visual mode + pen + a selection to operate.                |
| `add-note`               | tools  | do   | inline       | _Wired (quick-wins, needs `VITE_NOTES`)._ **Add note** — open the selected activity's Logic panel at its Notes section (`ActivityNotesSection`); Contributor+ (not pen-gated).                                           |
| `update-progress`        | object | do   | inline       | _Wired (quick-wins)._ **Update progress** — open `ActivityProgressDialog` for the selected activity; Contributor+ (not pen-gated). (Advancing the data date is a later, separate slice.)                                 |
| `export`                 | object | do   | inline       | **Export** — the diagram (PDF/PNG) or the schedule (XER/MSP/CSV).                                                                                                                                                        |
| `print`                  | object | do   | inline       | **Print**.                                                                                                                                                                                                               |
| `share`                  | object | do   | inline       | **Share** — surface the ADR-0012 per-plan External-Guest link as a toolbar action.                                                                                                                                       |
| `comments`               | object | do   | inline       | _Wired (quick-wins, needs `VITE_NOTES`)._ **Comments** — reveal + focus the **plan-level** notes thread (`PlanNotesSection`), not per-activity threads. Read for every role.                                             |
| `hammock` / `loe`        | (Add▾) | do   | Add menu     | **Span between activities** — Hammock + Level-of-effort, created by picking two endpoints (not point-and-draw). Previewed as disabled "Soon" menu items.                                                                 |

## Notes

- The **Visual-planning authoring** items (`snap-to-grid`, `clear-visual-placement`) are only meaningful
  in **Visual** scheduling mode (ADR-0033) and follow the shade-don't-hide rule: shown disabled in Early
  mode (with the reason "Only available in Visual mode") rather than removed. Both are **wired** to this
  rule now (`snap-to-grid` under `VITE_CANVAS_NAV`, `clear-visual-placement` under quick-wins).
- `next-conflict` is **not** Visual-only: the flags it cycles (`constraintViolated`, `visualConflict`,
  `externalDriven`, `levelingWindowExceeded`, negative total float) occur in **Early** mode too — only
  `visualConflict` is Visual-specific. It is view-only (every role) with no scheduling-mode gate; it
  shades only when there are no flagged activities ("No conflicts to review") or no diagram.
- `resource-view` is the visible "Coming soon" preview of a second lens; the `view-mode` slot remains a
  genuinely-reserved **hidden** stub (`isVisible: () => false`) that becomes the real lens **switch**
  (TSLD / Gantt / Resource) once more than one view exists — at which point `resource-view` folds into
  it. The Gantt/Resource switch is intentionally **not** surfaced as a visible control until then.
- Several placeholders become **`View▾` toggles** rather than toolbar buttons when built (e.g.
  `baseline-overlay`); the button is a stand-in for the affordance, not a commitment to its final shape.
  (`add-note` is now wired to open the selected activity's Logic-panel Notes section rather than becoming
  a canvas-markup toggle.)
- **Hammock / Level of effort** are not `placeholderItem`s — they are disabled `MenuItem`s in the Add
  split-button's "Span between activities" section (they're derived from two endpoints, not drawn). When
  built, they arm an endpoint-pick flow rather than a draw mode.
- **Zoom pad (deferred, not a placeholder).** The zoom controls stay a horizontal group; a literal 2×2
  pad would need a composite widget with its own internal roving focus (one toolbar stop, four buttons),
  which the flat one-control-per-stop registry can't express. Revisit if the compact geometry is worth a
  bespoke primitive.
