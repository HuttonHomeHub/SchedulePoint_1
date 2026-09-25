# M2 verdict: links read the labels (#393)

**Status:** Judged 2026-09-25 against [`conditions.md`](./conditions.md). Every bar is the one M0
committed. One cell misses (FC-W2, `small-17` at 1 px/day). It is recorded with its cause and does
not stop the work: the plan stops only on FC-W3. Every FC-W3 cell holds.

The router now scores the names and dates a candidate line runs through, read from the text layout
M1 extracted. The term ranks after obstructions, crossings and overlaps and before length (spec D-1),
and a lagged link also scores whether its plate has room (D-5). The painter and the Tidy worker read
the same layout.

Counts below are `node scripts/measure-attachment.mjs` (from `apps/web`) at pan 32 on commit
`8628af40`. Every count is the same at every pan, as at M0.

## FC-W2: text crossings fall — one cell MISSES

| Fixture            | M0 (z1 / z4 / z12) | M2 (z1 / z4 / z12) | Bar (z1 / z4 / z12) | Result                                  |
| ------------------ | ------------------ | ------------------ | ------------------- | --------------------------------------- |
| brief              | 6 / 4 / 0          | 5 / 2 / 0          | ≤ 6 / 3 / 0         | pass; below M0 at z1 and z4             |
| small-17           | 17 / 7 / 5         | **17** / 7 / 3     | ≤ 8 / 7 / 5         | **z1 misses** (17 > 8); below M0 at z12 |
| reference-netpoint | 7 / 10 / 10        | 4 / 8 / 8          | ≤ 7 / 10 / 10       | pass                                    |
| Unit 300           | 163 / 165 / 93     | 150 / 141 / 93     | ≤ 163 / 165 / 93    | pass                                    |

**Why `small-17` at 1 px/day cannot fall.** At 1 px/day the plan is about 60 px wide. Nearly every
link is a short vertical through the name rows of the lanes between its ends. Nine links cross text
there, 17 boxes in all. For seven of them, **no candidate the router has** crosses less text
(minimum over the candidate set equals what is drawn). The other two could cross less only on a
shape phase 1 ranked lower, i.e. one through more bars or with a run hidden behind one, and both of
those outrank a name. So the miss is a property of the candidate set at
that zoom, not of the ranking. Reaching node-to-node's FC-T6 bar there would need shapes the
orthogonal candidate set does not generate (a route round the whole row). That is outside this epic.
Established by listing, per link, the drawn line's text count against the minimum over
`routeNodeToNodeParts` candidates on that fixture and zoom.

FC-W4 (wrap residue): no fixture wraps a name at any zoom (`wrapsTaken` 0 in every reading), and
`name-wrapped` crossings are 0 everywhere. The bar is 0 and holds.

## FC-W3: nothing above text got worse — PASSED, after three fixes

| Fixture            | Occluded (bar)    | Opposed (bar)           | Crossings (bar)               | Overlaps (bar)          |
| ------------------ | ----------------- | ----------------------- | ----------------------------- | ----------------------- |
| brief              | 0 / 0 / 0 (0/0/0) | 0 / 0 / 0 (0/0/0)       | 0 / 0 / 0 (0/0/0)             | 0 / 0 / 0 (0/0/0)       |
| small-17           | 0 / 0 / 0 (0/0/0) | 3 / 3 / 2 (3/3/2)       | 9 / 7 / 6 (9/7/7)             | 0 / 0 / 0 (0/0/0)       |
| reference-netpoint | 0 / 0 / 0 (0/0/0) | 0 / 0 / 0 (0/0/0)       | 1 / 1 / 1 (1/1/1)             | 0 / 0 / 0 (0/0/0)       |
| Unit 300           | 9 / 8 / 6 (9/8/6) | 32 / 27 / 23 (32/28/23) | 348 / 346 / 345 (365/366/361) | 21 / 14 / 10 (22/14/10) |

Unattached ends are 0 in every cell.

**The first reading missed three cells, and each miss was a different mechanism.** None was the text
term trading a higher-ranked term directly. Each fix is a correction the spec's order already
implied, not a new rule.

1. **Unit 300 occluded 10 at z1 and 7 at z12 (bar 9 and 6).** `obstructions` counts a vertical
   through a bar and a run hidden behind one as the same thing. On two links the text term chose the
   hidden run, because the two tied on obstructions and the hidden run crossed no name. The product
   owner's order puts a hidden link above text. So `hiddenLegs` now ranks just above `text` in phases
   1 and 2, and phase 2 no longer moves a link to a line with more hidden legs at equal obstructions
   (phase 3's existing rule, applied to phase 2's ordinary shapes too). After that, z12 held, and one
   link at z1 was still moved by phase 2 for a crossing; the guard is what closed it.
