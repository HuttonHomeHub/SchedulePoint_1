# M2 verdict: node-to-node links. Stopped at FC-T3, then accepted by the product owner

**Status:** Measured 2026-09-25 on the M1 router wired into `routeFrame`, when the wiring was still
saved as [`m2-wiring.diff`](./m2-wiring.diff). The wiring is now committed (`e6da09ba`), and the M3
gate pass below changed it again. The tables in the first two sections are the M2 readings as taken,
kept so the stop can be read as it happened. `conditions.md` says: _"Past the bar at any zoom, the
work stops and the numbers go to the product owner. It is not withdrawn automatically."_ It was past
the bar, so work stopped here until the product owner answered.

Reproduce: apply `m2-wiring.diff`, then from `apps/web` run `node scripts/measure-attachment.mjs`.
Every count was identical at all four pans, so each cell below is one zoom (1 / 4 / 12 px/day).

## The decision (product owner, 2026-09-25): "Accept and ship"

Recorded in `conditions.md` under "Amendment after M2". FC-T3 on `small-17` is accepted as the
cost of attached links, FC-T2's false-junction metric exempts a sibling's node (spec D-4's bus),
and FC-T6's remedy is filed rather than approximated.

### False junctions re-measured with the corrected metric (both sides)

The baseline was re-measured on the M1 commit (the router not wired in) with the corrected probe,
and M2 on the wired tree. Readings at pan 32 (every pan agrees):

| Fixture            | Baseline (z1 / z4 / z12) | M2 (z1 / z4 / z12) | Verdict |
| ------------------ | ------------------------ | ------------------ | ------- |
| brief              | 1 / 0 / 0                | 1 / 0 / 0          | PASS    |
| small-17           | 71 / 4 / 0               | 56 / 2 / 0         | PASS    |
| reference-netpoint | 0 / 0 / 0                | 0 / 0 / 0          | PASS    |
| Unit 300           | 527 / 131 / 50           | 369 / 95 / 13      | PASS    |

## Readings against the committed bars (as first measured, before the amendment)

| Condition                    | Fixture            | M0 baseline       | M2               | Bar               | Verdict                 |
| ---------------------------- | ------------------ | ----------------- | ---------------- | ----------------- | ----------------------- |
| **FC-T1** unattached ends    | all four           | 6–209 per reading | **0 everywhere** | 0                 | **PASS**                |
| FC-T2 foreign-occluded links | Unit 300           | 76 / 50 / 51      | 9 / 8 / 6        | ≤ baseline        | PASS                    |
|                              | small-17           | 7 / 6 / 6         | 0 / 0 / 0        |                   | PASS                    |
|                              | reference-netpoint | 5 / 5 / 5         | 0 / 0 / 0        |                   | PASS                    |
| FC-T2 false junctions        | Unit 300           | 768 / 178 / 78    | 573 / 125 / 16   | ≤ baseline        | PASS                    |
|                              | small-17           | 164 / 26 / 2      | 143 / 21 / 0     |                   | PASS                    |
|                              | reference-netpoint | 7 / 7 / 0         | **9 / 9 / 9**    | ≤ 7 / 7 / 0       | **FAIL** (see below)    |
| **FC-T3** crossings          | Unit 300           | 424 / 362 / 388   | 387 / 362 / 350  | ≤ 466 / 398 / 426 | PASS (better)           |
|                              | reference-netpoint | 3 / 3 / 3         | 1 / 1 / 1        | ≤ 3 / 3 / 3       | PASS (better)           |
|                              | small-17           | 18 / 3 / 3        | **9 / 8 / 8**    | ≤ 19 / 3 / 3      | **FAIL at 4 and 12**    |
| FC-T4 overlaps               | Unit 300           | 133 / 52 / 44     | 21 / 15 / 10     | ≤ baseline        | PASS                    |
|                              | small-17           | 14 / 7 / 7        | 0 / 0 / 0        |                   | PASS                    |
|                              | reference-netpoint | 0 / 0 / 2         | 0 / 0 / 0        |                   | PASS                    |
| FC-T6 text crossings         | Unit 300           | 161 / 172 / 117   | 160 / 160 / 91   | ≤ 177 / 189 / 128 | PASS                    |
|                              | reference-netpoint | 7 / 16 / 12       | 7 / 10 / 10      | ≤ 7 / 17 / 13     | PASS                    |
|                              | brief              | 6 / 3 / 0         | 6 / **4** / 0    | ≤ 6 / 3 / 0       | **FAIL at 4**           |
|                              | small-17           | 8 / 7 / 5         | **17** / 7 / 5   | ≤ 8 / 7 / 5       | **FAIL at 1**           |
| FC-T7 labels                 | all four           | —                 | every floor met  | ≥ ⌈baseline×0.9⌉  | PASS                    |
| FC-T9 orthogonality          | all four           | 0                 | 0                | 0                 | PASS (throwing control) |
| FC-T5 determinism            | M1 unit property   | —                 | holds            | —                 | PASS (M1 suite)         |
| FC-T8 cost                   | —                  | —                 | not yet taken    | —                 | not measured (stopped)  |

## Why the three failures happen

**FC-T3 on small-17 is the approved score order at work, not a defect.** This was established by
listing every crossing (`scripts/_diag-n2n.ts`, a scratch harness that was not committed). All eight
crossings at 4 and 12 px/day are a gutter run crossing a vertical. For each of them, every shape that
would avoid the gutter runs through a bar:

- VH runs along the successor's lane.
- HV and HVH cross the bars in the lanes between.

The product owner's order puts "through a bar" ahead of crossings, so the router takes the gutter.
The M0 router had three crossings only because its elbows sat inside the nodes, which is the defect
this epic removes. On the two larger plans, crossings **fell**: Unit 300 by 9 % at 1 px/day and 10 %
at 12 px/day, and the reference plan from 3 to 1.

**FC-T2 on the reference plan is the bus the spec asked for.** Of the nine false junctions, six are
Mob's vertical stem passing through the start nodes of `P_FAB`, `B_FAB` and `S_FAB`, which are all
Mob successors on one x. That is spec D-3/D-4's bus, drawn exactly as the reference picture draws it.
The M0 router drew the same stem **3 px to the left of the nodes** (`m2-reference-netpoint-before.png`),
which is why it was not counted. The metric in spec §4.9 does not exempt a bus that passes its own
siblings' nodes, so the spec contradicts itself here. The other three are clusters of nodes a few
pixels apart at 4 px/day.

**FC-T6 on the two small fixtures** is one lag plate and a handful of gutter runs meeting a name or
date. The spec's remedy (D-6: names as a score term after overlaps) has not been tried, because the
work stops at FC-T3 first.

## Pictures

Rendered by the real `paintScene` in Chromium from the same fixtures (`scripts/_shoot-n2n.mjs`, a
scratch shooter, not committed):

- `m2-small-17-before.png` / `m2-small-17-after.png` (12 px/day)
- `m2-reference-netpoint-before.png` / `m2-reference-netpoint-after.png` (4 px/day)
- `m2-brief-before.png` / `m2-brief-after.png` (12 px/day)

In each "after" picture, every link leaves its predecessor's node and enters its successor's node
from an allowed side, and no bend is hidden inside a disc. The "before" pictures show the defects the
epic was opened on: elbows inside nodes, arrivals over the bar, and landings mid-bar.

## Completed after the decision

### FC-T8 cost, taken in one sitting with the baseline interleaved

`measure-route-cost.mjs`, run BASE (the M1 commit) → M2 → BASE → M2 on one machine, because the
first M2 readings of Tidy spread 5,576–7,236 ms across three sittings and a bar set against another
sitting's baseline would have judged the machine, not the router.

| Limb                                   | Baseline (same sitting) | M2                 | Bar              | Verdict           |
| -------------------------------------- | ----------------------- | ------------------ | ---------------- | ----------------- |
| (b) `routeFrame` p95, scale-2000, Week | 1.20–1.90 ms            | 3.60–4.30 ms       | ≤ 8 ms           | **PASS**          |
| (b) `routeFrame` p50                   | 0.80 ms                 | 1.60–1.70 ms       | (read with p95)  | 2.1× the baseline |
| (d) Tidy on Unit 300 (node proxy)      | 4,110–4,333 ms          | 5,631–6,775 ms     | ≤ 1.5 × baseline | **INDETERMINATE** |
| (a) shapes per link                    | —                       | ≤ 11 on every edge | ≤ 11             | **PASS** (gate)   |
| (c) staff-console paint probe          | —                       | not taken          | owed             | owed              |

Tidy's means are 6,151 against 4,236 ms, 1.45×, inside the bar. Its worst reading against the best
baseline reading is 1.65×, outside it, and an earlier sitting read 7,236 ms against the committed
absolute of 6,963 ms. Readings fall on both sides of the bar, so this is recorded as INDETERMINATE
(ADR-0128), not as a pass. The cause is known: Tidy re-routes the whole frame for every move it tries,
and each link now scores up to eleven shapes instead of one corridor. (a) is pinned by
`paint.routing-budget.test.ts`, which routes all 1,493 links of the 2,000-activity dense plan.

### Tests and journey

- The golden log was re-baselined against a written prediction, applied as the two audited hunks
  rather than with `-u`. The prediction was that only link geometry changes. One class was missed
  and is recorded: the lag plates (`fillRect`/`strokeRect`/`fillText`) move with their links, with the
  same text and size. Totals: `lineTo` −11, `moveTo` −3 (three fewer direction marks, two links one
  vertex shorter). The flag-off snapshot did not change.
- `e2e-netpoint-grammar/links.spec.ts` gains "a link leaves its predecessor through the finish node,
  not beside it". It reads pixels in a real browser and was **verified red on the old router**: the
  walk up the link's vertical met 30 px of ground (the corridor's corner), not the 8–16 px interior
  of the node ring.
