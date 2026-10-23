# Swimlanes M0-T4 — what a partitioned Tidy and Re-layout cost, measured in node

- **Task:** M0-T4 of [`implementation-plan.md`](./implementation-plan.md); the search it measures is
  [`feature-spec.md`](./feature-spec.md) §4.5.
- **Instrument:** `apps/web/scripts/measure-swimlane-arrange.mjs` (the search is
  `netpoint-swimlane-run.ts`), run at `72aad38` plus this change, node v22.22.0, 2026-10-23, in the
  container. `CASES=power,torture,scale300,scale500 node scripts/measure-swimlane-arrange.mjs` from
  `apps/web`, after `pnpm --filter "./packages/*" build`. It needs no API and no database.

## Verdict

**The limits in spec §4.5 stand: `OPTIMISE_MAX_ACTIVITIES = 300` and
`RELAYOUT_MULTISTART_MAX_ACTIVITIES = 150`.** Partitioning did not make a search dearer on any plan
measured. Counting evaluations, which the machine cannot move, it needed fewer on Re-layout on every plan
and on Tidy on three of four (the torture plan's Tidy needed 356 against 186). In wall time, in the same
sitting, Re-layout took 0.55x (power plant), 0.7x (torture), 0.5x (scale-300) and 0.85x (scale-500) of the
unpartitioned run; Tidy took 0.9x, 1.5x, 0.6x and 0.4x. The one slower cell is the torture plan's Tidy,
3.3 s against 2.2 s, from 356 evaluations against 186 and far inside the 10 s the limit
is set by. Nothing here asks the owner to move either number.

**What does change is height, and it is not a limit.** Swimlanes cannot share a row, so the display has more
of them: Re-layout 14 to 16 rows on the power plant and 35 to 54 on the torture plan, Tidy 24 to 50 on the
torture plan. The objective ranks rows last, so the search does not trade crossings for them. That is a fact
about the feature and the owner should see it before M2, but no cost bar is attached to it.

**The alternative hint (display lanes) does not earn its place.** See the last section.

## Method

1. **Unpartitioned runs are the product's own functions, unchanged**: `optimiseLayout`,
   `relayoutSeeds`, `relayoutStartIds` and `pickBestStart`, with Tidy seeded from the diagram as it
   stands and Re-layout's budget the taller of the diagram and the start (`relayoutBudget`'s rule).
2. **The partitioned search is a copy of `optimiseLayout`'s four phases with §4.5 added**, in the harness,
   so no product code changed and nothing reaches the UI (that is M2-T6). Swaps stay inside one swimlane;
   alignment candidates come from the bar's own swimlane; "one new row" is at the bottom of the bar's own
   swimlane, allowed while the whole display is under the budget; compaction keeps one row per swimlane;
   repair is `nearestFreeRow` with the M0-T2 `partition`. Lanes in the search are local to a swimlane and
   the objective is scored on display lanes (swimlanes stacked in order, each as tall as its highest lane,
   at least one row), so a link between swimlanes counts.
3. **A copy can drift, so the harness refuses to report unless it agrees with the product.** With every bar
   in one swimlane it must return `optimiseLayout`'s lanes exactly, and its evaluation count. It did, on
   the plans inside the Tidy limit (power plant `7e613358`, 703 evaluations both; torture `1b078dd4`, 186
   both). This check first failed on the torture plan, because the product allows a move to an existing row
   only below the budget and the copy did not; that is fixed and is why the budget filter reads as it does.
   Re-layout's starts 1 to 3 are the product's own builders run one swimlane at a time; start 0 is
   `packLanes` with the partition.
4. **Plans.** All three come from the committed `relayout-corpus.json` or the ADR-0066 scale generator,
   so nothing needs an API. The splits are the harness's, because the corpus has no WBS parent or system:
   - **power plant** (58 drawn): by system, the activity-code prefix (EI, P, B, S, C, CW, CH, AQ, SW, CO),
     with the milestones and the one-off activities in "Common" - 11 swimlanes;
   - **torture** (147 drawn): the thousands digit of the code (A1..A9) and the WBS summaries apart - 10;
   - **scale-300 and scale-500**: the generator's top WBS level, the phase - 5 and 8. They draw **325 and
     540** activities (summaries count), so **both are past the Tidy limit**; they are measured to show the
     cost's shape, as the earlier `scale` figures in `optimise-layout.ts` were, not as offered runs.
