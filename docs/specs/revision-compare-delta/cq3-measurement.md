# CQ-3 — the measurement, and its verdict

Judged against [`cq3-condition.md`](./cq3-condition.md), which was **committed before this harness
existed** (`d89d60b5`). Harness: `apps/web/measure-toolbar/cq3-facts-chip.spec.ts`. Chromium, the
production component tree, a real plan named `Riverside — Phase 2 Substructure` with two activities
and a computed schedule.

## VERDICT: PROCEED

At every measured width, with the dock populated, both equalities hold:

| width | foot row | canvas    | facts column  | dock width      | dock height |
| ----- | -------- | --------- | ------------- | --------------- | ----------- |
| 1920  | 55 → 55  | 571 → 571 | 254.7 → 507.4 | 1161.9 → 1033.6 | 34 → 34     |
| 1646  | 55 → 55  | 588 → 588 | 244.7 → 497.4 | 1012.3 → 759.6  | 34 → 34     |
| 1440  | 55 → 55  | 353 → 353 | 244.7 → 497.4 | 806.3 → 553.6   | 34 → 34     |
| 1280  | 55 → 55  | 293 → 293 | 244.7 → 497.4 | 646.3 → 393.6   | 34 → 34     |
| 1024  | 55 → 55  | 200 → 200 | 244.7 → 497.4 | 390.3 → 137.6   | 34 → 34     |
| 768   | 55 → 55  | 200 → 200 | 244.7 → 497.4 | 411.3 → 158.6   | 34 → 34     |

The chip is **236.8 px** wide and the facts column grows by **252.7 px** (the chip plus one
`gap-x-4`). The foot row does not move and the diagram loses nothing.

## Why it is free, which is not the reason the condition expected

The condition anticipated a third line: the facts are two explicit rows at 16 px each, so a third
would be 48 px against a 40 px floor and the row would have to grow. **It cannot happen.** `Fact`
carries `whitespace-nowrap` and its row is `flex items-center gap-x-4` with **no** `flex-wrap`, so
the row cannot break at all. The facts get **wider**, not taller.

So the height equality is satisfied structurally rather than by fitting, and the real cost is
horizontal: **252.7 px taken from the dock beside it**, at every width. The dock is `flex: 1 1 0%`
— it grows into whatever the facts leave — which is ADR-0115's mechanism exactly, measured there in
the other direction: the facts holding 231 px was what kept the dock from fitting at 1440, and
handing it back took that row from 117 px of wrap to 41.

Measured here, the dock **absorbs it without wrapping**: `dockHeight` is 34 px with and without the
chip at every width, including 1024 where the dock falls to 137.6 px.

## What this does NOT establish, and what to check at M2

**Whether the dock's content is legible and reachable in the reduced width.** The dock does not grow,
but at 1024 and 768 it is left 137.6 and 158.6 px, and this harness measures boxes rather than
whether the strip inside one is clipped. ADR-0114 M1 records a foot-row control that was painted,
pointer-unreachable and keyboard-unreachable while every height assertion passed — a clipped control
looks exactly like a control that is not there. **Check that with an `elementFromPoint` sweep when
M2 builds the chip**, not by re-reading these numbers.

Placement is also M2's: the chip was injected into the **first** fact row (Data date / Finish), the
tighter of the two, and the second row was measured alongside so the choice is informed.

## Three corrections the harness made to itself

1. **The first foot-row lookup was wrong and its number was checkable.** It walked up to the first
   ancestor wider than the facts column and found a wrapper hugging them at **32 px** — the facts'
   own height wearing the foot row's name. The real row is **55 px**, found by `[data-activities-bar]`,
   the seam `m4-shrink.spec.ts` already uses. An unproven structural walk beside a proven attribute
   is the instrument defect this epic keeps finding in other people's harnesses.
2. **The first two runs measured an EMPTY dock.** `dockHeight` was 0 in both states, so the chip was
   taking 252.7 px from a box holding nothing, and "the foot row did not grow" was true and
   uninformative — the same shape as a CHECK probe run against an emptied table. The dock is now
   populated by arming a tool (the lever `e2e-workspace-chrome/dock.spec.ts` uses), and a control
   **asserts `dockHeight > 0` before any verdict is formed**. Clicking a table cell was tried first
   and did not populate it.
3. **The chip is a CLONE of a real `Fact` node, not a hand-built one.** ADR-0119's divider probe
   reported +5 px against a predicted +13 because it styled a `<button>`, whose existing `px-2` an
   inline `padding-left` replaces rather than adds to — the verdict was unaffected and the recorded
   number was simply wrong. A clone inherits the real classes, font, gap and box by construction.

The chip text is the worst realistic case — `vs Contract Baseline: +14 working days later` — for the
reason `vertical-stack.spec.ts` records: ADR-0097 Landing C reported +307 px of slack and a PROCEED
because it measured a 37 px plan name where the real worst case is 227 px.
