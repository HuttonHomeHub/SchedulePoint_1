# ADR-0150 — A leg is an obstacle, and the gutter is a channel

- **Status:** Accepted
- **Date:** 2026-09-22
- **Supersedes:** nothing
- **Amends:** ADR-0065 (its obstacle check covered the vertical corridor only; its six-point
  fallback drew on a datum that ran through the bars it exists to avoid); ADR-0149 D4 (the
  crossing-aware pass is re-derived against a geometry it did not have)
- **Spec:** [`docs/specs/logic-legibility/`](../specs/logic-legibility/) —
  [spec](../specs/logic-legibility/feature-spec.md),
  [conditions](../specs/logic-legibility/conditions.md),
  [M0](../specs/logic-legibility/m0-measurement.md),
  [M1](../specs/logic-legibility/m1-gutter-channels.md),
  [M2](../specs/logic-legibility/m2-leg-obstacles.md),
  [M4](../specs/logic-legibility/m4-travel-and-assignment.md),
  [M6](../specs/logic-legibility/m6-gate-pass.md)

## Context

ADR-0149 shipped a crossing-aware corridor chooser, measured **−20.8 % crossings per link at zero
vertical cost**, and closed. The product owner then used the release and reported the same
complaint again, in different words: **"the logic is still difficult to read. even for a simple
plan the logic is mapping across other bars."**

That sentence is the finding, and it is worth stating before any decision. The previous epic
measured a quantity, improved it by a fifth, shipped, and **the quantity was not the complaint**.
Both facts hold at once: crossings genuinely fell, and a link vanishing behind a bar is a different
defect that no crossing count can see. Four symptoms were put back to the product owner and they
settled that **all four bite** — lines disappear behind bars, lines cross, lines travel too far,
and lines bunch onto one y — and that **height is spendable**: _"as many rows as it takes."_

Reading the code for the first symptom found that it was not a tuning problem at all.
`routeOrthogonal` applied its obstacle check to the **vertical corridor only**, and only across the
lanes strictly between the two endpoints. The two **horizontal legs** — which run at the source and
target bars' centre-lines — were checked against nothing. Links paint under bars, so a leg through a
bar sharing its lane does not overlap it: it **disappears behind it**, which is the reported
symptom exactly.

And the router's last structured escape ran through the same obstacles. Its VHV fallback drew its
horizontal leg at `screenYOfLane(L + 1) − pad`, which **is** `laneTop + pad + barHeight` — the
upper lane's bar **bottom**, exactly. Measured on the product owner's own fixture: **58 of Unit
300's 68 gutter legs lay inside a painted bar, at 0.0 px clearance.**

## Decision

### D1 — The gutter datum is the lane boundary, not a bar's edge

`routeOrthogonal`'s six-point fallback draws its horizontal leg at the **centre of the clear band**
between two lanes. The old value was not approximately wrong; it was the bar bottom to the pixel, so
every gutter leg was drawn along an obstacle.

**Measured: `legsTouchingABar` 58 of 68 → 0, at zero crossing cost** — `x/link` is **1.691,
unchanged to three decimals**, with the channel pass of D2 disabled at its call site. The two halves
of M1 cost different things and the split is measured rather than apportioned.

### D2 — A gutter carries channels, and its capacity is derived

`packGutterChannels` spreads a frame's gutter runs across channels so that two runs sharing a gutter
sit at different y **where they overlap in x**. It runs **after** `bundleCorridors`, because a
gutter run's x-extent is set by the two verticals either side of it and bundling moves verticals;
packing earlier would assign channels against x values that then change, which is ADR-0090's
recorded oscillation with a third subject.

Capacity is `gutterChannels(...)` — **derived from the row's own clear band**, never a constant. At
the 28/18 geometry this epic inherited it yields 3; at the 52/5 row ADR-0151 ships it yields **5**,
with no edit. That derivation is what stopped the row milestone having to rebuild this pass.

**It costs +11.4 % crossings**, and the mechanism is structural rather than a bug to sequence away:
`chooseCorridorsByCrossing` optimises against the pre-channel geometry and the channel pass then
moves legs it had already placed. The two are mutually ordered — the channel pass needs final x, the
crossing pass changes x. The cost is stated rather than folded into a milestone total, and FC-L4's
ceiling was **not moved** to accommodate it.

### D3 — A horizontal leg is an obstacle test, and the anchors are parameters

