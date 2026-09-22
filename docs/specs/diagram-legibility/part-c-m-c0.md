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

### Resolved 2026-09-22 — the comparands are replaced, the metric is kept

Put to the product owner with all three readings and three options — re-calibrate on the scramble,
replace the metric outright per the literal withdrawal clause, or lower the bar to 2× keeping both
comparands. They chose **re-calibrate**.

FC-C1 is amended in `part-c-conditions.md` (the amendment is dated, and deletes nothing): the pair
becomes **shipped vs the same-height scramble**, and the threshold moves 3× → 2×. Measured
**2.45× — PASSES**. `measure-crossings.mjs` judges on that pair and prints the original one as
evidence, because `shipped 2.617 / source order 2.160` is the reading that re-aimed M-C4 and
deleting it would remove the grounds for that decision.

**The threshold did move after its measurement**, which is the one thing that file exists to
prevent, and it is recorded as such rather than presented as unchanged. What makes it defensible is
that the comparand change is what the failure argues for, and 2.45× clears the original bar's
_purpose_ — an instrument that cannot separate a good assignment from a random one at identical
height is broken — while missing its number.

**And the epic's direction changed with it.** On the same evidence the product owner re-aimed M-C4
from "spend rows" to **logic-aware assignment at whatever height that needs**: height becomes an
output of the rule rather than its input. The no-ceiling decision stands; nothing is spent on height
for its own sake.

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

## M-C0-T3 — CQ-C4's held flip: **the band default stays OFF**

**Taken:** 2026-09-22, against `3d193bdc`. Unit 300, 144 activities / 188 links.
Harness `apps/web/scripts/measure-band-compression.mjs`.

`part-c-conditions.md` holds the WBS band's derived default until this reports, because the premise
of turning the band on is that a shorter diagram is a better one and nobody had measured it.

### Five configurations, not the four the plan names

The plan asks for band on/off × packed/un-packed. Those four answer the **decision** and cannot
answer the **mechanism**, because band-on differs from band-off in two ways at once: it compresses
the rows **and** it stops painting 18 summary bars, which are obstacles the router steers around
(ADR-0065 M2). The fifth isolates it, and it is not a contrivance — it is **the shipped behaviour
before `#364`**: band on, lanes packed for the band-off scene, so the summaries' rows are still
reserved and paint nothing.

### The control, checked first and throwing

Three things, because a figure from a culled framing or a dropped link population would look exactly
like a finding:

- **every configuration carries all 188 links.** Band on removes 18 summary bars, and
  `paint.ts:1206-1207` silently drops an edge whose endpoint is not in the scene — so if a summary
  were a dependency endpoint the band-on readings would carry a smaller population and the
  comparison would be against a different plan. ADR-0038 says a summary never is one; this asserts
  it.
- **the painter was handed the declared bar count.** Without this, a filter that silently failed to
  apply would report band-on and band-off as identical, which is exactly what a genuine null result
  looks like — and the null result below is precisely what was measured, so the control is the only
  thing separating the two readings.
- **no segment is non-axis-aligned** (ADR-0065).

### Whole-plan readings — 188 links on every row

| configuration                   | band | arrangement         | rows | bars | px/d | crossings | per link |
| ------------------------------- | ---- | ------------------- | ---: | ---: | ---: | --------: | -------: |
| A band off · as imported        | off  | source order        |  144 |  144 |    1 |       406 |    2.160 |
| A band off · as imported        | off  | source order        |  144 |  144 |    4 |       366 |    1.947 |
| A band off · as imported        | off  | source order        |  144 |  144 |   12 |       380 |    2.021 |
| **B band off · arranged**       | off  | packed (all bars)   |   27 |  144 |    1 |       492 |    2.617 |
| **B band off · arranged**       | off  | packed (all bars)   |   27 |  144 |    4 |       418 |    2.223 |
| **B band off · arranged**       | off  | packed (all bars)   |   27 |  144 |   12 |       430 |    2.287 |
| C band on · as imported         | on   | source order        |  144 |  126 |    1 |       406 |    2.160 |
| C band on · as imported         | on   | source order        |  144 |  126 |    4 |       366 |    1.947 |
| C band on · as imported         | on   | source order        |  144 |  126 |   12 |       380 |    2.021 |
| E band on · arranged pre-`#364` | on   | packed (all bars)   |   27 |  126 |    1 |       492 |    2.617 |
| E band on · arranged pre-`#364` | on   | packed (all bars)   |   27 |  126 |    4 |       418 |    2.223 |
| E band on · arranged pre-`#364` | on   | packed (all bars)   |   27 |  126 |   12 |       430 |    2.287 |
| **D band on · arranged**        | on   | packed (scene bars) |   12 |  126 |    1 |       548 |    2.915 |
| **D band on · arranged**        | on   | packed (scene bars) |   12 |  126 |    4 |       467 |    2.484 |
| **D band on · arranged**        | on   | packed (scene bars) |   12 |  126 |   12 |       477 |    2.537 |

