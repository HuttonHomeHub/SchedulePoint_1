# M7-S0 — measuring before the degradation ladder

**Date:** 2026-08-13 · **Harness:** `apps/web/measure-toolbar/item-widths.spec.ts`
(`pnpm --filter @repo/web measure:toolbar`), real Chromium, real plan, no injected component.
**Asserts nothing** (ADR-0081 §3).

This milestone rebuilds the toolbar's fit arithmetic into a single degradation ladder. Every budget
in that ladder is a sum of measured addends, and two of them were stale by construction before a
line of it was written. So this ran first.

---

## 1. The baseline — what `web-v0.86.1` actually does

Row 1 is `View and navigate`, Row 2 is `Build and manage`. `labelled` counts items rendering their
text; `sum` is the total measured item width, which is why it moves with the label decision.

| viewport | Row 1 container | Row 1 labelled | Row 2 container | Row 2 labelled |
| -------- | --------------- | -------------- | --------------- | -------------- |
| 2304     | 2152            | 8/9            | 2288            | 12/14          |
| 1920     | 1768            | 8/9            | 1904            | 12/14          |
| **1646** | **1494**        | **8/9**        | **1630**        | **12/14**      |
| 1536     | 1384            | 8/9            | 1520            | 5/14           |
| 1440     | 1288            | 4/9            | 1424            | 5/14           |
| 1280     | 1128            | 4/9            | 1264            | 5/14           |
| 1024     | 872             | 4/5            | 1008            | 5/13           |
| 960      | 808             | 0/9            | 944             | 5/11           |
| 768      | 616             | 0/8            | 752             | 4/6            |

The ninth Row 1 item and the two unlabelled Row 2 items at the top are `render` items (`search`,
`undo`, `redo`) — icon-only by design, not by budget.

**1646 is the product owner's Surface Pro** (2880 × 1920 at 175 %). Note how close it is to the
edge: Row 2 is fully labelled at 1646 and loses seven labels by 1536. That 110 px is the whole
margin the row has, and it is the fact the rest of this document is about.

---

## 2. The finding that changes the release plan

**Costing the standing `⋯` — correct on its own terms — takes Row 2's labels away at exactly 1646.**

Measured before and after `17ac626` (`fix(web): cost the standing overflow button…`), same harness,
same run conditions, only those two files swapped:

| viewport | Row 2 labelled — `web-v0.86.1` | Row 2 labelled — with the `⋯` costed |
| -------- | ------------------------------ | ------------------------------------ |
| 1920     | 12/14                          | 12/14                                |
| **1646** | **12/14**                      | **5/14**                             |
| 1536     | 5/14                           | 5/14                                 |

Row 1 is unchanged at every width (8/9 throughout the labelled band), because its slack is larger.

This is not a defect in the fix. The row **is** paying for a `⋯` that renders, the old arithmetic
**was** pretending otherwise, and the ~49 px it recovers is real. The point is that the correction
is a **net narrowing on the day it lands**, and the width it narrows past is the one width this
epic exists to serve. The design review predicted exactly this (blocker B4) and named the remedy:
it must ship together with tier-3 admission, which removes the `⋯` entirely at wide viewports and
hands the same width back.

**Consequence for the release: the arithmetic commits must not be released alone.** The product
owner asked for one release when it all works, which is now also the only safe sequencing.

---

## 3. `CHROME_RESIDUAL_PX` — the instrument could not answer this, and now can

`Toolbar.tsx`'s residual is the part of a row's width the group-rule + gap walk cannot attribute.
It was measured at 26–31 px (Row 1) and 50–55 px (Row 2) during ADR-0090 M1 and rounded up to **56**.
Both rows' composition has changed twice since, so the number was stale by construction rather than
by suspicion (design review, blocker B2).

**The first attempt to re-derive it was wrong, and the way it was wrong is worth keeping.** The
obvious formula is `scrollWidth − Σ widths − gaps − rules`. But the row is a flex line whose
content is laid out to fit, so **`scrollWidth === clientWidth` at every one of the nine viewports** —
the formula returns the row's _slack_, which on Row 1 at 2304 is 969 px. Those figures were written
into a draft of this section as chrome residuals before anything computed them: a table of
plausible-looking numbers, none of them measuring the thing they were labelled with. They are
ADR-0076 Class 3, caught only by doing the arithmetic instead of asserting it.