`routeOrthogonal` replaces `free(x)` with `viable(x)`: the crossed lanes clear **and both legs clear
in their own lanes**, consulted by **both** early returns. The candidate list, its order and its
bound are unchanged, so a route with no obstacle in reach is byte-identical.

**The anchors come in as parameters, and that is the load-bearing detail.** A leg begins on its
anchor's edge, so a plain interval test reports every link in the plan as blocked by itself — and
`laneIntervalIndex` cannot supply the anchor's identity, because it merges spans that overlap **or
touch** and `packLanes` puts activities end to end. The painter passes the two rects it already has
cached; `isLegClear` splits the leg at those edges and tests only the parts outside, which is exact
**through the merge**, since a touching neighbour is a different bar and its share still blocks.

**Measured: `occl/link` 0.559 → 0.250 at 4 px/day; 105 foreign-occluded links → 47.** Against
FC-L4's literal denominator that is 187 %, against the ceiling M0 also measured it is 82.9 %, and
both are reported because `m0-measurement.md` recorded that the condition's own denominator is
narrower than the remedy. Crossings land at **+8.8 % against the M0 baseline**, inside FC-L4's 10 %
ceiling **including M1's share** — which M1's own write-up had said could not be assumed.

### D4 — The crossing-aware pass is NOT extended to the leg term, on measurement

ADR-0149 D4's pass moves an elbow up to `± 8 × gap` from its anchor on a crossings-only score and
checks bars in the crossed lanes only, so it could move a corridor to an x whose legs run through a
bar — spending D3's gain immediately after D3 produced it. The concern was specific and reasonable,
so it was **built and measured** rather than argued.

Adding the leg term to that pass's filter is a **wash on occlusion** — and worse at the middle zoom
(0.250 → 0.255 at 4 px/day) — while crossings rise at all three zooms, taking 4 px/day to **+11.1 %
and back outside FC-L4's ceiling**. Withdrawn, and the reason it costs nothing is written into the
pass itself: `routeOrthogonal` has already chosen an elbow whose legs are clear, and this pass only
moves off it for a strictly better crossing count.

### D5 — Lane assignment is measured on a vector, and three of four rules are rejected again

ADR-0149 D5 rejected three assignment rules **on crossings alone**, which left open the reading that
the crossing metric was the wrong question for them. It was not. Judged on the three components
FC-L6 names — occlusion per link, crossings per link, mean `|Δlane|` — **chain rows is worse than
shipped on every one** (+2.0 %, +87.1 %, +88.4 %) for seven extra rows, and it is the NetPoint
reference's own shape.

FC-L6's amendment required the chain-rows reading to be **decomposed**, because a measurement framed
only by its favourable hypothesis would find it: H1 says a chain on one row needs no traversal, H2
says a chain on one row crowds that row and every link _out_ of it then has a leg in a crowded lane.
**Both are true and they cancel.**

The finding nobody was looking for is the stronger result: **the shipped packer already does what
chain rows does.** Both put exactly 68 of 188 links in one row. That looked like a classifier that
could not see the candidate, so the split was re-derived a second way — one classifier reads the
**drawn polyline**, the other reads the **layout** — and the two share no code and agree exactly on
all five candidates. The mechanism is ADR-0069's predecessor hint, which already places a successor
in its predecessor's lane whenever that lane is free. An explicit longest-chain decomposition finds
no more same-row links than the greedy hint already finds.

**One candidate qualifies and is NOT built here: lane re-indexing** — travel **−24.5 %**, long links
(> 5 lanes) **30 → 19**, at **zero height cost** and +4.1 % occlusion / +3.2 % crossings, both inside
FC-L6's tolerance. It is a **relabelling**, not a packing rule, which is why its same-row bucket is
identical to shipped's to the occluded link, and why the row count cannot move (asserted as a
control, not quoted as an argument). FC-L6 says a qualifier is **offered**, so it goes to the product
owner with `assignment-shipped.png` beside `assignment-lane-re-indexing.png`.

## Alternatives considered

- **Tune the crossing pass further.** Rejected by D4's measurement: the one extension that looked
  free costs crossings at every zoom and buys no occlusion.
- **Route around bars diagonally.** Rejected by ADR-0065's standing argument — on a time-scaled
  diagram x _is_ time, so a diagonal asserts work across the days it crosses.
- **Spend height on lane assignment instead.** Measured; three of four rules are worse than shipped
  and the fourth costs no height at all, so height was not the lever here either (D5).
- **Move FC-L4's crossings ceiling after M1 breached it.** Explicitly refused. The condition was
  written expecting the datum fix to be free, it was not, and the gap is recorded as a finding about
  the condition rather than negotiated away — which is what let M2 be judged honestly against the
  same number.