2. **Unit 300 opposed 29 at z4 (bar 28).** Neither link of the new pair changed shape. Both leave one
   node for two successors and share a gutter run of identical extent. When an unrelated link's text
   choice moved its gutter run, first-fit channel packing (ADR-0150) reordered the two. One vertical
   then ran up the other's in the opposite direction. `packGutterChannels` now orders two runs with
   identical extent by where their verticals go: the run whose vertical lies above the gutter takes
   the upper channel. The swap is free, because each channel's occupancy is unchanged. After it,
   opposed pairs read 27 at z4, one below M0.
3. The three fixes move no other cell past its bar (table above).

## FC-W5: plates — PASSED, and the sub-term is kept

| Fixture            | M2 (z1 / z4 / z12) | Bar      |
| ------------------ | ------------------ | -------- |
| brief              | 0 / 0 / 2          | ≥ 0/0/2  |
| small-17           | 0 / 0 / **4**      | ≥ 0/0/4  |
| reference-netpoint | 0 / 0 / 4          | ≥ 0/0/4  |
| Unit 300           | 0 / 0 / **33**     | ≥ 0/0/32 |

Plates on text are 0 in every cell. `small-17` at 12 px/day reaches node-to-node's floor of 4
through the text term alone: moving a link off a name gave its plate room. The plate sub-term
(D-5) then moved Unit 300 at 12 px/day from 32 plates to 33. Unit 300 has 35 lagged links, so 2
plates are still withheld. The sub-term moves a cell, so it stays.

The painter and the router derive each link's gap and plate text from one module, `link-facts.ts`.
They check room with the painter's own `freePlatePosition` (`plate-room.ts`). The probe builds the
same input, and its point-by-point control refused to measure until it did: its router copy had no
plate input and drew different lines from the painter.

## FC-W6: gap labels — PASSED

brief 0 / 0 / 1, small-17 0 / 1 / 5, reference-netpoint 0 / 17 / 17, Unit 300 0 / 27 / 35: every
cell at or above its bar (Unit 300's is ≥ 0 / 26 / 32).

**The count passed while one label was lost, and the count could not see it.** The M4 UX review
found it in the Unit 300 picture: the text-aware router moves A2210's `106 cal d` link off its own
row into the gutter A2200's `143 cal d` link already used, the two runs 3 px apart (ADR-0150's
channel pitch). Both labels wanted the same midpoint, and a gap label had exactly one position, so
`143 cal d` was withheld and nothing on screen said a second relationship waited there. A gap label
now takes the first free position along its own run inside the waiting interval, the lag plate's
rule less its vertical runs (`gapLabelCandidates`, `link-marks.ts`); the first candidate is the
midpoint it always took, so a label that fitted is where it was. Unit 300 then draws 0 / **30** /
**39**; no other cell changes and every route fingerprint is identical
(`node scripts/measure-attachment.mjs --json`, with and without the change). Pinned by
`paint.link-marks.test.ts`, "moves a gap label along its own run before withholding it", verified
red first. The two runs sharing a gutter at 3 px is ADR-0150's channel design and is not changed
here.

## FC-T5: determinism — PASSED

200 seeded shuffles of `scene.edges` draw identical lines on all four fixtures.

## Cost

One sitting, builds interleaved BASE → NEW → BASE → NEW. BASE is the M1 tree (`f77671b6`) with its
own harness; NEW is `8628af40`. `apps/web/src` was swapped in place for each BASE run and restored.
Headless Chromium rasterises in software (`m0-baseline.md` T5).

| Measure                          | BASE samples                              | NEW samples                               | Bar                               | Result                                           |
| -------------------------------- | ----------------------------------------- | ----------------------------------------- | --------------------------------- | ------------------------------------------------ |
| `routeFrame` p95 (ms)            | 5.6, 5.0, 6.0, 5.2 (5.45)                 | 6.3, 7.1, 4.4, 7.2 (6.25)                 | ≤ 8 and ≤ 1.3 × 5.45 = 7.09       | **pass** (means)                                 |
| `paintScene` p95 (ms)            | 13.6, 13.8, 13.8, 13.4 (13.65)            | 16.0, 17.7, 18.2, 15.3 (16.80)            | ≤ 1.3 × 13.65 = 17.75             | **pass** (means)                                 |
| Tidy, Unit 300 (s)               | 8.23, 7.69, 8.11, 7.02, 6.83, 6.77 (7.44) | 9.38, 8.65, 8.82, 9.12, 9.84, 8.64 (9.07) | recorded (CQ-1); 1.25 × M0 = 8.93 | **recorded**: 1.22 × BASE, 0.14 s over 1.25 × M0 |
| Width table, 300 activities (ms) | —                                         | median 12.1, max 32.0                     | ≤ 50 (FC-Q4)                      | **pass**                                         |

