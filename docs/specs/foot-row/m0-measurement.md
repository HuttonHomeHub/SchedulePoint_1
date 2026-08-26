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
