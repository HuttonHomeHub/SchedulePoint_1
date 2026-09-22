# M0 — the measurements, and what reviewing the instrument found

- **Epic:** [`./feature-spec.md`](./feature-spec.md) · [`./implementation-plan.md`](./implementation-plan.md) · [`./conditions.md`](./conditions.md)
- **Status:** Approved
- **Opened:** 2026-09-22

---

## 0. A third ordering compromise, and `conditions.md` M0-T0 cannot be satisfied as written

`conditions.md` says of itself that it is **"to be committed ALONE, before any harness is edited"**,
and M0-T0 is that commit. It was not: the file landed at `41b60592` **together with**
`feature-spec.md` and `implementation-plan.md`, and was amended at `ad0d74a4` with the product
owner's four decisions before approval.

That is recorded here rather than quietly satisfied, beside the two compromises `conditions.md` §0
already admits — and it is **not** a restatement of them. §0.1 is about the instrument pre-existing
the spec and §0.2 about one reading having been taken with it; this is about the thresholds file
sharing a commit with the documents it governs, which is a different guarantee.

**What the rule protects is intact for every condition except the one already marked**: no figure in
§2 below existed when `41b60592` or `ad0d74a4` was made, and FC-L2 is the sole condition `conditions.md`
§0.2 records as pre-satisfied on the relayed floor reading. What is lost is the cleanest possible
evidence — a thresholds-only commit with nothing else in it, which is what makes the ordering
verifiable by a reader rather than assertable by its author. The rule keeps its full force for the
epic's remaining conditions, none of which has been measured yet.

---

## 1. M0-T1 — the instrument review

`countOcclusions` and `measure-occlusion.mjs` pre-date this spec, are cited by nothing, and had
produced one relayed figure (**77.1 %**). The plan listed four things to check. All four were real;
**three more were found that were not on the list, and two of those changed a number this epic is
built on.**

### 1.1 Tangency — confirmed, fixed, and MUCH smaller than the alarm around it

The old test was `a.y <= r.y1 || a.y >= r.y2` — strictly inside a bar's vertical extent. `gutterY`
expands to **exactly** the upper lane's bar bottom at every pitch (ADR-0149 D3; 55.0 against 55.0 at
`originY = 32`, lane 0), so every VHV gutter leg scored zero. Confirmed.

`tangent` is now its own column: a leg whose y sits on a bar's top or bottom edge within 0.01 px,
and no worse.

**And the measurement corrects the alarm, including the version of it I wrote into `conditions.md`
§0.2.** Band-off on Unit 300 at 4 px/day, the blind spot is worth **6 links — 3.2 percentage
points**, not the large unknown that "all 68 gutter legs score zero" implies. The reconciliation is
that a gutter leg must ALSO overlap a bar in x to be an incident, and most do not; of the 44 tangent
incidents, nearly all land on links already counted as `through` for some other leg, so they change
the link-level total hardly at all.

So **77.1 % is a floor by 3.2 pp**, and the honest ceiling is 80.3 %. `conditions.md` §0.2's two
binding rules stand — the word "floor" still travels with the number — but the rule now carries a
size, which is what makes it useful rather than merely cautious.

### 1.2 A link's own endpoint bars — the plan said "exclude by id or state the blind spot". Neither: exclude by GEOMETRY, with a control

This is the finding that changes the epic's diagnosis, and it took two attempts to get right.

A recorded polyline carries no link identity (ADR-0149 D1 records why the recorder is built that
way). But `routeOrthogonal`'s **first and last points are the source and target anchors**, each
sitting on its bar's edge by construction — so the link's own two bars are recoverable from the
polyline's ends without an id. An incident against any other bar is **foreign**, and foreign is the
avoidable set: running over your own bar is what a backward link does necessarily, and the reported
complaint is "the logic is mapping across **other** bars".

**The discriminator has a control rather than an argument.** At one bar per lane, no lane holds a
foreign bar at all, so `foreign` must read exactly **zero**. That prediction was written into the
code and into `measure-occlusion.mjs` — which throws rather than printing — **before the first run**.
It reads zero at both zooms.

