# Part C — M-C0 measurements

- **Conditions:** [`./part-c-conditions.md`](./part-c-conditions.md) (committed alone at `0c48f5f3`,
  before any harness file existed)
- **Status:** Approved
- **Harness:** `apps/web/scripts/crossing-probe.ts`

---

## M-C0-T2a — what the painter actually emits, and why the plan's attribution rule needed checking

**Taken:** 2026-09-22, against `0c48f5f3`. Scale scene, 500 activities / 800 edges, 12 px/day,
`originY 32`, 1646×857.

The approved plan says to "identify link batches by sentinel palette values". That is a hypothesis
about a painter nobody had interrogated this way, so it was **dumped rather than assumed**
(`crossing-probe.ts`'s `dump`). 701 recorded paths in 11 batches:

| flush    | style     | dash  | lw  |   n | shapes                   |                     |
| -------- | --------- | ----- | --- | --: | ------------------------ | ------------------- |
| `stroke` | `#010203` | true  | 1   | 191 | 4pt×139 · 2pt×44 · 6pt×8 | ← link, non-driving |
| `fill`   | `#010203` | true  | 1   | 156 | 4pt×156                  | ← **arrowheads**    |
| `stroke` | `#e5e7eb` | false | 1   | 145 | 2pt×145                  | gridlines           |
| `stroke` | `#010203` | false | 2   |  92 | 4pt×69 · 2pt×19 · 6pt×4  | ← link, driving     |
| `fill`   | `#010203` | false | 2   |  81 | 4pt×81                   | ← **arrowheads**    |
| `stroke` | `#ececee` | false | 1   |  33 | 2pt×33                   | lane rules          |
| `fill`   | `#3b82f6` | false | 2   |   3 | 4pt×3                    | bars                |

### Three findings, each of which changed the metric

**1. Sentinel attribution works, and that was not free to assume.** The painter assigns
`palette.edge` directly rather than deriving a tint from it, so `#010203` appears verbatim at flush
time. Had it derived one, the sentinel would never have appeared and the control would have thrown —
which is why the sentinel is a checkable assumption rather than a belief.

**2. The colour cannot be the discriminator, because arrowheads carry it too.** 237 of the 520
sentinel-coloured paths are **filled** 4-point triangles — the ADR-0065 arrowheads, built from
`moveTo` + `lineTo` exactly like a routed line. A recorder that could not tell a `fill()` from a
`stroke()` would have counted every one as a link and reported **84 % more lines than exist**, with
nothing on screen looking wrong and every figure downstream inheriting it. The discriminator is the
**flush kind**; the colour only narrows it to the layer.

This is why `vhv-gutter-probe.ts`'s recorder could not simply be reused: it records vertices and
nothing else, and its own docblock says so deliberately.

**3. The link layer is four batches, not one** — dashed 1px and solid 2px strokes (the non-driving
and driving lines) each with an arrowhead fill batch beside it. So "one layer, one batch" is not
quite the rule; "one layer, one batch **per style group**" is.

### The number that makes "per visible link" mandatory rather than fussy

**283 stroked link polylines against 800 edges in the scene.** The rest are culled. A raw crossing
count would therefore fall whenever fewer links are visible — and spending rows is precisely a change
that puts fewer bars, and fewer links, in a constant visible band (FC-C4 limb A's prediction says so
in as many words). A raw count would **reward a candidate for culling the evidence**, so every figure
in this file is per visible link with the visible-link count printed beside it.

---

## M-C0-T2b — FC-C1's verdict: **FAILS**, and the failure is a finding about the epic

**Taken:** 2026-09-22, against `1389a402`. Unit 300 (`p6_torture_test_v1.xer`), 144 activities /
188 links. Harness `apps/web/scripts/measure-crossings.mjs`.

**The non-vacuity control passed first**, and it is independent rather than a model of the cull: at
a framing holding the whole plan, the painter drew **188 stroked link polylines against 188 edges**,
with **0** non-axis-aligned segments. It does not reproduce the cull, it removes it, so it cannot
agree with itself the way a reimplementation would.

### Whole-plan, like-for-like at 188 links on every side

| layout                         | rows | crossings |  per link |
| ------------------------------ | ---: | --------: | --------: |
| **shipped** (packed + hint)    |   27 |       492 | **2.617** |
| source order (one bar per row) |  144 |       406 | **2.160** |
| scrambled (same 27 rows)       |   27 |      1204 | **6.404** |

**FC-C1 asked for ≥ 3× between the best-known and worst-known layouts. It gets 0.83×, and in the
wrong direction.** The condition fails on its own terms and is recorded as failing.

### Which is wrong — the metric, or the condition's premise?

FC-C1 chose its two comparands because they "differ enormously on every proxy". **Every one of those
proxies measures link LENGTH** — mean `|Δlane|`, `>5-lane` links — and nothing in this epic had ever
checked that length and crossings move together.

The scramble settles it. A deterministic random assignment into **the same 27 rows** — same bars,
same links, same height, a plainly worse assignment — measures **6.404 per link, 2.45× the shipped
layout**. So the metric responds strongly to assignment quality; it is not vacuous and not broken.
What failed is the premise that a layout bad on length is bad on crossings.

**It is not, and the two are partly opposed.** Source order is the worst layout this epic has
measured on length (12.96 mean `|Δlane|`, 73 long links against the shipped 1.78 / 14) and is
**17 % better on crossings**.

### Why that is mechanically unsurprising, and why it matters

It is the epic's own §0.5 hypothesis, one compression further along. 144 rows offer 143 gutters;
27 rows offer 26; the 188 links are unchanged. Compressing the diagram concentrates corridor
traffic, and corridors that share a gutter are what cross. The same arithmetic predicts the 27 → 12
compression `#364` produces when the WBS band is on — which is exactly why CQ-C4 holds the band flip
until this is measured.

**The consequence for the epic is larger than the condition.** The product owner offered height
without limit to buy fewer crossings. Measured on their own plan, the **maximum possible spend of
height** — one bar per row, 144 rows against 27 — buys a **17 % crossing reduction**, against FC-C2's
floor of 50 % for a candidate to be worth offering at all. Assignment quality at **constant** height
moves the same number by 2.45×. On this evidence the lever is **how rows are assigned and how
corridors are chosen, not how many rows there are** — which inverts the framing the epic was opened
with, and is an argument for the router (zero height) preceding the layout rule, as already
sequenced.

### What is NOT concluded here

- **Not that the layout rule is withdrawn.** Source order is not a candidate; it is a deliberately
  bad reference. A _logic-aware_ spread (chain rows) may do what a naive one cannot, and that is
  precisely what M-C0 was to measure.
- **Not that `#364` should be reverted.** Those 13 rows paint nothing whatever the band does. The
  compression finding is about what to expect from compression, not about blank rows.
- **Not a licence to judge candidates.** FC-C1 failed, and its withdrawal clause is explicit:
  nothing else in M-C0 is judged on this metric until the condition is resolved. That resolution is
  the product owner's, because the honest options change what the epic is for.

---

## Still owed by M-C0

- **The fixture → painter bridge.** `lane-travel-probe.ts` loads Unit 300 from
  `packages/engine-conformance/fixtures/p6_torture_test_v1.xer` and builds `PackItem`s and lane
  statistics; it does **not** build `RenderActivity`/`RenderEdge`, so the real programme cannot yet
  reach `paintScene`. FC-C1 compares the shipped layout against the source-order layout **on Unit
  300**, so this bridge is a prerequisite for the verdict rather than a convenience.
- **FC-C1's verdict** — ≥ 3× discrimination, with the non-vacuity control asserted first and
  throwing. **If it fails, the metric is replaced before any candidate is measured.**
- **M-C0-T3** — the four configurations (band on/off × packed/un-packed), judging whether crossings
  per link rise as the diagram compresses 27 → 12 rows. This gates CQ-C4's flip.
- **M-C0-T3a** — does a freshly imported plan report "already arranged" band-off?
- **M-C0-T3b** — the cost of deriving the band default.
- **M-C0-T4** — the gutter sweep, in both configurations.

### A blind spot inherited deliberately, and how it is handled

`vhv-gutter-probe.ts`'s docblock records that this repository's only two exercises of the routing
path — `link-routing-bench.ts:141` and `link-routing.test.ts:31` — both paint at `originY: 0`, "the
single value at which the defect below is invisible". The crossing harness therefore sweeps pan
positions rather than measuring one, and says which it measured.