- `paint.routing-budget.test.ts`, `paint.lane-containment.test.ts` and `paint.netpoint-text.test.ts`
  were rewritten where they pinned the corridor router's shapes. Each is explained in its own file.

### Retired, as `m0-baseline.md` planned

The corridor router is gone from the code, not just from the routed path: `routeOrthogonal`'s
obstacle branch, `gutterRoute`, `bundleCorridors`, `chooseCorridorsByCrossing`, `isLegClear`,
`isLaneFreeAt` and `MAX_CORRIDOR_CANDIDATES`. `routeOrthogonal` stays, without obstacles, as the path
every link takes while `scene.linkRouting` is off. `packGutterChannels` finds gutter runs by geometry.

Harnesses: `netpoint-evaluate.ts` is re-pointed at the new router. `crossing-probe.ts` loses
`avoidableOcclusions`, and `measure-avoidable.mjs`, `measure-small-plan.mjs` and
`measure-crossing-pass.mjs` are deleted. Each measured a property of the corridor router that no
longer exists. Their verdicts stay in ADR-0149, ADR-0150 and `docs/specs/logic-legibility/`, and
those figures are not reproducible from this tree.

## M3 gate pass (2026-09-25)

Four reviews ran over the wired router: component, performance, UX and accessibility.
Accessibility found nothing blocking: the spoken logic summary and the listbox never read a route,
and the milestone arrowhead was measured clear of the triangle. The other three blocked. Every fix
below leaves the routes unchanged except where it says otherwise, and the attachment measure was
re-run after each.

