# M0-T3 — the throwaway prototype, photographed (CQ-1)

- **What this is.** Spec §4.6 applied to a **local, uncommitted** tree on 2026-10-09, `web 0.183.1`: `RowSubject` markup
  (`flex flex-wrap items-baseline gap-x-2 gap-y-0`; name group with a collapsible space before the badge; `sr-only` ", " before the
  context; nothing truncates), `ListRow` `align?: 'center' | 'baseline'`, the two consumers passing `align="baseline"` with the dead
  `shrink-0` removed. **The code is not committed** (it was reverted with `git checkout -- apps/web/src`, leaving only the inert
  `data-row-subject` hook); M1 re-implements from the spec, not from this. What is committed is these photographs and numbers.
- **Same probe, same fixture, same widths** as [`m0-measurement.md`](./m0-measurement.md). Raw: [`m0-raw-prototype.md`](./m0-raw-prototype.md)
  (without the 200-character plan), [`m0-raw-prototype-maxima.md`](./m0-raw-prototype-maxima.md) (with it).

## Photographs (Explorer at its default, the M0-T2 fixture)

| Width                                                                         | Before                                                            | After                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| 1912 × 948                                                                    | [`photos/before-1912x948.png`](./photos/before-1912x948.png)      | [`photos/after-1912x948.png`](./photos/after-1912x948.png)      |
| 1912 × 948, whole page (a 1900 px tall window, so nothing is behind the fold) | [`before-1912x948-tall.png`](./photos/before-1912x948-tall.png)   | [`after-1912x948-tall.png`](./photos/after-1912x948-tall.png)   |
| 1646 × 1000                                                                   | [`photos/before-1646x1000.png`](./photos/before-1646x1000.png)    | [`photos/after-1646x1000.png`](./photos/after-1646x1000.png)    |
| 1646 × 1000, whole page                                                       | [`before-1646x1000-tall.png`](./photos/before-1646x1000-tall.png) | [`after-1646x1000-tall.png`](./photos/after-1646x1000-tall.png) |

