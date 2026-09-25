# M2 verdict: node-to-node links. Stopped at FC-T3, then accepted by the product owner

**Status:** Measured 2026-09-25 on the M1 router wired into `routeFrame`. The wiring is **not
committed to the product**. It is saved as [`m2-wiring.diff`](./m2-wiring.diff), so the numbers
below can be reproduced exactly. `conditions.md` says: _"Past the bar at any zoom, the work stops and
the numbers go to the product owner. It is not withdrawn automatically."_ It is past the bar, so
work has stopped here.

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
