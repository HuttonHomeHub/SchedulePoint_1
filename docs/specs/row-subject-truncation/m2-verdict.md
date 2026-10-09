# M2 — the verdict: SC-1 to SC-9 on the shipped tree

- **Taken:** 2026-10-09, Chromium (`/opt/pw-browsers/chromium-1194`), Explorer at its default, the M0 fixture
  (`landing-fixture.mjs` `seedLongNames`), `row-subject-probe.mjs` through `measure-overview.mjs`
  (`SP_ROW_SUBJECT=1`).
- **Build:** `web 0.183.1 · api 0.88.1`, read off the shell footer by the harness. The tree is M1 as committed
  (`b65b505`, tests `07686b2`); the web stack was an isolated dev server on port 5273 over an API on 3100,
  because ports 3000 and 5173 were held by servers started earlier.
- **Raw:** [`m2-after-run.md`](./m2-after-run.md) (no 200-character plan; SC-2 control 120 × `W` at 1280),
  [`m2-after-run-control-320.md`](./m2-after-run-control-320.md) (SC-2 control 32 × `W` at 320),
  [`m2-after-run-maxima.md`](./m2-after-run-maxima.md) (with the 200 + 200 + 200 plan),
  [`m2-before-reading-needs-attention.md`](./m2-before-reading-needs-attention.md) (the unchanged
  `list-row.tsx`, for the "Needs your attention" comparison). Baselines: [`m0-measurement.md`](./m0-measurement.md)
  (today) and [`m0-prototype.md`](./m0-prototype.md) (the approved prototype).
- **Harness changes made for this reading** (`apps/web/scripts/measure-overview.mjs`, no product code): trailing
  columns (clipped, beneath, off the first line), an overlap column for SC-8 (two glyph rects of one subject, or a
  row and the next, sharing more than 1 px both ways), "Needs your attention" row heights, `SP_CONTROL_N` (the
  SC-2 token length), and a 320 × 3900 photograph with ADR-0179's notice dismissed.
