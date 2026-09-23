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
- **CORRECTED at M0-T4, see "The occlusion counter decided a link's own bar by position" below:
  every `occl` figure in this table uses the order-dependent positional counter. The denominator
  FC-N4 is judged against is the identity count, 58, not 49.** The original bullet is kept below
  as it was written, because the correction is the finding.
- **FC-N4's denominator (as first written — superseded).** Unit 300 at pitch 60 and 4 px/day, `packLanes`: `occluded` **49**,
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

## M0-T4 — the prototype search, and the CQ-1 frontier (FC-N10)

**Harness:** `apps/web/scripts/netpoint-search.ts` (the prototype, which never becomes product code:
M4 writes that and this file then imports it) run by `measure-netpoint-search.mjs`. Pitch 60,
4 px/day, fast counters. The search is spec §4.5 as written: repair, adjacent-row swaps, single-bar
moves to {link neighbours' rows, ± 1, ± 2, one new row}, compaction; strict lexicographic
improvement of (overlaps, occluded, crossings, −sameRow, travel, rows); pass cap P = 8.

### Two instruments were checked before any search result was trusted

- **The fast counters equal the pairwise ones** on seven layouts, including the scale generator's
  2,532 overlaps and 4,695 crossings (`PART=control`).
- **The occlusion counter decided a link's own bar by position, and that is order-dependent.**
  `lineOcclusion` (`crossing-probe.ts`) recovers a link's own bars from where its polyline starts
  and ends, via `barAt`, which returns the first bar in list order within 0.5 px. `packLanes` puts
  bars end to end, so a link's anchor sits on its own bar **and** the neighbour it touches, and the
  neighbour can be taken as "own". A leg running behind that neighbour then goes uncounted.
  Reversing Unit 300's activity list leaves the line set **byte-identical** (same digest) and moves
  the count from **49 to 54**. Counting by the link's two endpoint **ids** reads **58 in either
  order**:

  | plan (pitch 60) | px/day | position (fixture / reversed) | identity (fixture / reversed) |
  | --------------- | -----: | ----------------------------: | ----------------------------: |
  | `small-17`      |      1 |                        8 / 13 |                       10 / 10 |
  | `small-17`      |      4 |                         8 / 6 |                       10 / 10 |
  | Unit 300        |      1 |                       77 / 73 |                       78 / 78 |
  | **Unit 300**    |  **4** |                   **49 / 54** |                   **58 / 58** |
  | Unit 300        |     12 |                       45 / 51 |                       55 / 55 |
  | `scale-2000`    |      4 |                 1,273 / 1,175 |                 1,253 / 1,253 |

  Pitch 52 reads identically, and the positional counter is wrong **in both directions**, not just
  low. The product counter M4 builds has the ids and counts by identity, and FC-N0 requires the two
  to agree exactly. So from here on the harness counts by identity, and **FC-N4's denominator is
  58**: Re-layout passes at **≤ 34** occluded (60 %) and is withdrawn at **≥ 50** (a cut under
  15 %). Against the old denominator the bar would have been ≤ 29, and every result below also
  clears that, so the correction decides nothing about the verdict. It is recorded rather than
  quietly used because it makes the bar easier.
  **The same counter produced ADR-0150's and ADR-0151's published occlusion figures** (0.250 and
  0.261 per link). Those are positional counts in fixture order. Filed as `docs/TECH_DEBT.md` #373.

- **The picture depends on dependency order, and the search does not.** Reversing the dependency
  list changes the painter's line digest (the three post-passes run in a fixed order), while the
  counts happen to agree here. Under identity counting the search returns **byte-identical rows**
  for two runs and for fully reversed input (`PART=determinism`). M4 must still sort edges before
  routing, or FC-N3's "byte-identical across permuted input" holds of the rows and not of the
  picture drawn from them.

### Small plans

| run                           |   B | seed (ovl/occl/cross/same/travel/rows) | → result         |
| ----------------------------- | --: | -------------------------------------- | ---------------- |
| `chain-3` Tidy (pre-fix seed) |   5 | 1/0/0/2/0/1                            | 0/0/0/1/1/2      |
| `chain-3` Re-layout           |   6 | 0/0/0/1/1/2                            | 0/0/0/1/1/2      |
| `small-17` Re-layout (+50 %)  |   8 | 0/10/3/16/23/4                         | **0/0/2/9/32/6** |

`small-17` loses every hidden link for two rows, at the price of seven same-row links and nine rows
of travel. That trade is what the product owner's priority order asks for, and it is also the trade
that shows most in a picture.

### The Unit 300 frontier (seed 21 rows: 58 occluded, 360 crossings, 68 same-row, travel 502)

| budget B       | mode     | rows | occluded | crossings | same-row | travel | full evals | ms (node) |
| -------------- | -------- | ---: | -------: | --------: | -------: | -----: | ---------: | --------: |
| seed (21)      | exact    |   21 |       17 |       208 |       58 |    555 |      1,702 |     3,909 |
| +25 % (27)     | exact    |   27 |        2 |       210 |       44 |    739 |      2,120 |     5,240 |
| **+50 % (32)** | exact    |   31 |    **3** |   **142** |       40 |    725 |      2,982 |     7,525 |
| +100 % (42)    | exact    |   35 |        0 |       111 |       51 |    825 |      3,846 |     9,630 |
| ∞              | exact    |   38 |        0 |       109 |       47 |    878 |      4,081 |    11,635 |
| seed (21)      | filtered |   21 |       21 |       217 |       58 |    548 |        183 |     1,489 |
| +25 % (27)     | filtered |   27 |        4 |       177 |       52 |    663 |        360 |     3,080 |
| +50 % (32)     | filtered |   32 |        3 |       161 |       40 |    833 |        451 |     3,917 |
| +100 % (42)    | filtered |   34 |        0 |       178 |       41 |    828 |        474 |     4,735 |
| ∞              | filtered |   36 |        0 |       173 |       42 |    844 |        467 |     4,601 |

**What it says:**

- **The search buys what it is for, and most of it costs no rows at all.** At the seed's own 21
  rows, exact search takes occluded 58 → 17 (−71 %) and crossings 360 → 208 (−42 %). At the
  approved +50 % it reaches 3 and 142 (−95 %, −61 %). FC-N4's prototype read: **pass at every
  budget**, including B = seed (17 ≤ 34; `x/link` 208/188 = 1.11 against a ceiling of 2.11).
- **It is a local search, and the frontier is not monotone.** +25 % ends with fewer occluded (2)
  than +50 % (3), and +100 % reaches the same crossings as ∞ with three fewer rows. Every exact run
  but one hit the pass cap still improving, so these are readings at P = 8, not optima.
- **The filter costs quality.** It is 2–3× faster, but at +50 % it ends at 161 crossings against
  exact's 142, and at +100 % 178 against 111. M4's product module should score exactly wherever
  FC-N2 permits.
- **The price is chains and travel.** Same-row links fall from 68 to 40 at +50 %, and travel rises
  from 502 to 725. The lexicographic order puts occlusion and crossings first, and the search spends
  the later terms to buy them.
- **FC-N2(b), the run limb: the prototype FAILS the 2,000 ms bar already on Unit 300** (3.9–11.6 s
  exact, 1.5–4.7 s filtered, 144 bars) and the `scale-2000` reading follows. This is an
  unoptimised prototype (each accepted move rebuilds the whole model), so the product module
  re-judges it at M4. What is settled is the direction: the committed rule's worker or size-cap
  branch applies, never the main thread.

### The `scale-2000` frontier (filtered, P = 8; seed 41 rows: 1,253 occluded, 7,282 crossings)

`PART=scale` of `measure-netpoint-search.mjs`, identity attribution, 2,160 bars and 3,200 links. Only
the filtered mode was run: exact scoring is roughly 250 ms per candidate here (M0-T3), so a single
exact pass would take hours.

| budget B       | rows | occluded | crossings | same-row | travel | full evals | ms (node) |
| -------------- | ---: | -------: | --------: | -------: | -----: | ---------: | --------: |
| seed (41)      |   41 |    1,060 |     7,118 |    2,517 |  2,759 |        827 |   153,347 |
| +25 % (52)     |   51 |    1,000 |     7,863 |    2,434 |  4,630 |        968 |   217,515 |
| **+50 % (62)** |   62 |  **985** | **7,774** |    2,409 |  5,131 |      1,138 |   255,357 |
| +100 % (82)    |   80 |      936 |     8,645 |    2,316 |  8,156 |      1,439 |   335,981 |

**The unbounded and Tidy rows were not taken.** The run's `timeout 9000` fired (exit 124) after the
four rows above had used 962 s of it, so the ∞ search ran for about 2.2 hours without finishing its
eight passes and printed nothing. That is itself a reading: at this size an unbounded Re-layout is
not a whole-plan command at all, and a Tidy row that waits behind it is owed at M4 rather than
re-run here. The four bounded rows are the frontier CQ-1 is put on.

**What it says:**

- **At scale the search barely moves occlusion, and above the seed budget it makes crossings WORSE.**
  With no extra rows it cuts occluded 1,253 → 1,060 (−15 %) and crossings 7,282 → 7,118 (−2 %). Every
  larger budget cuts occlusion a little more and pays for it in crossings (+6.8 % at +50 %, +18.7 % at
  +100 %) and travel (+86 % at +50 %). Lexicographic order explains it: a move that removes one
  hidden link is accepted however many crossings it adds.
- **It does not reach FC-N4's 40 % occlusion cut here**, but FC-N4 is judged on Unit 300, not
  `scale-2000`. The synthetic plan's long linked bands (2,914 same-row links in the seed) leave the
  search little to reorder without breaking chains.
- **FC-N2(b), the run limb, FAILS by two orders of magnitude**: 153–336 s against 2,000 ms, and it is
  over 10,000 ms. By the committed rule the optimiser is **offered only below a measured plan size,
  with the dialog saying why** (FC-N2 (b), third branch). M4 measures that size on the product
  module, not on this prototype.

### The pictures, and what they do not show

`frontier-today.png`, `frontier-search-seed.png`, `frontier-search-50.png` and
`frontier-search-unbounded.png`, all by `shoot-netpoint-frontier.mjs`: the real painter in Chromium
at pitch 60, tall enough to show every row.

**The numbers improve more than the pictures do**, and this is said here so the product owner does
not have to find it. At B = seed the left half is visibly less tangled. At +50 % and ∞ the search
has bought its occlusion and crossing counts by **spreading the plan out**: activities move to the
bottom of the diagram and are linked back to the top by long verticals (A1030 and A12500 at +50 %
climb about 25 rows), and the WBS summary rows are pushed down. It reads as more spread out rather
than calmer. None of the three looks like the NetPoint example. Unit 300 is a torture fixture of
dense cross-linked logic, and a layout alone cannot make it read like a hand-drawn plan.

That is the CQ-1 question, and it is the product owner's. The objective as ordered has no term that
objects to a link spanning 25 rows, because travel ranks below both counts. A budget smaller than
+50 %, or travel promoted above crossings, would trade some of the count reduction for a more
compact picture.

### The answer (2026-09-23)

Put to the product owner with the two frontier tables and the four pictures, including the
statement that the pictures improve less than the numbers. **Answer: no extra rows** (`B =
seedRows`), and **avoid unlinked glyph contact** as a term below crossings. The seed-budget row is
therefore the one M4 builds to: on Unit 300 that is 58 → 17 hidden links and 360 → 208 crossings,
with the height unchanged. The amendment is in `conditions.md`.

## M0-T5 — text collisions and glyph contacts on today's row (FC-N6)

**Harness:** `apps/web/scripts/measure-netpoint-row.mjs` over `scripts/netpoint-row-probe.ts`.
The recorder now keeps every `fillText`: its text, position, width from the recorder's own
`measureText` (the metric the painter places text against), font size, alignment and baseline.
Two text runs collide when their boxes overlap by more than 0.5 px on both axes. **Control:** one
label counts 0 and two stacked labels count exactly 1 (checked at both pitches before any reading).
Pitch 52 and 60 read identically, so pitch 60 is shown. Dates are read off (today's default) and on
(M1's default); the dates layer only draws at ≥ 6 px/day, so at 4 px/day the two are the same.

| plan (pitch 60)  | px/day | text runs (dates on) | **collisions** | same-row rect overlaps | glyph contacts / adjacent pairs | of which **unlinked** |
| ---------------- | -----: | -------------------: | -------------: | ---------------------: | ------------------------------: | --------------------: |
| `chain-3` packed |      4 |                    3 |              0 |                      0 |                   1 / 1 (100 %) |               0 (0 %) |
| `small-17`       |      4 |                   16 |              0 |                      0 |                10 / 13 (76.9 %) |             1 (7.7 %) |
| `small-17`       |     12 |                   32 |              0 |                      0 |                10 / 13 (76.9 %) |             1 (7.7 %) |
| **Unit 300**     |  **4** |                  141 |          **9** |                     11 |           **65 / 123 (52.8 %)** |       **19 (15.4 %)** |
| Unit 300         |     12 |                  363 |              1 |                      4 |               60 / 123 (48.8 %) |           14 (11.4 %) |
| `scale-2000`     |      4 |                1,909 |             75 |                    138 |          1,856 / 2,119 (87.6 %) |            50 (2.4 %) |
| `scale-2000`     |     12 |                4,913 |             10 |                     69 |          1,857 / 2,119 (87.6 %) |            48 (2.3 %) |

### Findings

- **Today's name labels already collide, and the cause is a milestone's diamond, not the ladder's
  arithmetic.** The ladder's halved-gap rule (`paint.ts`, "halving is what makes non-collision
  provable") is sound **when a row's drawn rects are disjoint**. A milestone's diamond is
  `2 × MILESTONE_RADIUS` = 14 px wide around a single day, so at 4 px/day it reaches over a
  neighbour starting a day or two later, even though their day spans do not overlap. Every same-row
  rect overlap on both plans involves a milestone: Unit 300 has 11 at 4 px/day and 9 collisions, 4
  at 12 px/day and 1 collision. The colliding runs are truncated stubs such as `A…` × `A1…`. So the
  "provable" claim holds for the shape it was written for (bars with disjoint rects) and not for the
  milestone beside it. **FC-N6(a) requires 0 at M1, so M1 must close this**, either in the ladder
  (take each neighbour's drawn extent rather than its rect) or in the layout (a milestone's drawn
  extent counts as occupancy, the same as its day). The dates layer adds no collisions at 12 px/day.
- **FC-N6(c) is already exceeded before M1 changes anything, ten times over as written.** 52.8 % of
  Unit 300's adjacent same-row pairs touch glyphs at 4 px/day, against a 5 % bar. **Most of it is
  intended:** 46 of the 65 contacts are between bars **joined by a link**. That is an FS chain packed
  end to end, whose node discs meet at the shared day, which is the NetPoint chain the product owner
  asked for. The 19 **unlinked** contacts (15.4 %) are the defect the condition is about, two
  unrelated activities whose glyphs touch, and they still exceed 5 %.
  **The committed consequence applies:** contact joins the objective after `crossings` (ADR-0152
  amended). **Recommended, and put to the product owner with CQ-1 rather than decided here:** the
  term counts **unlinked** contacts only. Counting linked ones would make the optimiser break chains
  apart to separate their nodes, working against its own `sameRow` term and against the reference's
  look.
- **`scale-2000`'s unlinked rate is 2.4 %**, under the bar. Its bands are long linked chains, so
  almost every contact is linked. The generator's shape, not the layout, explains the difference from
  Unit 300.
