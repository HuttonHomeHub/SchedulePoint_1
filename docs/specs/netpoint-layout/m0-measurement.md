# NetPoint layout — M0 measurement record

**Status: M0-T2 recorded 2026-09-23.** T3 (cost), T4 (prototype + FC-N10 frontier) and T5 (glyph and
text baselines) are appended below as they are taken. The bars every figure here is judged against
were committed **alone, before this file existed**, in `conditions.md` (commit subject
`docs(docs): commit the NetPoint layout falsification conditions alone`).

## M0-T2 — the baseline vector

**Harness:** `apps/web/scripts/measure-netpoint-baseline.mjs` over `scripts/crossing-probe.ts`: the
**real painter**, bundled with the pitch substituted in the bundle (the `measure-row-pitch.mjs`
mechanism, unchanged), read through the recorder. 144 readings: 6 layouts × 2 pitches × 3 zooms × 4
pans.

**Controls, all of which held:**

- the substitution matched exactly one `var LANE_HEIGHT = N;` and `BAR_PAD` is live over it, and each
  reading reports the pitch the painter used (`laneHeight`), which matched the requested pitch in all
  144;
- every link was drawn in every reading (`visibleLinks === dependencies`). A reading over part of a
  plan is refused rather than printed;
- `chain-3-placed` shows **1** overlap under the pre-fix pack and **0** under the fixed one, checked by
  the fixture itself and again on the printed numbers;
- **pan invariance held**: every figure is identical at pans 0, 32, 200 and 500. It is now
  established rather than assumed, so later milestones read one pan.

**It agrees with three earlier instruments to the last digit**, and that is the reason to trust the
rest. Unit 300 at 4 px/day reads `x/link` **1.856** at pitch 52 and **1.915** at pitch 60, and
`occl/link` **0.261** at both. That matches `logic-legibility/m3-the-row.md:363-365` and
`m4-travel-and-assignment.md:19`. Travel reads 502 over 188 links, which is **2.670** per link, again
equal to `m4-travel-and-assignment.md:19`. So this harness reproduces what those epics measured. Any
difference a later milestone reports is the layout's, not the instrument's.

### The table (pan 32; every other pan is identical)

| pitch | plan           | layout  |  px/d | rows | overlaps |   occl | occl/lk |    x/link | sameRow | travel | stack/y |
| ----: | -------------- | ------- | ----: | ---: | -------: | -----: | ------: | --------: | ------: | -----: | ------: |
|    52 | chain-3-placed | pre-fix |  1–12 |    1 |    **1** |      1 |   0.500 |     0.000 |       2 |      0 |       0 |
|    52 | chain-3-placed | packed  |  1–12 |    2 |    **0** |      0 |   0.000 |     0.000 |       1 |      1 |       0 |
|    52 | small-17       | packed  |     1 |    4 |        0 |      8 |   0.276 |     0.621 |      16 |     23 |       1 |
|    52 | small-17       | packed  | 4, 12 |    4 |        0 |      8 |   0.276 |     0.103 |      16 |     23 |       1 |
|    52 | Unit 300       | packed  |     1 |   21 |        0 |     77 |   0.410 |     2.144 |      68 |    502 |       2 |
|    52 | Unit 300       | packed  |     4 |   21 |        0 |     49 |   0.261 |     1.856 |      68 |    502 |       2 |
|    52 | Unit 300       | packed  |    12 |   21 |        0 |     45 |   0.239 |     1.840 |      68 |    502 |       2 |
|    52 | scale-2000     | packed  |     1 |   41 |        0 |   1506 |   0.471 |     2.217 |    2914 |   2069 |       3 |
|    52 | scale-2000     | packed  |     4 |   41 |        0 |   1273 |   0.398 |     2.242 |    2914 |   2069 |       4 |
|    52 | scale-2000     | packed  |    12 |   41 |        0 |   1202 |   0.376 |     2.236 |    2914 |   2069 |       4 |
|    60 | chain-3-placed | pre-fix |  1–12 |    1 |    **1** |      1 |   0.500 |     0.000 |       2 |      0 |       0 |
|    60 | chain-3-placed | packed  |  1–12 |    2 |    **0** |      0 |   0.000 |     0.000 |       1 |      1 |       0 |
|    60 | small-17       | packed  |     1 |    4 |        0 |      8 |   0.276 |     0.621 |      16 |     23 |       1 |
|    60 | small-17       | packed  | 4, 12 |    4 |        0 |      8 |   0.276 |     0.103 |      16 |     23 |       1 |
|    60 | **Unit 300**   | packed  |     1 |   21 |        0 |     77 |   0.410 |     2.191 |      68 |    502 |       1 |
|    60 | **Unit 300**   | packed  | **4** |   21 |        0 | **49** |   0.261 | **1.915** |      68 |    502 |       1 |
|    60 | **Unit 300**   | packed  |    12 |   21 |        0 |     45 |   0.239 |     1.899 |      68 |    502 |       1 |
|    60 | scale-2000     | packed  |     1 |   41 |        0 |   1506 |   0.471 |     2.273 |    2914 |   2069 |       2 |
|    60 | scale-2000     | packed  |     4 |   41 |        0 |   1273 |   0.398 |     2.276 |    2914 |   2069 |       3 |
|    60 | scale-2000     | packed  |    12 |   41 |        0 |   1202 |   0.376 |     2.275 |    2914 |   2069 |       3 |

