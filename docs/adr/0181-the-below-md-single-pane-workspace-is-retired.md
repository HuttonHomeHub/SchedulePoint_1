# ADR-0181: The below-`md` single-pane workspace is retired

- **Status:** Accepted — 2026-10-09, with the `retire-single-pane-workspace` feature spec and plan, which the
  product owner approved on 2026-10-08 ("approve with your recommendations") and whose M0 amendments the product
  owner's delegate decided on 2026-10-09 (final).
- **Spec:** [`docs/specs/retire-single-pane-workspace/feature-spec.md`](../specs/retire-single-pane-workspace/feature-spec.md)
  · **Plan:** [`implementation-plan.md`](../specs/retire-single-pane-workspace/implementation-plan.md)
  · **Readings:** [`m0-measurement.md`](../specs/retire-single-pane-workspace/m0-measurement.md)
- **Date:** 2026-10-09
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Supersedes:** the responsive rule in ADR-0030 ("below `md`, a Diagram / Activities segmented view
  toggle") and the same rule as ADR-0031 restates it ("below `md` the workspace still switches to a single
  pane"). Both ADRs keep their other decisions.
- **Builds on:** ADR-0179 (the layout is designed from a laptop up; named this retirement as its follow-up),
  ADR-0180 (the short-body swap now applies at every width), ADR-0088 D1 (no flag), ADR-0105 (why this needed a
  spec), ADR-0110 and ADR-0114 (the foot row and the slot outlets), ADR-0113 (measure first).

## Context

Below 768 px the plan workspace was a second layout: a **Workspace view** radiogroup (Diagram / Activities)
showed one pane at a time, built by a `useMediaQuery` branch in `plan-workspace-toolbar.tsx`. ADR-0030 and
ADR-0031 chose it for a phone. ADR-0179 withdrew the phone: the product is designed from 1024 × 600 up, and
below that a reader has pressed Continue anyway on a window that is a zoomed laptop, not a handset.

The branch had cost more than it earned. It was a second place for every workspace rule to be implemented, and
it was not: **Compare revisions rendered nothing below 768 px** (M0, 2026-10-09, in a browser at 700 × 900) because
the narrow branch's chain of dock cases (`healthDockActive`, `floatPathsDockActive`, `notesDockActive`) had no
`revisionsDockActive` (read in `plan-workspace-toolbar.tsx` at the commit before this change), and the next dock
would have repeated the omission. The slot outlets for the plan's facts needed a `hostsPlanSlots` prop to avoid
registering inside the pane that is `display: none` by default.

## Decision

**D1 — The plan workspace has one layout at every width.** The below-`md` branch, `WorkspaceViewToggle` and
the `hostsPlanSlots` prop on `ActivityBottomPanel`, `PlanActivitiesFootRow` and `ActivityPanelCollapsedBar` are
deleted, and `onCollapse` on `ActivityBottomPanel` is now required (it was optional only for the host that had
no collapsed state). The canvas row above the foot row is unconditional. The Workspace view radiogroup is removed (a
user-facing control; no replacement, because Expand / Collapse already is the show / hide mechanism).

**D2 — Short heights are ADR-0180's, at every width.** Its swap (Expand gives the panel the whole body when the
body is under 611 px) applies below `md` too; it was inert there while that width had a layout of its own. This
ADR adds no panel-height rule.

**D3 — A dock is capped by the body it sits in, and one that leaves the diagram under 360 px takes the row.**
`dockBounds` (`dock-bounds.ts`) returns the rendered width, the resize bounds and the squeeze verdict from the
measured body width, and feeds the width, `PanelResizer`'s `min` and `max`, and the four resize handlers, so
those three cannot disagree.

