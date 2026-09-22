# ADR-0151 — The row is the unit, and a constant carries its justification

- **Status:** Accepted
- **Date:** 2026-09-22
- **Milestones:** M3 and M5 landed 2026-09-22; the M6 gate pass folded four blocking findings
- **Supersedes:** nothing
- **Amends:** ADR-0026 (the row's internal layout becomes one derivation the painter, the export, the
  hit-test and the channel capacity all read); ADR-0065 (fan-out is retired with the premise that
  justified it, and its coupling assertion is deleted with the mechanism rather than relaxed);
  ADR-0052 (the lag anchor's vertical tolerance no longer derives from the bar's height)
- **Spec:** [`docs/specs/logic-legibility/`](../specs/logic-legibility/) —
  [spec](../specs/logic-legibility/feature-spec.md),
  [conditions](../specs/logic-legibility/conditions.md),
  [M3](../specs/logic-legibility/m3-the-row.md),
  [M5](../specs/logic-legibility/m5-link-ink.md),
  [M6](../specs/logic-legibility/m6-gate-pass.md)

## Context

ADR-0150 cleared every link it could clear by routing, and its M0 measurement said in advance what
the residue would be: of the links still hidden behind a bar, **4 could be rescued by a different
corridor and 13 by any orthogonal means at all.** The rest is not a routing failure. It is the third
of the problem that needs **room**, and the product owner had already said room was available —
_"I'm happy to have to pan the canvas to see clear data if it's better readable"_, and _"as many rows
as it takes."_

They also chose the treatment, from the NetPoint diagrams they supplied: **a thin bar with a node
glyph at each end, the activity's name above it, and its dates below.** That is not a restyle. An
18 px bar in a 28 px lane leaves **5 px** of pad, and a 5 px bar in a 52 px lane leaves **23.5 px** —
which is the room the links need, obtained by giving the bar back most of the row.

Reading the code to cost that found the thing this ADR is really about. **Seven constants were
literals whose entire reason for being that number was a sentence about `BAR_HEIGHT = 18`**, and
every one of those sentences inverts at a thin bar: `TAIL_HEIGHT = 6` _"thinner than the bar"_,
`BAR_RADIUS = 3` _"subtle at 18"_, `SUMMARY_TAB_H = 4` _"1 px clearance"_, `FAN_OUT_MAX_PX = 6`
_"BAR_HEIGHT/2 = 9px"_ — the last of those in **a module that did not import `BAR_HEIGHT` at all**.
The relationship existed only as prose.

And the containment property nobody had checked did not hold. A gate written before any of this was
built found that **four of seventeen cues already draw outside their lane** at today's geometry —
every one of them a cue drawn **above** the bar, where the pad is 5 px, and every one sized without
anybody checking what it had.

## Decision

### D1 — Lane containment is a gate, measured differentially

`paint.lane-containment.test.ts` paints one activity, subtracts an **empty-scene control**, and
asserts that every mark attributable to it lies inside its lane. Seventeen cases plus the hover ring.

It ships **pinning each escape exactly** rather than tolerating it, with a ratchet. The most
instructive escape is the constraint pin, which is marginal only by an arithmetic nobody chose:
`CONSTRAINT_PIN_H` lives in `paint.ts` and the bar's pad is a function of two constants in
`geometry.ts`, and they **happen to be equal** — so nothing would have reported it if they had not
been, which is exactly what the lane-overlap badge's own row shows. That badge's `lift` is correct
about the pin and was simply never asked whether there was room for the result.

### D2 — A constant is derived from `BAR_HEIGHT`, and the relationship is asserted

The seven literals become derivations, and **every one reproduces the shipped value exactly at
`BAR_HEIGHT = 18`** — which is what made that task byte-identical apart from one deliberate pixel
and therefore committable alone. `geometry.constant-derivation.test.ts` asserts **the relationship,
not the value**, so a docblock's claim and the number in the code cannot part company again. A value
re-derived without its justification written somewhere a machine reads is the same literal wearing a
different number.

`BAR_PAD` is **named for the first time**. Five sites recomputed `(LANE_HEIGHT - BAR_HEIGHT) / 2`
inline, and every cue that draws above or below a bar is asking for that number without being able to
say so — which is D1's whole finding restated as a missing constant.

`link-routing.ts` now **imports** `BAR_HEIGHT`, and that import is the fix: the next person to change
the bar's height gets a compile-time dependency where there was a comment. `ARROWHEAD_HALF_W_PX` is
deliberately **decoupled** in the other direction — ADR-0065's reason for pinning it to the fan-out
step is about the **fan**, and the fan is about the **bar**, while an arrowhead is a decoration on a
**link**; inheriting a bar-derived value would shrink every arrowhead the day the bar thins, for no
reason anybody chose.

