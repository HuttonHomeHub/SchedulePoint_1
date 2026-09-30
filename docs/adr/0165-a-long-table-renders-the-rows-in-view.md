# ADR-0165: A long table renders the rows in view

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** James Ewbank (product owner — CQ-B, option (a)), with Claude Code
- **Amends:** ADR-0146 (for the windowed table only — D1 below)
- **Spec:** [`docs/specs/activities-panel-scale/`](../specs/activities-panel-scale/feature-spec.md)
  (§4.9 is this ADR's outline; the plan's M3 builds it). Register row: `docs/TECH_DEBT.md` #334.

## Context

The activities panel renders every activity as a `<tr>` inside `DataTable`. M0 measured opening it
(E1) at **1,664 ms at 2,000 rows** (range 1,608–1,968 ms over seven repeats) and **472–488 ms at
500 rows**, against a 200 ms bar
([`m0-measurement.md`](../specs/activities-panel-scale/m0-measurement.md), container, 1× CPU). The
product owner treated E1 as a fail (CQ-A, 2026-09-28), which arms M3 under the spec's committed
decision table. M2 (render isolation, PR #727) reduced re-renders on interaction and does not touch
mount cost.

**The effect size is predicted, not measured** (ADR-0142 D4). The two E1 medians give a slope of
about **0.73 ms per row** ((1,664 − 480) / (2,160 − 540) rows) and an intercept of about **85 ms**.
A window of roughly 30 visible rows plus `overscan` on each side is about 55 rows, so the prediction
is **~125 ms**, under the bar at any plan size. The M0 harness re-measures it after the build
(SC-7); if it does not pass, this ADR's prediction was wrong and the verdict file says so.

Windowing removes off-window rows from the DOM. That costs two things, and the product owner accepted
both on 2026-09-29, put to them in plain English in `docs/HANDOFF.md` (CQ-B, option (a)):

1. **Find-in-page cannot find an off-window row.**
2. **Screen-reader browse mode cannot reach off-window rows by table navigation.** It reaches them
   as the window moves.

The mitigation already in the product is the canvas search (ADR-0079) and the diagram's parallel
listbox, which renders **every** activity to the DOM, un-windowed and always mounted
(`TsldPanel.tsx`, `role="listbox"` at `:3454`, `activities.map` at `:3484`). A filter box on the
panel (option (b)) was not taken.

## Decision

**We will add an opt-in windowed mode to `DataTable`, and `ActivitiesTable` will use it.** Seven
decisions follow. Each is one of the spec's §4.9 items; D1 is the only one the spec left open.

### D1 — Column widths are measured once, then frozen

With `table-layout: auto` a table sizes its columns from the rows that exist. Windowed, a longer
value scrolling into view would widen its column and shift every column while the planner reads.

**In windowed mode the table measures its column widths from the first rendered window (header
included) and freezes them.** It renders a `<colgroup>` with those widths under `table-layout:
fixed`. The widths are re-measured only when the column set changes or the scroller's width changes
(a `ResizeObserver`), **never on scroll and never on a data change**. A `fit` column's frozen width is
its measured width. The free column (`Name`, `auto`) takes the remainder. Cells in windowed mode may
wrap, so a later, longer value wraps inside its frozen width rather than overflowing it.

**This amends ADR-0146 for this one table.** `fit` there means "take exactly what the content
needs", measured over all rows. Here it is measured over the first window. The alternative, declared
per-column widths, is the remedy ADR-0146's own `fit` docblock records as having become the defect
(ADR-0145 M4-T2's `md:w-44` and `md:w-24` wrapped the content they were sized for). A measured
width is a function of content. A declared one is a number that has to be re-derived.

**Stated cost:** an off-window value longer than anything in the first window wraps to a second line
in a `fit` column (for example, an unusually long activity code). Rows keep their estimated height
only approximately; the virtualizer measures real row heights (`measureElement`), so a wrapped row
does not misplace the rows after it.

### D2 — The table announces its size and each row's place

`aria-rowcount` on the `<table>` (total rows + 1 for the header) and `aria-rowindex` on each rendered
`<tr>`, the header row being 1. The Gantt already does this (`GanttPanel.tsx:1073`, `:1083`).
**Reasoned from ARIA 1.2, not observed with a screen reader:** NVDA and JAWS in Chromium honour
`aria-rowcount` on a table; VoiceOver's support is partial. It carries the ADR-0083/ADR-0122 label
until somebody tests it.

### D3 — The table stays a native table, with spacer rows

`DataTable` keeps its `<table>`, `<thead>` and `<th scope="col">`. The window sits between a top and
a bottom spacer `<tr aria-hidden="true">` whose heights come from the virtualizer. It does **not**
become a div `treegrid` like the Gantt: `DataTable` is deliberately not a treegrid
(`data-table.tsx:256`), and converting it would be its own ADR.

### D4 — The keyboard is unchanged, and a journey proves it

Tab order through the rows' checkboxes and `Actions` buttons works as it does today. Focusing a
control in the last rendered row scrolls it into view, the window moves, and `overscan` keeps the
next rows rendered before the next Tab. **This is a claim about event timing in a real browser**, so
it is a journey: Tab forward through 60 rows reaches row 60, and Shift+Tab walks back to row 1, both
without focus leaving the table. If the journey shows Tab escaping the table, that blocks the
release. No roving tabindex and no new keys, so this is not a keyboard-contract change under
§19.13 — but **accessibility-reviewer and component-reviewer run before release** anyway, because
the plan says so and because the first thing to break would be focus.

### D5 — The hook lives in a child component only the windowed mode renders

`useVirtualizer` makes the React Compiler's lint analysis bail out of the **whole** component that
calls it (`GanttPanel.tsx:634-636`, `docs/TECH_DEBT.md` #353 D3). `DataTable` has 24 call sites in
18 files (`grep -rn "<DataTable" apps/web/src`), so the hook must not sit in it. A
`DataTableWindowedBody` child calls it; `DataTable` renders that child only in windowed mode. A
structural test pins that `useVirtualizer` is imported by that file and by no shared primitive.
It has two other importers, both feature components with one call site each: `GanttPanel.tsx` and
`features/navigator/components/HierarchyTree.tsx` (this ADR first named only the Gantt).

### D6 — The mode is typed so it cannot be misused

Windowing needs a bounded scroller, so it is valid only with `scroll="contained"`. It is refused with
`renderDetail`, because variable-height detail rows defeat a row estimate. Both are enforced as a
type-level union on `DataTable`'s props, not as a runtime warning. `ActivitiesTable` does not use
`renderDetail`.

### D7 — Tests keep their rows; the sweep is mandatory

jsdom renders only the initial window (`src/test/setup.ts:62-76` stubs `ResizeObserver` and
`scrollTo`). **`initialRect` alone is not enough, and this ADR first said it was:** once the
scroller mounts, the virtualizer's own observer replaces the initial rect with the measured size,
which jsdom reports as 0×0, and a 0-height viewport renders no rows (71 of 155 tests failed on the
first build). `data-table-windowed-body.tsx` wraps `observeElementRect` to ignore a zero-height
report, so an unlaid-out scroller — jsdom, or a `display: none` ancestor — keeps the initial window.)
Small fixtures stay under the window. A test that needs more rows passes a **test-only row budget**,
never a production flag. The 27 test files that reference `ActivitiesTable`
(`grep -rl ActivitiesTable apps/web/src --include=*.test.tsx`) must pass unedited unless a fixture
exceeds the window, and any that is edited says why. 18 journey files call
`getByRole('row', …)` (`grep -rl` over `apps/web/e2e*`); not all target this table, but a full sweep
(`scripts/e2e-sweep.sh`) is required before release.

## Alternatives considered

- **Don't window (option (c) of CQ-B).** No accessibility cost, and the slow open stays. Declined by
  the product owner.
- **Window plus a filter box on the panel (option (b)).** Restores a find route for sighted users,
  and it is a new user-facing entry point that needs its own spec (ADR-0105). Not taken; it can
  follow if find-in-page is missed.
- **`content-visibility: auto` on rows.** Keeps rows in the DOM, so no accessibility cost. The spec
  reasons it is a no-op on table rows (CSS Containment 2 does not apply size or layout containment to
  internal table boxes), and it does nothing for React's render cost, which is most of E1. Not taken.
- **Window in `ActivitiesTable` only.** A second table implementation beside `DataTable`, which owns
  the markup, the four states, the region semantics and the width vocabulary. Two implementations
  drifting apart is this repository's most-recorded failure shape. Not taken.
- **Declared per-column widths (D1's alternative).** See D1.

## Consequences

- Opening the panel costs about the same at any plan size: predicted ~125 ms, **measured 72–80 ms**
  at 2,000 rows (was 1,664 ms) in
  [`m3-measurement.md`](../specs/activities-panel-scale/m3-measurement.md). The prediction erred high, for a reason
  nobody has measured.
- **Accessibility regressions accepted by the product owner:** find-in-page and browse-mode table
  navigation stop at the window. The diagram listbox stays the complete, always-present route.
- `DataTable` gains a mode, a child component and a type union. The other 23 call sites are
  untouched and render the same DOM.
- Column widths in the activities table no longer follow off-window content (D1).
- M3-T1…T4 built it; the harness re-measured E1 and I2 (SC-7) to PASS at 2,000 rows, and #334 closed
  on 2026-09-29.

## References

- Spec and plan: [`docs/specs/activities-panel-scale/`](../specs/activities-panel-scale/feature-spec.md)
- M0 readings and the CQ-A / CQ-B answers:
  [`m0-measurement.md`](../specs/activities-panel-scale/m0-measurement.md)
- ADR-0146 (column widths), ADR-0142 D4 (predict the effect size), ADR-0079 (canvas search),
  ADR-0105 (when a spec is required), `docs/TECH_DEBT.md` #334, #353
