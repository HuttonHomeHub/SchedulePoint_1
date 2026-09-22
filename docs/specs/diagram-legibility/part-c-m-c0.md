# Part C — M-C0 measurements

- **Conditions:** [`./part-c-conditions.md`](./part-c-conditions.md) (committed alone at `0c48f5f3`,
  before any harness file existed)
- **Status:** Approved
- **Harness:** `apps/web/scripts/crossing-probe.ts`
- **These figures describe the painter as it was BEFORE M-C3.** That milestone's crossing-aware
  corridor pass changes the lines deliberately (whole-plan crossings per link 2.612 → 2.069 on the
  shipped layout), so re-running any harness here against a later tree will not reproduce the
  numbers below — and should not. M-C0's job was to measure the state the epic was opened on.

---

## Correction 2026-09-22 — the summary rollup, and what it changed

**Every figure in this file was first taken with a `WBS_SUMMARY` sitting at day 0 carrying its own
stored duration — zero on this fixture, so eighteen invisible points at the plan start.** The engine
derives a summary's span from its children (`compute.ts:545`, ADR-0035 §24: earliest early-start to
latest early-finish over its direct children, deepest-first, a summary's own duration being always
zero), and the canvas packs the dates the engine wrote. So the first readings described a plan
SchedulePoint does not produce.

**It was found by looking at a rendered picture**, which is the method this epic exists to apply,
after every number here had already been taken. `layout-shipped.png` showed eighteen tiny squares
stacked at the left margin where a programme's phase bars should be.

