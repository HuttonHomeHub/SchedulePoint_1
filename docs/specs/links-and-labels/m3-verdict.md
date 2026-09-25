# M3 verdict: two-way tracks (#394)

**Status:** Judged 2026-09-25 against [`conditions.md`](./conditions.md). Every bar is the one M0
committed. FC-K1 is met in its listed form: every opposed pair left above the bar sits on a track a
named guard refused, and the guards are listed per cell below. FC-K2 to FC-K5 and FC-T5 pass.

After phase 3, a vertical track that still carries two links running opposite ways is drawn as two
lines: every segment travelling down moves `PORT_OFFSET_PX` (4 px) to one side and every segment
travelling up to the other, both still entering the node's disc (spec §4.7,
`apps/web/src/features/tsld/render/link-tracks.ts`). The arrowhead of an offset tip is trimmed to the
rim, √(`NODE_REACH_PX`² − δ²) back along the line (`nodeHeadTrim`). The probe's attachment judge
accepts an end exactly δ from a task node centre, perpendicular to its segment (CQ-2), and is its
default from M3.

Counts below are `node scripts/measure-attachment.mjs --json` (from `apps/web`) at pan 32, on the
tree at `5ff626df` plus the orientation field. Every count is the same at every pan.

## FC-K1: opposed pairs fall — met in its listed form

| Fixture            | M2 (z1 / z4 / z12) | M3 (z1 / z4 / z12) | Bar (z1 / z4 / z12)         | Result                             |
| ------------------ | ------------------ | ------------------ | --------------------------- | ---------------------------------- |
| brief              | 0 / 0 / 0          | 0 / 0 / 0          | 0 / 0 / 0                   | pass                               |
| small-17           | 3 / 3 / 2          | **2 / 2** / 0      | 0 / 0 / 0                   | z1, z4 above; both refusals listed |
| reference-netpoint | 0 / 0 / 0          | 0 / 0 / 0          | 0 / 0 / 0                   | pass                               |
| Unit 300           | 32 / 27 / 23       | **31 / 24 / 20**   | 17 / 12 / 12, plus refusals | above; every refusal listed        |

**What the pass did, and what it refused**, per cell (`tracks` in the probe's row). Counts are
**tracks**, not pairs: one track can carry several pairs.

| Cell         | Tracks split (segments) | Tracks refused, by the first guard both sides failed |
| ------------ | ----------------------- | ---------------------------------------------------- |
| small-17 z1  | 1 (3)                   | node 1, crossing 1                                   |
| small-17 z4  | 1 (2)                   | crossing 2                                           |
| small-17 z12 | 2 (4)                   | —                                                    |
| Unit 300 z1  | 1 (2)                   | not-absorbable 8, obstruction 4, text 1, node 1      |
| Unit 300 z4  | 2 (6)                   | not-absorbable 7, text 2, obstruction 1, occupied 1  |
| Unit 300 z12 | 3 (9)                   | not-absorbable 5, node 2, text 1, crossing 1         |

Of Unit 300's remaining pairs, 1 / 0 / 1 lie on a horizontal track (`opposedByOrientation`), which
the pass does not treat: the spec's option is a vertical one. The rest are on refused vertical
tracks.

**The honest reading is that the pass does less than M0's prototype suggested.** M0 counted 15 / 16 /
11 absorbable pairs on Unit 300; M3 removes 1 / 3 / 3. The difference is the guards: M0-T3's
prototype split every absorbable track and measured only attachment. With the spec's guards, a split
that would gain a crossing, meet text, run through a bar or come within reach of a neighbour's node
is refused. The product owner's order ranks an opposed pair above a crossing in phase 3, but §4.7
makes "gain a crossing" a guard on this pass, and that is what shipped. Relaxing it is not this
milestone's decision; it is recorded for M4's review.

## FC-K2: attachment, amended — PASSED

Unattached ends are 0 in every cell, at every pan, under the amended judge. The judge's self-test
(`selfTestAmendedJudge`, run by every probe reading) carries the three cases the spec names — δ
attached, δ + 1 unattached, an offset at an embed unattached — plus δ − 1 unattached, on-anchor, and
a non-perpendicular offset unattached.

## FC-K3: nothing else moves — PASSED

Fingerprints are identical to M2's at every zoom for **brief** (`44644792530d`, `1564ec3594a1`,
`fff575ab47a0`) and **reference-netpoint** (`c35967dae149`, `8c60e99e2b3d`, `c63743820236`), the two
fixtures with no absorbable pair.

| Fixture  | Crossings (M2 → M3)    | Foreign-occluded | Text crossings        | Overlaps                           | False junctions (M0 re-measured → M3) |
| -------- | ---------------------- | ---------------- | --------------------- | ---------------------------------- | ------------------------------------- |
| small-17 | 9 / 7 / 6 → 9 / 7 / 6  | 0 / 0 / 0 → same | 17 / 7 / 3 → same     | 0 / 0 / 0 → same                   | 56 / 2 / 0 → 56 / **1** / 0           |
| Unit 300 | 348 / 346 / 345 → same | 9 / 8 / 6 → same | 150 / 141 / 93 → same | 21 / 14 / 10 → 21 / **12** / **9** | 369 / 95 / 14 → same                  |