A residual is a property of the space **between** items, so the harness now reports each item's
`left`/`right` edges and the row's own content edges. Every gap on both rows at 1646:

**Row 1** (`View and navigate`), 9 items, 4 groups —

```
  0  go-to-date 132 │  4 zoom-out 106 │  4 zoom-in 96 │  4 fit 108 │  4 today 120
 17  view        91 │ 29 search   240 │  4 filter 93 │ 277 summary 126 │ trailing 41
```

**Row 2** (`Build and manage`), 14 items, 3 groups —

```
  0  add-activity 65 │ 30 link-tool 67 │ 30 marquee-select 32 │ 4 auto-arrange 32
  4  add-note     32 │  4 snap-to-grid 32 │ 4 recalculate 119 │ 4 undo 32 │ 4 redo 32
 17  analysis    116 │  4 calendar 32 │ 4 update-progress 32 │ 4 comments 32
 17  export      164 │ trailing 682
```

Every figure is now named:

- **4** — `gap-1`, exactly as the walk charges it.
- **17** — a group boundary: the container's own 4 px gap plus the 13 px rule (`ml-1` + `border-l` +
  `pl-2`). Charged correctly.
- **29** (Row 1, before `search`) — a group boundary **plus the search field's `ml-3`**, 12 px.
  Genuinely unattributed.
- **277** (Row 1, before `summary`) — the `ml-auto`. After the B1 fix it is the row's only one, and
  `summary` sits where `alignEndGroup` promises. `trailing 41` is the `⋯` immediately after it —
  32 px of button plus 9 px of wrapper chrome (`gap-1` + `border-l` + `pl-1`), also unattributed.
- **30 ×2** (Row 2) — **not chrome at all.** `add-activity` and `link-tool` are split buttons, and
  `data-toolbar-item` sits on the _primary_ half, so the harness measures 65 px and the ~26 px caret
  (`min-w-6` + `ml-0.5`) falls into the following gap. `Toolbar` does **not** make this mistake: for
  a `render` item its ref is the wrapping `<span>`, which contains both halves.

**So the honest residual, from `Toolbar`'s own point of view, is 21 px on Row 1 (12 search + 9 for
the `⋯` wrapper) and 9 px on Row 2 — not 27 and 51.** The old 50–55 px Row 2 figure was measured
with this harness's item-width convention and is therefore two split-button carets the primitive
already counts. `CHROME_RESIDUAL_PX = 56` still _bounds_ the truth, so nothing shipped is wrong —
but it over-charges Row 2 by ~47 px, which is within a couple of pixels of the ~49 px that §2 shows
costing that row its labels at 1646. The two findings are the same width seen twice.

The ladder therefore charges the two remaining margins **by name** rather than lumping them into a
generous constant, which is the S2 work: an addend you can name is one a later composition change
invalidates loudly.

---

## 4. Coarse pointer, at 1646

`pointer-coarse:px-3` takes every control from 32 to 40 px wide. The coarse run at 1646 reproduces
the standing finding (`docs/TECH_DEBT.md` #133): Row 2 withholds every label in tablet mode. The
product owner uses a keyboard, so the Surface reports a **fine** pointer and the tables above are
the state they see. This is recorded so the ladder is not tuned against the wrong pointer, and it is
still debt rather than a defect.

---

## 5. What this does not measure

- **Nothing here is a gate.** `e2e-toolbar-fit` is the gate; this is the instrument.
- Every edge is rounded to a whole pixel before it is reported, so a gap carries up to ~1 px of
  rounding and a per-row total up to ~1 px per item.
- One width, 2304, exists only to check the ladder's top end; no product target sits there.
- The harness drives a plan of one activity. Item widths are content-independent, but the canvas
  beneath is not, and no figure here says anything about draw cost.
- The run is a **fine** pointer except where §4 says otherwise, and Chromium only — the standing
  Chromium-first caveat in `CLAUDE.md` §17 applies.
- `clear-visual-placement` is the only tier-3 item on Row 2 and is `isVisible`-false on this plan,
  which is why Row 2 shows no `⋯` and 682 px of trailing slack. Row 1's three tier-3 items are why
  it has one. A plan with a visual placement would put a `⋯` on both rows.
