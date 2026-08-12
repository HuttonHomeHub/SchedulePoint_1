# M2-T0 — the per-item widths the consolidation is sized against

> Measured 2026-08-11 in Chromium on a **populated** plan (pen taken, two activities, schedule
> computed), via `apps/web/measure-toolbar/item-widths.spec.ts`. Readings land in
> `apps/web/measure-output/` (gitignored).
>
> The plan makes this the first task of M2 because **sizing a consolidation by arithmetic is the
> mistake this whole epic exists to correct**: `design.md` did exactly that and M0 falsified its
> headline. So the item widths come from the browser, and the two conclusions below are separated by
> how well they are actually supported.

## Row 1 today, item by item (at 2304, where the row is fully inline)

Container 2216 px · 25 items · **1911 px of items**.

|      px | id                                                                                                                                                                        | group        |
| ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
|     240 | `search`                                                                                                                                                                  | Find         |
|     183 | `colour-by`                                                                                                                                                               | Display      |
|     150 | `finish-chip`                                                                                                                                                             | Plan actions |
|     132 | `go-to-date`                                                                                                                                                              | Navigate     |
|     126 | `summary`                                                                                                                                                                 | Plan actions |
|     102 | `zoom-preset`                                                                                                                                                             | Navigate     |
|     102 | `mode-visual`                                                                                                                                                             | Display      |
|      96 | `mode-early`                                                                                                                                                              | Display      |
|      93 | `filter`                                                                                                                                                                  | Find         |
|      91 | `view`                                                                                                                                                                    | Display      |
|      81 | `isolate-logic`                                                                                                                                                           | Find         |
|      76 | `view-tsld`                                                                                                                                                               | Display      |
|      55 | `view-gantt`                                                                                                                                                              | Display      |
| 32 each | `zoom-out`, `zoom-in`, `fit`, `zoom-to-selection`, `today`, `baseline-overlay`, `resource-view`, `over-allocation`, `next-conflict`, `float-paths`, `legend`, `shortcuts` | —            |

**Pinned (a `render` item, which can never demote): 1198 px.** That is `go-to-date`, `zoom-preset`,
`view`, `colour-by`, `search`, `filter`, `isolate-logic`, `finish-chip`, `summary` — the two status
chips self-hide at rest. It **corroborates `design.md`'s ~1177 px estimate**, one of the few figures
in that document that survived contact with a browser.

Row 2 totals **835 px across 19 items, with nothing pinned** — which is why it has never overflowed
above 1024.

> **A correction, recorded because it would have flattered the milestone.** This harness's first
> version derived "pinned" from the DOM — _not a `<button>`_ — which is wrong: `data-toolbar-item`
> sits on the item's **focusable control**, and a `render` item's control is usually a button too. It
> reported the pinned subtotal as **390 px against a true 1198 px** — an 800 px error, in the
> direction that makes the consolidation look easy. Pinned-ness is a fact about the registry, so it
> is joined from there. Do not reintroduce a DOM-derived flag.

## Conclusion 1 — Option B clears 1920 icon-only. This is solid.

Option B keeps 15 items on Row 1 (`design.md` §4.1) and relocates ten.

- kept: **1212 px**
- removed: **699 px** (`colour-by` 183, `finish-chip` 150, `filter` 93, `isolate-logic` 81, plus six
  32 px controls)
- chrome, from the shipped constants: (5 − 1) × 13 + (15 − 1) × 4 + 56 = **164 px**

**1376 px against an 1832 px container at 1920 — fits, with 456 px of slack, and the `⋯` empty.**

## Conclusion 2 — Option B as designed does **not** clear 1920 with labels. It is 34–100 px short.

> The first version of this section said the question was unanswerable, because its inputs were a
> per-character text estimate and a `labelled` flag that reported `next-conflict` as labelled at
> 32 px wide. Both are now fixed: the flag sums the element's own visible text nodes (skipping
> `sr-only` and `aria-hidden` subtrees), and the width comes from **the same `measureText` call
> `Toolbar.tsx:130-146` makes to decide promotion**, with the control's real computed font. So the
> label cost is no longer an estimate of the same class — it is the component's own input.

### How the row actually decides to label

`Toolbar.tsx:286-310`, and the shape of it matters more than the numbers:

```
autoItems  = bar.filter(onActivate && labelPolicy === 'auto')   // `bar`, NOT the inline set
labelCost  = Σ measureLabelWidth(item.label) + 14 each          // LABEL_CHROME_PX
projected  = Σ widthOf(bar) + chromeWidth + labelCost + (overflow ? overflowWidth : 0)
autoLabelsFit = projected + 32 <= container.clientWidth         // LABEL_PROMOTION_MARGIN_PX
```

**It sums the whole `bar`, not the inline half.** So labels promote only when the row could fit
_every_ Tier-1/2 command labelled at once — a demoted item still pays for its label. That is
deliberate (a half-labelled row reads as broken), and it is why today's Row 1 is a wall of glyphs
rather than a partly-labelled one: one 121 px label anywhere on the bar suppresses all of them.
**It also means M2's reduction is the correct lever** — nothing short of removing items from the
registry raises `autoLabelsFit`.

### Row 1's `'auto'` items after Option B, measured

Six survive (`design.md` §4.1: `zoom-out`, `zoom-in`, `fit`, `today`, `next-conflict`,
`shortcuts` — everything else on the reduced row is a `render` item or `showLabel: 'always'`).

| label                 | measured px | +14 chrome |
| --------------------- | ----------: | ---------: |
| `Keyboard shortcuts`  |     **121** |        135 |
| `Next conflict`       |          76 |         90 |
| `Go to today`         |          72 |         86 |
| `Fit to plan`         |          61 |         75 |
| `Zoom out`            |          59 |         73 |
| `Zoom in`             |          51 |         65 |
| **label requirement** |     **440** |    **524** |

`design.md` §4.2 estimated 560. The measurement is 524 — that figure was close, unlike its headline.

### The verdict

| term                                 |       px |
| ------------------------------------ | -------: |
| kept items, icon-only (Conclusion 1) |     1212 |
| chrome (5 groups, 15 items)          |      164 |
| label requirement                    |      524 |
| `LABEL_PROMOTION_MARGIN_PX`          |       32 |
| **required**                         | **1932** |
| container at 1920                    |     1832 |
| **shortfall**                        | **−100** |

With `design.md` §4.1's proposed `go-to-date` narrowing (icon + chevron, date in the `title`,
−66 px) the shortfall is **−34 px**. Either way it fails, and `next-conflict`'s new label carries
a "· 2 of 7" count that makes it wider still, not narrower.