## Consequences

- **A link no longer disappears behind a bar**, which was the reported complaint. 58 links cleared at
  4 px/day, and the residue is what M0 predicted: of the 47 still foreign-occluded, only **4** could
  be rescued by a different corridor and **13** by any orthogonal means at all. The rest is the third
  of the problem that needs **room**, which is ADR-0151's subject.
- **The router now has three passes with a mutual ordering**, and that ordering is a property of the
  code rather than a convention: `routeOrthogonal` → `chooseCorridorsByCrossing` (moves corridor
  **x**) → `packGutterChannels` (moves only **y**), `paint.ts:1206-1271`. It is also what makes
  ADR-0151's occlusion prediction structural rather than lucky — channels can change crossings and
  are **structurally unable** to change leg-versus-bar occlusion.
- **Three instruments were wrong before the product was**, each recorded where it happened. The M0
  harness identified a gutter leg by the **old datum**, so the moment D1 landed it reported
  `0 gutter legs, 0 touching a bar` — a blind spot wearing a triumph's clothes. It is structural now
  (the middle segment of a six-point route, the same one the channel pass uses) and it **throws** if
  a scene paints six-point routes and yields no gutter leg.
- **The whole-scene golden log passed unedited, and that is not evidence.** Probed by moving the
  gutter leg **1000 px** it still passes, so its scene contains no VHV route at all. Its green says
  this epic touched nothing else; it says nothing about this epic. Worth knowing before anybody cites
  that suite about routing.
- **The browser journey does not gate the datum, and its docblock says so.** Four assertions deep,
  `e2e-arrange/gutter-channel.spec.ts` stays green against a deliberately reverted datum, by
  arithmetic: a channelled leg can land **2 px** from where the old datum put it. Its three earlier
  versions each claimed more and were each wrong in a way only a red run exposed, the last confound
  being a bar's own **1,575 px outline**. What the journey does establish is what only a browser can
  — that the real product, against a real API with the pen enforced, reaches this code, takes the
  fallback, and paints a line. The datum is gated where it **can** be: an independently derived
  inequality at five origins, verified red by exactly `pad` at every one.
- **The reconstruction control fired twice and was right both times.** `measure-avoidable.mjs` proves
  its model line set is byte-identical to the painted one before reporting a denominator; after D3 it
  reported DIVERGENT with the foreign-occluded **counts matching exactly** (76/76, 47/47, 43/43)
  while the fingerprints differed, because the model pipeline was missing the channel pass. A control
  that compared counts would have passed and the denominator would have been computed from a line set
  that was not the picture.
- **FC-L3's second limb is a question about the wrong quantity**, and is reported both ways
  permanently rather than softened. Its literal bound fails at every pitch because a channel
  legitimately carries many runs that do not overlap in x — which is what packing by x-interval is
  _for_ — while the overlapping count meets it exactly.
- **`packLanes` is untouched**, so ADR-0069's shared package keeps one objective and the interchange
  caller is unaffected. If lane re-indexing is chosen it lands as **one optional parameter** and a
  post-pass, so the byte-identity argument stays structural.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
  is untouched by construction. `database-architect` is not engaged because there is no schema change
  to design — recorded so that "the agent was not run" cannot read as an oversight.

- **The M6 gate pass found nothing blocking in this decision's half of the epic.** Four specialist
  reviews over the combined diff returned four blocking findings and **all four are the row**
  (ADR-0151); the routing work came through clean, with the performance review confirming
  independently that `laneIntervalIndex` is built from the culled set, that `isLegClear` is reached
  per routed edge, and that `packGutterChannels` runs over the frame's already-routed corridors — so
  the "bounded by the viewport, not the plan" claim is checked rather than asserted. Two of its
  instruments were corrected: `measure-crossing-pass.mjs` cited three line numbers that had moved
  ~300 lines during the epic and pointed at `arrowhead()`, and `ARROWHEAD_HALF_W_PX`'s only
  justification named a constant this epic deleted.

## References

- ADR-0065 — canvas link routing: orthogonal corridors that step around bars
- ADR-0069 — a shared lane-layout package, and packing an imported programme
- ADR-0090 — the oscillation an ordering-dependent pass produces
- ADR-0149 — a corridor is chosen for what it crosses, and height was never the currency
- ADR-0151 — the row is the unit, and a constant carries its justification
- `docs/specs/logic-legibility/` — spec, conditions, M0, M1, M2, M4