**An independent agreement worth noting:** A and B at 1 px/day read 2.160 and 2.617, which are
M-C0-T2b's whole-plan source-order and shipped figures to the decimal. Two runners written a day
apart, sharing the metric and nothing else about their framing, land on the same numbers.

### The verdict

| comparison                              | 1 px/d      | 4 px/d      | 12 px/d     |
| --------------------------------------- | ----------- | ----------- | ----------- |
| **B → D**, the flip a planner meets     | **+11.4 %** | **+11.7 %** | **+10.9 %** |
| **E → D**, compression and nothing else | **+11.4 %** | **+11.7 %** | **+10.9 %** |

**Crossings per link rise at 3 of 3 zooms.** Per CQ-C4's withdrawal clause, **the band default
stays off**, the dock still offers the press, and this is filed. It is **not** an argument for
reverting `#364` — those 13 rows paint nothing whatever the band does, and D is a better picture
than E in every respect except this one.

### The two comparisons are identical because the band moves no line at all

They agree to the decimal, and that is a consequence rather than a coincidence. **B and E
fingerprint identically at all three zooms** — the routed polylines are byte-for-byte the same with
and without the 18 summary bars — so the only difference the band makes to the lines is the row
count, and the decision comparison and the mechanism comparison are the same measurement.

That is a claim about the **router**, so it carries its own discriminator: painting with
`scene.linkRouting` **off** (the pre-ADR-0065 route) fingerprints **differently** at every zoom, so
the obstacle-aware branch is the one being measured. Without that reading, "the summary bars move no
line" and "this harness lost obstacle awareness" are indistinguishable.

**Why, measured rather than reasoned.** `routeOrthogonal` returns today's elbow unexamined when the
endpoints are within one lane of each other (`link-routing.ts:191-193`), and an obstacle only
differs between band on and band off in a lane holding nothing but band-drawn summaries:

| configuration | rows | summary-only lanes | spanning links | …crossing a summary-only lane |
| ------------- | ---: | -----------------: | -------------: | ----------------------------: |
| A / C         |  144 |                 18 |     130 of 188 |                         **0** |
| B / E         |   27 |                 13 |      73 of 188 |                         **3** |
| D             |   12 |                  6 |      70 of 188 |                         **0** |

**Three links out of 188** even span one of the rows the band empties, and for those three the
corridor the router picks is clear either way. The obstacle sets genuinely differ — 27 occupied
lanes against 14, 84 merged spans against 66 — and almost nothing consults the part that differs.

### What this says about the epic, beyond CQ-C4

It is M-C0-T2b's finding at a second compression ratio, in the same direction and at a smaller
magnitude. Across the three zooms measured here, 144 → 27 rows costs **+13 % to +21 %** crossings
per link (2.160→2.617, 1.947→2.223, 2.021→2.287) and 27 → 12 costs **+11 % to +12 %**. Height and
crossings move together, and **the epic's own remedy runs the wrong way** — every row `Arrange`
saves is paid for in crossings.

The per-zoom spread is worth keeping rather than averaging away: the effect is largest at 1 px/day,
where the programme is a narrow column and corridors are forced together horizontally, and smallest
at the two zooms a planner actually works at. It is present at all three, which is what makes it a
finding rather than an artefact of one framing.

It also puts a number on something the epic had assumed: **the router's obstacle awareness is
nearly inert on this programme**. 115 of 188 links are between lanes one apart or the same, so they
never reach the obstacle test at all; only 73 can, and only 3 of those can see the rows this
experiment varies. A crossing-aware router (M-C3) that extends the same machinery inherits that
reach unless it is deliberately widened — which is a design input for M-C3 rather than a defect, and
is exactly the kind of assumption the sequencing decision (router before layout rule) exists to test
cheaply.

### What is NOT concluded here

- **Not that the band is bad.** The band is a legibility feature about reading the programme's
  structure, and this measures one thing. It says the default should not flip **on this limb**; the
  press stays offered and a planner who wants it still gets it.
- **Not that `#364` was wrong.** Its 13 blank rows are strictly worse than D's 12 real ones: E draws
  the _same_ picture as B, with the same lines, in 27 rows instead of 12.
- **Not a licence to judge candidates.** FC-C1 is still unresolved, and its withdrawal clause binds
  the _candidate_ readings. This one is a diagnosis of the shipped product against a fixed metric,
  which is why it could be taken now.

---

## M-C0-T3a — does a freshly imported plan report "already arranged"?

**Answered 2026-09-22 as a code reading plus one property test, and labelled as such** — it is
**not** an end-to-end measurement, and the difference matters (ADR-0139 records exactly this
mislabelling being corrected).

### The question survived the withdrawal, with a different consequence