**UX: lag plates landed on names and dates.** In `m2-small-17-after.png` one plate sat across A105's
start date and another across the code "A108", the two texts interleaved. The plate had moved with
its link, and nothing placed it against text. Plates are now drawn in layer 3.9, after names and
dates, at the first free position on their own link (`lagPlateCandidates` and `freePlatePosition` in
`link-marks.ts`). A position is free when it misses every drawn name and date (with a 2 px graze
allowance) and every glyph box. If no position is free the plate is withheld, as a gap label already
is. Plates on text (`p/txt` in the measure) are now **0 on every fixture, zoom and pan**.

That fix costs one FC-T7 cell, and it is recorded as a miss, not moved:

| Fixture   | Lag plates at 12 px/day | Floor | Verdict  |
| --------- | ----------------------- | ----- | -------- |
| brief     | 2                       | ≥ 2   | PASS     |
| small-17  | **3**                   | ≥ 4   | **MISS** |
| reference | 4                       | ≥ 4   | PASS     |
| Unit 300  | 32                      | ≥ 32  | PASS     |

On `small-17` four links carry a lag and three plates are drawn: the fourth has no free position,
because every candidate point on its link meets a name, a date or a node. A plate drawn anyway is the illegible overprint the review
blocked on, so it is withheld. The lag is still in the link's spoken logic summary. The miss is the
same class as FC-T6 and has the same remedy, `docs/TECH_DEBT.md` #393: once the router can read the
painter's text layout, it can choose a route that leaves room for its plate.

