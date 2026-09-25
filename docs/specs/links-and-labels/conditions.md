# Falsification conditions: links and labels

**Status:** Committed 2026-09-25, **before M1's first commit** (ADR-0142 D4). The bars are the
spec's (`feature-spec.md` §4.10), written before any baseline existed. This document only fills in the
reference numbers from [`m0-baseline.md`](./m0-baseline.md) and the product owner's answers:

- **CQ-1 (2026-09-25): "Accept the cost."** FC-Q2's Tidy figure is recorded and reported, never a
  stop.
- **CQ-2 (2026-09-25): "Yes, inside the circle."** An end exactly `PORT_OFFSET_PX` from a task
  node's centre, inside the disc and perpendicular to its end segment, counts as attached.

Every count is the same at every pan (`m0-baseline.md` T1), so each condition is judged per fixture
and zoom (1, 4, 12 px/day) on the pan-32 reading. The pan sweep stays in the harness as the check
that this remains true; a cell whose pans disagree is judged summed over four pans.

## Decisions taken here, before any M1 number exists

1. **FC-W2 closes node-to-node's FC-T6 miss by its own wording.** Its bar is the lower of M0 and
   FC-T6's bar. Two cells are already past FC-T6 on today's tree (brief at 4 px/day reads 4 against
   3; small-17 at 1 px/day reads 17 against 8), so in those cells FC-W2 requires a fall, not a hold.
   That is the spec's rule applied, not a new one.
2. **FC-W5's small-17 floor asks for a rise.** Today small-17 at 12 px/day draws 3 plates; node-to-node
   FC-T7's floor there is 4 and was recorded as missed when that epic closed. FC-W5 keeps the floor,
   as the spec says.
3. **FC-Q2 is recorded, not judged** (CQ-1). The spec's "stop" clause does not apply. The per-lane
   memo (spec §4.9) is still built if FC-Q2 misses on its first reading, because the product owner
   accepted the cost, not a larger one than necessary.
4. **FC-Q1 is judged in the milestone's own sitting**, BASE → NEW → BASE → NEW, with the spread beside
   every number and ADR-0128's INDETERMINATE rule. The M0 figures below set the order of magnitude.
   "≤ 1.3 × M0" means 1.3 × the BASE builds of that sitting.
5. **M3-T1 takes each track's side as the better of the two**, by the §4.7 guard quantities, rather
   than a fixed convention. M0-T3 measured that neither fixed convention wins everywhere
   (`m0-baseline.md` T3, finding 3). This is a choice of design within §4.7, not a change to any bar.

## Text (judged at M1 and M2)

### FC-W0: agreement

The module's items equal the painter's recorded `fillText` calls for names, dates and centre items
(text, x, y, alignment) on four fixtures × three zooms × four pans. Wrapped names are listed, not
failed. **Exact**, and verified red by perturbing the module.

### FC-W1: the extraction moved nothing

Golden log byte-identical against a written prediction; every text budget suite unedited and green.

### FC-W2: text crossings fall

| Fixture            | M0 (z1 / z4 / z12) | FC-T6 bar       | Bar (z1 / z4 / z12) | Must fall below M0 somewhere |
| ------------------ | ------------------ | --------------- | ------------------- | ---------------------------- |
| brief              | 6 / 4 / 0          | 6 / 3 / 0       | ≤ 6 / 3 / 0         | yes (z4 already requires it) |
| small-17           | 17 / 7 / 5         | 8 / 7 / 5       | ≤ 8 / 7 / 5         | yes (z1 already requires it) |
| reference-netpoint | 7 / 10 / 10        | 7 / 17 / 13     | ≤ 7 / 10 / 10       | no                           |
| Unit 300           | 163 / 165 / 93     | 177 / 189 / 128 | ≤ 163 / 165 / 93    | no                           |

### FC-W3: nothing above text got worse

Unattached ends 0 in every cell. A cell past its bar stops the work and goes to the product owner
with the pairs listed.

| Fixture            | Occluded ≤ (z1 / z4 / z12) | Opposed ≤    | Crossings ≤ ⌊M0 × 1.05⌋ | Overlaps ≤ ⌊M0 × 1.05⌋ |
| ------------------ | -------------------------- | ------------ | ----------------------- | ---------------------- |
| brief              | 0 / 0 / 0                  | 0 / 0 / 0    | 0 / 0 / 0               | 0 / 0 / 0              |
| small-17           | 0 / 0 / 0                  | 3 / 3 / 2    | 9 / 7 / 7               | 0 / 0 / 0              |
| reference-netpoint | 0 / 0 / 0                  | 0 / 0 / 0    | 1 / 1 / 1               | 0 / 0 / 0              |
| Unit 300           | 9 / 8 / 6                  | 32 / 28 / 23 | 365 / 366 / 361         | 22 / 14 / 10           |

(M0 crossings: small-17 9 / 7 / 7, Unit 300 348 / 349 / 344; M0 overlaps: Unit 300 21 / 14 / 10.)

### FC-W4: wrap residue

Crossings of wrapped name lines, reported per cell. M0 is **0 in every cell**, so the bar is 0 in
every cell. If a wrapped lower line accounts for any rise in FC-W2, it is reported pair by pair.