Each judged bar is met on the means. The worst single samples (routeFrame 7.2, paintScene 18.2) are
over 1.3 × BASE by 0.11 and 0.45 ms, inside NEW's own spread. The paint cost rises about 3 ms at
Week because the detail tier now builds the text index and, for lagged links, the plate room every
frame. FC-Q5 (dropped frames on the product owner's hardware) is **owed** and not claimed.

**FC-Q2 missed on its first reading, and the remedy the spec expected was the smaller one.** First
reading: NEW 9.9 s against BASE 7.1 s. Conditions decision 3 required the per-lane memo either way.
The spec said the layout rebuild would be the larger share, and labelled that "reasoned, not
measured". A CPU profile of one Tidy run said otherwise:

- `layoutTextIndex`: 1.16 s inclusive;
- `textCrossings`: 0.78 s (a `Set` and a result array allocated per call);
- a conditional object spread in the scoring callback: about 0.4 s.

The shipped fixes are:

- `sceneRowTextItems` lays out one lane at a time, remembered per search. A property holds its
  items equal to the whole-plan layout, fresh and through a warm memo after a lane move.
- `textCrossings` allocates nothing until it meets a box.
- `plateBlocked` is always a number.

Tidy fell to 8.7–8.9 s against BASE 7.2–7.4 s in a direct interleaved check, and the formal sitting
above reads 1.22×. FC-Q3 (`scale-300` packed) was said here to be reported below and was not taken
at M2; it was taken on the final tree at M4 and is in [`m3-verdict.md`](./m3-verdict.md) (24.9 s,
1.52 × M0's 16.4 s).

## Findings the gates made

- **The Tidy worker would have failed on any plan whose names wrap.** The M2-T3 completeness
  property drives the layout over random plans, zooms, widths and toggles with a recording measure.
  On its first run it found a key the width table does not hold: the layout proposes a two-line wrap
  and measures single words. M0-T4's recording never saw it because none of its scenes wraps a name.
  Its own harness classifies those keys as `wrap` because it watches the painter, which does ask for
  them. `sceneRowText` now proposes no wraps (`oneLineOnly`), and a second property shows the
  router's items are identical either way. A missing key fails the search with a message and never
  guesses a width (protocol case).
- **The golden log did not change, and a case now says why** (`paint.golden.test.ts`, "the text term
  in the maximal scene"). Prediction written before the router read text: the maximal scene's four
  links each meet text, and no shape any of them has goes round it, so no line moves. Measured: they
  meet 1, 1, 1 and 4 boxes, and text-aware and text-blind routing give equal lines. The case pins
  that premise.
- **The journey went red three times before it went red for the right reason**
  (`e2e-netpoint-grammar/links.spec.ts`, "a link runs round a name rather than through it where it
  can"). Twice the instrument was wrong. First, a dark threshold of 450 found only glyph stems in
  anti-aliased grey text. Second, the scene canvas is transparent where nothing is drawn, so partial
  alpha at the edges broke the name into pieces; each pixel is now judged composited over the ground.
  The third red was the defect: with the painter made text-blind, 17 link pixels fall inside M's
  name. With the text term, 0. The controls are the link's ink and the name's detection (266 px).
- **Callers that pass `null` text on purpose** (the M2-T2 grep of `apps/web/scripts/`):
  `shoot-two-way.mjs` (M0's prototype pictures, taken before the router read text) and
  `shoot-links-labels-shim.ts` (the "before" pictures below). No measurement harness passes `null`.

## Pictures

`node scripts/shoot-links-labels.mjs` (from `apps/web`) paints each fixture with the real painter
twice: text-blind (the router given no text and no plates, as before M2) and as shipped. brief,
small-17 and the reference plan are at 12 px/day. Unit 300 is at 4 px/day, cropped to 1646 px.

| Fixture            | Before                                       | After                                      |
| ------------------ | -------------------------------------------- | ------------------------------------------ |
| brief              | [before](./m2-brief-before.png)              | [after](./m2-brief-after.png)              |
| small-17           | [before](./m2-small-17-before.png)           | [after](./m2-small-17-after.png)           |
| reference-netpoint | [before](./m2-reference-netpoint-before.png) | [after](./m2-reference-netpoint-after.png) |
| Unit 300           | [before](./m2-unit-300-before.png)           | [after](./m2-unit-300-after.png)           |

In `small-17` at 12 px/day, A120's link and its `+1d` plate move off A108's name, and a `+2d` plate
that had no room is drawn.