Every count is at or below its M2 value, and overlaps fall: splitting a track also separates two
collinear runs that happened to share it.

## FC-K4: the two lines really are two — PASSED

On the painter's recorded paths, every pair of link verticals either side of a split track, 2δ apart
and running side by side, keeps at least **2.5 px** of ground between their ink, arrowheads and
chevrons included (bar 1 px). The probe measures it (`trackInk`): each line's ink reaches its stroke
half-width or, wider, any link mark lying across it within the pair's shared y-range, counted
against the whole range. A split track with no measured pair throws, verified by blinding the
measure.

| Cell         | Pairs | Smallest gap (px) |
| ------------ | ----- | ----------------- |
| small-17 z1  | 1     | 4.5               |
| small-17 z4  | 1     | 4.0               |
| small-17 z12 | 2     | 4.0               |
| Unit 300 z1  | 1     | 4.5               |
| Unit 300 z4  | 3     | 4.5               |
| Unit 300 z12 | 3     | 2.5               |

The worst case the derivation allows is an arrowhead beside a chevron: 2δ − 3 − 2.5 = 2.5 px, which
is what Unit 300 at 12 px/day measures.

## FC-K5: the report's own shape — PASSED

`route-frame.opposed.test.ts` passes with no assertion edited. Its harness changed at M2, to pass the
router the scene's text as `routeFrame`'s new argument; M3 did not touch it. Phase 3 already
separates that scene, so the track pass has nothing to do there, as the spec predicted.

## FC-T5: determinism — PASSED

200 seeded shuffles of `scene.edges` draw identical lines on all four fixtures at 4 px/day.

## Three departures from the plan

1. **The pass runs after `packGutterChannels`, not before it.** The plan put it before. The first
   cut did that and gained crossings on Unit 300: where two halves' gutter runs shared a boundary y,
   the split left only a T-junction, which the crossing guard does not count, and packing then
   spread the runs into channels and made it a crossing. After packing, the guard sees the lines as
   they are drawn. A guard against a new collinear horizontal overlap (`occupied`) was added at the
   same time, since moving a vertical lengthens the horizontals either side of it by δ.
2. **A node guard the spec did not list.** The first cut raised Unit 300's false junctions at
   12 px/day from 14 to 16: a moved end came within reach of a neighbouring node. A vertical that
   ends on a lane centre crosses no lane there, so `obstructions` cannot see it pass beside a node;
   moved δ closer, it can reach one. The guard refuses a move that brings a line within reach of a
   node, other than its own two activities', that it was not within reach of before. After it, 14 → 14.

3. **M2 and M3 ship in one release.** The plan gave M3 its own slice and release, independent of
   M2's cost outcome. Both landed on the same branch before either was released, so they go out
   together, each with its own changeset; M3 can still be withdrawn alone, since M2 does not depend
   on it.

## Cost: FC-Q1 misses on `routeFrame`

Two sittings, each BASE → NEW → BASE → NEW with BASE the M1 tree (`f77671b6`) and its own harness
(`node scripts/measure-route-cost.mjs`, `apps/web/src` swapped in place and restored). Headless
Chromium rasterises in software. Means of the per-run p95s; every sample is in the table.

| Measure (p95)      | BASE                                      | NEW, first sitting (`81d0c3af`) | NEW, second sitting (`f05fa2a5`)                 | Bar                         |
| ------------------ | ----------------------------------------- | ------------------------------- | ------------------------------------------------ | --------------------------- |
| `routeFrame` (ms)  | 4.7, 6.6, 4.7, 4.1 (**5.03**)             | 10.9, 12.4, 13.1, 14.5 (12.73)  | 9.1, 9.7, 7.1, 8.3 (**8.55**)                    | ≤ 8 and ≤ 1.3 × 5.03 = 6.53 |
| `paintScene` (ms)  | 13.3, 13.9, 13.2, 13.3 (13.43)            | 22.6, 20.5, 22.0, 25.1 (22.55)  | 17.4, 17.9, 17.4, 16.7 (17.35)                   | ≤ 1.3 × 13.43 = 17.45       |
| Tidy, Unit 300 (s) | 7.52, 7.31, 7.17, 7.49, 7.12, 6.85 (7.24) | 18.80 (six runs, 18.2–19.6)     | 11.21, 10.91, 11.48, 11.30, 11.09, 10.72 (11.12) | recorded (CQ-1)             |

BASE is the second sitting's; the first sitting's BASE read 5.20 / 12.80 / 7.16, the same within
spread. **`routeFrame` misses both limbs** (8.55 against 8 and against 6.53). `paintScene` meets its
bar on the mean, by 0.10 ms, with one sample (17.9) over. Tidy is 1.54 × BASE, recorded under CQ-1.

