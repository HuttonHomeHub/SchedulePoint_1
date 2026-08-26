# M0 measured — the foot row, the deck, and what streamlining would buy

> Measured 2026-08-26 in Chromium against a real API on a populated plan with the pen **held**,
> using `apps/web/measure-toolbar/m0-foot-row.spec.ts` (`bash scripts/e2e-local.sh measure:toolbar`).
> The harness's JSON lands in `apps/web/measure-output/`, which is git-ignored — this file is the
> record. Every figure below is measured except the one marked _derived_.
>
> The falsification conditions were written into the spec's docblock **before** the run, so the
> verdicts are computed from the readings rather than read off them afterwards.

## C1 — the overflow is real, and it is live at 1920 as well as 1646

Predicted: at 1646 the row's `scrollWidth` exceeds its `clientWidth` and at least one action sits
beyond the container. Measured: **it overflows at both widths.**

| viewport | content | container | over by | controls off-screen                                     |
| -------- | ------- | --------- | ------- | ------------------------------------------------------- |
| 1920     | 1753    | 1619      | **134** | `Clear visual placement`                                |
| 1646     | 1753    | 1345      | **408** | `Edit`, `Duplicate`, `Delete`, `Clear visual placement` |

The content width is **identical at both widths**: the row does not wrap and does not scroll, it
clips. So this is not a narrow-window problem — one control is already off-screen on the 24″
monitor the product is designed for, and `Delete` is pointer-unreachable on the Surface Pro.
Keyboard still reaches them, because a browser scrolls a focused element into view, which is
precisely why it has gone unreported. Same shape as the ADR-0090 defect.

## The row, itemised (with a selection)

| part                                 | px      |
| ------------------------------------ | ------- |
| Facts block                          | **607** |
| — of which the pen sentence          | 126     |
| Zoom to selection                    | 152     |
| Isolate                              | 79      |
| Isolate caret                        | 24      |
| Logic                                | 71      |
| Report progress                      | 141     |
| Resources                            | 105     |
| Steps                                | 74      |
| Edit                                 | 63      |
| Duplicate                            | 99      |
| Delete                               | 80      |
| Clear visual placement               | 184     |
| Collapse toggle                      | 40      |
| **Armed-tool statement** (intrinsic) | **410** |

Row height 41 px. Container 1619 at 1920, 1345 at 1646.

## C2 — the streamlined row fits at 1920 only if the view commands fold too

| change                                                                | saves           |
| --------------------------------------------------------------------- | --------------- |
| Withdraw the pen sentence                                             | 126             |
| `Zoom to selection` → `Zoom selection`                                | 16              |
| `Report progress` → `Progress`                                        | 46              |
| Fold `Logic`+`Resources`+`Steps`+`Edit` (313) into one `Edit ▾` (~87) | 226             |
| `Clear visual placement` → `Clear placement`                          | ~46 _(derived)_ |
| **total**                                                             | **~460**        |

The last row is **derived, not measured**: that control's text node carries an `sr-only` reason, so
the clone-and-rewrite did not match it. ~6.6 px/char comes from the `Report progress` reading.

The `Edit ▾` figure is a **floor**. `ToolbarSplitButton` renders its caret as a sibling of its
primary (the geometry ADR-0110 D5 records a gate missing for exactly that reason), so the shipped
control may be wider than the 87 px assumed here.

Row after streamlining ≈ **1293 px** → slack **326 px** at 1920.

**C2's condition was that the slack must be at least the armed-tool statement's width**, because
ADR-0092's guarantee is that arming a tool costs the canvas 0 px, and it holds only if the strip has
somewhere to go. The statement measures **410**. So **C2 fails by 84 px**: with an activity selected
_and_ a tool armed, the row wraps and the canvas loses ~41 px.

Folding `Zoom` + `Isolate` into one `Focus ▾` (152 + 79 + 24 = 255 → ~87) frees a further **~168**,
giving **494 px** of slack. **That passes.** At 1646 the slack is ~220 and the row wraps in the
armed-and-selected state, which the product owner has accepted.

