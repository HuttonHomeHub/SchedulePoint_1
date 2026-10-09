# ADR-0180: The panel takes the body when it cannot show rows

- **Status:** Accepted — 2026-10-08, with the `short-screen-vertical-budget` feature spec, which the
  product owner approved the same day (Part A as option A1; Part B as B0 with one change kept, the
  gear icon). Built as milestones M-A1 to M-A5.
- **Spec:** [`docs/specs/short-screen-vertical-budget/feature-spec.md`](../specs/short-screen-vertical-budget/feature-spec.md)
  · **Plan:** [`implementation-plan.md`](../specs/short-screen-vertical-budget/implementation-plan.md)
  · **Readings:** [`m0-measurement.md`](../specs/short-screen-vertical-budget/m0-measurement.md)
- **Date:** 2026-10-08
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:**
  - ADR-0030 — the activities panel's split of the workspace body gains a second layout, used only
    when the body is too short to give the panel rows.
  - ADR-0092 — the diagram's vertical budget is no longer always `CANVAS_MIN_HEIGHT`; below the line
    below, the diagram yields the whole body.
- **Builds on:** ADR-0179 D10 (the floor is made to fit), ADR-0081 (the Expand control is the entry
  point), ADR-0088 D1 (no flag), ADR-0105 (why this needed a spec), ADR-0111 (keyboard contracts),
  ADR-0113 (measure the problem first), ADR-0118 D7 (a Surface reports `pointer: fine`), ADR-0135
  (focus when a control is removed).

## Context