**The first version of the discriminator was wrong, and the control did not catch it**, because it
was wrong in a direction the control cannot see. It attributed against `laneIntervalIndex`'s spans,
which are **merged when bars overlap OR TOUCH** (`span[0] <= last[1]`). `packLanes` puts activities
end to end in a lane, so two touching bars are one span, and a leg crossing its neighbour was
attributed to "its own bar". It reported **17 foreign incidents across 16 links**. Per **unmerged**
bar — `activityRect`, the painter's own rect source — the same run reports **267 incidents across
105 links**. A 6.6× undercount, in the direction that would have made the complaint look almost
absent.

It was not found by a failing test. It was found by asking what the merge condition was before
trusting the attribution, which is §19.11 applied to an instrument rather than to a document.

### 1.3 One paint per reading — fixed

`readBoth` painted twice. It now paints once and spreads both counters over the same recorded paths,
so the crossing figure and the occlusion figure describe the same picture by construction rather
than by the scene being deterministic.

### 1.4 One predicate — done, and it exposed a fifth finding the plan did not have

`isLaneFreeAt` was the router's only obstacle test and nothing asked the span question, which is
exactly why a horizontal leg has always been free to run through a bar. It is now the degenerate
case of `isLaneFreeBetween(index, lane, from, to)`, exported from `link-routing.ts`, and the harness
imports it.

**Then the reading came back at 100 % of links occluded at BOTH layouts, with 391 of 395 incidents
self-anchored.** The cause is that the two callers are asking different questions about the same
bars:

| question                        | asked by       | containment | why                                                       |
| ------------------------------- | -------------- | ----------- | --------------------------------------------------------- |
| _may I draw a line here?_       | the router     | **closed**  | a corridor on a bar's edge is drawn on the bar — unusable |
| _is this line hidden by a bar?_ | the instrument | **open**    | a line touching an edge hides nothing                     |

Every link's horizontal leg begins on its own bar's edge, so the closed predicate reports every link
in the plan as hidden by itself. `laneOverlapBetween` is therefore a second export beside it —
deliberately open, returning a **length** rather than a boolean, so a leg buried forty pixels inside
a bar and one grazing half a pixel are not the same reading. Both read the same
`laneIntervalIndex`, so they cannot disagree about **where a bar is**; only about whether an edge
counts, which is the caller's question and not the index's.

`grazing` reports the excluded residue rather than dropping it — 136 legs at 4 px/day — because the
size of what an exclusion removes is what justifies the exclusion.

**M2 is the consumer that makes `laneOverlapBetween` product code rather than scaffolding** (its
whole job is to make horizontal legs obstacle-checked), and the instrument is its first caller.

### 1.5 The test written for §1.4 was VACUOUS, and mutation is what said so

The first assertion for the degenerate case was
`isLaneFreeBetween(i, l, x, x) === isLaneFreeAt(i, l, x)`. `isLaneFreeAt` **delegates** to
`isLaneFreeBetween`, so it compared a function with itself and could never fail. Proven rather than
suspected: mutating the containment boundary from `< lo` to `<= lo` left all 35 cases green.

It now sweeps a literal, independently stated point rule at a 0.25 px step and pins the exact span
edges the sweep steps over. Re-mutated: **red**. A generous reader owes a control that measures a
**different** quantity (ADR-0124), and that applies to a test's control exactly as it applies to a
gate's.

The open predicate's test takes the same shape — a brute-force integration of the span union over a
0.05 px grid, compared with a tolerance, with the exact open/closed boundary cases pinned separately
where no tolerance is involved. Verified red against two named mutations (dropping either clamp);
a third (`spans[i][0] < hi` → `<= hi`) stayed green and is recorded as a **genuine no-op** — a span
beginning exactly at `hi` contributes zero length either way — rather than as an untested boundary.

---

## 2. The first reading, and the three things it corrected

`node apps/web/scripts/measure-occlusion.mjs`, at `ad0d74a4` with the working tree carrying the M0-T1
instrument fixes. Unit 300, 144 activities, 188 visible links, **WBS band OFF** (summaries rolled up
— decision 7), whole-plan framing, `originY = 32`.

