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

## Two departures from the plan

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

## Cost

_Owed: the FC-Q1 / FC-Q2 sitting on the final tree, and FC-Q3._

## Tests

- `link-tracks.test.ts`: the split on a crowded shared node, the tie rule, a V link on one side at
  both ends, a same-direction bus and a frame with no opposed pair returned untouched by identity,
  an embed end refused, and one case per guard (ports, obstruction, node, text, crossing, occupied).
  Nine mutations of `splitResidueTracks` each turn their own case red. The hidden-leg guard has no
  case of its own: a hidden leg also counts as an obstruction, so it fires alone only when a move
  takes a vertical out of one bar while running a horizontal into another.
- `nodeHeadTrim` (in `link-tracks.test.ts`): the rim on a node centre and beside one, verified red
  against the untrimmed reach; nothing trimmed elsewhere.
- The derivation test: `PORT_OFFSET_PX` inside the window its bounds derive from the constants.
- The golden log is byte-identical: the maximal scene has no residue track.
- Journey: `e2e-netpoint-grammar/links.spec.ts`, "two links on one track at a crowded node are drawn
  apart".

## Pictures

_Owed._
