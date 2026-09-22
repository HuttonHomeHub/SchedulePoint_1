# M3 — the row

- **Epic:** [`./feature-spec.md`](./feature-spec.md) · [`./implementation-plan.md`](./implementation-plan.md) · [`./conditions.md`](./conditions.md)
- **Prior milestones:** [`./m0-measurement.md`](./m0-measurement.md) · [`./m1-gutter-channels.md`](./m1-gutter-channels.md) · [`./m2-leg-obstacles.md`](./m2-leg-obstacles.md)
- **Status:** Approved

---

## T1 — FC-6 as a gate, and what it reported

### What the gate is

`paint.lane-containment.test.ts` asserts FC-6 directly: _every glyph family and every decoration
draws within `[screenYOfLane(L), screenYOfLane(L + 1))`._ Seventeen cases — a plain bar, a critical
one, a near-critical one, a progressed one, a milestone, an LOE bracket, a WBS summary, a
constraint pin, a conflict badge, a lane-overlap badge, that badge lifted above a pin, an
over-allocation badge, a feasible window, a primary and a secondary selection ring, a hover ring,
a baseline ghost — plus the fan-out anchors, which are offsets rather than marks and are asserted
from `computeEdgeFanOut` instead.

It exists because the invariant existed only as **four docblocks**, each stating a clearance in
terms of `BAR_HEIGHT = 18`: the summary tab's 1 px, the float tail being _"thinner than the bar"_,
the LOE cap's ±3 overhang, the bar radius being _"subtle at 18"_. Not one of them was checked, and
all four are functions of a geometry this milestone is about to change — so the milestone that
changed it would have been the first thing to find out whether they were ever true.

### How it measures — a difference, not a reading

A painted frame is mostly chrome: the ruler, three tiers of gridline, the non-working wash, the
month bands, the today and data-date verticals, the lane hairlines. All of it legitimately spans
the canvas and none of it belongs to a lane, so a gate that read the frame would be reading noise.

Each case therefore paints a scene holding **exactly one activity** and subtracts the ink of the
same scene holding **none**. The subtraction is exact because the lane-hairline layer is derived
from the viewport rather than from the activities (`paint.ts:1031`) — and `chromeIsASubset`
asserts that rather than assuming it, because a control that is not a control turns every other
case into a reading of noise.

`test-support/ink-extents.ts` is the recorder. It is a second recording context beside
`recording-ctx.ts`, and the reason is that they answer different questions: that one asks _"did
these two paints do the same thing?"_ and compares an ordered log of calls, which structurally
cannot answer _"how tall is what was drawn"_ — the ink a `stroke()` lays down depends on the
`lineWidth` assigned some lines earlier and on the path built before it. So this one keeps the
state the log merely records.

**`roundRect` and `arcTo` are present on it and absent from `mockCtx`, deliberately.** Every
rounded bar, ring and elbow in the painter is guarded on those two being callable, so a context
without them measures the square fallback — the branch that never ships (ADR-0103 records a whole
suite that could only ever reach the fallback).

**Text is the one approximation and it is deliberately generous.** jsdom has no font metrics, so a
glyph box is derived from the `px` in the assigned font and the assigned `textBaseline`, with
ascent and descent at the loose end. A box that is too tall reports a containment failure a real
browser might not — loud, and cheap to tighten. A box that is too short is the failure ADR-0110 D5
is about.

### Three defects in the gate itself, and only one instrument could see them

The gate is a measuring instrument, and the first version of it measured the wrong thing three
times. Each is recorded because two of the three were **green**.

1. **Two cases set a misspelled scene field** — `remainingFloatDays` for `remainingFloat`, and a
   `Set` where `selectedIds` takes a `readonly string[]`. Both passed every containment assertion,
   because both drew a bare bar and a bare bar is contained. `tsc` is the only thing in the
   repository that could see it; the positive-count limb (_"it drew something"_) could not,
   because every case draws something.
2. **The feasible-window case never turned its toggle on.** `floatTails` is not in the default
   view block, so the case named for the window measured a bar.
3. **The hover ring is drawn by a different painter.** `scene.hoverId` drives the incident-link
   highlight; the ring itself lives in `paintInteractionLayer` (`paint.ts:2283`), so the case was
   measuring `paintScene` for something `paintScene` does not draw.

The fix is one limb: a case named for a decoration must lay down ink that **differs from a plain
bar's**. Not a larger count — a critical bar, a near-critical one and a milestone each draw the
same number of marks as a plain bar, so a count comparison rejects three correct cases. Comparing
the extents themselves is the quantity this file is about anyway.