| px/day | layout      | rows | x/link | through          | tangent   | inc | tinc | grazing | buried px | foreign                 |
| ------ | ----------- | ---- | ------ | ---------------- | --------- | --- | ---- | ------- | --------- | ----------------------- |
| 4      | shipped     | 21   | 1.691  | **145 (77.1 %)** | 6 (3.2 %) | 331 | 67   | 136     | 12,875    | **267 inc / 105 links** |
| 4      | one-per-row | 144  | 1.505  | 100 (53.2 %)     | 0 (0.0 %) | 111 | 6    | 278     | 730       | **0 / 0** (control)     |
| 12     | shipped     | 21   | 1.707  | 143 (76.1 %)     | 6 (3.2 %) | 310 | 67   | 139     | 37,621    | 253 inc / 99 links      |
| 12     | one-per-row | 144  | 1.521  | 98 (52.1 %)      | 0 (0.0 %) | 105 | 6    | 284     | 1,753     | 0 / 0 (control)         |

**The 77.1 % reproduces to the decimal** against the pre-spec instrument, which is the control that
matters most here: the rewrite is the old counter plus a tangent column plus an attribution, and it
did not move the figure it inherited.

### 2.1 The relayed figure was never FC-L0's metric, and the epic's headline number is 55.9 %

`conditions.md` FC-L0 defines `occl/link` as _"share of visible links with ≥ 1 horizontal segment
running through **a bar that is not its own endpoint**"_. The `through` column does not exclude a
link's own bars, so **77.1 % was never a reading of the condition's own metric** — it is the raw
column, and §0.2 adopted it as FC-L2's evidence because the attribution did not exist when it was
relayed.

Measured properly, band-off at 4 px/day, **`occl/link` = 105 / 188 = 55.9 %**.

Both verdicts hold, and neither threshold moves:

- **FC-L2 is satisfied on the correct metric**, at 5.6× its 0.10 floor rather than 7.7×. Its
  amendment already fixed the threshold before any figure existed; what changes is only which
  number stands as its evidence, and the substitution makes the condition harder to pass, not
  easier.
- **The word "floor" still travels with 77.1 %**, for the reason §1.1 gives, and with its size
  (3.2 pp). But it should be quoted less often: it is the raw column, and the epic's metric is
  55.9 %.

**This is the fourth figure this epic has had to correct, and every one moved because somebody
opened the file rather than because a test failed** — the instrument that could not see bars, the
tangency blind spot, the merged-span undercount, and now a metric quoted against the wrong
definition of itself.

### 2.2 What it says

1. **`occl/link` = 55.9 % on the shipped layout and 0 % at one bar per lane.** 105 of 188 links
   cross a bar that is not their own; give every activity its own row and, by construction, not one
   does. That is the complaint stated in the epic's own terms, and the first number this repository
   has had for it.
2. **Height IS a lever, where it was not one for crossings.** One bar per lane takes the raw
   through-column **77.1 % → 53.2 %, −31.0 %**, buried length **12,875 px → 730 px, 17.6×**, and
   `occl/link` to zero. ADR-0149 D5 withdrew the layout rule on crossings; this is a different
   quantity and it answers differently. The product owner's "as many rows as it takes" is supported
   by measurement on the quantity they were complaining about.
3. **And height alone does not make the picture clean.** At one bar per lane — the extreme, not a
   proposal — **53.2 % of links still run through a bar**, every one of them the link's own anchor
   (the control). Those are not the reported complaint, but they are legs disappearing into bars all
   the same, and only M2's obstacle check can address them. Whether they SHOULD be addressed is a
   judgement for M0-T3's picture, not for this table.
4. **It is nearly scale-invariant.** 77.1 % at 4 px/day against 76.1 % at 12 — everything in the
   picture scales with `pxPerDay` except the corridor `gap`, which is in pixels. A planner cannot
   zoom out of this defect, which is consistent with the complaint arriving about "even a simple
   plan".
5. **Crossings and occlusion are not the same quantity, again.** One-per-row improves crossings by
   11 % and occlusion by 31 %. ADR-0149 D2's finding — that length and crossings are different and
   partly opposed — has a third member now.

### 2.3 FC-L1's verdict: the prediction failed as written, its named refutation held exactly

FC-L1 predicted **`occl/link` = 0** at one bar per lane, and named its own refutation: any non-zero
case must be a link occluding **its own endpoint bar**, from an `SF` tie whose corridor is
`(from.x + to.x) / 2` or from a clamped lag anchor. Its clause then directs that the instrument be
taught to exclude a link's own two endpoint bars, and re-run, **before anything else is judged**.