T3a was owed because M-C2's derived default keyed on `computeArrangeChanges()` being empty. That
default is withdrawn (M-C0-T3), but the **same predicate** decides whether the dock's "Arrange now"
offer appears at all (`TsldPanel.tsx:2213-2219`, and `:2226-2228` announces _"Lanes are already
arranged; nothing to move."_ on an empty result). So the question stands and its failure mode
inverts: the risk is no longer a band flipping on, it is **offering a planner a press that
reshuffles a diagram the importer had already laid out correctly**.

### The two derivations agree, and here is what was read to establish it

Band off, `deriveWbsBandSource` returns `sceneActivities` **by identity**
(`wbs-band-source.ts:63`), so `computeLaneArrangement` packs the same set the importer packed. Both
call the same `packLanes`. The day arithmetic differs in form and not in value:

|        | importer (ADR-0069 phase 3)                 | canvas                              |
| ------ | ------------------------------------------- | ----------------------------------- |
| source | `interchange.service.ts:1073-1085`          | `arrange-lanes.ts:68-80`            |
| offset | `Math.round(earlyStart.getTime() / DAY_MS)` | `daysBetween(dataDate, earlyStart)` |
| origin | the epoch                                   | the plan's data date                |

`early_start` / `early_finish` are `@db.Date` (`schema.prisma:1205-1206`), so Prisma hands the
importer a UTC midnight and the rounding is exact; the DTO serialises through `formatCalendarDate`
(`activity-response.dto.ts:443`, `:494`), so the canvas sees `YYYY-MM-DD` and `daysBetween`
(`working-time.ts:21-25`) is exact too. The two origins differ by a constant, and `packLanes` only
ever compares offsets to one another — which the importer's own comment says in as many words.

**One divergence is real and is named rather than dismissed:** the importer **skips** an activity
whose `earlyFinish` is null (`interchange.service.ts:1074-1075`), where the canvas substitutes
`earlyStart` (`arrange-lanes.ts:74`). The canvas's item set is therefore a superset, and an extra
item occupies a lane, so the two packings would differ. After a successful import it should be
empty — phase 2 recalculates and a phase-2 failure hard-deletes the plan — but the importer's guard
exists because its author did not want to rely on that, and neither does this.

### The load-bearing half is now a property test, because nothing had asserted it

All of the above is worth nothing unless **`packLanes` is idempotent**: the canvas re-runs it over
the importer's own output, so if a second pass moved anything, every healthy import would offer the
press. Nothing in this repository asserted that, in `packages/layout` or anywhere else.

`packages/layout/src/pack-lanes.spec.ts` now does, over three shapes including the predecessor hint,
each with a control that the **first** pass really moved something — because a case where nothing
moved twice proves nothing. **Verified red** against emitting a row for every item rather than only
the ones that move.

### What follows for the product owner's decision 8 ("offer Arrange after an import")

**On a healthy import the offer is correctly silent**, because ADR-0069 phase 3 has already packed
the plan. It fires when phase 3 **did not run or failed** — which that ADR permits by design, since
"a layout failure means a correct plan arranged badly, which one press of Auto-arrange fixes".

So the decision buys a **safety net, not a routine post-import prompt**, and that is worth saying
plainly because the two read the same in a plan and completely differently on screen. The direct
consequence for M-C2: its journey must drive **both** cases — an import where the offer is absent,
and one where it is present — or it proves nothing either way. A journey that only imports a healthy
file would pass against a strip that can never render, which is ADR-0081's defect with a green test
on top of it.

### What is NOT established here

- **Not measured end to end.** No import was run and no browser rendered the dock. What settles it
  is `apps/web/e2e-arrange/` at M-C2, with the phase-3-prevented case as its negative control.
- **Not that the null-`earlyFinish` case is unreachable** — only that it should be after a
  successful import, which is a claim about the engine rather than about either packer.

---

## Still owed by M-C0

- ~~**The fixture → painter bridge.**~~ **Built** (`sceneFor`, `1389a402`), and kept here because
  the reason it was owed is the reason it is worth knowing it exists: `lane-travel-probe.ts` loads Unit 300 from
  `packages/engine-conformance/fixtures/p6_torture_test_v1.xer` and builds `PackItem`s and lane
  statistics; it does **not** build `RenderActivity`/`RenderEdge`, so the real programme cannot yet
  reach `paintScene`. FC-C1 compares the shipped layout against the source-order layout **on Unit
  300**, so this bridge is a prerequisite for the verdict rather than a convenience.
- ~~**FC-C1's verdict**~~ — **taken, and it FAILED** (above). Its withdrawal clause is in force:
  no candidate is judged on this metric until the product owner has resolved it.
- ~~**M-C0-T3a** — does a freshly imported plan report "already arranged" band-off?~~ **Answered
  above as a reading plus a property test**; the end-to-end half is M-C2's journey, named there.
- ~~**M-C0-T3b** — the cost of deriving the band default.~~ **Withdrawn**: M-C0-T3 withdrew the
  derived default, so there is nothing to cost. Recorded rather than dropped — if the default is
  ever revisited, this and FC-C8's three limbs come back with it.
- **M-C0-T4** — the gutter sweep, in both configurations.

### A blind spot inherited deliberately, and how it is handled

`vhv-gutter-probe.ts`'s docblock records that this repository's only two exercises of the routing
path — `link-routing-bench.ts:141` and `link-routing.test.ts:31` — both paint at `originY: 0`, "the
single value at which the defect below is invisible". The crossing harness therefore sweeps pan
positions rather than measuring one, and says which it measured.