## C3 — three deck cards still do not fit at 1920

| card   | px  |
| ------ | --- |
| View   | 638 |
| Find   | 662 |
| Author | 608 |
| Plan   | 674 |

Toolbar container **1878** at 1920 (1604 at 1646); deck height **108 px for two rows**.

`View + Find + Plan` = 1974 + gaps ≈ **1990**, so they are **~112 px over** — the Author card cannot
leave the deck and buy a one-line command band on its own. The earlier reading behind ADR-0113 put
this at ~136; the figure moves, the conclusion does not. Collapsing the deck to one row would be
worth **~50 px** of canvas.

## C1d — focus does NOT scroll a clipped control into view, and 2.4.11 is not cited

This record first said the clipped controls stay keyboard-reachable "because a browser scrolls a
focused element into view". **Measured, that is false.** The pre-fix state was reproduced in the
browser (restoring `shrink-0` on the wrapper), the clipped control focused, and its rect read before
and after:

| viewport | control                  | right before focus | right after focus | fully revealed | centre reachable |
| -------- | ------------------------ | ------------------ | ----------------- | -------------- | ---------------- |
| 1920     | `Clear visual placement` | 2042               | **2042**          | no             | **no**           |
| 1646     | `Edit`                   | 1667               | **1667**          | no             | yes              |

The rect is **identical** before and after: nothing scrolled, because the clip comes from an
ancestor with `overflow-hidden` and there is no scrollable ancestor to move. So the control can be
focused and still not be brought fully into view.

**SC 2.4.11 Focus Not Obscured (Minimum) is nevertheless NOT cited**, and that is a deliberate
restraint rather than an oversight. 2.4.11 triggers when the focused component is _entirely_ hidden;
at 1920 the control spans 1858–2042 against a 1920 viewport, so part of it remains within the
viewport, and whether any of that part is actually painted (rather than clipped by the row's own
box) was **not measured**. The enhanced criterion **2.4.12** — no part obscured — would fail, but it
is AAA and not this product's bar.

So the ADR states the defect as **pointer-operability with a focused control never fully revealed**,
without a WCAG number. This follows the accessibility review's instruction not to assert the citation
from prose, and ADR-0082's record of an overstated citation being corrected.

## C1b — the row clips because one wrapper cannot shrink, not because it is too wide

Added after the architecture review, which raised this as its headline finding and **explicitly
offered it as unverified** — derived from four class lists rather than from a run. So it was probed
rather than argued.