**So Conclusion 1 stands and Conclusion 2 is settled the other way**: Option B fits at 1920 with
room to spare, and it fits _icon-only_. Success criterion 1 (`design.md` §1.4 — "every inline
command **with its label**") is not met by the consolidation as specified.

### One further cut closes it, and it is a cut the product owner already asked about

`shortcuts` is the **most expensive label on the reduced row (121 px, the largest of the six)**
attached to the least-used command, and it is the only member of the `help` group once `legend`
moves into `View ▾` — so removing it takes its group rule with it:

|   saved | term                                                                              |
| ------: | --------------------------------------------------------------------------------- |
|     135 | its label + chrome                                                                |
|      32 | its icon-only width                                                               |
|       4 | one `gap-1`                                                                       |
|      13 | the `help` group rule (`ml-1` + `border-l` + `pl-2`), now that the group is empty |
| **184** |                                                                                   |

Required drops to **1748 against 1832 — it fits, with 84 px of headroom**, without narrowing
`go-to-date` at all, and with enough left over to absorb `next-conflict`'s richer label.

That is a measured answer to the product owner's **Question 3** — _"could keyboard shortcuts move
out of the toolbars?"_ — which `design.md` answered on ergonomic grounds alone. It is also the
answer with the smallest cost: the `?` shortcut already opens the dialog, and ADR-0084's estate
aside, a keyboard-shortcuts _button_ is the one command whose users are by definition reaching for
the keyboard. **This is a scope decision, so it is put to the product owner rather than taken**
(see the milestone's open questions), with the alternative stated: keep `shortcuts` on the bar and
accept that Row 1 stays icon-only at 1920, which is what ships today.

### The obligation this does not discharge

These are the component's own inputs, but they are still arithmetic over them. **M2-T5 re-runs this
harness against the built set and records the actual `autoLabelsFit` state here** — the discipline
that turned M1 around. Predicting a label promotion is exactly the move `design.md` made and M0
falsified; the difference is that this prediction is falsifiable in one command and says which way
it expects to fall.

## M2-T1 landed — the first measured reduction

Re-measured 2026-08-11 after `zoom-to-selection` and `isolate-logic` moved to the selection bar
(`float-paths` did **not** — see the commit and `implementation-plan.md`; it is a view-agnostic
analysis that runs in the Gantt).

|                   | before |    after |       Δ |
| ----------------- | -----: | -------: | ------: |
| Row 1 items       |     25 |   **23** |      −2 |
| Row 1 total @2304 |   1911 | **1798** |    −113 |
| **Pinned floor**  |   1198 | **1117** | **−81** |
| Inline @1920      |     15 |   **17** |      +2 |

The pinned saving is `isolate-logic` alone (81 px): it was a `render` item, so it could never demote
and its width was paid at every viewport. `zoom-to-selection` was a 32 px demotable. Together they
are **113 px of Option B's projected 699 px removal** — and the two remaining big-ticket items
(`colour-by` 183 px and `finish-chip` 150 px, both pinned) are M2-T2 and M2-T3.

**Conclusion 2 is unaffected**, which is worth stating so nobody re-derives it: neither moved
command was among the six `'auto'` items whose labels the 524 px figure counts. The label question
still resolves at M2-T5, by measurement.

## M2-T2 (colour-by) landed — Row 1 stops overflowing at 1920

Re-measured 2026-08-11 after `colour-by` moved into `View ▾`.

|                   | M2 start | after T1 | after T2 (colour-by) |  total Δ |
| ----------------- | -------: | -------: | -------------------: | -------: |
| Row 1 items       |       25 |       23 |               **22** |       −3 |
| Row 1 total @2304 |     1911 |     1798 |             **1615** |     −296 |
| **Pinned floor**  |     1198 |     1117 |              **934** | **−264** |
| Inline @1920      |       15 |       17 |         **22 (all)** |       +7 |

**The headline is the last row.** At 1920 the row now holds _every_ item inline — the `⋯` is empty
and nothing demotes. That is `design.md` §1.4 success criterion 2 met at 1920 rather than at the
1440 it was written for, and it is the first time in this epic that Row 1 has not overflowed on the
product owner's own monitor.

`view` still measures **91 px**, unchanged: the trigger annotation is conditional, and the fixture's
plan is at the default `criticality`. That is the decision working, not the feature failing to
apply — the non-default width is only spent when a planner has actually changed the encoding.

Remaining pinned: `search` 240, `finish-chip` 150, `go-to-date` 132, `summary` 126, `zoom-preset`
102, `view` 91, `filter` 93. `finish-chip` is M2-T3.

## After M2-T2 in full (lenses + Legend into `View ▾`)

|                   | M2 start | after T1 |     after T2 |
| ----------------- | -------: | -------: | -----------: |
| Row 1 items       |       25 |       23 |       **18** |
| Row 1 total @2304 |     1911 |     1798 |     **1487** |
| Pinned floor      |     1198 |     1117 |      **934** |
| Inline @1920      |       15 |       17 | **18 (all)** |

**And the label arithmetic, re-derived rather than assumed — it got worse, not better.** Seven
`'auto'` items now survive on Row 1, not the six Option B projected: `zoom-out` 59, `zoom-in` 51,
`fit` 61, `today` 72, `next-conflict` 76, **`float-paths` 69** and `shortcuts` 121. That is 509 px
of text, 607 px with the 14 px per-item chrome.

| term                        |       px |
| --------------------------- | -------: |
| items                       |     1487 |
| chrome (5 groups, 18 items) |      176 |
| label requirement           |      607 |
| promotion margin            |       32 |
| **required**                | **2302** |
| container @1920             |     1832 |
| **shortfall**               | **−470** |

`float-paths` is in the list because M2-T1 correctly declined to move it (it runs in the Gantt).
So the earlier hope — that clearing enough width would let labels promote without cutting anything
— **does not survive measurement**: the reduction so far is 424 px and the shortfall is 470.

`finish-chip` (150 px, M2-T3) and the Row-2 consolidation do not change the label term at all; only
removing an `'auto'` item does. `shortcuts` remains the single largest at 135 px all-in, and on
these numbers cutting it alone still would not close a 470 px gap. **This is the question to put to
the product owner at M2-T5, with these figures** — and the honest framing is no longer "cut one
control and labels appear", it is "labels at 1920 need roughly three of the seven to go, or a
different mechanism".

## After M2-T3 (Project-finish read-out → plan header) — labels promote at 2304

|              | M2 start |   T1 |  T2 |  **T3** |
| ------------ | -------: | ---: | --: | ------: |
| Row 1 items  |       25 |   23 |  18 |  **17** |
| Pinned floor |     1198 | 1117 | 934 | **784** |
| Inline @1920 |       15 |   17 |  18 |  **16** |

**The new fact: at 2304 the row now labels itself.** Every one of the seven `'auto'` items measures
its labelled width for the first time in this epic — `shortcuts` 174 (was 32), `next-conflict` 126,
`today` 120, `float-paths` 116, `fit` 108, `zoom-out` 106, `zoom-in` 96. That is `autoLabelsFit`
flipping true, observed rather than predicted, and it is the first evidence that the mechanism works
at all rather than merely that the row is shorter.

**At 1920 it does not.** The items stay icon-only and `shortcuts` demotes into the `⋯`:

| term                                  |       px |
| ------------------------------------- | -------: |
| items (incl. the demoted `shortcuts`) |     1337 |
| chrome (5 groups, 17 items)           |      172 |
| label requirement                     |      607 |
| `⋯` button                            |       44 |
| promotion margin                      |       32 |
| **required**                          | **2192** |
| container @1920                       |     1832 |
| **shortfall**                         | **≈360** |

### What this means for the question going to the product owner

Removing an `'auto'` item saves its label, its icon width and a gap. The three candidates:

|                 | label+chrome | width | gap | **saved** |
| --------------- | -----------: | ----: | --: | --------: |
| `shortcuts`     |          135 |    32 |   4 |   **171** |
| `next-conflict` |           90 |    32 |   4 |   **126** |
| `float-paths`   |           83 |    32 |   4 |   **119** |

Any two total 245–297 — **not enough**. All three total 416, which clears 360 with room. So the
honest choice is: **labels at 1920 cost all three of `shortcuts`, `next-conflict` and
`float-paths`**, and the last two are commands a planner uses to trace logic, not conveniences.
Nothing in M2-T4/T5 changes this — they touch Row 2 and the pinned set, and the label term moves
only when an `'auto'` item leaves.

That is the trade to put, and it should be put as a trade rather than as a recommendation: labelled
commands at 1920, or three fewer commands on the row. `design.md` §1.4 criterion 1 assumed the first
was free.

## M2 complete — both rows, measured

|                           | M2 start |     now |
| ------------------------- | -------: | ------: |
| Row 1 items               |       25 |  **17** |
| Row 1 pinned floor        |     1198 | **784** |
| Row 2 items               |       19 |  **15** |
| Toolbar stops (both rows) |       44 |  **32** |

Row 1 at 1920 holds 16 of 17 inline; Row 2 holds all 15 with 851 px against an 1832 px container.

### The label question, both rows, at 1920

**Row 1 — short by ≈360 px.** Seven `'auto'` items; removing one saves its label, its icon width and
a gap: `shortcuts` 171, `next-conflict` 126, `float-paths` 119. Any two save 245–297 and do not
clear it; **all three** save 416 and do.

**Row 2 — short by ≈128 px**, which is a different order of problem. Eight `'auto'` items, and their
labels are much wider than Row 1's:

| label                           | icon-only | labelled | label cost |
| ------------------------------- | --------: | -------: | ---------: |
| `clear-visual-placement`        |        32 |      199 |    **167** |
| `auto-arrange`                  |        32 |      172 |        140 |
| `calendar` (Schedule settings…) |        32 |      177 |        145 |
| `update-progress`               |        32 |      163 |        131 |
| `snap-to-grid`                  |        32 |      124 |         92 |
| `comments`                      |        32 |      114 |         82 |
| `marquee-select`                |        32 |      145 |        113 |
| `add-note`                      |        32 |      101 |         69 |

`clear-visual-placement` alone (167 + 32 + 4 = 203) clears Row 2's gap with room to spare — and it
is the narrowest-purpose command on the row: it only does anything in Visual scheduling mode, and it
is pen-gated on top of that.

**So the two rows have different answers**, which is worth saying plainly because a single
"labels at 1920" verdict would be wrong for one of them. Row 2 is one cut away. Row 1 needs three,
two of which — `next-conflict` and `float-paths` — are logic-tracing commands rather than
conveniences.

## Follow-ups this task opens

- ~~**Fix the `labelled` flag**~~ — done in this task; `visibleText` / `labelWidth` / `nameWidth`
  now come from `measureText` with the control's computed font.
- **Put the `shortcuts` question to the product owner** before M2-T1 fixes the registry set.
- **Re-run after M2-T1…T5 land** and record the actual promoted state here.