5. **Seeds.** The corpus and the generator lay every activity on rows that overlap (the torture hand layout
   is one row), so Tidy there starts with a large repair, and a "crossings seed to final" that rises
   (scale-300: 733 to 1,849 unpartitioned) is the repair, not the search. The partitioned Tidy seed is the
   same diagram read per swimlane (its distinct rows, in order).
6. **Re-layout time is the sum of its starts run one after another on one thread.** The product runs them
   in a worker pool, so its wait is shorter; the comparison between rows is like for like.
7. **Determinism.** Every row ran twice in one process and its lanes were compared; the whole run was then
   repeated as a second process and the digests compared (below).

## The machine (read this before any absolute time)

The container is shared: the load average was **6.7, 8.3, 7.6** during the first run and other agents were
building. Absolute times are inflated against a quiet machine (the same `optimiseLayout` on scale-300
read 15.6 s in `optimise-layout.ts:99-100` and 32-34 s here; Re-layout at 147 read about 28 s in
`relayout-quality/m2-verdict.md` and 45-51 s here). **They bound the algorithm, not the product owner's
hardware (#75), and cannot be set against ADR-0203's wait as numbers.** The ratios inside one sitting, and
the evaluation counts, are what this reading rests on. Text width is the harness's 6 px a character
(`HARNESS_TEXT`), as `netpoint-optimise-run.ts` uses, not the browser's width table.

## Readings

Final objective after the search. `none` is no swimlanes (the product), `lanes` is partitioned. `RL` is
Re-layout from all starts the limit allows; `R0` is Re-layout from start 0 alone. `same` and `display`
are the two pack hints. "Rows" is the display height. "Capped" means a search stopped on the evaluation cap.

| Plan             | Variant          | Starts | Evaluations | Time (ms), two runs | Crossings | Contacts | Travel | Rows | Digest     |
| ---------------- | ---------------- | -----: | ----------: | ------------------- | --------: | -------: | -----: | ---: | ---------- |
| power plant (58) | Tidy none        |      1 |         703 | 886 / 901           |         1 |        0 |     73 |   13 | `7e613358` |
| power plant (58) | RL none          |      4 |        3124 | 5159 / 5218         |         1 |        2 |    132 |   14 | `f14cb59d` |
| power plant (58) | Tidy lanes       |      1 |         359 | 854 / 784           |         3 |        0 |    156 |   17 | `4ac34612` |
| power plant (58) | RL same          |      4 |        1243 | 2898 / 2846         |         2 |        0 |    153 |   16 | `311e28bd` |
| power plant (58) | RL display       |      4 |        1151 | 2526 / 2370         |         2 |        0 |    153 |   16 | `311e28bd` |
| power plant (58) | R0 same          |      1 |         276 | 539 / 529           |         3 |        0 |    146 |   15 | `574a0bde` |
| power plant (58) | R0 display       |      1 |         184 | 398 / 347           |         3 |        0 |    150 |   15 | `cc1827a8` |
| torture (147)    | Tidy none        |      1 |         186 | 2216 / 2236         |       282 |       38 |    866 |   24 | `1b078dd4` |
| torture (147)    | RL none (capped) |      4 |        4526 | 50872 / 45266       |       126 |        2 |    829 |   35 | `853c3fbb` |
| torture (147)    | Tidy lanes       |      1 |         356 | 3303 / 3394         |       146 |       15 |    876 |   50 | `cbf199ae` |
| torture (147)    | RL same          |      4 |        3495 | 32941 / 32094       |       112 |        8 |    927 |   54 | `25186885` |
| torture (147)    | RL display       |      4 |        3824 | 33144 / 34267       |       112 |        8 |    927 |   54 | `25186885` |
| torture (147)    | R0 same          |      1 |         462 | 4191 / 4070         |       121 |        8 |    855 |   50 | `fc6ac781` |
| torture (147)    | R0 display       |      1 |         791 | 7282 / 7290         |       127 |        7 |    813 |   50 | `7b5561b7` |
| scale-300 (325)  | Tidy none        |      1 |         914 | 34037 / 31717       |      1849 |       72 |   1239 |   40 | `6b8a8dc8` |
| scale-300 (325)  | RL none (capped) |      1 |        2000 | 48323 / 44359       |       848 |       11 |    655 |   40 | `1f26b746` |
| scale-300 (325)  | Tidy lanes       |      1 |         866 | 19976 / 18189       |       545 |       11 |    305 |   50 | `775933ea` |
| scale-300 (325)  | RL same          |      1 |        1273 | 25444 / 20451       |       408 |       10 |    315 |   50 | `7a511310` |
| scale-300 (325)  | RL display       |      1 |        1273 | 18777 / 18423       |       408 |       10 |    315 |   50 | `7a511310` |
| scale-300 (325)  | R0 same          |      1 |        1273 | 17347 / 17632       |       408 |       10 |    315 |   50 | `7a511310` |
| scale-300 (325)  | R0 display       |      1 |        1273 | 16264 / 19230       |       408 |       10 |    315 |   50 | `7a511310` |
| scale-500 (540)  | Tidy none        |      1 |        1257 | 50404 / 46033       |      2315 |       65 |   1331 |   47 | `9423594d` |
| scale-500 (540)  | RL none (capped) |      1 |        2000 | 50735 / 51105       |      1048 |       22 |    652 |   42 | `ca018a14` |
| scale-500 (540)  | Tidy lanes       |      1 |         873 | 20557 / 20434       |      1074 |       14 |    399 |   76 | `b4af3e1a` |
| scale-500 (540)  | RL same          |      1 |        1801 | 41674 / 44374       |       890 |       13 |    435 |   76 | `a32ddedb` |
| scale-500 (540)  | RL display       |      1 |        1801 | 44581 / 41473       |       890 |       13 |    435 |   76 | `a32ddedb` |
| scale-500 (540)  | R0 same          |      1 |        1801 | 40383 / 42684       |       890 |       13 |    435 |   76 | `a32ddedb` |
| scale-500 (540)  | R0 display       |      1 |        1801 | 41981 / 39010       |       890 |       13 |    435 |   76 | `a32ddedb` |

Overlaps are 0 in every Re-layout row; Tidy leaves a few (torture 4 none and 1 lanes, scale-300 4 and 0, scale-500 1 and 0), as the
objective counts them. The full objective for every row is in the harness's output.

## The pack hint

`same` (the §4.5 default) reads only predecessors in the bar's own swimlane. `display` reads
predecessors across swimlanes by their display lane (swimlane heights from the `same` pack, so the heights
cannot move). Where the pack is searched afterwards (the RL rows) the two end **identically on all four
plans**. Alone, from start 0 (`R0`), they differ only on the power plant and the torture plan:

| Plan        | Hint    | Crossings | Travel | Evaluations |
| ----------- | ------- | --------: | -----: | ----------: |
| power plant | same    |         3 |    146 |         276 |
| power plant | display |         3 |    150 |         184 |
| torture     | same    |       121 |    855 |         462 |
| torture     | display |       127 |    813 |         791 |

Crossings rank above travel in the product's order, so `display` is no better where it is different and
costs 1.7x the evaluations on the torture plan. **Keep the default.** The pack seeds themselves differ a
little (power plant 8 against 6 crossings before the search, torture 198 against 197), which the search
removes.

## Pictures

The existing harness has no node renderer: its pictures (`docs/specs/relayout-quality/pictures/`) are
Chromium screenshots of the painter, which needs a browser and a dev server. Rather than invent one, these
are a small **schematic** drawn by `renderPictures` (bars on their display rows, swimlanes as bands, each
link a straight line from the end of its predecessor to the start of its successor); they show where bars
sit and how far links travel, not how the painter routes them.

- [`m0/reference-netpoint-power-plant-relayout-before.png`](./m0/reference-netpoint-power-plant-relayout-before.png)
  (and `.svg`): the current pack, 11 rows, before its search - **not** the searched unpartitioned result,
  whose lanes the harness does not keep.
- [`m0/reference-netpoint-power-plant-relayout-after.png`](./m0/reference-netpoint-power-plant-relayout-after.png)
  (and `.svg`): partitioned Re-layout by system, 16 rows.

## Determinism

Two runs inside one process returned identical lanes on all 28 rows (`repeatable: true`), and a second
process, started after the first finished, returned the same evaluation count, lane digest and final
objective on all 28 rows (compared line by line; the digests are in the table). Times differ between the
two, as expected on a loaded machine.

## What this does not establish

- The owner's hardware (#75), and the pool's real wait.
- Quality on a plan that was really split by the planner: the splits are the harness's.
- Browser text widths; the schematic's routing; the cost of the surrounding UI (the worker protocol and
  the dialog are M2-T6).
