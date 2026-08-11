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

## Follow-ups this task opens

- ~~**Fix the `labelled` flag**~~ — done in this task; `visibleText` / `labelWidth` / `nameWidth`
  now come from `measureText` with the control's computed font.
- **Put the `shortcuts` question to the product owner** before M2-T1 fixes the registry set.
- **Re-run after M2-T1…T5 land** and record the actual promoted state here.