Columns: `overlaps` counts same-row **drawn-span** overlaps. `occl` counts links with a leg behind a
bar they do not connect to. `sameRow` counts links whose two ends share a lane in the layout.
`travel` is Σ |Δlane| over all links. `stack/y` is the worst number of gutter legs overlapping in x
on one y.

### What the conditions now read against

- **FC-N1: MET.** `chain-3-placed` after Arrange shows **0** overlaps. The red run against the pre-fix
  code is the `e2e-arrange` case in PR #663, which was verified red on that code before the fix. This
  table repeats the same result through the painter.
- **FC-N4's denominator.** Unit 300 at pitch 60 and 4 px/day, `packLanes`: `occluded` **49**,
  `x/link` **1.915**. Re-layout passes if it reaches **≤ 29 occluded** (60 % of 49, rounded down)
  with `x/link` **≤ 2.106** (+10 %). A cut of less than 15 %, i.e. **42 or more**, withdraws
  Re-layout.
- **FC-N9: B_X(60) = 1.915.** ADR-0151 records pitch 60 as +13.2 % against FC-L4's 1.691
  (`0151:139`), and 1.691 × 1.132 = **1.914**. That result came from a different harness run on a
  different day, and it agrees with this one to rounding. FC-L4's ceiling is recorded as **knowingly
  breached** by the pitch-60 decision, as the condition requires, and is not moved.
- **Going from pitch 52 to pitch 60 costs no occlusion and removes one stacked leg** at every zoom on
  both larger plans (Unit 300 2 → 1; scale-2000 4 → 3). The price is +3.2 % `x/link` on Unit 300.
  This is ADR-0151's result at 60, reproduced.

### Things this reading says that nobody asked

- **Zoom changes occlusion on the larger plans and not on the small one.** Unit 300 goes 77 → 49 →
  45 from 1 to 12 px/day. At 1 px/day bars are shorter than the corridors, so more legs run behind
  unrelated bars. `small-17` is flat at 8. FC-N4 is judged at 4 px/day as written. The 1 px/day
  figure is the worst case, and M4 must report it, not just the judged zoom.
- **`sameRow` is high on `scale-2000` (2,914 of ~3,200 links)** because its chains are long bands
  that pack into one row each. That is the storyline objective already largely met by the seed. The
  optimiser's room there is in occlusion (1,273) and not in chains.

### Recorded rather than used: the scale generator's own lanes

`scaleScene` deals bands into 50 lanes and runs a phase's bands **concurrently**
(`src/features/perf-probe/scenes/scale-scene.ts:21-30`). That is a paint-cost layout by
construction, and its docblock says reading a schedule from it "would be reading a fiction". On drawn
spans it has **2,532** same-row overlaps. That is not a finding about the product. It is why the
yardstick for `scale-2000` is `packedOnDrawn` (what Arrange would produce on that plan: 41 rows, 0
overlaps) and never the generator. The generator's figures are in the harness output so the choice
can be seen, and every condition's `scale-2000` limb reads the packed row.

## M0-T3 — what one evaluation costs (FC-N2)