Also kept: `photos/before-1024x600.png`, `before-1280x800.png`, `before-1465x900.png`, `before-320x800.png` (today's tree). The "tall" pair
is the one to read for CQ-1: at the fold the long-name rows are all you see, and the ordinary `Dockside — Ancillary works N` rows are
behind it.

## What the probe says on the prototype (early read of SC-1, SC-3, SC-4, SC-5)

**SC-1 — nothing clipped: 0 names, 0 contexts, 0 ellipses in all 13 cells**, including 320 × 800, 200 % and the text-spacing
injection; document `overflow-x` 0 and no `fill` body scrolls horizontally in any cell. The SC-2 after-control (a ~400 px token in one
context at 320 × 800): not clipped before, **clipped after (60 of 71 characters shown) — PASS**, so the zero is not a silent probe.

**SC-3 — a row that fits costs nothing: PASS at 1280 × 800.** Every ordinary `Dockside — Ancillary works N` row is 61 px (60 for the
last) before and after, and `Dockside — Quay Wall Reconstruction` in "Jump back in" is 40 px before and after.

**SC-4 — rows grow by whole lines:** heights are 40 / 60 / 80 / 100 (base 40) or 61 / 81 / 101 / 125 (base 61) — steps of 20 px, no
vertical gap. 125 is a four-line subject row.

Rows whose subject went to more than one line (of 17), and the box sizes:

| Cell        | Rows >1 line before → after | Median row height before → after                        | Bottom boxes (px) before → after                    |
| ----------- | --------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| 1024 × 600  | 0 → 16                      | 61 → 81                                                 | 609 → 829 / 853 (one column; boxes size to content) |
| 1280 × 800  | 0 → 6                       | 61 → 61                                                 | 609 → 669                                           |
| 1465 × 900  | 0 → 3                       | 61 → 61                                                 | 609 → 629 / 649                                     |
| 1477 × 900  | 0 → 17                      | 61 → 81                                                 | 234 → 234 (fixed, scrolls)                          |
| 1646 × 1000 | 0 → 16                      | 61 → 81                                                 | 334 → 334 (fixed, scrolls)                          |
| 1912 × 948  | 0 → 11                      | 61 → 81 (Recently changed) / 61 (Where the work stands) | 282 → 282 (fixed, scrolls)                          |
| 1912 × 1114 | 0 → 11                      | 61 → 81 / 61                                            | 448 → 448                                           |

At 1912 × 948 **all 8 rows in "Recently changed" go to two lines or more**, including the five ordinary ones, because
`Ada Lovelace · just now` is `shrink-0` beside a name + badge + 284 px context that no longer shares the line; in "Where the work
stands" only the three long-name rows do (the ordinary ones fit beside `No finish date yet`). One column at 1280 and 1465 pays for the three
long-name rows only (3 and 2/1).

**SC-5 — whole rows per capped box:**

| Cell        | Bottom boxes before | after       | after, with the 200 + 200 + 200 plan |
| ----------- | ------------------- | ----------- | ------------------------------------ |
| 1646 × 1000 | 3 and 3 whole       | **2 and 2** | **0 and 0**                          |
| 1912 × 948  | 3 and 3             | **1 and 1** | **0 and 0**                          |
| 1912 × 1114 | 5 and 5             | 3 and 3     | not taken                            |

`<main>` does not scroll at 1646 × 1000 (949/949) or 1912 × 948 (897/897), before or after; it is the box bodies that scroll.
**SC-5's "≥ 4 whole rows at 1646 × 1000" is missed by the prototype (2), and it was already missed by today's tree (3)** — see §3 of
`m0-measurement.md`: the premise the spec grades against is stale. The 200-character plan alone is a **253–297 px row** (10–12 lines) in a 282–334 px
box: **less than one whole row**, which is the case SC-5's own last paragraph sets the "box scrolls and the reading is recorded" rule for.
Neither the spec's remedy (1) (raise the floor) nor (2) (rebalance the rows) was applied or measured here.

## What the photographs show (and CQ-1 is the product owner's)

- **The name half of the report is fixed completely:** `NetPoint reference: power-plant programme` and `EDF - Hynamics Proposal` are whole,
  with `Draft`, and the project and client are whole beneath them, in the 1912 × 948 and 1646 × 1000 photographs.
- **The cost is height, as the spec's CQ-1 said, and bigger than "about 1½ rows"**: at 1912 × 948 the visible part of each bottom box goes from three whole rows
  (the three long-name rows, clipped) to one. In the whole-page photograph the ordinary `Dockside — Ancillary works N` rows in "Recently changed" are each
  81 px (two lines, with the project and client under the name) against 61 px today.
- **The badge-alone case occurs** in the fixture with no help from the 200-character plan: at 1646 × 1000, "Where the work stands",
  `Berth 4 Deepening — Dredging and Revetment Works, Stage 2B` fits its column to the last character and **`Draft` lands alone on the next line**
  (`after-1646x1000.png`). In "Recently changed" the same plan wraps `Stage 2B Draft` together. The spec accepted this (§1 defaults).
- **The moved finish date:** in "Where the work stands", `No finish date yet` / `Finishes …` now sits on the name's first line instead of the middle of
  the row; visible in `after-1912x948.png` against `before-1912x948.png`. Heights are not changed by it (SC-3 above).
- **Not fixed by this design:** `min name col` at 320 × 800 is still **6** characters on the prototype (the trailing block is untouched, as decision rule (b) in
  `m0-measurement.md` §4 says it must be amended in the spec). At 320 the prototype's median row is 277 px.

## Cleanliness

The prototype was discarded with `git checkout -- apps/web/src/...` after the last photograph. `git status` after the discard shows only the inert hook, the three scripts and
this directory (see the commit).
