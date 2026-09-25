# Falsification conditions: node-to-node links

**Status:** Committed 2026-09-25, **before M1's first commit** (ADR-0142 D4). The bars are the
spec's (`feature-spec.md` §4.9), written before the baseline existed. This document only fills in
the reference numbers from [`m0-baseline.md`](./m0-baseline.md) and the product owner's answer to
CQ-1. **CQ-1 (2026-09-25): "Approve, +10 % limit."**

Measured with `node scripts/measure-attachment.mjs` and `node scripts/measure-route-cost.mjs` from
`apps/web`. Counts are the same at every pan, so each condition is judged per fixture and zoom
(1, 4, 12 px/day). The pan sweep stays in the harness as the check that this remains true.

## Decisions taken here, before any M2 number exists

1. **FC-T3's ratio bar is judged on the three plans (`small-17`, `reference-netpoint`,
   `Unit 300`), not on `brief`.** `brief` has zero crossings at every zoom, and 0 × 1.10 is 0. On
   `brief` the ratio bar would become "no crossing may exist", which is a different condition from
   the one the product owner approved. `brief` exists for attachment (FC-T0, FC-T1). Its crossings
   are still reported.
2. **FC-T8 (b) is judged on p95 but read with its spread.** Today's two runs read 5.90 and
   2.30 ms: a 3.60 ms spread, which is larger than the room between the baseline and the 8 ms
   absolute bar.
   - **Pass:** M2's larger p95 of two runs is ≤ 8 ms.
   - **Fail:** M2's p95 is over 8 ms, and its p50 is also over 2 × 0.80 = 1.60 ms.
   - **Indeterminate:** p95 over 8 ms with p50 within 1.60 ms. Take a third and fourth run; if the
     p95 still disagrees across runs by more than 3.60 ms, the reading is INDETERMINATE (ADR-0128)
     and is reported as that, not as a pass.
3. **The FC-T7 label floor rounds up.** ≥ baseline × 0.90 means ≥ ⌈baseline × 0.9⌉, so one label
   on a fixture must stay one.

## Core conditions (judged at M2)

Baseline values are copied from `m0-baseline.md`. A bar is written as the largest (≤) or smallest
(≥) value that passes.

### FC-T0 — non-vacuity (judged at M0)

**PASS (2026-09-25).** Unattached ends over every framing: brief 96, small-17 352,
reference-netpoint 664, Unit 300 2,332. Both brief cases are named at every zoom and pan. The
probe's self-test was verified red twice (see `m0-baseline.md`).

### FC-T1 — unattached ends = 0

Zero on **every** fixture, zoom and pan. Today it is 6 to 209 per reading.

### FC-T2 — obstructions ≤ today

Each is ≤ its baseline at every zoom.

| Fixture            | Foreign-occluded links (z1 / z4 / z12) | False junctions (z1 / z4 / z12) |
| ------------------ | -------------------------------------- | ------------------------------- |
| brief              | ≤ 0 / 0 / 0                            | ≤ 2 / 0 / 0                     |
| small-17           | ≤ 7 / 6 / 6                            | ≤ 164 / 26 / 2                  |
| reference-netpoint | ≤ 5 / 5 / 5                            | ≤ 7 / 7 / 0                     |
| Unit 300           | ≤ 76 / 50 / 51                         | ≤ 768 / 178 / 78                |

### FC-T3 — crossings per link ≤ baseline × 1.10 (CQ-1)

The link count is fixed per fixture, so the bar is stated as the exact crossing count:
⌊baseline crossings × 1.10⌋. The per-link figures in `m0-baseline.md` are rounded, and a bar
computed from a rounded ratio would be wrong by a crossing on the small plans.

| Fixture (links)         | Baseline crossings (z1 / z4 / z12) | Bar (z1 / z4 / z12) |
| ----------------------- | ---------------------------------- | ------------------- |
| small-17 (29)           | 18 / 3 / 3                         | ≤ 19 / 3 / 3        |
| reference-netpoint (68) | 3 / 3 / 3                          | ≤ 3 / 3 / 3         |
| Unit 300 (188)          | 424 / 362 / 388                    | ≤ 466 / 398 / 426   |

Past the bar at any zoom, **the work stops and the numbers go to the product owner.** It is not
withdrawn automatically.

A 10 % allowance on a small count is no allowance at all: on `small-17` at 4 and 12 px/day, and on
`reference-netpoint` at every zoom, one more crossing than today fails. That is the approved
condition, applied as written.

### FC-T4 — overlaps ≤ baseline

| Fixture            | Baseline and bar (z1 / z4 / z12) |
| ------------------ | -------------------------------- |
| brief              | ≤ 0 / 0 / 0                      |
| small-17           | ≤ 14 / 7 / 7                     |
| reference-netpoint | ≤ 0 / 0 / 2                      |
| Unit 300           | ≤ 133 / 52 / 44                  |

### FC-T5 — determinism

- Identical lines across two runs (the fingerprints).
- Identical lines across 200 seeded shuffles of `scene.edges`, as a property test in M1-T4 and on
  the fixtures.

### FC-T6 — text crossings ≤ baseline × 1.10

| Fixture            | Baseline (z1 / z4 / z12) | Bar (z1 / z4 / z12) |
| ------------------ | ------------------------ | ------------------- |
| brief              | 6 / 3 / 0                | ≤ 6 / 3 / 0         |
| small-17           | 8 / 7 / 5                | ≤ 8 / 7 / 5         |
| reference-netpoint | 7 / 16 / 12              | ≤ 7 / 17 / 13       |
| Unit 300           | 161 / 172 / 117          | ≤ 177 / 189 / 128   |

