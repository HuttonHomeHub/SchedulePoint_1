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

**That figure is smaller than it looks, and the M6 performance review established it.** The pass was
memoised on `scene.edges` array identity (ADR-0052 M5), and `scene.edges` is reference-stable across
pan and zoom, so its per-frame cost was already a `WeakMap.get`. Retiring it reclaims that lookup
per frame plus the 5–11 ms **once per edge-list change** — real, and not a per-frame saving. Written
down because the un-qualified number appeared in two docblocks, this file, the ADR and the register,
and every one of them read as "5–11 ms off every frame".

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

---

## T4 — the pitch, and the epic's verdicts

`node apps/web/scripts/measure-row-pitch.mjs`, at `d7014dd9`. Seven pitches × two zooms, the bundle
rewritten rather than a tracked file (M-C0-T4's method), every variant reporting the pitch it
painted with, and two controls — one whole-sweep, one **per-pitch**, the second added because the
first only fires when every row is empty.

| pitch  | gross | **net** | channels | legs | distinct y | max/y | **overlapping/y** | peak | in a bar | smallest gap | `x/link` @4 |
| ------ | ----- | ------- | -------- | ---- | ---------- | ----- | ----------------- | ---- | -------- | ------------ | ----------- |
| 40     | 35    | 3       | 1        | 102  | 14         | 14    | 7                 | 7    | 0        | 13.0         | 1.181       |
| 44     | 39    | 7       | 1        | 102  | 14         | 14    | 7                 | 7    | 0        | 15.0         | 1.181       |
| 48     | 43    | 11      | 3        | 102  | 35         | 9     | 3                 | 7    | 0        | 14.0         | 1.771       |
| **52** | 47    | **15**  | **5**    | 102  | 46         | 9     | **2**             | 7    | 0        | 13.0         | **1.856**   |
| 56     | 51    | 19      | 5        | 102  | 46         | 9     | 2                 | 7    | 0        | 15.0         | 1.856       |
| 60     | 55    | 23      | 7        | 102  | 51         | 9     | 1                 | 7    | 0        | 14.0         | 1.915       |
| 68     | 63    | 31      | 9        | 102  | 51         | 9     | 1                 | 7    | 0        | 18.0         | 1.915       |

Both zooms agree on every figure, which is itself a stability check rather than a coincidence: the
channel derivation has no zoom term.

### The pitch is 52, and three of the seven candidates buy nothing

**44 buys nothing over 40, 56 nothing over 52, 68 nothing over 60** — same channel count, same
worst bunching, byte-identical crossings. The efficient frontier is 48, 52 and 60, so the choice is
between three numbers and not seven.

**FC-L11 removes two of them**: at 40 and 44 the net clear band is 3 px and 7 px against today's
10, so the row treatment would have spent the channel it was also supposed to supply.

**FC-L4's crossings ceiling removes 60.** `x/link` may rise by ≤ 10 % against M0's **1.691** at
4 px/day: 48 is +4.7 %, 52 and 56 are **+9.8 %**, 60 and 68 are **+13.2 %**. So 52 is the largest
pitch that buys anything and stays inside a committed ceiling. **60 is not rejected — it is not a
milestone's to take.** FC-L4's withdrawal clause says in terms that a breach "goes to the product
owner with both numbers and both rendered pictures … never resolved inside a milestone", and what
60 buys is the last layer of the fourth symptom they reported: worst overlapping-on-one-y falls
from 2 to 1, i.e. no two runs that overlap in x share a y anywhere in the plan. It goes to them
with CQ-6.

**And the crossing metric rewards the defect, which is why the ceiling is used as a ceiling and
never as a reason to prefer a smaller pitch.** At one channel `x/link` is **1.181 — 30 % _below_
the M0 baseline** — because seven coincident legs on one y do not cross, they overlap, and
`countCrossings` cannot see a line hidden under another line. A reading that took the number at
face value would ship the bunching the epic exists to remove and report an improvement. The rise
from 1.181 to 1.856 is not the picture getting worse; it is lines that were always there becoming
visible, and no instrument here can separate the two.

**Nothing changes in the tree.** 52 is the provisional value M3-T3 shipped, and it is the right one
for a reason nobody had when it was chosen.

### FC-L11 — **clears**, and the gross never travels alone

Gross **47 px**, net **15 px**, five channels, against today's 10 px. The withdrawal clause does
not fire.

### FC-L3 — the epic's verdict (M1-T4's was a progress reading)

- **Limb 1 — `legsTouchingABar` = 0**, at every pitch, smallest gap to a bar edge **13.0 px**.
  Today's figure was **58 of 68**. It means something now in a way it did not two days ago: the
  instrument that reports it had been finding legs by a datum M1-T1 moved, and reported 0 legs from
  103 six-point routes — a blind spot wearing a triumph's clothes, fixed in T4 and controlled for
  per-pitch.
- **Limb 2 — reported both ways, as `gutterStats` records.** The literal count **fails at every
  pitch** (at 52: bound `ceil(7/5) = 2`, literal 9); the overlapping count **meets it exactly at
  every pitch** (at 52: 2 ≤ 2). A channel legitimately carries many runs that do not overlap in x,
  which is what packing by x-interval is _for_, so the literal bound is a question about the wrong
  quantity. Both are printed so neither can be quoted alone.
- **Limb 3 — the picture**: `gutter-channels-52.png`, the busiest gutter (lane 2) at 1646 × 420,
  12 px/day, band off. Two runs through one gutter read as two lines, clear of both bar edges.
  **The file is named after the pitch** — the harness used one fixed name and had already silently
  replaced M1's progress picture with M3's once, leaving the M1 write-up's "at today's 28/18
  geometry" above an image of a 52 px row with nothing failing.
- **Limb 4 — FC-6 holds.** `paint.lane-containment.test.ts` is green at the shipped geometry, 17
  cases plus the hover ring.
- **The harness's own prediction was wrong and is corrected rather than dropped.** Its docblock says
  a NetPoint-thin bar "makes the same derivation yield seven" channels. It yields **five**.

### The occlusion prediction — confirmed twice, with a residual it does not explain

The prediction, committed in the spec (§0.10) before any of this was built: thinning the bar does
**nothing** for occlusion, because a horizontal leg runs at the bar's **centre-line**, so whether it
meets a bar is an x-overlap question the bar's **height** does not enter.

| what was varied           | `occl/link` @ 1 / 4 / 12 px/day  | fingerprints |
| ------------------------- | -------------------------------- | ------------ |
| pitch, 40 → 68 (7 values) | 0.410 / 0.261 / 0.239 — constant | all differ   |
| bar height, 5 → 10 → 18   | 0.410 / 0.261 / 0.239 — constant | all differ   |

**Constant to three decimals while every fingerprint differs** is the discriminating form: it is not
"the same picture, so the same count" — the routes genuinely moved and the count did not follow.
`foreign`, `2pt f/all` and `buriedPx` are identical across all ten readings too.

The pitch half also has a mechanism read from the call order rather than inferred from the result:
`routeOrthogonal` → `chooseCorridorsByCrossing` (which moves a corridor's **x**) →
`packGutterChannels` (which moves only its **y**), `paint.ts:1206-1271`. Channels can therefore
change crossings — and the table above shows they do — while being structurally unable to change
leg-versus-bar occlusion, because a leg never enters a bar.

**What the prediction does not cover: `occl/link` at 4 px/day is 0.261 here and M2 recorded 0.250.**
Measured at the M2 tip (`5fc9439a`) in a git worktree with the workspace's `node_modules`
symlinked, the harness reproduces M2's recorded figures **exactly** — 0.404 / 0.250 / 0.229 and
`x/link` 2.399 / 1.840 / 1.835 — so the difference is the product, not the instrument.

The attributable change is **two-point links: 25 → 55**. `routeOrthogonal` returns `[from, to]`
when the two anchors share a y, and fan-out — retired in T3 because a 3 px step cannot separate
anything on a 5 px bar — was offsetting endpoint y and keeping thirty links out of that branch. So
thirty more links are now same-lane straight lines. Within that population the foreign **rate**
falls (5/25 = 20 % → 9/55 = 16 %) and foreign **incidents** fall (53 → 52); the per-link figure
rises because the denominator of links carrying the same-lane mechanism more than doubled. M2's
same-lane branch still routes a blocked one into the gutter, so this is more members of a handled
category rather than a new hole — **and it is M4's business**, because §0.3 names the same-lane
two-point link as the small-plan mechanism and M4 is assignment.

### FC-L7 — reported, never used to bound height, and its own expectation is falsified

Unit 300 band-off (21 lanes) and a 2,000-activity scale scene (50 lanes), at
`devicePixelRatio = 1.75`.

| fixture    | pitch | export CSS  | raster @ 1.75 | scaled to fit |
| ---------- | ----- | ----------- | ------------- | ------------- |
| Unit 300   | 28    | 1632 × 770  | 2856 × 1348   | no            |
| Unit 300   | 52    | 1632 × 1274 | 2856 × 2230   | no            |
| scale-2000 | 28    | 4668 × 1582 | 8169 × 2769   | no            |
| scale-2000 | 52    | 4668 × 2782 | 8169 × 4869   | no            |
| scale-2000 | 68    | 4668 × 3582 | 8169 × 6269   | no            |

FC-L7 calls the export "the condition most likely to bind", on the reasoning that decision 6 makes
the pitch spendable. **Measured, the pitch does not bind it and cannot**: the binding term is the
**width** (`days × pxPerDay`), which no pitch touches. At 12 px/day on the 2,000-activity scene
`scaledToFit` fires at pitch 28, 52 and 68 alike — it already fired before this epic — and at 1 and
4 px/day it fires at none of them. The height cap binds at **160 lanes at pitch 28, 86 at 52 and 66
at 68**, derived from a measured 182 px of reserved chrome against 4,681 CSS px of cap.

**Minimap `pxPerLane` is 5.714 at every pitch**, because `minimap.ts:212` allocates the box across
**lanes** and `minimap-axes.structural.test.ts` bans the name `LANE_HEIGHT` from that module.
Measured rather than asserted, which is what FC-L7 asks for: a figure that is invariant because a
gate forbids the dependency is worth printing.

**Where the pitch does land is the reader's window inside that box**, and nothing had named it:
`sceneWindowRect` takes the scene's row height as a parameter, so visible lanes fall **24.3 → 13.1**
and the rectangle's height falls **139.0 → 74.8 px** in a 120 px box. At pitch 28 the rectangle was
_larger than the box_ — degenerate, delimiting everything and therefore saying nothing. At 52 it
covers 62 % of the plan's height and starts carrying information. That is the orientation cost of
decision 6 and also, on this fixture, the moment the overview's viewport mark begins to work.

**The parallel listbox is unchanged** — `TsldPanel.wbs-band-a11y.test.tsx` and the 59 render suites
(874 cases) pass unedited, which is the ADR-0063 §4 form: an invariant you have to touch to make
room for your change was never an invariant.

### The picture found a defect the numbers could not

M3-T3 wrote that crowding "truncates a name; it no longer suppresses one … a planner never loses an
activity's identity to density." In the rendered frame two milestones were labelled **`…` and
nothing else**. `truncateToWidth` returns a bare ellipsis when not even one character fits
(`geometry.ts:824`), so the degradation ladder ends in a glyph that names nothing and reads as
content — the claim was asserted about the branch above it and never checked against the branch
below.

The name is now suppressed when the truncation keeps no characters, and the claim is restated to
what is true: **a name is shortened rather than suppressed while any character survives, and below
that the row shows the bar alone**, with the full name still on the bar's option in the parallel
listbox, which is where identity actually lives (ADR-0026 D7). The regression test widens the
width function rather than crowding the fixture further — a milestone's box is 14 px and `'M…'` at
the 6 px-per-glyph stub is 12, so the stub structurally cannot reach the branch, and a test that
could only be written by pretending otherwise would be testing the stub. Verified red.

### What is still owed to the product owner (CQ-6)

Three sub-decisions, none of which a milestone may take (FC-L8 limb 1's withdrawal clause, and
FC-L4's):

1. **Where progress goes.** Built as the default — a second, shorter bar along the same line.
2. **Criticality's second non-colour channel.** Built as the default — a filled versus hollow node.
3. **Pitch 60 instead of 52.** It removes the last layer of the bunching they reported (worst
   overlapping-on-one-y 2 → 1) and costs +13.2 % crossings against M0, outside FC-L4's ceiling —
   with the caveat above, that the metric cannot separate "more crossings" from "the same lines,
   now visible". 8 px per row, and they have already said height is spendable.