**Three badge offsets are a fourth family the spec's table did not name**, found by measuring rather
than reading, and they are deliberately **not** pad-derived against the obvious symmetry. The rule is
worth stating because it is what stops a constant becoming illegible: **a badge's size is a
legibility choice, and the pad is a constraint it either satisfies or does not.** Conflating them
produces a badge clamped to 3 px squares with a 1 px outline, which is not a cue but a smudge that
passes a gate. **The fix is the pad, not the badge**, and all three close at the row of D3 with no
change to any of them — so D1's ratchet reaches zero and its limb is **deleted, not relaxed**.

### D3 — The row is the unit, and `rowSlots` is its one derivation

`LANE_HEIGHT` **28 → 52**, `BAR_HEIGHT` **18 → 5**. An activity is a thin bar with a node glyph at
each end, its name centred **above** and its dates at each end **below**.

`rowSlots(laneTop)` is the **one derivation** of the row's internal layout. Four things have to agree
about where the text rows are — the painter, the export, the hit-test, and the channel capacity
ADR-0150 D2 derives — and four opinions would drift in the one way nobody would ever see: a diagram
and the PNG of it, two pixels apart about where a date sits. That is ADR-0059's _"the time axis is
shared, not reimplemented"_ applied to the other axis.

**ADR-0150's own docblock predicted this and was wrong, and the prediction is corrected rather than
deleted.** `gutterChannels` said a thin bar would give _"±10 px and 7 channels, with nothing here
changed"_ — and **the band a thin bar hands back is exactly where the name and date rows now live**.
The old derivation would have claimed seven channels straight through a label. It takes the **clear**
half-band now, which knows what the row spends, and yields **five**.

### D4 — Fan-out is retired, and the node replaces it

`FAN_OUT_STEP_PX` derives to **1** at a 5 px bar, so the mechanism cannot separate anything. Its
coupling assertion with the arrowhead is **deleted with the mechanism, not relaxed** — ADR-0065's
premise is a **fanned bundle**, and with fan-out gone there is no neighbour for a head to cross,
exactly as that case's own docblock said its lifetime would end. `computeEdgeFanOut`,
`edgeFanOutFor`, `FanOutOffsets` and both constants are gone from the painter, the router, the probe
and four suites. **What that saves is stated carefully, because the obvious phrasing overclaims**:
the 5–11 ms measured at 2,000 activities / 4,000 edges is the cost the ADR-0052 M5 WeakMap memo had
already taken off a pan frame, since `scene.edges` is reference-stable across pan and zoom — so the
deletion reclaims a `WeakMap.get` per frame plus that 5–11 ms **once per edge-list change**. The M6
performance review found the un-qualified version in two docblocks, a milestone write-up, this ADR
and the register, reading in all five as a per-frame saving.

### D5 — The pointer target is the row band, not the 5 px line

`activityHitRect` inflates the drawn rect to `MIN_TARGET_PX` about its centre, and **both** hit-tests
use it. Without it, selecting any activity is a 5 px-tall target — WCAG 2.2 §2.5.8, across the whole
product, from a change to two constants.

The same question caught a **stated guarantee going false** in a file the row change does not
obviously touch: `LAG_ANCHOR_PX`'s docblock says its zone _"meets WCAG 2.5.8 outright"_, and its
vertical tolerance was `BAR_HEIGHT / 2`, justified both as "the bar the anchor sits on" **and** as
covering fan-out's spread. Both halves expired at once, and 24 × 5 is not 24 × 24. It is
`LAG_ANCHOR_VERTICAL_PX` now.

### D6 — The pitch is 52, and it is derived rather than preferred

Seven pitches × two zooms, the bundle rewritten rather than a tracked file, every variant reporting
the pitch it painted with, and two controls — one whole-sweep, one **per-pitch**, the second added
because the first only fires when every row is empty.