At 1024 × 600, the floor ADR-0179 set, the expanded activities panel showed no rows
(`docs/TECH_DEBT.md` #468). Measured 2026-10-08 in the container's Chromium (layout only), the
workspace body is 365 px (fine pointer) and 329 px (coarse) there. The panel's own fixed parts are
header 52/60, foot 51/55, padding 16 and a table head of 57, and a row is 57 px. Beside a 240 px
diagram nothing is left for rows.

The register's proposed fix, letting the diagram's minimum drop to about 160 px, frees about 25 px,
and a row costs 57. There was also a second defect: the panel's minimum (140) was smaller than its
own fixed parts, so a panel dragged to its minimum showed no rows on any screen.

## Decision

**D1 — On a short body, Expand gives the panel the whole body and hides the diagram.** A body is
short when `bodyHeight − reserve < PANEL_USEFUL_MIN` (three rows), with `reserve` being
`CANVAS_MIN_HEIGHT` (240), or `DOCK_MIN_HEIGHT` (360) while a right dock is open.

- The measured constants are `PANEL_MIN_OPEN` **249**, `PANEL_USEFUL_MIN` **371**, so the line is a
  body under **611** with no dock. (They were 245, 359 and 599 until `ROW_PX` 57->61 when the
  activities row's ⋯ grows to 44 on touch, dense-row-touch-targets M1: the row is 61 on a coarse
  pointer, and the constant is sized for the larger part.) Each constant is the sum of named parts, not a number.
- At 1024 × 600 the swap delivers about **3.3 rows** with a fine pointer (row 57) and **2.2** with a
  coarse one (row 61): (365 − 52 − 51 − 16 − 57) / 57 and (329 − 60 − 55 − 16 − 57) / 61.
  (2.5 coarse before the row grew to 61.)
- 24 px of hysteresis stops a drag-resize flickering across the line.
- 1280 × 720 (body 573) swaps, by 38 px. 1280 × 800 fine (body 653) does not. Coarse 1280 × 800 was
  not read and probably swaps (its deck is four lines).

**D2 — One coarse-sized constant, not a fine/coarse pair.** The Surface reports `pointer: fine`
with its cover attached (ADR-0118 D7), so a pointer-keyed size would under-reserve on the one touch
device the product owner uses. The cost is that a mouse user's header and foot are reserved 12 px taller
than they are. `TABLE_HEAD_PX` and `ROW_PX` are keyed on the stage's width, not the pointer
(57 at 1024–1280 wide, 37 and 45 at 1912), and the constants take the narrow reading, which is where
a short body exists.

**D3 — The diagram is hidden with `display: none` (the `hidden` attribute), stays mounted, and
carries no ARIA.** No `aria-hidden` and no `inert`: `display: none` already removes it from the
accessibility tree and the tab order, and a second mechanism would only disagree with the first. It
is not unmounted, so the canvas keeps its state. Measured: across a hidden round trip `originX` and
`pxPerDay` are kept; `originY` is read from code, not observed. The canvas's `measure()` returns
early on a 0 × 0 rect so a hidden surface keeps its bitmaps (no reallocation), and its window
`keydown` returns early while hidden.

**D4 — Commands collapse first.** The workspace wraps each canvas-directed toolbar callback in
`withDiagram(fn)`: if the swap is active, collapse the panel, then run `fn` on the next frame.

- Collapse first: viewport moves, tool arming, right docks.
- Unaffected: display-mark toggles, and plan / data / output commands.
- Typing in Find does not collapse; stepping its cursor does.
- Canvas-owned keyboard shortcuts do nothing while hidden, and entering the swap disarms an armed
  tool, which the panel's note says. The disarm is made in the workspace through
  `canvasUi.setMode('select')`, not through `TsldPanel`'s `exitAddMode`: the mode is the workspace's
  own state, and the panel's mode effects announce the change and release a pending LOE pick as they
  do for any other disarm. The announcement names the tool ("Add tool closed") and the note says
  "Drawing tool put away."; both are kept, because the first is a live region that fires once and
  the second is read with Collapse, and neither is the other's text.
- The pending frame of a deferred command is cancelled when the workspace unmounts. The collapse is
  quiet (focus stays on the toolbar control that was pressed) unless focus is inside the panel, where
  the collapsed bar takes it so it is never left on `<body>`; a dock that forces the panel closed
  uses the same quiet collapse.
- A structural test lists the canvas-directed callbacks, so a new one must choose a class.

**D5 — A right dock and an expanded panel are mutually exclusive on a short body, and the later
request wins.** Expand closes the dock (its toggle goes unpressed); opening a dock collapses the
panel. A toggle never claims a dock nobody can see. Expand closes an open dock whenever
`isShortBody(bodyHeight, DOCK_MIN_HEIGHT)` holds, **even if no swap follows**: on a body between
`DOCK_MIN_HEIGHT` + 240 and 599 the panel opens beside the diagram, the dock is gone, and nothing
announces that except the toggle's `aria-pressed` going false.

**D6 — Focus.** Entering the swap while focus is inside the hidden canvas row, dock or resizer moves
focus to the panel's Collapse button in a layout effect, so it is never `<body>`. Leaving the swap
moves nothing.

The panel's note describes the control it explains: while the diagram is hidden, Collapse carries
`aria-describedby` pointing at the note, and the note is not a live region, so focus arriving on
Collapse reads it once.

**The Gantt is hidden by the swap too.** The Gantt is the workspace `surface` inside the same hidden
row, so the swap hides whichever projection is showing. The note names it: `GANTT_HIDDEN_NOTE`
("Gantt hidden. Collapse to return.") for the Gantt, `DIAGRAM_HIDDEN_NOTE` for the diagram.

**D7 — The panel's minimum is derived and stored sizes are clamped.** A stored 140 reads back as
`PANEL_MIN_OPEN`, and, because the preference hook's mount effect writes its state out, the stored
value **is rewritten** as the clamped one. The swap never writes `panel.size`.

**D8 — A1 replaces the single-pane precedent.** The below-`md` single-pane layout is being retired
by ADR-0181. A1 is the one place a mounted-but-hidden diagram is designed. It is inert below `md`
until that retirement, and ADR-0181 re-runs this decision's narrow cases.

**D9 — Part B was considered and not built (B0), with one change kept.** The spec's Part B proposed
dropping the Summary, Settings… and Share & export labels below `xl` on hover-and-fine-pointer
devices (a registry `deckLabel` field, a `iconOnly` render flag, tooltip suppression through a
`useTooltip` `suppressFocusOpen` option) to take the deck from four lines to three. The product owner
chose to keep four lines. **Not built:** the label drop, `deckLabel`, `iconOnly`, and any tooltip
change. **Kept:** the `calendar` item (label "Settings…") takes the `Settings` gear at every width,
because the dialog stopped being only the calendar and `SlidersHorizontal` is already View ▾'s
glyph. If the four-line deck is revisited, the spec's Part B and its reviews are the starting point.

## Alternatives considered

- **A2, the diagram keeps a sliver of about 96 px.** About 2 rows fine and none coarse at the
  floor. Fails the coarse pointer.
- **A3, the register's 160 px diagram minimum.** About no rows. Does not fix #468.
- **A4, fold the panel header into the foot.** Saves 48 px, one row, for a restructured panel.
  Deferred.
- **A no-wrap table head and fixed rows (37 / 45 px).** Would make the swap less eager, but it
  restructures the table, not the panel. Noted in the measurement record.
- **Keep the dock open but hidden behind the swap.** Leaves a pressed toggle for something nobody
  sees.
- **B1 and B2** (drop the labels, or fold them in an overflow menu). See D9.

## Consequences

- At the floor the panel shows rows, and a panel at its minimum always shows one.
- A planner on a short window loses sight of the diagram while the panel is expanded, and is told so.
- The six suites that press Expand at Playwright's default 1280 × 720 (body 573, under 611) now run
  at 1280 × 800: `e2e` (all three browser projects), `e2e-edit`, `e2e-notes`, `e2e-programme`,
  `e2e-toolbar` and `e2e-undo`. No suite gets a test-only threshold. `e2e-toolbar`'s explicit
  1280 × 520 case is left as it was.
- The 12 px raise of the line (599 to 611) makes more touch screens swap, coarse 1280 × 800
  among them; that is expected, the row there really is 61.
- The line rising from 599 to 611 makes more touch screens swap, coarse 1280 × 800 among them;
  that is expected, the row there really is 61.
- Nothing changes on the product owner's 1912 × 948 and 1912 × 1114 screens.
- The constants are measured in a container's layout engine; the journey asserts every real part is
  at most its constant on both pointers.

## References

- `docs/TECH_DEBT.md` #468 (closed by this ADR's milestone).
- `docs/specs/short-screen-vertical-budget/m0-measurement.md` §1–§4.
- `apps/web/src/components/layout/workspace/use-activity-panel-prefs.ts`.