That is exactly what happened, in that order:

1. The raw column read **53.2 %** at one bar per lane — not zero.
2. Every non-zero case was a link over its own bar. Nothing else is possible there: a leg's y lies
   in one lane, that lane holds one bar, and the control now proves the classification.
3. The instrument was taught to exclude them — by **geometry rather than by id**, because a recorded
   polyline carries none, and the clause offered "by id" as a method rather than as a requirement.
4. Re-run: **zero**, at both zooms.

So the **withdrawal clause did not fire** — it fires only if the non-zero cause is neither of the
two named — and the condition did the job a condition is for: it predicted, it was wrong, and it had
already written down what being wrong would mean.

**One part of its reasoning was wrong and is corrected rather than absorbed.** It attributed the
exclusion of a link's own anchor to _strict interiority_, which is a test on **y**; what actually
excluded a touching anchor in the old instrument was its strict **x** overlap (`hi <= r.x1 + EPS_X`).
That matters, because the y-based story would have predicted zero self-overlap of any kind, and the
53.2 % is precisely the self-overlaps with positive length that an x-based exclusion cannot remove.

---

## 3. M0-T2 — the FC-L0 vector, band-off, across zooms and pans

`node apps/web/scripts/measure-occlusion.mjs`, section A. Unit 300, shipped layout, WBS band off,
whole-plan framing, 188 of 188 edges attributed at every row. **mean |Δlane| = 2.670** over 188
edges — a property of the assignment, with no zoom or pan term, so it is computed once.

| zoom | pan | links | `occl/link` | `x/link` | max legs on one y | gutter legs | touching a bar | clear band / usable |
| ---- | --- | ----- | ----------- | -------- | ----------------- | ----------- | -------------- | ------------------- |
| 1    | 0   | 188   | **0.612**   | 2.069    | 13                | 70          | 60             | 10 / 9 px           |
| 1    | 32  | 188   | 0.612       | 2.069    | 13                | 70          | 60             | 10 / 9 px           |
| 1    | 200 | 188   | 0.612       | 2.069    | 13                | 70          | 60             | 10 / 9 px           |
| 1    | 500 | 188   | 0.612       | 2.069    | 13                | 70          | 60             | 10 / 9 px           |
| 4    | 0   | 188   | **0.559**   | 1.691    | 13                | 68          | 58             | 10 / 9 px           |
| 4    | 32  | 188   | 0.559       | 1.691    | 13                | 68          | 58             | 10 / 9 px           |
| 4    | 200 | 188   | 0.559       | 1.691    | 13                | 68          | 58             | 10 / 9 px           |
| 4    | 500 | 188   | 0.559       | 1.691    | 13                | 68          | 58             | 10 / 9 px           |
| 12   | 0   | 188   | **0.527**   | 1.707    | 13                | 68          | 58             | 10 / 9 px           |
| 12   | 32  | 188   | 0.527       | 1.707    | 13                | 68          | 58             | 10 / 9 px           |
| 12   | 200 | 188   | 0.527       | 1.707    | 13                | 68          | 58             | 10 / 9 px           |
| 12   | 500 | 188   | 0.527       | 1.707    | 13                | 68          | 58             | 10 / 9 px           |

Rows: **21**, reported and never scored (decision 2).

**Every column is pan-invariant and the fingerprints are not**, which is the pair of facts that makes
that worth stating: the picture genuinely moved — a different polyline digest at every pan — and none
of the four quantities moved with it. `originY` shifts every lane and every leg together, so this is
the expected answer and now an established one. **`originY = 0` is swept deliberately** rather than
avoided, because `vhv-gutter-probe.ts` records it as the single value at which a whole class of
gutter defect is invisible; it reads the same as every other pan here.

**The plan's literal pans {32, −200, −500} could not be used, and the reason is the control doing its
job.** A negative `originY` lifts the scene above the viewport's top edge and the painter culls what
is off screen; at −200 the reading is **135 attributed polylines against 188 edges**, and FC-L0's
non-vacuity control threw rather than reporting a whole-plan figure taken over two thirds of a plan.
Positive pans move the same phase through the same modulo arithmetic with every edge still drawn.

### 3.1 Two independent instruments agree to the unit

