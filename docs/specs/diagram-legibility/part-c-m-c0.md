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