`Toolbar` wraps unconditionally (`Toolbar.tsx:181-189`, _"a line that cannot fit becomes two
lines"_) and the dock outlet is `flex min-w-0 flex-1 flex-wrap` (`canvas-dock.tsx:104`). Between
them sits `selection-actions.tsx:845` — `className="flex shrink-0 items-center"`. A `shrink-0` flex
item takes `max-content` and never shrinks, so the outlet's width is never imposed on it and the
wrapping `Toolbar` inside is never asked to break a line. The overflow then paints past the row and
is clipped by the workspace body's `overflow-hidden`.

Measured by dropping the class, forcing a reflow and re-reading:

| viewport |        | scrollWidth | clientWidth | overflows | row height        |
| -------- | ------ | ----------- | ----------- | --------- | ----------------- |
| 1920     | before | 1753        | 1619        | **yes**   | 41                |
| 1920     | after  | **1619**    | 1619        | **no**    | **77** (2 lines)  |
| 1646     | before | 1753        | 1345        | **yes**   | 41                |
| 1646     | after  | **1345**    | 1345        | **no**    | **117** (3 lines) |

**Confirmed.** The live defect is one CSS class, and the fix is separable from every other decision
in this epic.

What it costs is height, which is what makes the streamlining still worth doing — and changes its
argument from "the row does not fit" to "the wrapped row takes three lines at 1646 and one after
streamlining", i.e. **~76 px of canvas at 1646 and ~36 px at 1920**.

**It also invalidates the width ladder this file's C2 section is built on.** A row that wraps has no
fit/no-fit verdict; C2's arithmetic survives only as a line-count estimate, and the slack figures
(326 px, 494 px) describe a state the product will not be in once the class is dropped.

## C1c — 1753 px is the row's NARROWEST state, not its widest

Also from the architecture review, verified in the code. The fixture is three unlinked activities,
freshly recalculated, pen held, a plain task selected, isolate inactive — so every variable-width
term was measured at its minimum or at zero:

- `ScheduleStateRegion` renders **`null`** in `current` and `pending` (`plan-facts.tsx:229`). The
  `stale`/`failed` states render a sentence **plus a `Recalculate` button** — and that is the state a
  planner is in _while editing_, which is exactly when a selection exists.
- `conflict-remedy` was absent (no conflicts in the fixture); `dissolve` / `duplicate-band` were
  absent (a plain task, not a summary); `Isolate` was measured at its inactive width, not
  `Isolating · Driving path`; the pen sentence was 126 px in the held state against up to 432 px
  across the ten lock states.
- The armed statement's 410 px is the `adding` sentence; `linkPicking` and `linked` carry **activity
  names** and are unbounded.

The diagnosis stands — the row does clip, at its narrowest. The **budget** does not, and neither do
the figures derived from it.

## M3 measured — freeing 126 px bought ZERO height

Re-measured after M3 (the pen sentence made visually hidden, `Clear visual start`):

| viewport | facts         | controls        | container | row height    |
| -------- | ------------- | --------------- | --------- | ------------- |
| 1920     | 607 → **481** | 1112 → **1074** | 1619      | 77 → **77**   |
| 1646     | 607 → **481** | 1112 → **1074** | 1345      | 117 → **117** |

**Not one line was removed.** A wrapping row breaks between ITEMS, not by total width, so freeing
164 px inside a line that still cannot fit another control changes nothing a reader can see. This is
the sixth consecutive width expectation on this surface contradicted by its own measurement, and the
first where the arithmetic was right and the _model_ was wrong.

**What it did reveal is how close 1920 is.** Content is now `481 + 1074 = 1555` plus twelve `gap-2`
gaps ≈ **1651 against a 1619 container — 32 px from a single line.** Crossing that is worth a whole
line, i.e. **~36 px of canvas**.

At 1646 the same row needs to lose **306 px** to reach one line. Nothing remaining in the plan
approaches that; the withdrawn responsive fold (226 px) was the only candidate and would still not
have been enough on its own.

## What the instrument got wrong

Three runs, two of them wasted on the harness rather than the product — and both mis-picks were
caught by the reading's `text` field, not by its number.

1. The first draft queried `[data-toolbar-group]` and `[data-canvas-dock]`. **Neither attribute
   exists.** Found before the first run by grepping for them; a card is `role="group"` named by its
   caption (`Deck.tsx:264`) and the dock outlet is a bare `div` (`canvas-dock.tsx:104`).
2. The selection step used `getByRole('option').first().isVisible()`. That listbox is **`sr-only`**
   (`TsldPanel.tsx:2796`), so the guard answered false and the reading was recorded as
   `{ skipped: 'no listbox option found' }` — at both widths, in a run that otherwise passed.
   **`m5-canvas-foot.json` carries the same skip**, under a docblock stating the row is measured "in
   three states": ADR-0113's foot-row reasoning never saw a selected row. Its dock figures came from
   the at-rest and armed states and are sound; the selected state simply was not measured. This
   probe now **fails** rather than skipping, and selects by focusing the listbox, which
   default-selects (`TsldPanel.tsx:974`).
3. The dock strip was then read as `row.querySelector('[role="status"]')`, which matched the **pen
   sentence** and returned a perfectly plausible 126 px with the wrong text. A second attempt
   excluded `[data-schedule-state]` as an attribute of the child and matched the **facts block**,
   because that attribute sits on a descendant. The third dumps every direct child alongside the
   answer, so a fourth mis-pick would be visible rather than plausible.
