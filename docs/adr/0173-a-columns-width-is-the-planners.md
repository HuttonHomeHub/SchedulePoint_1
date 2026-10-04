# ADR-0173: A column's width is the planner's, kept on their device, and its drag has a typed twin

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** James Ewbank (product owner — approved the spec and plan as written, Q1–Q4 at their
  recommended defaults, 2026-10-03), with Claude Code
- **Builds on:** ADR-0059 (the Gantt view), ADR-0095 (the Gantt becomes a working surface; its
  Float-over-chart incident), ADR-0099 (the grid splitter), ADR-0111 (a shared primitive's keyboard
  contract is reviewed before release), ADR-0118 (a control height is one decision; the coarse
  pointer), ADR-0123 (a search param is a string), ADR-0088 D1 (no flag; the rollback is the commit)
- **Spec:** [`docs/specs/gantt-column-resize/`](../specs/gantt-column-resize/feature-spec.md); closes the
  real residue of `docs/BACKLOG.md` "The Gantt's remaining editing gaps"

## Context

The backlog row this work came from said the Gantt grid "has no resize handle, so nothing can set"
its width. Both halves were false: Graphite M8 shipped `PanelResizer` "Grid width" on the table/chart
divider and `useResizablePanelPrefs` remembers it (`GanttPanel.tsx`, `e2e-gantt/gantt.spec.ts`). The
sentence survived in `gantt-view-state.ts` and ADR-0095 and was copied into the backlog — an ADR-0076
wrong claim carried forward by a document nobody re-read.

What a planner could not do was size **one column**. Six of seven columns had a fixed width, and
M1-T0's measurement (`docs/specs/gantt-column-resize/m1-measurement.md`) found real truncation: a
15-character structured Code in an 80 px column, and a Predecessors list (activity names) in 90 px. The
divider cannot help, because its extra width goes only to Activity.

Two forces shaped the answer. Once every width is planner-reachable, ADR-0095's defect (a pane narrower
than its own columns, painting Float over the chart) has a far wider blast radius: `clampSize` with
`min > max` returns `max`. And a drag is not, by WCAG 2.2 SC 2.5.7, satisfied by arrow keys: it needs a
single-pointer, non-dragging alternative.

## Decision

- **D1 — Storage.** A column width is a per-device view preference in `localStorage`
  (`schedulepoint:gantt-column-widths`, `{ v: 1, widths }`), global across plans, read totally and
  clamped to 48–400 px. It is not in the URL (ADR-0123's URL state is for views worth sending — a width
  chosen on a 1,646 px monitor is wrong on a laptop) and not on the server until a user-preference model
  exists for some other reason. The hook writes only on a planner's change, never on mount, and
  `Reset widths` **removes** the key, so a future change to a default still reaches everyone.
- **D2 — The elastic column, and the floor wins.** Activity has no width of its own: it absorbs a
  widened column and the divider the planner placed does not move. **A pane's floor always wins over its
  ceiling** — `ceiling = max(cap, floor)` — stated as the rule for any resizable pane whose floor is
  derived from its contents. A chart guard stops a typed or dragged change that would leave the chart
  under 240 px, at the moment of the change only; nothing is shrunk automatically afterwards.
- **D3 — Pointer-only affordances.** A drag affordance may be `aria-hidden` and unfocusable **only**
  where the same view offers a typed, single-pointer equivalent reaching every value the drag reaches
  (here the `View ▾` → Columns width fields and `Table width`). Under `pointer: coarse` it is **omitted
  rather than enlarged** when enlargement would cover a neighbouring control: a 44 px strip on a 60 px
  Float column would cover its sort button. This is a named exception to ADR-0118 D1's 44 px rule, with
  the field (44 px under a coarse pointer through `--control-h`) as the stated equivalent. Focusable
  separators per column were rejected: seven more Tab stops, an arrow-key contest with the treegrid's
  own handler (the ADR-0111 #192 shape), and still no 2.5.7 alternative.
- **D4 — Paper keeps its own widths.** The printed programme (`PRINT_COLUMN_WIDTHS`) is a designed A4 or
  Letter landscape document, not a projection of a screen preference.
- **D5 — The framing input is defaults-only.** Zoom framing (`barRegionWidth`) reads the **default**
  grid width and never a planner's widths, so a column drag never rescales the bars. A structural test
  pins it. The pre-existing divergence between that input and the dragged divider is recorded as
  `docs/TECH_DEBT.md` #437, not fixed here.
- **D6 — One pointer-drag hook, no keys.** `usePointerDrag` (`components/ui/use-pointer-drag.ts`) is the
  pointer half of `PanelResizer` lifted verbatim: capture on press, one callback per animation frame,
  immediate flush and release on up or cancel, cancel on unmount. It claims **no key**; `PanelResizer`
  keeps its arrows, Home and End. A drag applies transiently (`setTransient`) and stores once on release
  (`commit`); there is no Escape-to-cancel, because that would give the hook a key — a mistaken drag is
  undone by double-clicking the edge or by the field.

## Alternatives considered

- **Grid-versus-chart split only** — already shipped; cannot widen Code or Predecessors.
- **Spreadsheet model** (a widened column pushes the chart) — moves a divider the planner placed, and
  with all columns shown the 720 ceiling is hit after about 34 px, so it degrades into D2 anyway.
- **Focusable APG separator per column** — rejected under D3.
- **A "Column widths…" dialog** — a second place to manage columns; the chooser already lists them.
- **Auto-fit on double-click** — needs measuring rows a virtualised grid never mounts, so the answer
  would depend on scroll position (the ADR-0165 D1 cost). Deferred.
- **Widths in the URL, or on the server** — see D1.

## Consequences

- **Positive.** The two columns that truncate real data can be read; an untouched grid is byte-identical
  to before; every drag-reachable width is also typeable, by keyboard, screen reader and single tap.
- **Negative.** The edge strips are invisible to the deck's 24 × 24 sweep (no role), so the journey
  measures them directly. Activity's edge persists on every frame because the shipped divider's hook
  does; accepted, as the divider already does. Two tabs do not sync.
- **Neutral, and filed rather than answered.** The same 2.5.7 question applies to every other
  `PanelResizer` consumer (`docs/TECH_DEBT.md` #442), and `PanelResizer` has no `touch-action`
  (#439). `PanelResizer`'s internals moved, so accessibility-reviewer and component-reviewer review it
  before release (ADR-0111).
- **Not a recalculation input.** No scheduling input changes and `computeSchedule` is never imported.

## References

- `apps/web/src/features/gantt/layout/column-widths.ts`, `model/use-gantt-column-widths.ts`,
  `components/GanttColumnEdge.tsx`, `components/ui/use-pointer-drag.ts`
- `apps/web/e2e-gantt/column-widths.spec.ts`, `docs/specs/gantt-column-resize/m2-measurement.md`