**Component: four findings.**

1. `isLaneBoundary` was defined twice, in `route-frame.ts` and in `netpoint-evaluate.ts`. It now
   lives once, beside `gutterBelow` in `link-candidates.ts`, and both import it.
2. `RouteFrame.laneIndex` was not a lane index. It is now `glyphs: GlyphIndex | null`.
3. `BundleCandidate` named the retired bundler. It is now `RoutedLine`.
4. FC-T8(a) claimed a counted bound on obstruction tests that no test counted. `conditions.md`
   now says what is counted (shapes per link) and why the obstruction bound follows from it.

The same review found FC-T5 tested only as a unit property, while the spec required it on the
fixtures. `measure-attachment.mjs` now shuffles `scene.edges` 200 times per fixture. **Unit 300
failed that check: 39 of 200 orders drew different lines.** The cause was `packGutterChannels`,
which broke ties between gutter runs by their position in the input. It now breaks them by a stable
link key (the edge id). The fix was verified red, and all four fixtures are now identical across 200
shuffles. The phase-1 and phase-2 internals of `link-score.ts`
(`comparePhase1`, `Phase2Score`, `scoreCandidates`) are no longer exported.

**Performance: FC-T8(d) had no accepted disposition.** The product owner's "Accept and ship"
predates the cost reading, so INDETERMINATE could not stand. Four changes, none of which change a
route (the measure's fingerprints are identical before and after):

- `obstructions()` binary-searches to the first glyph that can reach a segment, instead of scanning
  each lane from the start.
- A candidate's segments are cut once, lazily, and reused by phase 2.
- `SegmentBuckets.between()` returns an index range, not a generator.
- `lineOf` no longer clones every routed line twice. Phase 2 also stops early on a link whose best
  shape already crosses and overlaps nothing, because no move can strictly improve it.

Re-measured in one sitting, baseline (`7b7c0ec8`) and this tree interleaved, BASE → NEW → BASE →
NEW:

| Limb                                   | Baseline       | This tree      | Bar              | Verdict  |
| -------------------------------------- | -------------- | -------------- | ---------------- | -------- |
| (b) `routeFrame` p95, scale-2000, Week | 1.20–1.90 ms   | 3.20–4.00 ms   | ≤ 8 ms           | **PASS** |
| (b) `routeFrame` p50                   | 0.70–0.90 ms   | 1.40–1.70 ms   | (read with p95)  | —        |
| (d) Tidy on Unit 300 (node proxy)      | 3,868–4,003 ms | 4,631–4,970 ms | ≤ 1.5 × baseline | **PASS** |
| (a) shapes per link                    | —              | ≤ 11           | ≤ 11             | **PASS** |
| (c) staff-console paint probe          | —              | not taken      | owed             | owed     |

Tidy's means are 4,770 against 3,927 ms, 1.21×. The worst reading against the best baseline reading
is 4,970 against 3,868 ms, 1.28×. Every reading is also under the committed absolute of 6,963 ms.
FC-T8(c) is still owed and is not claimed.

**Also changed, each with a test verified red first:** an arrowhead into a milestone's centre port
stops at the triangle (`paint.netpoint-text.test.ts`); the gutter tie-break key
(`link-routing.test.ts`); and plate placement (`link-marks.test.ts`, pure cases rather than a scene,
because the first scene test passed against the defect).