That limb then reported something worth knowing: **a critical bar's geometry is identical to a
plain bar's, to the pixel.** The emphasis outline is heavier, but the painter strokes an _inset_
rect (`paint.ts:845`) so the stroke sits inside the bar and the extents coincide. Criticality is
carried entirely by fill and dash. The two cases are marked `geometryMatchesPlainBar` rather than
the limb being relaxed for everything — which matters at M5, where the ink changes.

The hover ring is now measured against the painter that draws it. The **rest** of that layer is
deliberately out of FC-6's scope and the reason is stated rather than left as a gap: drag ghosts,
the marquee and the cursor chip are in-flight gesture feedback that follows the pointer, so
leaving a lane is what they are for. The hover ring is the one decoration _on a bar_ in there.

### Verified red, twice, in opposite directions

| mutation                                                                    | result                                                                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `BAR_HEIGHT` 18 → 26 (a deliberately-too-tall bar, the plan's own red case) | **9 failures**, five of them cases that are green today: the LOE bracket, the WBS summary tab, both selection rings and the hover ring |
| the lane-overlap badge moved to `barTop + 1` (i.e. **fixed**)               | **2 failures** — the two cases that record it escaping                                                                                 |

The second is the one worth having. It proves the escape list below is a **ratchet in both
directions**: a fifth escape fails, and so does a fix, because a case that stops escaping no longer
matches its recorded list and has to be promoted to `[]` deliberately rather than drifting into
compliance unnoticed.

### The finding: FC-6 does not hold today

Four of the seventeen draw outside their lane, and the gate ships pinning each escape **exactly**
rather than tolerating it. Every one is a cue drawn **above** the bar, where a 28 px lane holding
an 18 px bar leaves 5 px, and each was sized without anybody checking what it had.

| case                                      | escapes            | by                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| constraint pin                            | `stroke -0.5..5.5` | the filled triangle tops out **exactly** at the lane boundary — `barTop - CONSTRAINT_PIN_H` with `CONSTRAINT_PIN_H = 5` against a pad of `(28 - 18) / 2 = 5` — so the outlined variant's 1 px stroke puts half a pixel in the lane above |
| lane-overlap badge                        | `-3..2`, `-1..4`   | `barTop - s - off - 1` = 8 px above the bar top, 3 px above the lane                                                                                                                                                                     |
| lane-overlap badge above a constraint pin | `-9..-4`, `-7..-2` | the `lift` that stacks it clear of the pin puts the **whole badge** in the lane above — not one pixel of it in its own lane                                                                                                              |
| over-allocation badge                     | `-4..3`, `-2..3`   | `baseY = barTop - 2` with a tallest mini-bar of 7 reaches 9 px above the bar top                                                                                                                                                         |

The constraint pin's case is the most instructive. It is marginal only by an arithmetic nobody
chose: `CONSTRAINT_PIN_H` lives in `paint.ts` and the bar's pad is a function of two constants in
`geometry.ts`, and they happen to be equal. Nothing coupled them, so nothing would have reported it
if they had not been — which is what the last row shows, since the lift is correct about the pin
and was simply never asked whether there was room for the result.

### What this means for M3-T2

The spec's constant table lists six values justified by `BAR_HEIGHT = 18`. These three badge
offsets are **three more in the same family that the table did not name**, found by measuring
rather than by reading. They differ from the six in one way that matters: the six get _tighter_ at
a thin bar and these get _looser_, because a thinner bar means a larger pad and the badges sit in
the pad. So they are expected to self-resolve at M3-T3's geometry — **if** the offsets are
re-derived from the pad rather than left as absolutes. Left as absolutes they would pass by luck,
which is the same condition they are in today.

The ratchet limb reaches zero at M3-T3 and is **deleted, not relaxed**.

---

## T2 — the constants re-derived, each with its justification asserted

### What shipped

Seven constants were literals whose entire reason for being that number was a **sentence about
`BAR_HEIGHT = 18`**, and every one of those sentences inverts at a NetPoint-thin bar.

| constant             | was                            | now                                         | at 18 | at 5 |
| -------------------- | ------------------------------ | ------------------------------------------- | ----- | ---- |
| `TAIL_HEIGHT`        | `6` — _"thinner than the bar"_ | `round(BAR_HEIGHT / 3)`                     | 6     | 2    |
| `BAR_RADIUS`         | `3` — _"subtle at 18"_         | `round(BAR_HEIGHT / 6)`                     | 3     | 1    |
| `GLYPH_CAP_OVERHANG` | `3`                            | `min(BAR_PAD - 1, round(BAR_HEIGHT / 6))`   | 3     | 1    |
| `SUMMARY_TAB_H`      | `4` — _"1 px clearance"_       | `min(BAR_PAD - 1, round(BAR_HEIGHT / 4.5))` | 4     | 1    |
| `PROGRESS_BAND_H`    | `4`                            | `round(BAR_HEIGHT / 4.5)`                   | 4     | 1    |
| `FAN_OUT_STEP_PX`    | `3`                            | `round(BAR_HEIGHT / 6)`                     | 3     | 1    |
| `FAN_OUT_MAX_PX`     | `6` — _"BAR_HEIGHT/2 = 9px"_   | `round(BAR_HEIGHT / 3)`                     | 6     | 2    |

**Every derivation reproduces the shipped value exactly at `BAR_HEIGHT = 18`**, which is what makes
this task byte-identical apart from one deliberate pixel (below) and therefore committable alone.

`BAR_PAD` is named for the first time. Five sites recomputed `(LANE_HEIGHT - BAR_HEIGHT) / 2`
inline, and **every cue that draws above or below a bar is asking for that number without being
able to say so** — which is the whole of T1's finding restated as a missing constant.

`geometry.constant-derivation.test.ts` asserts **the relationship, not the value**, so the claim in
each docblock and the number in the code cannot part company again. A value re-derived without its
justification written somewhere a machine reads is the same literal wearing a different number.

### The fan-out pair is the one the compiler could not see

`link-routing.ts` justified `FAN_OUT_MAX_PX = 6` by _"BAR_HEIGHT/2 = 9px"_ **in a module that did
not import `BAR_HEIGHT` at all**. The relationship existed only as a sentence. It now imports it,
and that import is the fix — the next person to change the bar's height gets a compile-time
dependency where there was a comment. Verified red: putting the step back to a literal `3` with the
bar at 5 fails the relationship case, which is the defect in its exact shipped shape (a step of 3
against a half-height of 2.5, before the cap is even consulted).

`ARROWHEAD_HALF_W_PX` is **decoupled** from `FAN_OUT_STEP_PX` and becomes its own `3`. ADR-0065's
reason for pinning them was real — widening the barbs past the fan-out step pushes each head across
its neighbour in a fanned bundle — but that reason is about the **fan**, and the fan is about the
**bar**. An arrowhead is a decoration on a _link_, so inheriting a bar-derived value would shrink
every arrowhead the day the bar thins, for no reason anybody chose. The constraint is preserved as
an assertion; the derivation is not.

### `labelPlacement` gains a required height term

`LABEL_INSIDE_MIN_PX` is a **width** gate with no height term, so the function returned `'inside'`
for any bar wide enough regardless of whether the line fitted vertically — correct at 18, and at a
thin bar an 11 px line painted outside a 5 px bar. `barHeight` is a **required parameter** rather
than a module-level comparison, for the ADR-0070 reason: the compiler enforces that a milestone
thinning the bar cannot leave it unconsidered. Every call site had to state it, which is the point.

### One deliberate pixel, and one escape closed

`CONSTRAINT_PIN_H` becomes `min(5, BAR_PAD - 1)` = **4** at today's geometry, so the pin's top edge
moves down one pixel and **T1's constraint-pin escape closes**. The ratchet went 4 → 3 and its own
limb reported it, which is what the ratchet is for.

The golden log changed by **exactly seven lines**, all of them `152` → `153` on the pin's two
horizontal vertices, in a snapshot where **nothing else uses y = 152 at all**. Re-baselined by
editing those coordinates rather than by running `-u`, per ADR-0034's golden strategy.

### The three remaining escapes do NOT close by derivation, and that is a decision

The lane-overlap badge and the over-allocation histogram were **not** pad-derived, against the
obvious symmetry, and the rule is worth stating because it is what stops a constant becoming
illegible: **a badge's size is a legibility choice, and the pad is a constraint it either satisfies
or does not.** Conflating the two produces a badge clamped to 3 px squares with a 1 px outline,
which is not a cue — it is a smudge that passes a gate.

Two 5 px squares offset by 2 need 7 px above the bar; a 28 px lane holding an 18 px bar has 5. **The
fix is the pad, not the badge**, and M3-T3's row leaves ~19 px. Both stay pinned until it does.

### A forward check that changed an assertion before T3 met it

Running the derivations at the target geometry — not as a mutation to keep, but as a question —
reported `BAR_PAD 11.5`, `TAIL_HEIGHT 2`, `BAR_RADIUS 1`, `FAN_OUT_STEP_PX 1`, `FAN_OUT_MAX_PX 2`,
and **one failing assertion**: the arrowhead's, because the head stays 3 while the step derives to 1.

That is not a defect in either constant. It is ADR-0065's premise expiring exactly where spec D10
says it does — with fan-out retired in favour of the node glyph, there is no fanned bundle and the
constraint has no subject. So the case carries its own lifetime in its docblock: **deleted with
fan-out at M3-T3, not relaxed.** Until then it is exactly tight, 3 against 3, which is what makes it
a test of the relationship rather than of slack.

---

## T3 — the row

### What shipped

`LANE_HEIGHT` **28 → 52** (provisional — M3-T4's sweep sets the final value) and `BAR_HEIGHT`
**18 → 5**. An activity is now a thin bar with a **node glyph at each end**, its **name centred
above** and its **dates at each end below** — the reference the product owner chose.

`rowSlots(laneTop)` is the **one derivation** of the row's internal layout (`barY`, `nameY`,
`belowY`, `clearHalfBandPx`). Four things have to agree about where the text rows are — the
painter, the export, the hit-test and the channel capacity M1 derives — and four opinions would
drift in the one way nobody would ever see: a diagram and the PNG of it, two pixels apart about
where a date sits. That is ADR-0059's "the time axis is shared, not reimplemented" applied to the
other axis.

### Fan-out is retired, and the node replaces it

Spec D10, and M3-T2's forward check had already established it would have to be: `FAN_OUT_STEP_PX`
derives to 1 at a 5 px bar and `ARROWHEAD_HALF_W_PX` stays 3, so the coupling assertion fails. That
is not a defect in either constant — ADR-0065's premise is a **fanned bundle**, and with fan-out
gone there is no neighbour for a head to cross. The assertion was **deleted with the mechanism, not
relaxed**, exactly as its own docblock said it would be.

`computeEdgeFanOut`, `edgeFanOutFor`, `FanOutOffsets` and both constants are gone from the painter,
the router, the probe and four suites. It takes a per-frame memoised pass off the draw path that
was measured at **5–11 ms alone** at 2,000 activities / 4,000 edges.

### M1's own docblock predicted seven channels, and T3 falsified it

`gutterChannels` took `(laneHeight, barHeight)` and its docblock said a NetPoint-thin bar would
give _"±10 px and 7 channels, with nothing here changed"_. **The band a thin bar hands back is
exactly where the row's name and date rows now live.** The old derivation would have claimed seven
channels straight through a label.

It takes the **clear** half-band now — `rowSlots().clearHalfBandPx`, which knows what the row
spends. The prediction is corrected in the test rather than deleted, because an epic that measures
its own claims should keep the one it got wrong.

### The pointer target is the row band, not the 5 px line

`activityHitRect` inflates the drawn rect to `MIN_TARGET_PX` (24) about its centre; **both**
hit-tests use it. Without it, selecting any activity is a 5 px-tall target — WCAG 2.2 §2.5.8, across
the whole product, from a change to two constants in `geometry.ts`.

The same question caught a stated guarantee going false in a file the row change does not obviously
touch: `LAG_ANCHOR_PX`'s docblock says its zone _"meets WCAG 2.5.8 outright"_, and its vertical
tolerance was `BAR_HEIGHT / 2` — justified as "the bar the anchor sits on" **and** as covering
fan-out's spread. Both halves expired at once, and 24 × 5 is not 24 × 24. It is
`LAG_ANCHOR_VERTICAL_PX = LAG_ANCHOR_PX` now.

### FC-6's ratchet reaches zero

All three remaining escapes — the lane-overlap badge, that badge lifted above a constraint pin, the
over-allocation histogram — **close with no change to any of them**, because the row's 23.5 px pad
holds what a 5 px pad could not. That is M3-T2's recorded prediction landing: their sizes are
legibility choices and the pad was the constraint. The ratchet limb is deleted, not relaxed.

### Three decisions taken while building, each against the plan

1. **The duration is NOT drawn below the bar**, though the reference prints it and the spec says
   "dates and duration below". It is already on screen — `activityBarLabel` composes
   `{code} {name} · {n}d` into the name row — so a second run would be one fact drawn twice, which
   is the defect ADR-0093 records removing. And it could not be honestly re-derived here: the only
   duration this layer can reach is the drawn **calendar** span, while `durationDays` is a
   **working-day** figure `a11y.ts:58` records as _"not derivable from the spoken calendar dates"_.
2. **The bar's own outline is gone.** A 1 px inset hairline leaves 3 px of fill in a 5 px bar, and
   a 2 px dashed emphasis is a dash whose period exceeds the shape. The node carries the
   definition. **It was dropped silently on the first pass** and the suite did not notice, because
   the case guarding it asked whether _any_ `strokeRect` was emitted — which the node satisfies. It
   now asks about the bar's own extent.
3. **Crowding truncates a name; it no longer suppresses one.** The `none` branch existed because a
   _beside_ label had nowhere to go. A name above the bar always has its own row, so the honest
   degradation is a shorter name — a planner never loses an activity's identity to density.

### Defects found while building, each by running rather than reading

- **A ragged text row.** The painter recovered the lane's top as `rect.y - BAR_PAD`, which is right
  for a task bar and wrong for a **milestone**, whose rect is centred on the lane rather than padded
  into it — so a milestone's name drew 4.5 px above its neighbours'. It reads the lane now.
  Verified red.
- **The progress shape fired the wrong branch.** The discriminator was arithmetic fit, and at a 5 px
  bar `PROGRESS_BAND_H` derives to 1, so `2 + 1 + 2 ≤ 5` held and the inset branch produced a 1 px
  line inside a 5 px bar. The inset shape exists **to sit below a centred inside label**, so the
  condition is now the one deciding whether there is a label to sit below — which also stops the two
  thresholds drifting apart.
- **The node and the active lag handle share a radius.** `NODE_RADIUS` derives to 5 and
  `LAG_HANDLE_R_ACTIVE` is 5, and both are traced as a square with a half-side radius (how a circle
  is drawn without widening `Ctx2D`). Excluding nodes by size silently dropped the disc two cases
  are about. The discriminator is a **positive property of a handle** — it is traced twice, core
  then halo — which stays true if either radius changes.
- **An arbitrary cap bound the commonest case in the product.** A centred name was clamped to 48 px
  of overhang either side; a milestone's box is 14 px wide, so **every milestone's name truncated in
  a row that was otherwise empty**. The cap is gone; the residual (a centred name spends half its
  overhang to the left, where this layer does not know the room) is stated rather than hidden.

### Two instruments lost coverage silently, and both are fixed rather than re-baselined

- **The golden log's canvas.** `SIZE` was 800×400 — eleven lanes at 28 px and **eight** at 52 — so
  the maximal scene quietly stopped exercising three glyph families and every per-method count fell.
  A shrinking golden log reads exactly like a painter doing less work. `SIZE` derives from the lane
  count now, and the re-baseline accounts for **every** remaining delta exactly: `strokeRect` +10
  (20 node strokes less 10 removed bar outlines), `fillRect` +4 (two criticality-filled bars × 2
  nodes), `setLineDash` −4 (two emphasis dashes, set and reset), `moveTo`/`lineTo` −2 each (fan-out).
- **ADR-0128's canvas-draw probe.** Its Fit non-vacuity floor asks for a majority of the scene, and
  at 52 px a 2,000-activity plan's lanes no longer fit a 900 px viewport — `fitToContent` shrinks
  `pxPerDay`, which is the **time** axis, and no zoom touches the lane axis. Lowering the fraction
  until it passed would be tuning a threshold to the answer. The floor states the property instead —
  **show every bar in every lane you can fit** — so it still fails on the ADR-0066 shape it was
  written for. **The consequence for `docs/TECH_DEBT.md` #75/#261 is real: a Fit reading at 2,000
  activities is no longer a reading about the whole plan.**

### What is still owed

- **FC-L11's net measurement and FC-L3's epic verdict** are M3-T4's. At pitch 52 the clear band is
  **15 px** (half-band 7.5) against today's 10 — above FC-L11's floor, but **that is arithmetic from
  the shipped constants and not the measured net**, which is what the condition asks for.
- **CQ-6's two sub-decisions go to the product owner with the rendered picture**: where progress
  goes (built as the default — a second, shorter bar along the same line) and criticality's second
  non-colour channel (built as the default — a filled versus hollow node). Neither is settled here.
- The pitch itself is **provisional**.
