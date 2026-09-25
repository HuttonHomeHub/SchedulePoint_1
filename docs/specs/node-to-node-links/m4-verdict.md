# M4 verdict: diagonals are not valid

**Status:** Measured 2026-09-25 on the M3 head (`ce6a56e7`). **Five of the eight diagonal
conditions fail, so diagonals are recorded as not valid** in ADR-0158. As agreed at approval, the
product owner is not asked again: _"if the diagonal is an issue lets leave it as not valid"_.

**Nothing is shipped.** The diagonal code was built outside the product branch, behind
`ALLOW_DIAGONAL_LINKS`, and measured there. It is kept as [`m4-diagonals.diff`](./m4-diagonals.diff),
applied to `ce6a56e7`, so this reading can be reproduced:

    git apply docs/specs/node-to-node-links/m4-diagonals.diff
    cd apps/web && ALLOW_DIAG=1 node scripts/measure-attachment.mjs --json

M4-T4b's revert needs no check: the product branch never held the code, so M2's routes are
unchanged.

## What was built

- **Five shapes** under spec §4.8's construction rule: D, VDV, HDH, HDV and VDH. Each has its slope
  inside the link's own waiting interval (`linkGapSpan`, the interval the gap label reads), running
  forward and at least 24 px wide. Only a non-driving link that changes lane waits, so only those
  links are offered a slope.
- **The scorer.** It counts a slope's obstructions in every lane whose glyph band the slope passes
  through, including the two end lanes. It measures length as Euclidean, and counts phase-2
  crossings between a slope and any segment by general intersection.
- **The instruments, generalised first** (M4-T1): the probe's crossing count, its text-crossing test
  (a slope's bounding box is not the slope, so the test clips the slope to each text box), its end
  judge, and its occlusion count.
- **With the constant off**, every count and every route fingerprint equals M3's on all four fixtures
  at every zoom and pan. The generalisation is invisible on straight lines.

## Two corrections made before judging

Both made the diagonals' result fairer. Neither changed a bar.

1. **The first slope scorer had a hole.** It checked only the lanes a slope strictly crosses, so a
   bar abutting the node a slope leaves was invisible to it. Found by listing the links the probe
   saw as hidden. The fixed scorer counts every lane the slope's glyph band touches.
2. **The probe's occlusion count skipped vertical segments** ("vertical corridors are already
   obstacle-checked", true of the retired router, not of this one). So an M2 vertical through a bar
   was invisible while a slope through a bar was counted: the two sides were judged by different
   rules. Judged instead on a count of every segment (`occludedAll`), applied to both sides alike.

## Readings (every pan agrees, so each cell is one zoom: 1 / 4 / 12 px/day)

"Off" is the shipped M3 route set and "on" has diagonals allowed.

| Condition                              | Fixture            | Off                     | On                        | Bar                      | Verdict    |
| -------------------------------------- | ------------------ | ----------------------- | ------------------------- | ------------------------ | ---------- |
| FC-D0 eligible links at 4 px/day       | reference-netpoint | —                       | 14                        | ≥ 1                      | PASS       |
| FC-D1 unattached ends                  | all four           | 0                       | 0                         | 0                        | PASS       |
| **FC-D2** links through a foreign bar  | reference-netpoint | 1 / 1 / 1               | **4 / 4 / 4**             | ≤ off                    | **FAIL**   |
|                                        | small-17           | 7 / 6 / 6               | 7 / 6 / 6                 |                          | pass       |
|                                        | Unit 300           | 56 / 52 / 53            | 56 / 52 / 52              |                          | pass       |
| **FC-D3** text crossings               | reference-netpoint | 7 / 10 / 10             | 6 / **13 / 11**           | ≤ off                    | **FAIL**   |
|                                        | small-17           | 17 / 7 / 5              | 17 / 6 / 5                |                          | pass       |
|                                        | Unit 300           | 160 / 160 / 91          | 145 / 134 / 73            |                          | pass       |
| **FC-D4** gap labels drawn             | reference-netpoint | 0 / 17 / 17             | 0 / **15 / 15**           | ≥ off                    | **FAIL**   |
|                                        | small-17           | 0 / 1 / 5               | 0 / **0** / 5             |                          | **FAIL**   |
|                                        | Unit 300           | 0 / 28 / 34             | 0 / **27** / 35           |                          | **FAIL**   |
| FC-D5 wrapped names                    | —                  | —                       | not taken                 | ≥ off × 0.95             | not needed |
| **FC-D6** benefit at 4 px/day          | Unit 300           | 1.926 x/link, 173 bends | 1.915, 170                | x ≤ 1.830 or bends ≤ 138 | **FAIL**   |
|                                        | reference-netpoint | 0.015 x/link, 25 bends  | 0.029, 21                 | x ≤ 0.014 or bends ≤ 20  | **FAIL**   |
|                                        | small-17           | 0.276 x/link, 22 bends  | 0.172, 23                 | x ≤ 0.262                | pass       |
| **FC-D7** a diagonal drawn at 4 px/day | brief              | —                       | **0**                     | ≥ 1 on each              | **FAIL**   |
|                                        | the other three    | —                       | 2 / 7 / 11 slope segments |                          | pass       |
| FC-D8 cost                             | —                  | —                       | not taken                 | within FC-T8             | not needed |

FC-D5 and FC-D8 were not measured, because five conditions had already failed and any one failure
decides the verdict. They are recorded as not taken, not as passes.

## Why they fail

**Diagonals do go where the spec allowed them.** On the reference plan at 4 px/day seven slope segments
are drawn, every one inside its link's waiting interval. The failures are about what a slope does once it is
there, and the picture shows it plainly
([`m4-reference-netpoint-diagonals.png`](./m4-reference-netpoint-diagonals.png)). A link from MOB
waits 457 days, so its waiting interval is about 1,800 px wide. Across that width it drops five
lanes as one shallow slope. On the way it passes behind S_FAB's bar and the bar above it, and it
crosses the name and date rows of every lane in between.

That is the case spec §4.8 named as "the likeliest real failure". The obstruction score does not
prevent it. The scorer counted three obstructions on that slope. Since the M2 shapes are all still
candidates and obstructions come first, every orthogonal alternative must have scored at least
three: their verticals cross the same lanes' node-widened spans. So the slope won on length. The
probe counts only a bar's own box, and by that count the slope is worse (FC-D2).

The benefit is also too small to pay for this. Where slopes are taken, Unit 300's crossings per link
fall 0.6 % against the 5 % required, and its bends fall 2 % against the 20 % required. Gap labels
fall too. The likely cause, not separately measured, is that a label placed on a slope lands on a
row's name or date more often than one on a horizontal run. A label that would meet text is
withheld (ADR-0157).

**FC-D7 fails by construction.** `brief`'s one waiting link that changes lane waits less than
24 px at 4 px/day, so the construction rule offers it no slope.