**What the pass itself costs.** The same tree with only the `splitResidueTracks` call bypassed (one
run): `routeFrame` 6.3 / 5.2 ms p95, Tidy 9.70 / 9.09 / 8.78 s. So M3's pass adds about 2.8 ms p95
(1.2 ms p50) to a frame of 306 routed links at scale-2000 Week, and about 2 s to Tidy. M2 had
already used most of the 1.3 × allowance (its own sitting read 6.25 ms against its BASE 5.45, and
the bypass here reads 5.75), so the pass would have had to cost under about 0.8 ms p95 to fit it.

**The first sitting was far worse, and a review found it before the sitting did.** The performance
review read the pass as testing every other line in the frame for each track; a CPU profile of one
Tidy run then put 32 % of it in `nodesReached`, which tested every node for every moved line on both
sides. Four changes, none of which moves a line (all 48 probe rows keep their fingerprint, tracks and
opposed pairs): nodes sorted by x and searched; each line's pre-move node count and score taken once;
the vertical-occupancy guard a binary search; and the crossing and shared-run guards counted on each
moved line's window only (both are sums over segment pairs, so the rest cancels), against only the
lines whose box meets a window's. `routeFrame` 12.73 → 8.55 ms, Tidy 18.8 → 11.1 s. What remains is
spread over fixed per-frame work (spans, sorting, boxes) with no single term to remove.

**My own first A/B was wrong, and is recorded because its number was nearly used.** To isolate the
pass I made the block that runs it unreachable, which also skipped phase 2 and the gutter channels;
it read `routeFrame` 2.4 ms and Tidy 5.4 s and credited all of the difference to the pass. The pass
alone, timed inside `routeFrame` in node, was 2.6 s of Tidy, and the bypass above is the figure used.

**The miss goes to the product owner.** The conditions give FC-Q1 no stop clause, and the choices
are theirs: accept the cost, as CQ-1 did for Tidy; run the pass in the painter only and not in Tidy's
objective (Tidy would then score a picture a few pixels different from the one drawn); or withdraw
M3. FC-Q5 (dropped frames on the product owner's hardware) is owed and not claimed.

FC-Q3 (`scale-300` packed, `PLANS=scale300 node scripts/measure-netpoint-optimise.mjs`, reported
beside FC-Q2): **24.9 s** on the final tree (`9b84cabc`), against M0's 16.4 s: 1.52 ×, 1,817
evaluations at 13.7 ms each, deterministic.

## Tests

- `link-tracks.test.ts`: the split on a crowded shared node, the tie rule, a V link on one side at
  both ends, a same-direction bus and a frame with no opposed pair returned untouched by identity,
  an embed end refused, and one case per guard (ports, obstruction, node, text, crossing, occupied).
  Nine mutations of `splitResidueTracks` each turn their own case red. The hidden-leg guard had no
  case of its own until the M4 test review showed it reachable and untested (deleting it left the
  suite green); its case builds the one shape it fires alone on, a move that takes a vertical out of
  one bar while running a horizontal into another, and goes red without the guard.
- The cost shape: a line far from every track is read the same number of times whether one track
  or eight is split (a counting stub, verified red at 260 reads against 36).
- `nodeHeadTrim` (in `link-tracks.test.ts`): the rim on a node centre and beside one, verified red
  against the untrimmed reach; nothing trimmed elsewhere.
- The derivation test: `PORT_OFFSET_PX` inside the window its bounds derive from the constants.
- The golden log is byte-identical: the maximal scene has no residue track.
- Journey: `e2e-netpoint-grammar/links.spec.ts`, "two links on one track at a crowded node are drawn
  apart": green with the pass, red with it off, the suite's other ten cases unchanged. It failed on
  its first run, twice, and neither failure was the product. The fixture came from a search whose
  bars ended a working day late, so its crowded node did not exist in the app; and the detector
  judged pixels composited over the ground, which a 1 px line on a whole-pixel x, drawn as two
  half-alpha columns, never matches.

## Pictures

`node scripts/shoot-tracks.mjs` (from `apps/web`) paints each fixture with the real painter twice:
with the pass switched off (the frame as before M3) and as shipped, around the split track with the
most moved segments.

| Fixture                        | Before                                   | After                                  |
| ------------------------------ | ---------------------------------------- | -------------------------------------- |
| small-17, 12 px/day, 560 × 300 | [before](./m3-tracks-small17-before.png) | [after](./m3-tracks-small17-after.png) |
| Unit 300, 4 px/day, 1646 × 900 | [before](./m3-tracks-unit300-before.png) | [after](./m3-tracks-unit300-after.png) |

In `small-17`, the link arriving up into A200's start node from A190 and the link leaving it down to
the `10 cal d` run were one stroke with an arrowhead at each end; they are now two lines. The track at
A180 still carries two arrowheads: splitting it would gain a crossing, so the guard refused it. In
Unit 300, the same happens at A7230's start node and at A5230's finish.

**Where a split appears depends on what is in view.** The painter routes only the activities in its
viewport, so a track that is residue in the whole plan may not be residue in a crop, and the reverse.
The first Unit 300 picture, a 560 × 300 crop at 12 px/day, showed no difference at all for that
reason; the probe's counts route every activity and are the same at every pan.