`unit300Asap` gains `rollUpSummaries`, **default off** — not because off is right, but because
silently changing a shared derivation is how a recorded measurement stops describing what produced
it (`vhv-gutter-probe.ts`'s own rule). Every Part C runner opts in explicitly; Part A's figures and
`docs/TECH_DEBT.md` #364's were taken without it.

### What it changed, in full

| claim                                  | first taken |    corrected | effect                           |
| -------------------------------------- | ----------: | -----------: | -------------------------------- |
| shipped layout's drawn extent          |    27 lanes | **21 lanes** | **`#364`'s headline, see below** |
| shipped whole-plan crossings per link  |       2.617 |    **2.612** | negligible                       |
| scramble per link (FC-C1's comparand)  |       6.404 |    **7.085** | FC-C1 **2.45× → 2.71×**, passes  |
| B → D compression penalty (4 px/d)     |     +11.7 % |  **+26.9 %** | T3's verdict **strengthened**    |
| VHV routes on Unit 300                 |          35 |       **69** | T4's finding **strengthened**    |
| gutter legs sharing one y              |          11 |       **13** | T4's finding **strengthened**    |
| gutter legs inside a painted bar       |     31 / 34 |  **58 / 68** | T4's finding **strengthened**    |
| **"the 18 summary bars move no line"** |        true |    **FALSE** | **refuted — see T3 below**       |

**Every headline conclusion survived or strengthened, and exactly one sub-finding was refuted.**
That is recorded as prominently as the findings themselves, because a measurement that only ever
confirms its author is not a measurement.

### It puts a number in `docs/TECH_DEBT.md` #364 in question, and that is named rather than buried

`#364` records "13 of 27 lanes held nothing but band-drawn summaries … 420 px of blank rows", and
`cheap-levers.md` Finding 1 is the same measurement. Both came from **this harness family**
(`measure-lane-travel.mjs` + `lane-travel-probe.ts`), so they are not independent of the defect
above. Re-taken with the rollup, the same fixture reports **4 summary-only lanes of 21 — 112 px**.

Two things follow, and neither is "`#364` was wrong to ship". The change it made is right either
way: band on, the drawn extent falls to 12 lanes and the blank rows go. What is in question is only
**how much** that was worth on this fixture. And settling it properly needs a measurement against a
real plan in the product rather than another harness reading, because this harness's ASAP pass is
itself an approximation of the engine (whole days, no calendars). Filed rather than fixed here.

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
| **shipped** (packed + hint)    |   21 |       491 | **2.612** |
| source order (one bar per row) |  144 |       406 | **2.160** |
| scrambled (same 21 rows)       |   21 |      1332 | **7.085** |

**FC-C1 asked for ≥ 3× between the best-known and worst-known layouts. It gets 0.83×, and in the
wrong direction.** The condition fails on its own terms and is recorded as failing.

### Which is wrong — the metric, or the condition's premise?

FC-C1 chose its two comparands because they "differ enormously on every proxy". **Every one of those
proxies measures link LENGTH** — mean `|Δlane|`, `>5-lane` links — and nothing in this epic had ever
checked that length and crossings move together.

The scramble settles it. A deterministic random assignment into **the same 21 rows** — same bars,
same links, same height, a plainly worse assignment — measures **7.085 per link, 2.71× the shipped
layout**. So the metric responds strongly to assignment quality; it is not vacuous and not broken.
What failed is the premise that a layout bad on length is bad on crossings.

**It is not, and the two are partly opposed.** Source order is the worst layout this epic has
measured on length (12.96 mean `|Δlane|`, 73 long links against the shipped 1.78 / 14) and is
**17 % better on crossings**.

### Why that is mechanically unsurprising, and why it matters

It is the epic's own §0.5 hypothesis, one compression further along. 144 rows offer 143 gutters;
21 rows offer 20; the 188 links are unchanged. Compressing the diagram concentrates corridor
traffic, and corridors that share a gutter are what cross. The same arithmetic predicts the 21 → 12
compression `#364` produces when the WBS band is on — which is exactly why CQ-C4 holds the band flip
until this is measured.

**The consequence for the epic is larger than the condition.** The product owner offered height
without limit to buy fewer crossings. Measured on their own plan, the **maximum possible spend of
height** — one bar per row, 144 rows against 21 — buys a **17 % crossing reduction**, against FC-C2's
floor of 50 % for a candidate to be worth offering at all. Assignment quality at **constant** height
moves the same number by 2.71×. On this evidence the lever is **how rows are assigned and how
corridors are chosen, not how many rows there are** — which inverts the framing the epic was opened
with, and is an argument for the router (zero height) preceding the layout rule, as already
sequenced.

### Resolved 2026-09-22 — the comparands are replaced, the metric is kept

Put to the product owner with all three readings and three options — re-calibrate on the scramble,
replace the metric outright per the literal withdrawal clause, or lower the bar to 2× keeping both
comparands. They chose **re-calibrate**.

FC-C1 is amended in `part-c-conditions.md` (the amendment is dated, and deletes nothing): the pair
becomes **shipped vs the same-height scramble**, and the threshold moves 3× → 2×. Measured
**2.71× — PASSES** (2.45× as first measured; see the correction section). `measure-crossings.mjs`
judges on that pair and prints the original one as evidence, because
`shipped 2.612 / source order 2.160` is the reading that re-aimed M-C4 and deleting it would remove
the grounds for that decision.

**The threshold did move after its measurement**, which is the one thing that file exists to
prevent, and it is recorded as such rather than presented as unchanged. What makes it defensible is
that the comparand change is what the failure argues for, and 2.71× clears the original bar's
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
| **B band off · arranged**       | off  | packed (all bars)   |   21 |  144 |    1 |       491 |    2.612 |
| **B band off · arranged**       | off  | packed (all bars)   |   21 |  144 |    4 |       368 |    1.957 |
| **B band off · arranged**       | off  | packed (all bars)   |   21 |  144 |   12 |       377 |    2.005 |
| C band on · as imported         | on   | source order        |  144 |  126 |    1 |       406 |    2.160 |
| C band on · as imported         | on   | source order        |  144 |  126 |    4 |       366 |    1.947 |
| C band on · as imported         | on   | source order        |  144 |  126 |   12 |       380 |    2.021 |
| E band on · arranged pre-`#364` | on   | packed (all bars)   |   21 |  126 |    1 |       476 |    2.532 |
| E band on · arranged pre-`#364` | on   | packed (all bars)   |   21 |  126 |    4 |       382 |    2.032 |
| E band on · arranged pre-`#364` | on   | packed (all bars)   |   21 |  126 |   12 |       391 |    2.080 |
| **D band on · arranged**        | on   | packed (scene bars) |   12 |  126 |    1 |       548 |    2.915 |
| **D band on · arranged**        | on   | packed (scene bars) |   12 |  126 |    4 |       467 |    2.484 |
| **D band on · arranged**        | on   | packed (scene bars) |   12 |  126 |   12 |       477 |    2.537 |

**An agreement worth noting, with its limit stated:** A and B at 1 px/day read 2.160 and 2.612,
which are M-C0-T2b's whole-plan source-order and shipped figures to the decimal. Two runners,
sharing the metric and nothing else about their framing, land on the same numbers — which checks the
framing and the attribution. It is **not** independent of the scene, because both build it from the
same `unit300Asap`; the summary defect above is exactly the failure that agreement cannot see.

### The verdict

| comparison                                    | 1 px/d      | 4 px/d      | 12 px/d     |
| --------------------------------------------- | ----------- | ----------- | ----------- |
| **B → D** (21 → 12), the flip a planner meets | **+11.6 %** | **+26.9 %** | **+26.5 %** |
| **E → D** (21 → 12), same bars, same links    | **+15.1 %** | **+22.3 %** | **+22.0 %** |

**Crossings per link rise at 3 of 3 zooms.** Per CQ-C4's withdrawal clause, **the band default
stays off**, the dock still offers the press, and this is filed. It is **not** an argument for
reverting `#364` — those 13 rows paint nothing whatever the band does, and D is a better picture
than E in every respect except this one.

### ~~The two comparisons are identical because the band moves no line at all~~ — **REFUTED**

**This section first said the routed polylines were byte-for-byte identical with and without the 18
summary bars, and that was an artefact of the summary defect above.** With summaries at day 0 they
were zero-width points that obstructed nothing; rolled up they are wide phase bars, and **B and E
now fingerprint differently at every zoom** — the summary bars move lines.

The claim is left standing in strikethrough rather than deleted, because how it was reached is the
useful part: it was measured correctly, with a discriminator that ruled out the obvious alternative
(painting with `scene.linkRouting` **off** fingerprints differently, so the obstacle-aware branch
really was the one under test), and it was still wrong — because **the discriminator tested the
instrument's routing and not its scene**. A control that proves the right code ran says nothing
about whether it ran on the right data.

**What the corrected reading says.** `routeOrthogonal` returns today's elbow unexamined when the
endpoints are within one lane of each other (`link-routing.ts:191-193`), so only a spanning link can
consult an obstacle, and an obstacle differs between band on and band off only in a lane holding
nothing but band-drawn summaries:

| configuration | rows | summary-only lanes | spanning links | …crossing a summary-only lane |
| ------------- | ---: | -----------------: | -------------: | ----------------------------: |
| A / C         |  144 |                 18 |     130 of 188 |                         **0** |
| B / E         |   21 |                  4 |      88 of 188 |                        **43** |
| D             |   12 |                  6 |      70 of 188 |                         **0** |

**43 of 88 spanning links** cross one of the rows the band empties — where the first reading found
three — which is why the two comparisons above now differ from each other, and why B → D is no
longer purely a statement about height.

### What this says about the epic, beyond CQ-C4

It is M-C0-T2b's finding at a second compression ratio, in the same direction and at a smaller
magnitude. Across the three zooms measured here, 144 → 21 rows costs **+0.5 % to +21 %** crossings
per link (2.160→2.612, 1.947→1.957, 2.021→2.005 — so a **rise at 1 px/day and essentially nothing at
the two working zooms**), and 21 → 12 costs **+11.6 % to +26.9 %**. Height and crossings move
together at the compressions that matter, and **the epic's own remedy runs the wrong way** — every
row `Arrange` saves is paid for in crossings.

**The 144 → 21 figure is weaker than the first reading made it look, and that is stated rather than
left to a reader comparing tables.** At 4 and 12 px/day the difference between 144 rows and 21 is
within half a per cent — so "spending the maximum possible height buys 17 %" is a statement about
the **1 px/day** framing, and at the zooms a planner works at it buys close to nothing at all. That
makes the case against spending height for its own sake stronger, not weaker.

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
- **Not that `#364` was wrong.** Its blank rows are strictly worse than D's 12 real ones, and
  removing them is right whatever the count. What the correction section puts in question is only
  **how many** there are on this fixture — 4 of 21 under the rollup, against the 13 of 27 that row
  records.
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

## M-C0-T4 — FC-C3: **the gutter is not the term**, and no pitch can make it one

**Taken:** 2026-09-22, against `1e17f266`. Unit 300, band off, lanes arranged — the configuration a
planner meets. Harness `apps/web/scripts/measure-gutter-pitch.mjs` +
`apps/web/scripts/gutter-pitch-bench.ts`.

FC-C3 asks for a pitch at which "two runs through one gutter read as two lines, clear of both bar
edges", **judged on a rendered image at 1646**. Both halves were measured before any pitch was
rendered, and both are **unachievable by changing the pitch** — not marginal, not
fixture-dependent: identical at every pitch swept.

### How the pitch was varied without touching a tracked file

`LANE_HEIGHT` is a module constant with 37 call sites. The obvious sweep — patch `geometry.ts`,
build, restore — leaves a tracked file modified for the length of the run behind a `finally` a crash
can skip. Instead the **bundle** is rewritten: esbuild emits `var LANE_HEIGHT = 28;` as a real
binding and references it rather than inlining it (checked, not assumed), so one substitution in a
temp file moves every call site. The substitution asserts **exactly one** match, and both the
arithmetic sweep and the browser render **report back the pitch they actually painted with** — so a
substitution that silently failed appears as a reading at the wrong pitch, never as three plausible
identical numbers.

### The readings

| pitch | gutter | px/d | links | VHV | gutter legs | distinct y | most on one y | legs inside a bar | min clearance |
| ----: | -----: | ---: | ----: | --: | ----------: | ---------: | ------------: | ----------------: | ------------: |
|    28 |  10 px |    4 |   188 |  69 |          68 |         12 |        **13** |            **58** |    **0.0 px** |
|    28 |  10 px |   12 |   188 |  69 |          68 |         12 |        **13** |            **58** |    **0.0 px** |
|    36 |  18 px |    4 |   188 |  69 |          68 |         12 |        **13** |            **58** |    **0.0 px** |
|    36 |  18 px |   12 |   188 |  69 |          68 |         12 |        **13** |            **58** |    **0.0 px** |
|    44 |  26 px |    4 |   188 |  69 |          68 |         12 |        **13** |            **58** |    **0.0 px** |
|    44 |  26 px |   12 |   188 |  69 |          68 |         12 |        **13** |            **58** |    **0.0 px** |

A gutter leg is identified by the painter's **own** definition rather than by a band — a horizontal
segment whose offset within its lane is exactly `pad + barHeight`, which is
`routeOrthogonal`'s `gutterY` (`link-routing.ts:225-228`). Anything looser would count a 4-point
route's first or last leg, which runs at a bar's centre and is not in a gutter at all. Clearance is
measured against **`activityRect`** — the one existing source of a bar's geometry, the same one
`laneIntervalIndex` reads — never against the routing formula, which would make the answer a
restatement of the expression rather than a measurement of the picture.

### First half — two runs through one gutter never read as two lines

**13 of the 68 gutter legs are drawn at a single y**, and widening the gutter from 10 px to 26 px
changes that number by nothing. It cannot: the leg's y is
`(gutterLane + 1) * laneHeight - (laneHeight - barHeight) / 2`, which has **no per-link term at any
pitch**. Eleven lines at one y are eleven lines drawn on top of each other however tall the gutter
is, and `bundleCorridors` cannot help — it bundles **vertical** segments (`a.x === b.x`,
`link-routing.ts:315`) and never touches a horizontal leg.

### Second half — the leg is never clear of a bar edge, by construction

`gutterY` expands to **exactly the bottom edge of the upper lane's bar**: `pad` is
`(laneHeight − barHeight) / 2` at both ends, so the difference cancels to zero at every pitch. The
measurement agrees and goes further — **58 of 68 legs lie _within_ a painted bar's vertical
extent**, not merely tangent to one, with a smallest gap of **0.0 px** at 28, 36 and 44.

### The pictures, which are what FC-C3 actually asks to be judged on

`gutter-pitch-28.png` / `-36.png` / `-44.png` — 1646 CSS px, DPR 1.75, painted by the real
`paintScene` against a real Chromium 2D context, with the real `resolveTsldPalette` reading the real
`globals.css` tokens through ADR-0102's canvas surface scope. No hex literal stands in for a token
and nothing reconstructs the routing pipeline. The frame is centred on the **busiest** gutter,
measured rather than chosen, because a picture of a quiet one shows a case nobody was complaining
about.

They say it plainly: at 44 the rows are much further apart, the extra space is **empty**, and every
horizontal run still lies along a bar row exactly as it did at 28. One qualification, because the
picture invites an over-reading: most of the long horizontals visible are a 4-point route's first
and last legs, which run at a bar's **centre** and are pinned there by the endpoints — they are not
gutter legs and no gutter can hold them. The gutter legs are the 34 counted above.

### Verdict, and the withdrawal clause

**FC-C3's withdrawal clause fires as written**: no candidate pitch shows two distinguishable runs,
so **the pitch stays at 28** and the gutter is recorded as **not the term**. The condition names that
outcome as itself a finding — "it would mean the complaint is entirely row assignment and corridor
choice" — and that is now measured rather than supposed.

**The epic's own sequencing already accounts for it.** M-C1 was the gutter; it is withdrawn. What
remains is the router (M-C3, zero height) and the re-aimed layout rule (M-C4, logic-aware assignment
at constant height), which is exactly where M-C0-T2b's 2.71× lives. Three independent measurements
now point the same way: height does not buy legibility, **assignment and corridor choice do**.

### What is NOT concluded here

- **Not that the gutter should be narrowed.** Nothing measured says 10 px is too much; it says a
  wider one is not spent on the problem. Changing it in either direction is a separate decision with
  no evidence behind it.
- **Not that the VHV fallback is wrong.** It puts a line where a bar cannot be, which is what it was
  built for (ADR-0064 M2). What is wrong is that thirteen of them choose the same line.
- **Not that this exonerates the router.** It is an argument that the remedy belongs in **how a
  corridor is chosen**, which is M-C3's subject — including, now, distributing legs within a gutter
  rather than stacking them.

---

## The pictures (CQ-C1)

The product owner reserved the layout choice for themselves on the **numbers and the pictures**, per
their own instruction, and a reader who has seen 2.612, 2.160 and 7.085 still has no idea what any
of them looks like. `apps/web/scripts/shoot-layouts.mjs` paints all three — same viewport, same
zoom, same framing, lane 0 at the top, so the lane assignment is the only variable:

| picture                   | layout                   | rows | whole-plan crossings per link |
| ------------------------- | ------------------------ | ---: | ----------------------------: |
| `layout-shipped.png`      | what ships today         |   21 |                     **2.612** |
| `layout-source-order.png` | as imported, one per row |  144 |                     **2.160** |
| `layout-scrambled.png`    | seeded scramble, 21 rows |   21 |                     **7.085** |

1646 CSS px × 820 at DPR 1.75, 4 px/day — Unit 300's whole 391-day span, the framing the product
owner's own screenshots show. Painted by the real `paintScene` against a real Chromium 2D context
with the real `resolveTsldPalette` reading the real `globals.css` tokens through ADR-0102's canvas
surface scope.

**The scramble is there to calibrate the eye, not as a candidate.** It is what 2.71× worse looks
like, and without it "2.612 crossings per link" is a number with no scale attached.

**What these are not.** They are the three layouts M-C0 **measured**; they are not the three
candidates CQ-C1 chooses between, because those do not exist yet — M-C4 is unbuilt and has been
re-aimed at logic-aware assignment. What they give the product owner now is the **baseline** picture
every later candidate will be judged against, and a calibrated sense of what the metric's numbers
mean.

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
- ~~**M-C0-T4** — the gutter sweep, in both configurations.~~ **Taken** (above): FC-C3 fails at
  every pitch and the gutter is recorded as **not the term**. Swept on the shipped band-off arranged
  configuration only. That was first justified by M-C0-T3's "the band moves no line" reading, which
  the correction section **refutes** — so the honest justification is the weaker one that survives:
  the mechanism is `gutterY` having no per-link term, which is a property of `routeOrthogonal` and
  not of a configuration, and the band-on configuration has strictly fewer bars and the same links.
  Re-sweeping band-on would be cheap and is **not** claimed to have been done.

### A blind spot inherited deliberately, and how it is handled

`vhv-gutter-probe.ts`'s docblock records that this repository's only two exercises of the routing
path — `link-routing-bench.ts:141` and `link-routing.test.ts:31` — both paint at `originY: 0`, "the
single value at which the defect below is invisible". The crossing harness therefore sweeps pan
positions rather than measuring one, and says which it measured.