(Bars are ⌊baseline × 1.10⌋.)

**Remedy if it fails:** add names as a score term after overlaps (spec D-6), then measure again.

### FC-T7 — labels drawn ≥ ⌈baseline × 0.90⌉

| Fixture            | Gap labels (z1 / z4 / z12) | Lag plates (z1 / z4 / z12) |
| ------------------ | -------------------------- | -------------------------- |
| brief              | ≥ 0 / 0 / 1                | ≥ 0 / 0 / 2                |
| small-17           | ≥ 0 / 1 / 2                | ≥ 0 / 0 / 4                |
| reference-netpoint | ≥ 0 / 16 / 16              | ≥ 0 / 0 / 4                |
| Unit 300           | ≥ 0 / 23 / 27              | ≥ 0 / 0 / 32               |

### FC-T8 — cost

- **(a)** At most 11 candidates per edge, and a bounded number of obstruction tests per edge. Both
  pinned by a counting gate in jsdom (`paint.routing-budget.test.ts`).
  **Corrected at the M3 gate pass:** only the candidate cap is counted by that gate (it routes all
  1,493 links of the 2,000-activity dense plan and asserts at most 11 shapes each). The obstruction
  bound follows by construction and is not counted: `scoreCandidates` scores each candidate exactly
  once, so there are at most 11 obstruction tests per edge, and each one binary-searches to the first
  glyph that can reach the segment. The sentence above claimed a count that was never written.
- **(b)** `routeFrame` p95 ≤ 8 ms at scale-2000, Week. Baseline: p50 0.80 ms; p95 5.90 and 2.30 ms
  (spread 3.60 ms). Judged under decision 2 above.
- **(c)** The staff-console paint probe on the product owner's hardware, Week at 2,000: the
  dropped-frame delta ≤ 2.00 pp. **Owed until taken**, never claimed.
- **(d)** Tidy on Unit 300 ≤ 1.5 × 4,642 ms = **≤ 6,963 ms** (the larger baseline run).

### FC-T9 — orthogonality

No diagonal segment, on any fixture. This is the harness's throwing control. It stays until M4,
which alone may relax it.

## Amendment after M2 (product owner, 2026-09-25)

M2 went past FC-T3 on `small-17` (3 → 8 crossings at 4 and 12 px/day), and the work stopped as
this document requires. The numbers and pictures went to the product owner (`m2-verdict.md`), who
answered **"Accept and ship"**:

1. **FC-T3 on `small-17` is accepted as the cost of attached links.** The bar is not moved. The
   miss is recorded against it. Every other FC-T3 cell passes, and Unit 300 and the reference plan
   fall.
2. **FC-T2's false-junction metric exempts a sibling's node** (spec D-4's bus): a node of another
   successor of the link's predecessor, or of another predecessor of its successor. The M0 baseline
   was **re-measured with the corrected metric** before judging (`m2-verdict.md`), so the bar is
   still today's figure, measured like for like. This is the one condition changed after its
   measurement, and it is changed because the metric contradicted spec D-4, not to pass a reading.
3. **FC-T6's remedy (spec D-6) was tried and is not buildable faithfully in this epic.** The painter
   places a name and its dates using measured text widths and neighbour gaps, and the router cannot
   see either. An approximation would be the second opinion ADR-0149 warns against. The two small
   misses are accepted with the rest, and the proper fix (the painter's label layout as a pure module
   the router can read) is filed as `docs/TECH_DEBT.md` #393.

## Diagonal conditions (judged at M4, against the M2 result)

Copied from spec §4.9 unchanged. Their reference numbers are M2's, which do not exist yet, so they
are filled in at M4 from `m2-verdict.md`.

- **FC-D0, eligibility:** at least one eligible link on the NetPoint reference plan at 4 px/day.
  Zero means drop.
- **FC-D1, unattached ends:** still 0.
- **FC-D2, obstructions:** ≤ M2.
- **FC-D3, text crossings:** ≤ M2.
- **FC-D4, gap labels drawn:** ≥ M2.
- **FC-D5, wrapped names:** ≥ M2 × 0.95.
- **FC-D6, benefit:** crossings per link ≤ M2 × 0.95, **or** bends per link ≤ M2 × 0.80.
- **FC-D7, non-vacuity:** at least one diagonal drawn on each fixture at 4 px/day.
- **FC-D8, cost:** within FC-T8.

**Judged 2026-09-25: five fail (FC-D2, D3, D4, D6, D7), so diagonals are not valid**
([`m4-verdict.md`](./m4-verdict.md)).

**Any FC-D failure drops diagonals.** They are recorded as not valid in ADR-0158, and the product
owner is not asked again (the product owner, 2026-09-25: "if the diagonal is an issue lets leave it
as not valid").

## Amendment after the opposed-links fix (product owner, 2026-09-25)

ADR-0158 decisions 7–10 answer the product owner's report against `web-v0.150.0` (links into a
finish node running against the link out of it). Two conditions move, and both are recorded rather
than passed:

1. **FC-T8 (a) rises from 11 to 15 shapes per link.** The four escapes follow the eleven and are
   built only when a link asks for them. The counting gate reads `MAX_ROUTE_CANDIDATES`, so it now
   pins 15.
2. **FC-T8 (d) is missed, and the miss is accepted.** Measured in one sitting against the pre-epic
   tree: Tidy on Unit 300 **1.66–1.78×** its time (6.87–7.39 s against 4.08–4.21 s), over the 1.5×
   bar. Put to the product owner with the numbers and three alternatives, the answer was **"Ship it,
   accept the cost"**. The bar is not moved; the figures and what was tried are in ADR-0158's
   amendment.
