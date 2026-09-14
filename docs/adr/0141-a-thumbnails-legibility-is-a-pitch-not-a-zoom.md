# ADR-0141: A thumbnail's legibility is a pitch, not a zoom

- **Status:** Accepted
- **Date:** 2026-09-14
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0100](./0100-the-canvas-minimap-an-invariant-picture-and-a-dom-rectangle.md)
  — **D5** (the omitted-layer list and the budget's exact counts), **D7** (hover, re-decided as
  still out) and **D9** (the token deviation, extended to the indicator's fill)
- **Spec:** [`docs/specs/tsld-minimap-visual/`](../specs/tsld-minimap-visual/) — the evidence base
  is `m0-measurement.md` §§1–13

## Context

The product owner used the released application and reported the minimap as _"extremely basic in
appearance"_ — it _"doesn't pop like the old minimap of the old repo used to."_

Measured rather than described, the complaint was not taste. The picture drew **five marks in
three colours**, two pairs of which were literally the same token value: `today` and `critical`
are both `--destructive`, and the critical fringe and the data-date vertical are both
`--foreground`. Its ground was `canvasGround` — the diagram's own ground — so the picture area
measured **1.03:1** against the canvas it floats over and read as a hole in the panel rather than
as a picture. The viewport indicator was two hairlines with no fill, and at whole-plan zoom it is
congruent with the picture's own edge **to the pixel**, so the loudest mark in the widget (14.13:1)
delimited everything and therefore said nothing.

**This ADR exists because ADR-0100 is Accepted and ADRs are immutable.** D5 is amended by a new
decision, never edited. The first attempt at this milestone edited D5 in place; that is recorded
here rather than quietly corrected, because the spec had warned against exactly it (§4.9) and the
rule still lost to convenience.

## Decisions

### D1 — A temporal tier is admitted by measured pitch in the box, never by a tier name

`MINIMAP_TIER_MIN_PX = 6`, set from **six candidate pitches rendered into the real 200×120 box**
with the real ground, grid and bar inks, twice each (`m0-measurement.md` §7). At 1.5 px the rules
are a solid wash, at 3 px a hatch, at 4.5 px the ground is visibly striped; 6 px is the lowest
pitch at which they read as individual structure.

The scene's own day-tier floor (`DAY_GRID_MIN_PX`) is **also 6**, and that is corroboration
rather than the derivation — its docblock gives a reason and cites no measurement, so deriving
from it would inherit an unmeasured constant. `DATE_LABEL_MIN_PX_PER_DAY`'s precedent applies:
_set from the measurement, not by eye._

At most two tiers are ever drawn — the finest of month/quarter that clears the floor, plus year.
Month and quarter are never both drawn, because a quarter boundary is a **subset** of the month
boundaries. On the measured plans: quarter + year at 1,059 days, year alone at 4,385.

**Recorded blind spot:** the choice between 6 and 8 is unobservable on both measured plans, since
neither admits the month tier either way.

### D2 — Temporal structure is drawn beneath the bars, and that is what makes its contrast obligation nil

Their only ground is `--canvas`, and `--canvas-grid-month`/`--canvas-grid-year` are already gated
≥ 3:1 against it — so this adds **no new contrast pair**. Drawn over the bars they would need
gating against both bar inks as well, and would read as noise over the one thing the picture is
for.

### D3 — ADR-0100 D5's three named properties survive; the amendment narrows it

**Zero text work**, **zero per-bar strokes** and `fillStyle` **batched per pass** all hold
verbatim — one write per drawn tier, never per rule. Three candidates are **declined** under the
same approval, each on measurement rather than preference:

- **Year labels.** At 8 px, `"2026"` is ~19 px against a **17.7 px** year pitch on a
  2,000-activity plan — they collide precisely where they would help most. D5's "zero text work"
  therefore stands on arithmetic and not only on the original legibility assertion.
- **Endpoint dots** (the old application drew them) — per-bar strokes, the second property.
- **Links** — ADR-0100 D5's original rejection is untouched.

The budget gate's counts were **re-derived, not relaxed**, with the arithmetic written out in the
file so a reader can re-check it by hand.

### D4 — Criticality's non-hue channel was already there, and the plan's step to build one is recorded as satisfied rather than done

The approved plan (M2-T2 step 3) directed replacing the row-height-gated fringe with _"a
fill-level lightness separation, which reaches every row height"_. **Measured, the fills already
have one**, and that is why the step was not built:

| ink                         | relative luminance |
| --------------------------- | ------------------ |
| ordinary (`--primary`)      | **0.2152**         |
| near-critical (`--warning`) | **0.1234**         |
| critical (`--destructive`)  | **0.0626**         |

A monotone ladder, each step roughly a halving. Through the shipped viewport tint the pairs
measure **2.36:1**, **1.54:1** and **1.53:1** against the product's 1.5:1 criticality floor
(ADR-0097 Landing E) — and a luminance ratio **is** a lightness measure, so a pure hue difference
at equal lightness would read ~1.00:1. This is ADR-0102's own work: it separated critical from
non-critical on lightness precisely because they previously _"differed in hue and almost nothing
else"_ at 1.23:1.

**The M5 accessibility review read this as a hue-only ladder and called the epic a WCAG 1.4.1
failure, and that is why the numbers are in this ADR rather than in a reply.** Its three
subsidiary findings were right and are fixed or recorded here; its headline was not, and the
ratios it cited as evidence of the defect are the evidence against it. The plan's step 3 is a
**plan claim that had gone stale** — written before ADR-0102's ladder was checked — which is the
§19 rule (_re-verify a plan's problem statement, not only its design_) applied to a remedy.

What the fringe adds above that ladder is a **second** lightness cue on tall rows, and it fires on
neither measured plan (`pxPerLane` 2.93 at 540 activities, 0.674 at 2,160). It is therefore
belt-and-braces rather than the sole channel, and `MinimapPalette`'s docblock is corrected to say
so — it previously called the fringe "the 1.4.1 answer", which is what invited the misreading.

### D5 — The five marks are distinct by construction, and near-critical became a sixth

`palette.nearCritical` was **not among the keys handed to the painter**, so the scene painted three
bar states and the minimap painted two: an activity a planner is being warned about looked exactly
like one they are not. That is not a collision — it is a scene state with **no mark at all**.

The Today marker and a critical bar are the same token, proven live rather than read: the marker's
computed background is `oklch(0.439 0.175 27)` and sampling its column found `rgb(156,7,17)` over
ground, **byte-identical** to the bar it crosses, so it vanished there — and on a real programme
the critical path is where most of the ink is. It keeps the scene's hue (ADR-0059: two views of
one plan do not disagree about what a thing looks like) and gains a **halo** as its second channel.

The acceptance condition is deliberately _"distinguishable **where it crosses a critical bar**"_
rather than _"the two tokens differ"_ — the second is satisfiable by a change that leaves them
close, and closeness was never the defect.

**Declined with the reason recorded:** the fringe/`dataDate` pair share `--foreground` and are
**not** a comparable defect. The fringe is bounded to a bar and reads as that bar's edge; the data
date is a continuous full-height vertical; they are distinguished by extent before colour is
consulted, and on any large plan the fringe is not drawn at all. This register has overstated a
WCAG citation once (ADR-0082); inventing a change to match a table is the same error inverted.

### D6 — The viewport indicator is filled, and the composite pair is gated before the CSS — with two instruments

A border says where a region ends; a fill says the region is a thing.

**The alpha is 8 % because ΔE said so.** The plan named one assertion — criticality must survive
the tint — and measured, that never binds: a neutral fill holds 2.02:1 at α = 0.40 against a 1.5
floor. The binding constraint is the opposite one, and **a contrast ratio cannot judge it**: it is
blind to a chroma shift at equal lightness, and called the old application's plainly-visible amber
fill 1.073:1 where CIE76 ΔE reads 8.33. So the gate carries both — **ΔE ≥ 5** for perceptibility,
**≥ 1.5:1** for the criticality ladder through the fill — and `deltaE76` joins the shared colour
helpers with its scope and its ΔE*ab-not-2000 choice written down.

The hue is the frame's own. **Amber read best in the rendered candidates and was declined on a
collision, not on looks**: `--warning` is near-critical, which D5 had just given a mark, so an
amber viewport would be a new collision created by the milestone whose subject is removing them.
`--primary` failed one step earlier — it **is** the ordinary bar ink.

### D7 — Hover is re-decided as still out; D9's token deviation extends to the fill

ADR-0100 D7 deferred hover with _"revisit after M4 with real use"_. The trigger has fired and the
answer is unchanged: the complaint is about **appearance**, not about information, and the date is
on the ruler.

D9's deviation extends to `--canvas-minimap-frame-fill`, on the same argument — a viewport
indicator has no semantic sibling in the base vocabulary, so it is a `packs` member, and its
perceptibility is gated by its **own** pairs rather than by a scope's completeness.

### D8 — No `VITE_` flag; the rollback is a commit boundary

ADR-0088 D1: a `VITE_` constant is inlined at build time and has never been an operator rollback.

### D9 — `input-architecture.md`'s LOD premise was wrong, and ADR-0100 D5 inherited it

The v1 architecture input justified omitting temporal structure as _"all LOD-gated off far above
minimap scale (`NON_WORKING_MIN_PX`, `DAY_GRID_MIN_PX`)"_. Read `render/paint.ts`: only the **day**
tier is gated; month and year draw at every zoom, and both cited constants are px-per-**day** floors
on **day-pitch** work.

That does not make month rules viable — D1's pitch ladder refuses them on both measured plans, for
a reason the original never stated — but the rejection was reasoned from the wrong constant, so the
design space it closed was never examined. Kept because the correction is the useful part
(ADR-0058: _verify the claim; do not trust the document_).

## Consequences

- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity
  gate is untouched by construction.
- The rebuild's clean measured cost is **p95 13.6–13.9 ms at 2,160 activities** with a 0.0–0.3 ms
  run-to-run spread; the per-frame path is unchanged, which is the structural limb of the bar
  committed before the milestone (`m0-measurement.md` §8.4, §12).
- **Two questions are left open for the product owner rather than decided here**, both of the form
  _what should the minimap draw_: the lane compression (178 lane indices mapped linearly into
  120 px, so the picture is ~85 % empty at scale — and omitting summaries does **not** fix it), and
  the data-date vertical painting over any zero-duration activity at the data date, which is 76
  milestones on the measured plan. Two marks cannot share a pixel; every remedy is a
  decimation-policy trade (`m0-measurement.md` §10.4, §11.4).
- `docs/TECH_DEBT.md` **#155.1 closes** — its own words nominated "a faint fill" if first-contact
  feedback ever said the affordance was insufficient. **#155.3 is re-filed**, not folded in: its
  condition is "if it ever surfaces in use" and no screenshot this epic took reached the empty
  state.