**Harness:** `apps/web/scripts/measure-netpoint-cost.mjs` over `scripts/netpoint-evaluate.ts`, at
pitch 60 and 4 px/day, node v22.22.2. It uses the painter's routing order: `laneIntervalIndex` →
`lagAnchorPoints` → `routeOrthogonal` → `chooseCorridorsByCrossing` → `bundleCorridors` →
`packGutterChannels`. It then counts foreign occlusion, crossings, drawn-span overlaps, same-row
links, travel and rows. There are nine runs per size. **At n = 9, nearest-rank p95 is the slowest
run**, so the p95 column below is a maximum and that is the conservative reading.

**Controls, all of which held:**

- **Agreement:** the evaluator's line set digests byte-identically to the painter's recorded links on
  all three plans. The run refuses to print otherwise. Unit 300's objective (49 occluded, 68
  same-row, travel 502, 21 rows) equals M0-T2's reading, which came from a different code path.
- **Equivalence (FC-N2c):** 1,000 seeded moves on Unit 300. Each move is scored incrementally on a
  live model and in full from scratch, and the objective **and** the line digest are compared.
  **0 disagreements.**
- **The equivalence check can fail:** the same 1,000 moves, with the destination lane's re-route
  skipped (the plan's named mutation), disagree **119 times**, the first at move 0.

| plan       |  bars | links | full p50 | **full p95** | index | route | post | occl | **cross** | ovlp | incr p50 | incr p95 |   re-routed |
| ---------- | ----: | ----: | -------: | -----------: | ----: | ----: | ---: | ---: | --------: | ---: | -------: | -------: | ----------: |
| Unit 300   |   144 |   188 |      5.0 |         15.9 |   0.6 |   1.4 |  1.1 |  0.7 |       0.9 |  0.3 |      3.5 |      7.4 |    57 / 188 |
| scale-500  |   540 |   800 |     24.1 |         26.1 |   2.0 |   4.0 |  1.3 |  3.9 |       9.9 |  2.8 |     20.1 |     26.6 |    99 / 800 |
| scale-2000 | 2,160 | 3,200 |    245.7 |    **259.1** |   7.7 |  16.6 |  6.4 | 18.9 | **144.5** | 49.3 |    214.6 |    240.9 | 292 / 3,200 |

All times are in ms; the stage columns are medians. At scale-2000 the six stages sum to 243.4 ms of a
245.7 ms median, so the cost is fully attributed.

### Verdict

- **FC-N2(a), the offer limb: FAIL, by 32×** (259 ms against ≤ 8 ms). The committed consequence
  applies: **the offer states overlaps only**, not an occluded count.
  **The verdict does not depend on the harness's slow counters, and that is why it is final.** Two
  stages here are quadratic (crossings compares every horizontal with every vertical; overlaps
  compares every pair of bars), and a product version would do both faster. But the stages no
  counter touches (index, routing, the three post-passes and occlusion) already total **49.6 ms**,
  six times the bar. The offer derivation already costs 8.15 ms (ADR-0149 D6), and no counter design
  gets a whole-plan objective beside it inside a frame.
- **FC-N2(b), the run limb: NOT YET JUDGEABLE**, because it is the wall time of a whole Tidy and M0-T4
  builds the search. What this reading bounds is the budget. At about 250 ms per full evaluation,
  2,000 ms buys **eight** evaluations at `scale-2000`, and even the counter-independent floor
  (≈ 50 ms) buys forty. A local search over 2,160 bars cannot finish in either. So at that size T4's
  prototype must either score moves by **delta** (only the links a move re-routes, which is 292 of
  3,200 here) or fall to the rule's worker or size-cap branches. The rule's thresholds do not move.
- **FC-N2(c), equivalence: PASS.** Incremental agrees with full on every one of 1,000 moves, so the
  committed rule permits it as the evaluator rather than only a ranking filter.
  **What it buys, though, is small:** 13 % at `scale-2000` (215 against 246 ms median) and 30 % on
  Unit 300. Under the plan's definition it saves only the routing term, and the post-passes and
  counters that dominate still run over the whole set. **This evaluator's incremental form is
  correct but is not the remedy for (b).** The remedy is a delta objective, and M4 has to prove that
  equivalent too. The control is written so it can be pointed at one.

### Honest limits

Equivalence is shown on Unit 300 only (144 bars), not at `scale-2000`, where 1,000 double
evaluations would take about ten minutes; M4's delta objective will need the larger check. Node
figures bound the algorithm and say nothing about the product owner's hardware (conditions.md; #75).
The p95 is taken over nine runs.