- **Photographs:** [`photos/after-m2-*.png`](./photos/) for 1024 × 600, 1280 × 800, 1465 × 900, 1912 × 948 (and
  `-tall`), 1646 × 1000 (and `-tall`), 320 × 800 (the notice, as M0's was) and `after-m2-320x800-dismissed.png`
  (the rows themselves).

## Verdict

**All nine criteria pass.** Two need a qualification, stated in place: SC-2's 1280 control as written was silent
on the shipped tree and was widened (a finding about the control, not the product), and SC-4's whole-line steps
hold for text lines but a line holding only the Draft badge is taller. Nothing failed and nothing is applied
beyond M1.

| SC   | Verdict | Number                                                                                                                      |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| SC-1 | PASS    | 0 names, 0 contexts, 0 trailing facts clipped, 0 ellipses, in all 13 cells, with and without the 200-character plan         |
| SC-2 | PASS    | before: 11 names clipped at 1912; after: planted token reported clipped at 320 (60 of 71) and at 1280 (115 of 159)          |
| SC-3 | PASS    | rows that fit are unchanged; trailing shares the first line in 16 of 16 at every 100 % cell; Needs-attention rows identical |
| SC-4 | PASS\*  | heights are base + k × 20 px; \*a lone-badge line is 24 px, as in the approved prototype                                    |
| SC-5 | PASS    | 2 and 2 / 1 and 1 / 3 and 3 whole rows; `<main>` 949/949 and 897/897; boxes 334 / 282 / 448 px                              |
| SC-6 | PASS    | 320 and 200 %: document `overflow-x` 0, no `fill` body scrolls sideways, SC-1 holds                                         |
| SC-7 | PASS    | `e2e-overview` 9 of 9 and `e2e-staff` 6 of 6 (see below)                                                                    |
| SC-8 | PASS    | three text-spacing cells: SC-1 holds, `overflow-x` 0, 0 overlaps                                                            |
| SC-9 | PASS    | at 320: primary at least 23.1 characters (floor 12; today 6 and 10), trailing beneath in 16 of 16; 200 %: 25.2 and 58.1     |

## SC-1 and SC-2

Names clipped (of 17), unchanged tree against shipped tree:

| Cell        | Before | After | Cell                | Before | After |
| ----------- | -----: | ----: | ------------------- | -----: | ----: |
| 1024 × 600  |     16 |     0 | 320 × 800           |     17 |     0 |
| 1280 × 800  |      6 |     0 | 1280 × 800, 200 %   |     17 |     0 |
| 1465 × 900  |      3 |     0 | 1912 × 948, 200 %   |      6 |     0 |
| 1477 × 900  |     17 |     0 | 1280 × 800, spacing |     11 |     0 |
| 1646 × 1000 |     16 |     0 | 1477 × 900, spacing |     17 |     0 |
| 1912 × 948  |     11 |     0 | 1912 × 948, spacing |     17 |     0 |
| 1912 × 1114 |     11 |     0 |                     |        |       |

Contexts clipped match the names in every cell (0 after). The shipped tree shows the median name whole at 239 px /
29 characters (it was 198-213 px and 22-24 characters at 100 %), and `Dockside — Ancillary works 6` keeps its `6`.

SC-2, the instrument. Before (taken again here on the unchanged `list-row.tsx`): 11 names clipped at 1912 × 948, and a
32 × `W` token at 1280 reported (66 of 71 characters shown). After, on the shipped tree: the same 32 × `W` token at
**320 × 800** is reported clipped (60 of 71 shown, `m2-after-run-control-320.md`). **At 1280 × 800 the 32 × `W` control
is silent on the shipped tree** (71 of 71 shown): the one-column track there is 955 px and the ~400 px token simply fits
on a line of its own, because a subject that wraps only overflows when a nowrap run is wider than the track. That is the
M1 builder's note confirmed. Widened to 120 × `W` (~1500 px) it is reported clipped (115 of 159 shown). So the spec's
"at 1280 × 800 (today: 66 of 71)" clause holds only with the token sized to the track; the 320 control, which the journey
runs, holds as written.

## SC-3 and SC-4

At 1280 × 800 the 17 subject rows are 40 (×1), 60 (×2) and 61 (×8) px as before, and **6 rows are 81 px**: exactly the six
names that were clipped there. Every row whose subject fits is the same height as today. "Needs your attention" row
heights (no subject, no trailing): **61, 61, 61, 61, 61, 60 at every 100 % cell from 1024 to 1912, before and after**;
at 320 85…80, at 200 % 121…120, under spacing 90…89, identical on both trees.

The trailing block shares the primary's first line in 16 of 16 rows at 1024, 1280, 1465, 1477, 1646, 1912 × 948,
1912 × 1114 and both 200 % cells (0 beneath), and is beneath in 16 of 16 only at 320 × 800. The staff status summary
(the one consumer the landing harness cannot see) is held by the `e2e-staff` step below.

SC-4: row heights at 1280 × 800 are 40/60/61/81, at 1646 × 1000 40/80/81/101/125, at 1912 × 948 40/60/61/80/81/101.
Steps are 20 px with no vertical gap; the 125 (and 249, 289, 337 at 200 %, 7-8 px past a 40 px step) are rows where the
badge starts a line alone, a line taller than a text line. 125 is the same figure the approved prototype recorded.
That the extra height is the lone badge line is consistent with the numbers and was not isolated.

## SC-5

Whole rows in view per bottom box ("Where the work stands" and "Recently changed"), 8 rows each:

| Cell                   | Today (M0) | Prototype |                                              **Shipped** | Acceptance         |
| ---------------------- | ---------: | --------: | -------------------------------------------------------: | ------------------ |
| 1646 × 1000            |    3 and 3 |   2 and 2 |                                              **2 and 2** | ≥ 2 and ≥ 2: PASS  |
| 1912 × 948             |    3 and 3 |   1 and 1 |                                              **1 and 1** | ≥ 1 and ≥ 1: PASS  |
| 1912 × 1114            |    5 and 5 |   3 and 3 |                                              **3 and 3** | ≥ 3 and ≥ 3: PASS  |
| + 200 + 200 + 200 plan |          — |   0 and 0 | 1646: 0 and 0; 1912 × 948: 0 and 0; 1912 × 1114: 1 and 1 | recorded, accepted |

Same as the prototype the owner approved, at all three rows. `<main>` does not scroll at 1646 × 1000 (949/949) or
1912 × 948 (897/897); box heights are 334 / 282 / 448 px, unchanged. With the pathological plan the box bodies scroll
with their stated count (body 947 in 236 px at 1646, 823 in 184 at 1912 × 948). The remedies (raise `min-h-55`,
rebalance the rows) were **not** applied; they wait for the product owner.

Median row height per cell, before → after: 1024 61 → 81; 1280 61 → 61; 1465 61 → 61; 1477 61 → 81; 1646 61 → 81;
1912 × 948 and × 1114 61 → 81; 320 81 → 145; 200 % at 1280 121 → 248, at 1912 121 → 121; spacing 122 → 143 / 187 / 143.
Rows over one line (of 17): 16, 6, 3, 17, 16, 11, 11 at the seven 100 % cells; 17 at 320.

## SC-6 and SC-8

320 × 800 and the two 200 % cells: document `overflow-x` 0, no `fill` body scrolls horizontally (no `SCROLLS-X`
in either run), SC-1 holds. 200 % is the labelled proxy (`html { font-size: 200% }`), as in M0.

Text spacing at 1280, 1477 and 1912: SC-1 holds, `overflow-x` 0, **0 overlaps**. The overlap column is not
independently planted-red, but it fires (20-78 per cell) on the unchanged tree, where Chrome reports a second rect for
a truncated run, so it can report non-zero. One observation, not a criterion: under that injection the trailing block is
not beneath its primary, and its box centre is off the first line (16 of 16), because the injected `p { margin-bottom:
2em }` lengthens the trailing `<p>` (`data-overview-finish`).

## SC-9 and the narrow drop

At 320 × 800 the narrowest primary block is **23.1 characters** (`min name col 23`; today 6 in "Recently changed", 10 in
"Where the work stands"; floor 12), and the trailing text is beneath the primary in **16 of 16** rows, whole.
At 200 %: 25.2 at 1280 and 58.1 at 1912 (today 25 and 57). **The drop fired only at 320 × 800**, in none of the other
12 cells. [`after-m2-320x800-dismissed.png`](./photos/after-m2-320x800-dismissed.png) shows the rows beneath the
notice: the name wraps to two or three lines, the badge under it, `Ada Lovelace · just now` last.

## SC-7 — the journeys

Run against the isolated stack (API 3100, vite 5273, `PLAYWRIGHT_SKIP_WEBSERVER=1`, each suite's own API environment):
`pnpm test:e2e:overview` **9 passed**, including the step that runs the same probe at 1477 × 900 and 1912 × 948, the
320 control, reading order and SC-9; `pnpm test:e2e:staff` **6 passed**, including the status-summary verdict-badge step.
(The staff suite failed twice on `Working: none failed in the last 24 hours`: three `FAILED` `ESOCKET`
`email_verification` rows from 16:21 in the shared e2e database, written before this run by an API with no mail relay.
Not related to this change. Those three rows were deleted from the local `app_test` database and the suite then passed 6 of 6.)

## What the photographs show

- **1912 × 948 whole page:** every name, Draft badge, project and client whole; the three long-name rows take an extra line or two for their
  project and client, the ordinary ones keep project and client on the name's line, and `Ada Lovelace · just now` sits
  on the name's line. The ragged heights are visible and the boxes are half empty below the rows at 1900 px, as expected of a capped box.
- **The finish date** has moved to the name's first line in "Where the work stands" (accepted with CQ-1).
- **Badge alone on a line** is not seen in this fixture's 1912 photograph; it was seen at 1646 × 1000 in the prototype and
  is accepted.
- **320 × 800:** the rows shown are fully legible with the trailing fact beneath.