`gutterStats` reproduces M-C0-T4's figures exactly — **68 gutter legs, 58 touching a bar** at 4 and
12 px/day — from a different code path, on the recorded paths of the same paint that produced the
occlusion columns. It is written that way on purpose: `gutterReadings` selects its own scene from
`unit300BandConfigs` and pins `originY` at 32, so reading half the vector from it would be two
pictures of possibly two plans.

**`max legs on one y` = 13 at every zoom and every pan.** That is ADR-0149 D3's figure, and its
invariance is the strongest available statement of that decision's finding: `gutterY` has **no
per-link term**, so nothing a planner does — zoom, pan, pitch — separates those thirteen lines.
M1 is the milestone that supplies the term.

**The clear band is 10 px and 9 px of it is usable** (`LANE_HEIGHT − BAR_HEIGHT`, less one pixel
each side, derived from `pad` rather than written as a constant so it re-scales when M3 thins the
bar — FC-L3's amendment requires exactly that).

---

## 4. M0-T3 — the crossing pass is EXONERATED, and the same-lane mechanism is small here

`node apps/web/scripts/measure-crossing-pass.mjs`. The same scene, the same layout and the same
paint path, bundled twice: once as shipped, and once with `paint.ts:1228`'s single call to
`chooseCorridorsByCrossing` textually removed from the bundle. Two controls, both throwing — the
call must appear **exactly once** in the bundle, and the two builds must paint **different**
fingerprints.

| zoom | pass | `occl/link` | `x/link` | foreign incidents | 2-point foreign / all | buried px |
| ---- | ---- | ----------- | -------- | ----------------- | --------------------- | --------- |
| 1    | ON   | 0.612       | 2.069    | 313               | 5 / 26                | 4,201     |
| 1    | OFF  | 0.633       | 2.612    | 318               | 5 / 26                | 4,194     |
| 4    | ON   | 0.559       | 1.691    | 267               | 5 / 26                | 12,875    |
| 4    | OFF  | 0.574       | 1.957    | 268               | 5 / 26                | 12,789    |
| 12   | ON   | 0.527       | 1.707    | 253               | 2 / 26                | 37,621    |
| 12   | OFF  | 0.559       | 2.005    | 263               | 2 / 26                | 37,802    |

**Turning the pass on moves `occl/link` by −3.4 %, −2.8 % and −5.7 %.** It does not raise occlusion
at any measured zoom. So the epic's sharpest suspicion — that **Part C's own remedy is a cause of
the complaint it did not measure** — is **false, and is recorded as a negative result rather than
dropped.** FC-L4's amendment made applying M2's leg viability to this pass's candidate filter
"mandatory rather than conditional" _if the pass raised occlusion_; that trigger has not fired, so
it stays conditional, and the reason is on the page.

What the pass did was help the wrong quantity by an order of magnitude more than the right one:
**−13.6 % to −20.8 % on crossings against −2.8 % to −5.7 % on occlusion.** That is the epic's
founding diagnosis measured directly, rather than inferred from the product owner's reaction.

### 4.1 A framing finding: ADR-0149's −20.8 % is the best of three zooms, and its zoom is unstated

The OFF rows reproduce `part-c-m-c0.md` §308's pre-M-C3 band-off figures **exactly at all three
zooms — 2.612, 1.957, 2.005** — which is the control that the bundle patch really restored the old
picture rather than merely changing something.

That also locates ADR-0149 D4's headline: `2.612 → 2.069, −20.8 %` is the **1 px/day** reading. At
4 px/day the same pass is worth **−13.6 %** and at 12 px/day **−14.9 %**. Neither the ADR nor the
plan names a zoom, and D5 quotes `shipped 1.691` — the **4 px/day** figure — as "whole-plan" two
decisions later, so one document uses one word for two framings.

Nothing was fabricated and the pass is real at every zoom. But **−20.8 % is the most favourable of
three measured values, quoted without its framing**, and a reader cannot tell. Recorded here; it is
`docs/DECISIONS.md` material rather than a correction to a shipped decision, because the decision it
supported (ship the pass) holds at every zoom.

### 4.2 Spec §0.3's same-lane mechanism is real and small ON THIS PLAN

`routeOrthogonal` returns `[from, to]` before obstacles are consulted whenever the two anchors share
a y (`link-routing.ts:182`), so a two-point polyline is a link that was never routed at all. Unit 300
has **26 of them (13.8 % of links)**, of which **5 run through a foreign bar** at 1 and 4 px/day and
2 at 12.

So on a 144-activity plan the same-lane early return is a minor contributor and **the other 100 of
105 foreign-occluded links are routed links whose legs cross bars** — which is M2's subject.

**That is not evidence about the case the complaint was actually about.** The product owner's words
were _"even for a simple plan the logic is mapping across other bars"_, and a simple plan has few
lanes, so a far larger share of its links are same-lane. M0-T4's fixture exists to exhibit that, and
its self-asserted properties require at least one same-lane A→C with an intervening B **after**
`packLanes` has run.

---

## 5. M0-T3's avoidable denominator — and it disposes of the obvious remedy

`node apps/web/scripts/measure-avoidable.mjs`. FC-L4's threshold is a **fraction** of this number
and the fraction was committed before the number existed, so it is produced here, before M2 is
built.

**The reconstruction is EXACT at all three zooms**, which is what makes the denominator exact rather
than approximate. The counterfactual cannot be asked of a recording — a recorded polyline is one
line, already chosen — so the line set is rebuilt from the scene through the same four functions
`paint.ts` uses, in the same order (`lagAnchorPoints` → `routeOrthogonal` →
`chooseCorridorsByCrossing` → `bundleCorridors`), and then **checked**: an order-insensitive digest
of the model lines against the same digest of the painted ones. `ceb3d0e2773b`, `b83683b832f3`,
`79d7c8ce9dc8` — equal at every zoom. The model set **is** the picture, point for point. (The edge
layer uses no arcs, which is why that identity is available at all.)

| zoom | foreign-occluded | by candidate | by gutter | +M1 clear gutter | **any** corridor | tight VHV | **ceiling**     |
| ---- | ---------------- | ------------ | --------- | ---------------- | ---------------- | --------- | --------------- |
| 1    | 115              | 30           | 2         | 33 (28.7 %)      | 37               | 33        | **65 (56.5 %)** |
| 4    | 105              | 31           | 3         | 34 (32.4 %)      | 35               | 45        | **70 (66.7 %)** |
| 12   | 99               | 31           | 2         | 34 (34.3 %)      | 36               | 44        | **71 (71.7 %)** |

### 5.1 Three findings, and two of them contradict what this epic assumed

**1. Widening the candidate search is nearly worthless.** "Any corridor" sweeps **every x at 1 px**
across the anchors' span plus three gaps either side — far beyond ADR-0065's bounded four — and
rescues **35 links against the existing list's 31**. Four more, for an unbounded search. So the
elbow's _position_ is not the lever, and the obvious M2 design ("try more x values") is disposed of
before it was written. The reason is structural: the two legs run at `from.y` and `to.y` and both
must be clear, so the feasible x is the **intersection** of two clear runs adjacent to two different
anchors, and that intersection is usually empty.

**2. M1's clear channel is worth 3 links to M2's ceiling, not the unlock I predicted.** The
hypothesis on measuring `by gutter = 2` was that the router's own last-resort escape has never been
usable — `gutterY` expands to exactly the upper lane's bar bottom (ADR-0149 D3) — and that giving it
a clear channel would unlock it. Measured: **31 → 34**. Moving the _middle_ leg does nothing for the
two _outer_ legs, and the shipped gutter route puts its far corridor at `(from.x + to.x) / 2`, so
the leg at the target's y runs half the span and meets whatever is there.

**The prediction was written into the code before the run and is kept there, corrected, rather than
quietly replaced.** M1's case is legibility — thirteen lines on one y — and it is not an occlusion
remedy. That is a better place for it to stand than on a number that is not true.

**3. The remedy is the SHAPE of the route, and M1 is its prerequisite.** A VHV whose legs hug
**both** anchors — leave each lane immediately, travel in the clear channel, arrive — rescues **45
links on its own at 4 px/day**, more than every elbow position in existence combined. It requires a
channel a bar is never in, so it is M1's clear gutter that makes it possible. That is a far stronger
argument for M1 than the one the plan gave it, and it fixes M2's design:

> M2's new route shape is a tight VHV through M1's channel, not a wider elbow search.

### 5.2 The ceiling is ~67 %, and FC-L4's denominator is narrower than the remedy

Over both mechanisms, **70 of 105 foreign-occluded links (66.7 %) can be routed clear**. The
remaining third cannot be, by any orthogonal route in today's geometry: those links need **room**,
which is M3's subject and the product owner's "as many rows as it takes".

**FC-L4's denominator, as literally written, is 31 — and that is a problem with the condition, not
with M2, so it is recorded rather than exploited.** The condition counts "at least one x in
`routeOrthogonal`'s **existing** candidate set, or **the gutter route**", and the remedy §5.1 just
identified is a gutter route with _different_ corridors, which that wording arguably excludes.
Judged literally, M2 would have to clear **22 links** to pass — and could do so while leaving **83
of 105 links still occluded**.

So, following this file's own rule that a threshold is never moved after its measurement:

- **FC-L4 is judged as written, against 31**, and the threshold stands at 70 %.
- **70 is reported beside it as the number that matters**, and M2's write-up states its result
  against both. A milestone that passes its condition and leaves four fifths of the defect in place
  has not done its job, whatever the condition says.
- The gap is a **finding about the condition** — it was written before anyone knew which route shape
  the remedy would be — and it is on this page rather than in a quiet re-definition.

---

## 6. M0-T4 — the complaint reproduced on a seventeen-activity plan

`node apps/web/scripts/measure-small-plan.mjs`. A single-storey domestic extension, built for this
epic because the product owner's words were _"**even for a simple plan** the logic is mapping across
other bars"_ and Unit 300 is 144 activities. It is **a construction, not their plan** — nobody here
has seen their file — and its docblock says so.

**The headline is that the complaint reproduces, and slightly worse than on the big plan.** At
12 px/day, band off:

| plan                | activities | links | rows | `occl/link` |
| ------------------- | ---------- | ----- | ---- | ----------- |
| the small extension | 17         | 29    | 4    | **0.483**   |
| Unit 300            | 144        | 188   | 21   | 0.527       |

Nearly half the links on a seventeen-activity extension cross a bar that is not their own. Whatever
this epic builds has to work at this size, and a remedy tuned to a 144-activity programme would miss
the case the complaint was actually about.

### 6.1 The five properties, and the sparse control

FC-L12's rule is that the fixture's value is **logic density, not activity count**, because a sparse
fixture would pass every condition in this epic while exhibiting nothing and would then be quoted as
evidence that small plans are fine. All five are asserted **after `packLanes` has run**, not as
authored — every one is a property of the layout rather than of the network, and authoring cannot
guarantee any of them.

| property                                 | rule   | fixture | sparse control |
| ---------------------------------------- | ------ | ------- | -------------- |
| P1 links per activity                    | ≥ 1.30 | 1.71    | 0.88           |
| P2 same-lane A → C with a B between      | ≥ 1    | 5       | 0              |
| P3 links no candidate corridor can clear | ≥ 1    | 7       | 0              |
| P4 `occl/link`                           | > 0    | 0.483   | 0.200          |
| P5 max legs on one y                     | ≥ 2    | 4       | 0              |

**5/5 against 1/5**, so the properties discriminate. The harness throws in both directions — if the
fixture fails one, and if the control passes them all.

### 6.2 Two things the fixture's own measurement corrected

**The first draft had thirteen activities and the build sequence only, and `packLanes` put it in TWO
rows.** With two lanes, `crossedLanes` is empty for every link, so `routeOrthogonal` never reaches
its candidate list or its gutter route at all — P5 measured **0** and the fixture could not exhibit
two of the five things it exists to exhibit. The fix is also the realistic one: a real programme has
**long-lead procurement** running alongside the build, and that is exactly what forces extra rows
and generates the long cross-lane links. Seventeen activities, four rows.

**The sparse control was a no-op, and the control caught it.** Its filter's second clause compared
`indexOf(x)` with `indexOf(x)`, so it produced all 29 links; the control then passed all five
properties and the harness refused the fixture — correctly, and for the right reason, before it had
checked anything else. It is now written out in full rather than filtered. A control derived from
the thing it controls is how ADR-0120's A9 read 88 of 119 rows while agreeing with itself.

---

## 7. M0-T5 — the pictures, and what they show that no number did

`node apps/web/scripts/shoot-occlusion.mjs`. Painted by the real `paintScene` against a real
Chromium 2D context, with the real `resolveTsldPalette` reading the real `globals.css` tokens
through ADR-0102's canvas surface scope — **no hex literal stands in for a token**, because
ADR-0102's finding was that the painter had never once used that scope and a harness resolving its
own colours could not have found it.

1646 × 820 CSS px at DPR 1.75 (the product owner's Surface Pro), **12 px/day** — zoomed in, which is
how a planner reads logic. **The frame is measured, not chosen**: each picture is centred on the lane
carrying the most foreign-occlusion incidents and on the median x of that lane's incidents, and the
harness prints both so a reader can see what was framed rather than take it on trust. A picture of a
quiet area shows a case nobody complained about, and a mean x would frame a tight cluster with one
distant outlier onto the empty canvas between them.

| picture                                                  | rows | `occl/link` | worst lane | incidents |
| -------------------------------------------------------- | ---- | ----------- | ---------- | --------- |
| [`occlusion-unit-300.png`](./occlusion-unit-300.png)     | 21   | 0.527       | 2          | 70        |
| [`occlusion-small-plan.png`](./occlusion-small-plan.png) | 4    | 0.483       | 0          | 21        |

### 7.1 Five things the pictures show that the numbers did not

**1. A link between two bars that touch has nowhere to be drawn.** `packLanes` puts activities edge
to edge in a row, so `A100│A110│A130` on the small plan and
`A4220│A4400│A4410│A4420│A4430` on Unit 300 are continuous blue with the relationships **inside**
them. This is §0.3's same-lane mechanism, and seeing it makes clear why it is the shape a planner
notices first: the commonest relationship in any programme is "this, then that", and it is the one
the diagram draws invisibly.

**2. Short bars cannot hold their own names.** The small plan renders `A1…` and, on one bar, `…` —
nothing but an ellipsis. `LABEL_INSIDE_MIN_PX` is a **width** gate, so a three-day activity at
12 px/day has 36 px to hold a label and loses. Decision 5's name-above-the-bar is not only a NetPoint
aesthetic; it is the fix for a bar that cannot say what it is.

**3. There is a great deal of unused height, and that is the strongest evidence for decision 2.**
The small plan uses 4 of about 28 available rows; Unit 300 fills roughly 60 % of the viewport and
leaves the rest blank. The product owner's _"as many rows as it takes"_ is not a concession — the
room is already there and the product declines to use it.

**4. The summary rollups are full-width solid bars that carry no visible logic at all.** Several of
Unit 300's rows are one unbroken bar spanning the frame. They consume a row each, they are the bars
most likely to be crossed by somebody else's leg, and they are the least informative thing in the
picture.

**5. It reads as a bar chart, not a network.** That is the product owner's original comparison stated
as an observation rather than a preference, and it is what M3 is for.

### 7.2 The NetPoint reference images could NOT be committed, and that is a gap rather than a decision

M0-T5's third step is _"commit the NetPoint reference images beside them"_. **They exist only as
images pasted into the conversation; there are no file bytes to commit**, so the step cannot be
completed from here.

What stands in its place is `feature-spec.md` §0.8, which measured the reference rather than
describing it — the bar/pitch ratio, the node circles, the label placement, the routing behaviour —
and that table is what M3 is designed against. The gap is worth stating plainly because §0.8's own
argument is that M3 should be judged _"against the picture rather than against a memory of it"_, and
until those files are in the repository the picture is exactly a memory. **The product owner can drop
the two screenshots into `docs/specs/logic-legibility/` and they will be versioned beside these two.**

---

## 8. What M0 still owes

**Nothing, except §7.2's two reference images, which are the product owner's to supply.** M0-T1
through M0-T5 are complete; every figure the later milestones are judged against is on this page,
and each was taken before the milestone it governs.

**One residual blind spot in the attribution is stated rather than left to be found.** Where two bars
in one lane genuinely overlap — which `packLanes` refuses but an imported or hand-placed plan can
produce (`lane-overlap.ts` models it) — `barAt` returns the first match, so a leg crossing the
second could be attributed to the first. It cannot occur on a packed layout, which is what every
figure above was taken on, and the small fixture in M0-T4 is packed.