**Three of the seven candidates buy nothing** over their neighbours — 44 over 40, 56 over 52, 68 over
60 — same channels, same worst bunching, byte-identical crossings, so the choice is between three
numbers. **FC-L11 removes 40 and 44**: their net clear band is 3 px and 7 px against today's 10, so
the row treatment would have spent the channel it was also supposed to supply. **FC-L4's crossings
ceiling removes 60** (+13.2 % against M0's 1.691, where 52 is +9.8 %). 52 is the largest pitch that
buys anything and stays inside a committed ceiling, and it is the value the row shipped provisionally
— **nothing changes in the tree**, and it is now the right value for a reason nobody had when it was
chosen.

**60 is not rejected; it is not a milestone's to take.** It removes the last layer of the fourth
symptom the product owner reported — worst overlapping-on-one-y **2 → 1** — and FC-L4's withdrawal
clause says in terms that a breach goes to them with both numbers and both pictures.

**And the crossing metric rewards the defect, which is why the ceiling is used as a ceiling and never
as a reason to prefer a smaller pitch.** At one channel `x/link` is **1.181 — 30 % _below_ the M0
baseline** — because seven coincident legs on one y do not cross, they overlap, and `countCrossings`
cannot see a line hidden under another line. A reading that took the number at face value would ship
the bunching this epic exists to remove and report an improvement.

### D7 — Link ink is NOT made louder, because the premise was false

M5 was specified to make the link layer read as the reference's does. Measured against the shipped
row, its premise does not hold: **link ink is 58–114 % of bar ink by area**, the row change already
**tripled** the link's share by weight, and the link sits at **5.31:1** against the bar's **3.14:1**
— the link is already the louder mark. Making it louder still would make the picture noisier, not
more legible. Withdrawn and recorded as measured-and-rejected.

What the measurement **does** point at is not contrast but **continuity**: 124 of 187 links are 1 px
dashed, and a `[4, 3]` dash over a 1,500 px channel run is about 214 separate marks to follow. The
driving/non-driving cue does not depend on the dash — it is already carried by **weight**, which is
not colour, so WCAG 1.4.1 survives dropping it. FC-L8 limb 1 says a cue that goes is a
**product-owner decision, not a milestone's**, so the rendered pair is offered and nothing is
changed.

## Alternatives considered

- **Keep the 18 px bar and spend the room elsewhere.** There is nowhere else: the pad is the only
  vertical room a row has, and ADR-0150's residue is a room problem by measurement.
- **Re-derive the badge offsets from the pad too**, for symmetry. Rejected: it makes a legibility
  choice a function of a constraint, and produces a 3 px smudge that passes the gate (D2).
- **Draw the duration below the bar**, as the reference prints it and the spec said. Rejected twice
  over: it is already on screen in the name row, so a second run would be one fact drawn twice
  (ADR-0093's defect); and it could not be honestly re-derived here, because the only duration this
  layer can reach is the drawn **calendar** span while `durationDays` is a **working-day** figure.
- **Keep the bar's own outline.** A 1 px inset hairline leaves 3 px of fill in a 5 px bar and a 2 px
  dashed emphasis is a dash whose period exceeds the shape. The node carries the definition.
- **Lower ADR-0128's Fit non-vacuity floor** until it passed at the new pitch. Refused as tuning a
  threshold to the answer; the floor states the property instead.

## Consequences

- **The room exists and the links use it.** At pitch 52 the net clear band is **15 px** against
  today's 10, carrying **five channels**, with `legsTouchingABar` **0** at every pitch and a smallest
  gap to a bar edge of **13.0 px**.
- **The occlusion prediction committed before any of this was built is confirmed twice.** Thinning
  the bar does **nothing** for occlusion, because a horizontal leg runs at the bar's **centre-line**,
  so whether it meets a bar is an x-overlap question the bar's height does not enter. `occl/link` is
  constant to three decimals across seven pitches **and** three bar heights **while every fingerprint
  differs** — the discriminating form, since the routes genuinely moved and the count did not follow.
  The mechanism is read from the call order rather than inferred: channels move only **y**.
- **There is a residual the prediction does not explain, and it is attributed rather than waved
  through.** `occl/link` at 4 px/day reads 0.261 here against ADR-0150's 0.250. Measured at that tip
  in a worktree, the harness reproduces the earlier figures **exactly**, so the difference is the
  product. The attributable change is **two-point links 25 → 55**: fan-out was offsetting endpoint y
  and keeping thirty links out of `routeOrthogonal`'s same-lane branch. Within that population the
  foreign **rate** falls (20 % → 16 %) and foreign **incidents** fall (53 → 52); the per-link figure
  rises because the denominator more than doubled.
- **FC-L7's own expectation is falsified.** It calls the export "the condition most likely to bind";
  measured, the binding term is the **width**, which no pitch touches. `scaledToFit` already fired at
  12 px/day before this epic. The height cap binds at 160 lanes at pitch 28 and **86 at 52**.
- **Minimap `pxPerLane` is 5.714 at every pitch**, because that module allocates the box across
  **lanes** and a structural test bans the name `LANE_HEIGHT` from it. Where the pitch **does** land
  is the reader's window inside the box: visible lanes **24.3 → 13.1** and the rectangle's height
  **139.0 → 74.8 px** in a 120 px box. At pitch 28 the rectangle was **larger than the box** —
  degenerate, delimiting everything and therefore saying nothing.
- **The parallel listbox is unchanged**, and `TsldPanel.wbs-band-a11y.test.tsx` plus 59 render suites
  (874 cases) pass unedited — the ADR-0063 §4 form: an invariant you have to touch to make room for
  your change was never an invariant.
- **A Fit reading at 2,000 activities is no longer a reading about the whole plan**, and
  `docs/TECH_DEBT.md` #75/#261 are told so: `fitToContent` shrinks `pxPerDay`, which is the **time**
  axis, and no zoom touches the lane axis.
- **Two instruments lost coverage silently and both are fixed rather than re-baselined.** The golden
  log's canvas was a fixed 800 × 400 — eleven lanes at 28 px and **eight** at 52 — so the maximal
  scene quietly stopped exercising three glyph families and every per-method count fell. **A
  shrinking golden log reads exactly like a painter doing less work.** It derives from the lane count
  now, and the re-baseline accounts for every remaining delta exactly, edited coordinate by
  coordinate rather than run with `-u`.
- **The picture found a defect the numbers could not.** D3's own write-up claimed a planner "never
  loses an activity's identity to density"; in the rendered frame two milestones were labelled
  **`…` and nothing else**, because `truncateToWidth` returns a bare ellipsis when not even one
  character fits. The claim was asserted about the branch above it and never checked against the
  branch below. The name is suppressed now and the claim restated to what is true, with the full name
  still on the bar's option in the parallel listbox, which is where identity actually lives. Its
  regression test widens the width function rather than crowding the fixture — a milestone's box is
  14 px and `'M…'` at the 6 px-per-glyph stub is 12, so the stub structurally cannot reach the branch.
- **Six things are owed to the product owner and none is a milestone's to take** (M6 §6): where
  progress goes on a 5 px bar (built as the default — a second, shorter bar along the same line),
  criticality's second non-colour channel (see below), pitch 60 instead of 52, lane re-indexing
  (ADR-0150 D5's one qualifier), dropping the non-driving dash, and **FC-L5's paint reading**, which
  the epic's own condition required on the product owner's hardware and which **was never taken** —
  recorded as untaken rather than treated as met, because the last real fps reading was taken on the
  pre-epic painter and is a genuine number about a different picture.
- **Criticality's channel has THREE rungs, and shipping two was the gate pass's largest finding.**
  M3-T3 replaced a solid/dashed/absent bar outline with `isCritical || isNearCritical`, so critical
  and near-critical became separable by **hue alone** — on the most important distinction in the
  product, unconditionally, with the epic's own test asserting the two paint identically and a
  docblock claiming the channel survived. It is a three-value union now (filled node / heavy ring /
  hairline; solid / dashed / hairline on a milestone, where the dash returns because a 14 px diamond
  has perimeter for one and a 5 px outline has not). **And the legend was describing the retired
  cue** — a key naming a mark that is not on the canvas, which no amount of reading the painter
  would have found.
- **Three more row defects were found by the same pass** and are in M6 §1: the node glyph painting
  out an LOE bracket cap and a WBS-summary tab (the milestone branch's own rule written for one
  glyph family and not its two neighbours); the flanking dates doing **no** measurement, so a bar
  narrower than its two dates printed them over each other; and the centred name spending half its
  overhang in the previous neighbour's room, which a rendered picture showed as one garbled string.
  The date fix's first version was refused by `paint.dates-budget.test.ts` for making that gate
  vacuous — the gate was right and the rule was too blunt.
- **No new colour value exists**, so FC-L8 limb 5's three canvas traps — ADR-0102's unreachable alias,
  ADR-0100 M4's token pair that painted nothing while the contrast gate stayed green, ADR-0121's
  `fillStyle` setter that silently discards an unparseable value — do not fire. That is a structural
  argument rather than a claim to have cleared them.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
  is untouched by construction. `apps/api` contributes zero files to the diff.

## References

- ADR-0026 — the TSLD canvas: layers, coordinates, and the parallel focusable DOM a11y layer
- ADR-0052 — direct manipulation, and the lag anchor's grab zone
- ADR-0059 — the time axis is shared, not reimplemented
- ADR-0065 — orthogonal corridors, fan-out, and the arrowhead coupling
- ADR-0093 — an object action belongs on the object (one fact drawn once)
- ADR-0128 — the canvas-draw probe and its non-vacuity floor
- ADR-0150 — a leg is an obstacle, and the gutter is a channel
- `docs/specs/logic-legibility/` — spec, conditions, M3, M5
