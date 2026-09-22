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

## 2. The reading (M0-T2's first pass)

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

### 2.4 What it does not yet say

The rest of M0 is owed, and none of it is measured here: the FC-L0 vector across zooms
{1, 4, 12} × pans {32, −200, −500}; FC-L1's formal verdict; `chooseCorridorsByCrossing` measured
**on and off**, which is the epic's headline question and may find that Part C's own remedy made the
reported complaint worse; the same-lane two-point count of spec §0.3, which is the small-plan
mechanism; and the small realistic fixture with its five self-asserted properties.

**One residual blind spot in the attribution is stated rather than left to be found.** Where two bars
in one lane genuinely overlap — which `packLanes` refuses but an imported or hand-placed plan can
produce (`lane-overlap.ts` models it) — `barAt` returns the first match, so a leg crossing the
second could be attributed to the first. It cannot occur on a packed layout, which is what every
figure above was taken on, and the small fixture in M0-T4 is packed.