- `squeezed = bodyWidth − min − SPLITTER_WIDTH < CANVAS_MIN_WIDTH`. A squeezed dock takes `bodyWidth − 1` (the
  whole row less the splitter's pixel) and **the stage beside it is `inert`**: a focusable diagram nobody can
  see is a focus-visibility failure. Not squeezed, the dock is `min(stored, bodyWidth − 360 − 1, cap)`.
- **The splitter's pixel is budgeted.** The clamp it replaces forgot it: at 767 the revisions dock rendered
  407 px and left a 359 px diagram, one under the floor the clamp exists to keep (M0).
- `bodyWidth` 0 is "not yet measured": no cap, nothing squeezed, nothing made inert by mistake on the first render.
- **The resizer is not rendered** when the dock is squeezed (its width is pinned) or has no range above its
  minimum. Wherever it is rendered it is keyboard-resizable and at least 24 px. M0 found the dock's `Resize …
panel` handle was the only zero-size focusable the retirement produced.
- It is a render clamp only: a width saved at 1440 is still saved at 1440 after a visit at 640.
- **A squeezed dock puts an armed drawing tool away**, as the swap does: an armed tool has no target behind an
  `inert` stage, and Escape, its way out, is a canvas key the stage would never receive. (Journey and unit:
  `plan-workspace-toolbar.test.tsx`. Not covered: a canvas row merely too short for a bar, whose measurement is the
  shell's; see the limits below.)
- At 640 and below every dock is squeezed (minimums 280 to 380 against a 360 floor); the side-by-side layout
  survives from about 700 to 740 px, by dock. That is the rule working, not a defect.

**D4 — A command that acts on the diagram closes a squeezed dock first.** `withDiagram` (the short-body
wrapper) now applies when `swapActive || squeezed`: its first step closes the open dock through the existing
close path and runs the command on the next frame. **`WithDiagram` takes an optional third argument, typed
`'dock'`**: a command classed `dock` is exempt, because it already replaces the open dock and closing first would
turn "close this one" into "reopen it". A wrong class cannot hide: `canvas-directed-commands.structural.test.tsx`
records the argument each wrapped command was given and holds it to `COMMAND_CLASS`, so a fifth dock command that
omits it, or a viewport command that claims it, fails that test (verified red by dropping it from `revealComments`).

- **Focus and a voice.** If focus was inside the dock being closed, it goes to that dock's toolbar control
  (`DOCK_TRIGGER_ITEM`, a `Record` over the dock set, so a fifth dock must name one) rather than <body>, and the
  polite region says "Panel closed to show the diagram." — nothing else on screen says why the panel went.
- **A restore never aims into `inert`.** `focusPlanSurface`, the Gantt-grid restore and the cell-closed restore go
  through `focusOutsideInert`: a target inside an `inert` subtree is skipped for the first control of an open
  dock, then the foot row's toggle.
- The canvas window `keydown` early-return also applies while the stage is `inert`.
- **A canvas row too short for a bar** (the collapsed panel on a body that holds the foot row and not the 40 px
  ruler) makes **the stage** `inert`, and only the stage: the row also holds the four docks, and an inert dock
  cannot take focus on mount or be closed. Fit and the other diagram commands **run in place** against such a
  row, by decision: there is no dock to close and no panel to collapse, the canvas keeps its viewport, and the
  command is harmless on a diagram nobody can see. The cause is the shell's chrome (#471).

**D5 — The foot row wraps, and nothing in it is allowed to leave the screen.** The row takes `flex-wrap` with
`min-h-9` as a floor only. `PlanFacts` and its outlet are `max-w-full`, so the facts wrap their own items; Expand
and Collapse are `shrink-0 ml-auto` at the button's touch size. (Expand was **not** `shrink-0` before: 26 × 40
at 640 and 16 × 40 at 320. The outlet had no bound of its own, so `PlanFacts`' `max-w-full` resolved against its
one-line width and, at 320, the row scrolled 270 px sideways with Recalculate off screen. A browser reading in
this change found that; the unit tier cannot see it.) **The dock outlet has a floor** (`not-empty:min-w-72`, 288
px, under the 304 px a 320 px row has): its zero basis let the facts take the line, so a selected activity's
action bar stacked into a 152 px, 356 px tall column at 700 and painted over them; with the floor a row too narrow
for both wraps the bar onto its own line (journey, red on the old outlet; a first floor of 320 px was itself an
8 px sideways scroll at 320 and is why it is 288). The collapsed canvas row's stage is `inert` below the 40 px
ruler band (`RULER_BAND_PX`, measured 40 px in every M0 cell).

**D6 — `CanvasDock` still falls back to rendering in place** for a host with no outlet, and that stays its
contract. **The workspace no longer takes it, and the guest view still does.** Read with
`grep -rn "<TsldPanel\b" apps/web/src --include=*.tsx` (excluding tests) on 2026-10-09: two production mounts,
`plan-workspace-toolbar.tsx` (which mounts `CanvasDockOutlet` through the foot row, in both panel states) and
`features/share/components/GuestPlanView.tsx`, which has no outlet and so renders in place. The spec's "no
production path exercises it any more" was therefore wrong about the guest view (read-only, so no authoring strip
reaches it, but the path is live) and is corrected here. `DataTable`'s contained region keeps `min-h-32` at every
width (the `md:` prefix existed only for the single pane).

## Known limits, recorded rather than fixed

**The tiny-window criteria are withdrawn.** The spec asked that at 640 × 300, 640 × 360, 640 × 480 and
320 × 256 the expanded table keep a row and the foot row be reachable. M0 measured that nothing this epic does
can meet that. The app's own header (88 px at 640, 136 at 320) plus the wrapped command band (248 px at 640,
448 at 320) put `<main>` at y = 355 and y = 603, so the workspace body is **117 px at 640 × 480, 109 px at
320 × 720, and 0 at 640 × 360, 640 × 300 and 320 × 256**. Below about 604 px of viewport height at 640 wide, no
layout shows a table row, and at 640 × 360 and below the foot row is below the viewport with no scroll to reach it.

This is **pre-existing** (the single pane showed 0 rows at 640 × 480 and 320 × 720 too: bodies of 84 and 76 px),
and it is below the 1024 × 600 design floor. The conditional workspace-body minimum the plan drafted is withdrawn
with it: the cause is a 0 px `<main>`, which a workspace minimum cannot repair. The levers are the shell's (let
the command band collapse behind a disclosure, or let the shell scroll as a whole) and need their own spec:
`docs/TECH_DEBT.md` **#471**, which stays open. Readings that remain asserted are the ones M0 shows are
meetable: 700 × 900 and 640 × 844 (10 and 8 hit-testable rows under the swap), the width facts at 320 (no
sideways scroll, Expand and Recalculate on screen), and docks at 320 × 1000.

Two more are recorded, not decided here:

- **At 320 × 720 the foot row (123 px once it wraps) is taller than the 109 px body**, so the canvas row has no
  height and **a dock opened there is 0 px tall**. Expand sits 10 px below the viewport, with its centre still
  hit-testable (asserted: `pointerReachable` at 320 × 720 in the foot-row journey). Docks are asserted at
  320 × 1000 instead.
- **A squeezed dock does not say why the diagram is gone.** ADR-0180's swap prints "Diagram hidden. Collapse to
  return."; a dock that has taken the row prints nothing. Doing it means a note slot in the shared dock chrome of
  four panels, so it is a follow-up in `docs/TECH_DEBT.md` #471, not built here.
- **A selected activity docks its action bar in the foot row and grows it to 167–367 px** at 1280 down to 640
  (M0 §5). It was already true at the 1024 floor, and it is why a dock opened with a selection at a narrow width
  is short. With the outlet's floor the bar now takes its own line where the facts leave it under 288 px, so it no longer
  paints over them at 700 and 640 (journey); the height it costs the body is still #471's.

#466 (the row `⋯` under a bar at 320) was **not reproduced** in either layout and is left open and untouched.

## Alternatives considered

- **Keep the branch and mount the revisions dock in it.** Cheapest for the one defect, and it keeps the layout
  ADR-0179 named for retirement; the next dock repeats the omission. Rejected.
- **A below-`md` rule that docks always take the whole body.** A smaller version of the same branch. D3's clamp
  gives the same result on the narrowest windows with no media query. Rejected.
- **A feature flag.** Rejected per ADR-0088 D1. The rollback is the commit boundary.
- **Fixing the shell chrome here** so the tiny-window criteria could be met. It is a shell layout rule and a
  public-contract change; ADR-0105 makes it a spec of its own (#471).

## Consequences

- One layout means one set of rules: ADR-0180's swap, the dock cap and the `inert` stage apply at 1024 and at 320.
- A reader below 768 px loses a control (the Workspace view toggle) and gains Expand, docks, and a Compare
  revisions that exists. A narrow window that held both panes side by side now holds the diagram above the foot
  row, like a larger one.
- ADR-0030 and ADR-0031 carry a closing note; ADR-0179's Consequences name this as done.
- The journey is `e2e-narrow-shell` (ADR-0081), extended over 700 × 900, 640 × 844 and 320 wide, with keyboard
  and focus checks per dock, and `e2e-workspace-chrome`'s `activities-panel-scroll` case 7 is rewritten as the
  swap applying at 700 × 900 and 640 × 844.
- No schema change and no API change.

## References

- ADR-0030, ADR-0031, ADR-0092, ADR-0110, ADR-0111, ADR-0113, ADR-0114, ADR-0179, ADR-0180.
- `docs/TECH_DEBT.md` #466, #468, #471; `docs/UX_STANDARDS.md` "Two hosts, one mechanism".
