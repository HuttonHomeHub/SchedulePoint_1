# M1 measurement — the seam and the ground

- **Status:** Accepted — readings taken 2026-09-10 on the M1 tree (`measure-console.mjs`, 32-char
  plan name, the control run's fixture)
- **Instrument:** the M0 harness, unchanged.

| width | band before → after | header                                    | deck before → after | deck rows     | foot |
| ----- | ------------------- | ----------------------------------------- | ------------------- | ------------- | ---- |
| 1920  | 180 → **143**       | 40                                        | 108 → **80**        | 2             | 55   |
| 1646  | 180 → **143**       | 40                                        | 108 → **80**        | 2             | 55   |
| 1440  | 278 → **191**       | 88 (2 lines — the pen cluster, see below) | 166 → **80**        | **2** (was 3) | 55   |
| 1280  | 278 → **235**       | 88                                        | 166 → 124           | 3             | 55   |

Coarse pointer at 1646: 196 → **163** (the study predicted 159 for C and M0 measured 165; M1 is 2 px
under that with the captions still present, because the header's floor dropped 8 and the caption's
box is `--control-h` either way).

## What the 37 px is

Exactly the M0 §1 arithmetic: the card's 14 px per deck line × 2 (**28**), the double seam (**1**),
the header band's floor `min-h-14 → min-h-12` (**8**). The plan's M1 outcome said "~150"; it is 143,
inside F1's 145 bar with the captions still on the band — so if M6's picture is wrong, this commit is
the revert point and the height stays.

## Two things the measurement says that the plan did not

1. **F6 holds at 1440 after M1, with 8 px to spare.** Deleting the cards took the LOOK set from
   1452 to **1416** against a 1424 container, so the deck is two rows at every width down to 1440
   and three at 1280 — which is F6 as originally written. M0's correction to the plan (§2, "at most
   three at 1440") stands for **C's 48 px column gap**, which re-spends that 8 px five times over;
   M4 decides between the gap and the row.
2. **The band at 1440 is 191 because the HEADER is two lines, not the deck.** That is ADR-0112 D4's
   accepted wrap, caused at this width by the pen cluster: M0 §1's C run, which hides the cluster,
   reads the header at 42 px at 1440. So F1's bar is met at 1646 and 1920 now, and 1440 joins at M5
   — the gate case asserts the bar at the two widths F1 names and says why in its own comment
   (its first version asserted 1440 too and went red for M5's reason).

## The gate case, verified red twice, and the second red corrected the instrument

`command-surface.spec.ts` gains "the band stays inside its height bar and the deck its line count".
The height half went red against the pre-M1 tree at **180 against 145**. The line half was made red
by injecting a 1500 px item — and the **first** line metric (height ÷ tallest child, the shape
`pen-status.spec.ts` uses for the header) **passed** against it: a group that wraps internally
becomes the tallest child and divides itself away. Under the declared rows that is exactly the
failure F6 exists to catch, so the metric is now the number of distinct rows the controls sit on,
which went red at **3 rows against 2** on the same injection. A gate is finished when it has been
made to fail by the defect it was written for (ADR-0110 D5); this one had to be made to fail twice.

## Deviations from the plan's M1-T3, recorded rather than smoothed

- The **group-level** inset rule (24 px + rule + 24 px between groups) does **not** land at M1. Under
  today's flex wrap a group that starts a new line would paint its rule into the wrapper's padding —
  the line-leading group is not knowable in CSS. It lands at M4 with the declared rows, where "second
  in its row" is a fact. The section seam and the split caret take the shared `TOOLBAR_INSET_RULE` now.
- The rule's height is **50 %** (`inset-y-1/4`), not the study's 44 %: the sizing ratchet on arbitrary
  values (ADR-0099) is worth more than 6 % of a hairline. The group rule will be 60 % (`inset-y-1/5`).
