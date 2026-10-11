# ADR-0188: A divider has a single-pointer twin, and its strip follows the finger

- **Status:** Accepted — 2026-10-11. The spec was approved by the product owner on 2026-10-11 with every
  recommendation accepted: pressing a divider opens a size box (new on the monitor too), the grab strip grows to
  44 px on a coarse pointer with the Gantt's table/chart divider as the named exception, and #483 is measured
  with the browser's own text size.
- **Spec:** [`docs/specs/a11y-touch-sweep/spec.md`](../specs/a11y-touch-sweep/spec.md) · **Plan:**
  [`implementation-plan.md`](../specs/a11y-touch-sweep/implementation-plan.md) · **Readings:**
  [`m0-measurement.md`](../specs/a11y-touch-sweep/m0-measurement.md) (predictions first:
  [`m0-falsification.md`](../specs/a11y-touch-sweep/m0-falsification.md))
- **Date:** 2026-10-11
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0118 D1's exception list (adds the Gantt grid divider, D3), ADR-0183 D7's third bullet (the
  `row-select` marker is retired: the activities table's select labels are swept as targets), ADR-0173's
  Consequences ("filed rather than answered": the Explorer and the docks have a typed twin now).
- **Builds on:** ADR-0173 (the typed width, which this extracts), ADR-0111 (a shared primitive's keyboard
  contract is reviewed before release), ADR-0135 (a container hands focus on), ADR-0110 (a gate is verified
  against the defect it names), ADR-0113 and ADR-0142 (measure before building), ADR-0105 (why this was a spec),
  ADR-0088 D1 (no flag; the rollback is the commit).

## Context

`PanelResizer` is the one divider in the product. Seven call sites use it: the Project Explorer's width, four
right docks' widths (float paths, health check, revision comparison, notes), the activities panel's height and
the Gantt's grid width. Three facts, each read rather than assumed:

- **Six of the seven can only be set by dragging the line or by keys.** WCAG 2.2 SC 2.5.7 (AA) asks for a
  single-pointer alternative to a drag, and a keyboard is not one (ADR-0173 already read it that way for the
  Gantt, whose `View ▾` › Columns › `Table width` is its twin). The register row (#442) listed five files and
  was corrected to seven call sites in three files.
- **The grab strip is 25 px** (`-left-3 -right-3` on a 1 px line), on a mouse and on a finger alike. The house
  rule under a coarse pointer is 44 px (ADR-0118 D1). M0 added two things the row did not say: the Explorer's
  strip is **13 px live, not 25** (the stage's positioned content paints over its right half, so every sample
  from +1 to +26 px hit the canvas), and a 44 px strip does not fit between the neighbours of four of the seven
  dividers without touching one (gaps of 17 and 18 px against a 22 px half).
- **The Gantt's divider already covers a third of each row's `⋯`** (9.5 px of 28) and 7.5 px of the Float left
  sort button, because it runs through the last grid column and the chart's first bars.

## Decision

1. **D1 — Every `PanelResizer` offers a press-to-size box.** A press that does not move more than 4 px
   (`PRESS_SLOP_PX`), or a click with no pointer gesture before it (an assistive technology's "click"), opens a
   small, non-modal box at the divider holding a `SizeField`, the range in words, and "Reset to standard". Enter
   or blur in the field applies; Escape closes the box and returns focus to the separator; a press elsewhere
   closes it and focus goes where that press went; pressing the divider again puts it away. **No key opens it:**
   the arrows, Home and End already reach every value (2.1.1) and the separator keeps them; a focusable
   separator cannot carry `aria-haspopup`. `sizeLabel` is **required** by the type and a structural test counts
   the call sites that pass it and an `onReset`, so a new divider cannot ship without its twin. The box is a
   **sibling** of the separator, not a child: a portal child's pointer and key events bubble to its React parent,
   and the separator's drag and arrow handlers would act on the field's. `usePointerDrag` gains `onPress` and
   withholds `onValue` until the pointer passes the slop, so finger jitter on a tap cannot nudge the size; a
   handle that passes no `onPress` (the Gantt's column edges) is unchanged.
2. **D2 — `SizeField` is the shared typed size.** The Gantt's private `WidthField` moves to
   `components/ui/size-field.tsx` and the Columns group and the box both use it, with `useSizeNotice` for the
   polite status. A typed value is never changed silently (ADR-0173). **The extraction found a defect and fixes
   it:** a container that closes on Escape (`usePopoverPanel`) listens on `document` in the capture phase and
   moves focus at once, so the blur reached the field before its own key handler had marked the draft
   discarded, and Escape **applied** the draft it was meant to throw away. The field now hears Escape on
   `window` in the capture phase, which is earlier than any `document` listener whichever registered first.
   `usePopoverPanel` gains an anchor point (`openPanel({x, y})`) and an initial-focus target, both optional.
3. **D3 — Under a coarse pointer a divider's strip is `--control-h` across its axis, centred on the line.**
   `coarseStrip="finger"` (the default) does it. The gaps either side of the dividers are 17 and 18 px, so it
   takes the nearest 5 px of a neighbouring 44 px control at the docks and the activities panel, 17 px of the
   Explorer's `⋯`, and up to 14 px of the first control of the selection bar beside the Explorer; every
   neighbour keeps its centre and at least 27 px of its box. **A grow-away-from-the-panel variant was built for
   the Explorer and withdrawn:** 12 px on the panel side and 32 on the stage side covered the selection bar's
   first control at its centre (+30 px), which the sweep found only in a state where a bar was selected. The
   strip stacks above the stage (`z-10`) for every pointer, because the stage's positioned content painted
   over the Explorer's stage-side half and left a mouse 13 px live, not the 25 intended; a click on the line
   itself could land on the diagram. `"none"` stays 25 px and marks itself `data-coarse-exempt="divider"`;
   **the Gantt grid divider is the one named exception**, because 44 px would cover whole 28 px row menus and
   the Float left and Timeline headers (19 to 25 px each), and `View ▾` › Columns › `Table width` is its
   finger-sized, typed equivalent. This extends ADR-0173 D3 ("omit rather than enlarge") from column edges to
   dividers. A structural test lists the exceptions, so adding one is a decision a reviewer sees.
4. **D4 — The coarse sweep measures `[data-resizer-hit]`, not the 1 px separator.** It asks each divider on
   screen four things at 1646 × 1097 and 1024 × 600: the strip is at least 44 across (or the separator is
   counted as the exemption), `elementFromPoint` a quarter and three quarters of the way across lands on the
   separator (this fails without the `z-10`), no control's centre is covered, and the exemption inventory is
   exactly the Gantt grid. The activities table's select labels (`data-row-select`, 44 px on a coarse pointer)
   are swept as targets, and a pinned positive asserts the sweep saw them.

## Alternatives considered

- **B. Size fields in the owning menus** (`View ▾` gets a Panels group, the Explorer's actions row gets a `⋯`).
  Rejected: five places to keep in step, the Explorer's row is tight at 1024 touch, dock widths in a menu while
  the dock is closed is awkward, and nothing stops the next divider shipping without a twin.
- **C. Rule that the keyboard is sufficient and close #442.** Rejected: it contradicts ADR-0173's own reading of
  2.5.7 and leaves an AA gap.
- **D. A visible grip button on each divider.** Rejected: one more Tab stop per divider, and a 44 px coarse button
  on a divider covers neighbours, which is the #476 problem made worse.
- **A strip shrunk to the free gap** (about 35 px). Rejected: it leaves the divider under the house rule on the
  device the rule is for. **A strip grown only away from the panel** was built for the Explorer and withdrawn
  (D3). **A symmetric strip on the Gantt grid divider** is the one case where the cost is a whole target, so it
  is the named exception.
- **The tooltip primitive for the hint.** Declined: its long-press and click-swallowing would fight the
  separator's own pointer handlers. The separator's native `title` (and so its description) says what the KEYS do, because no key opens the box; the box is the control.

## Consequences

- **A click on a divider opens a box, which is new behaviour on a monitor** and is stated in the changeset.
  Nothing visible says the line can be pressed except the cursor; the Surface sheet (steps 25b
  and 26) asks whether a finger finds the line and whether the box surprises.
- **A finger's strip takes the nearest 5 to 17 px of a neighbour's box** (D3), never its centre. Stated,
  measured and gated rather than hidden. The cost is a finger that means the edge of such a control may grab
  the line instead.
- **The activities table's header row is taller on touch** (41 or 57 px to 61), because its select label is
  44 px; body rows already were 61 for the `⋯`, so they do not move. M0 found no row without a `⋯`.
- **The Explorer's landmark moved** (#473, no ADR of its own): the column's wrapper is the one
  `<nav aria-label="Project Explorer">` and holds the splitter, so axe's `region` rule is clean on the overview
  without a filter. A plan page still reports one `region` finding (the command band's slot), filed separately.
- **#483 is not built.** Under the browser's own text size the breadcrumb is wider than at 100 % (123 to 337 px
  against 89 to 197); the "R… / P" collapse is the inline-root method's (`html { font-size: 200% }`), which no
  browser setting produces. The two stale comments beside it are corrected.
- **Not measured:** the finger's press-to-release movement (a container has no finger; 4 px is the default and
  step 26 records the reading), a Viewer seat's table, and the Surface sheet's answers.
- **A size applied exactly as typed is announced** ("Project Explorer width set to 340 px."), and **a draft lost to
  an outside press is announced as not applied** ("…the typed size was not applied.") rather than applied or
  dropped silently; Escape discards on purpose and says nothing. Both come from the accessibility review (4.1.3,
  ADR-0173).
- **`SizeField` is not a pure extraction.** Escape moved to a `window` capture listener, so the Gantt Columns
  fields' Escape behaviour changed: it now discards a draft where it used to apply it. That is the fix for a
  pre-existing defect, not a regression, and the Gantt's own suite passes unchanged. The field and `TextField`
  can drift (`docs/TECH_DEBT.md` #495).
- **Accepted, unchanged: Tab out of the field closes the box with no focus restore** (the next stop in document
  order after the portal), as `ToolbarPopover` does. Escape is the route back to the line.
- **`CLICK_AFTER_GESTURE_MS` (500 ms) is a heuristic** that tells the click a browser fires after a press or a drag
  from an assistive technology's synthesised one. jsdom proves its two branches; only a real browser proves the
  number, and a screen reader's browse-mode click has not been exercised on a device.
- **Safari/iPad is unchecked:** a tap may not focus a button there, so the box's focus-out handler could close it
  before "Reset to standard" acts. Device-sheet step 28 asks.
- **Filed:** #493 (axe `region` on a plan page), #494 (the Gantt's 25 px strip covers a third of each row menu,
  pre-existing), #495 (`SizeField` against `TextField`).
- **One more shared-primitive review.** `PanelResizer`, `usePointerDrag` and `SizeField` change their public
  contracts, so accessibility-reviewer and component-reviewer read them before release (ADR-0111).

## References

- `docs/TECH_DEBT.md` #442, #470, #473, #475, #476, #483; ADR-0118, ADR-0173, ADR-0177 D4, ADR-0183
- `apps/web/src/components/ui/panel-resizer.tsx`, `size-field.tsx`, `use-pointer-drag.ts`,
  `toolbar/use-popover-panel.tsx`
- `apps/web/e2e-workspace-fit/command-surface.spec.ts` (the dividers case), `e2e-overview/overview.spec.ts`,
  `apps/web/measure-toolbar/a11y-touch-sweep-m0.spec.ts`