### FC-W5: plates

Plates on text stay 0 in every cell (M0: 0 everywhere).

| Fixture            | Lag plates drawn ≥ (z1 / z4 / z12) |
| ------------------ | ---------------------------------- |
| brief              | 0 / 0 / 2                          |
| small-17           | 0 / 0 / **4** (M0 3; decision 2)   |
| reference-netpoint | 0 / 0 / 4                          |
| Unit 300           | 0 / 0 / 32                         |

If the plate sub-term moves no cell, it is withdrawn and the text term stays.

### FC-W6: gap labels ≥ ⌈M0 × 0.90⌉

| Fixture            | M0 (z1 / z4 / z12) | Bar (z1 / z4 / z12) |
| ------------------ | ------------------ | ------------------- |
| brief              | 0 / 0 / 1          | ≥ 0 / 0 / 1         |
| small-17           | 0 / 1 / 5          | ≥ 0 / 1 / 5         |
| reference-netpoint | 0 / 17 / 17        | ≥ 0 / 16 / 16       |
| Unit 300           | 0 / 28 / 35        | ≥ 0 / 26 / 32       |

### FC-T5: determinism

200 seeded shuffles of `scene.edges` draw identical lines on all four fixtures.

## Two-way tracks (judged at M3)

### FC-K0: non-vacuity — PASSED at M0

small-17 has 3 / 3 / 2 opposed pairs, all absorbable; Unit 300 has 32 / 28 / 23, of which
15 / 16 / 11 are absorbable. Every pair is classified (`m0-baseline.md` T2). The harness-only
prototype showed that the **unamended** judge reads every offset end as an embed and passes it
(T3, finding 1).

### FC-K1: opposed pairs fall to the non-absorbable residue

| Fixture            | Bar (z1 / z4 / z12)                         |
| ------------------ | ------------------------------------------- |
| brief              | 0 / 0 / 0                                   |
| small-17           | 0 / 0 / 0                                   |
| reference-netpoint | 0 / 0 / 0                                   |
| Unit 300           | 17 / 12 / 12, plus each §4.7 refusal listed |

A pair a guard refuses is allowed above the bar only if it is listed with the guard that refused it.

### FC-K2: attachment, amended

0 unattached ends under the amended judge in every cell. The judge's self-test still reproduces every
existing verdict and carries the three cases the spec names (δ attached, δ + 1 unattached, offset at
an embed unattached). The draft amended judge built at M0 already carries these plus three more
(`attachment-probe.ts` `selfTestAmendedJudge`).

### FC-K3: nothing else moves

**Fingerprints identical** where M0 found no absorbable pair:

| Fixture            | 1 px/day       | 4 px/day       | 12 px/day      |
| ------------------ | -------------- | -------------- | -------------- |
| brief              | `48f45e64fee8` | `7b762ca8d2a9` | `fff575ab47a0` |
| reference-netpoint | `f4626a071713` | `f63fcb067e80` | `47df2f3f148a` |

These are M0's fingerprints. **If M1 or M2 moves them, FC-K3's reference becomes M2's fingerprints for
that cell**, since the condition is that M3 moves nothing M2 drew; the M2 figures are recorded in its
verdict. Elsewhere, crossings, foreign-occluded links, text crossings and overlaps each ≤ their M2
value, and false junctions under the amended exemption ≤ M0 re-measured: small-17 56 / 2 / 0,
Unit 300 369 / 95 / 14 (the amended judge equals the shipped one on unmoved routes, T3).

### FC-K4: the two lines really are two

On the painter's recorded paths, the ink of any two offset segments on one track, heads and chevrons
included, is ≥ 1 px apart wherever they run side by side.

### FC-K5: the report's own shape

`route-frame.opposed.test.ts` passes unedited.

## Cost (judged at M1, M2 and M3)

| ID        | M0 (`m0-baseline.md` T4, T5)                                                                           | Bar                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **FC-Q1** | `routeFrame` p95 4.70–6.10 ms (spread 1.40); `paintScene` p95 13.90–16.20 ms (spread 2.30)             | `routeFrame` ≤ 8 ms and ≤ 1.3 × the sitting's BASE. `paintScene` ≤ BASE + BASE's spread at M1, ≤ 1.3 × BASE at M2. |
| **FC-Q2** | Tidy on Unit 300: 7,147 / 7,300 / 7,127 ms                                                             | **Recorded, not judged** (CQ-1, decision 3). The spec's 1.25 × M0 = 8,934 ms is reported beside it.                |
| **FC-Q3** | scale-300 packed: 16,395 ms                                                                            | Reported beside FC-Q2.                                                                                             |
| **FC-Q4** | 5,955 keys at 300 activities; build median 13.5–30.7 ms, worst 42 ms; no key outside the predicted set | Build ≤ 50 ms on the main thread at 300 activities, and the completeness property holds.                           |
| **FC-Q5** | Not taken.                                                                                             | Dropped-frame delta ≤ 2.00 pp on the product owner's hardware, Week at 2,000. **Owed until taken, never claimed.** |
