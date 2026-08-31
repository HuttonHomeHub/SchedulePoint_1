# ADR-0121: One stack derivation, two renderers, and a cap set by height rather than cost

- **Status:** Accepted
- **Date:** 2026-08-31
- **Deciders:** Product owner; ui-architect, feature-analyst, and the six specialist gates

## Context

The resource histogram showed **one resource at a time**. The product owner noticed it while using
the app and asked two falsifiable things: whether that was really the limit, and whether other tools
stack resources with colour the way they remembered. Both were checked before anything was advised.

The first was true. The second was true too, and the source they supplied — a P6 walkthrough of the
stacked histogram — is worth reading for what it complains about rather than what it demonstrates:
P6 stacks by adding **one filter dialog per segment**, which its own advocates call "really tedious"
for the case every real programme has, dozens of trades.

Three corrections were made to the brief before it became a spec, and each is recorded because the
brief is not evidence (§19.11):

- I told the product owner the ramp had **ten** members; it has **twelve**. My `grep` was
  `head -14`, and `globals.css:195` opens by saying "Twelve, not five".
- I told them over-allocation shading was not built. **It is** — on the diagram, as an
  ADR-0041-driven lens (`render/lenses.ts:402-428`). What is absent is a histogram capacity band.
- I told them the limit line was where the value lay. The source they supplied does not support
  that, and the framing was withdrawn rather than quietly carried into the spec.

## Decision

### D1 — One derivation, indexed once, shared by three consumers

`features/resources/model/stack-series.ts` owns ranking, aggregation, the colour index and the
bucket totals. The dialog chart, the data table and the canvas painter all read it. A second
implementation would drift, and **the drift would be invisible**: each renderer looks right alone,
and only somebody holding the legend against the diagram would ever see segment 3 painted two
different colours (the ADR-0065 `routeOrthogonal` argument, one module along).

Bucket totals are summed **in draw order**, once, and shared. A renderer stacking bands computes a
running offset in that order; summing the raw input instead can differ in the last bits under IEEE
addition, and the visible symptom is a top band that overshoots the axis by a hair at some zooms
and not others.

### D2 — A colour has two forms, and which one a renderer gets is that renderer's business

This is the decision that nearly did not get made, because the code looked right.

`stackSeries` emits `var(--chart-n)`, which is correct for its **first** consumer: a `var()` follows
the ADR-0055 surface scope and re-values with the token. The canvas strip then indexed the same ramp
and published it straight to `paintResourceStrip`.

**Canvas 2D's `fillStyle` setter discards an unparseable value and leaves the previous colour in
place.** No throw, no console warning, no visual error state. Verified in Chromium rather than
reasoned about: after `fillStyle = '#ff0000'`, assigning `'var(--chart-1)'` reads back `'#ff0000'`
and the painted pixel is red. So the stacked strip would have painted as **one solid block** — the
feature's entire premise, telling the trades apart by colour, silently absent.

Every unit test passed, because jsdom has no canvas: a test asserting a segment's `fill` string
passes on exactly the value a browser refuses. That is the ADR-0100 M4 minimap-frame defect, in this
same token family, one consumer along.

`resolveLensPalette` has resolved this **exact ramp** correctly since ADR-0049 (`wbsCycle`,
`palette.ts:352`). So this is not a design error; it is one correct pattern applied to a control and
not its neighbour — the failure shape this register has now recorded six times.

The fix goes **where the indexing rule already lives**: `stackSeries` takes the ramp as a parameter
(defaulting to the `var()` form) and the canvas host passes `categoricalCycleResolved()`. Resolving
at the call site instead would be a second copy of the `i % length` rule, which is D1's own argument
turned against it. `paintResourceStrip` additionally **throws in development** on an unresolved
fill, so the next occurrence is a failing test rather than a screenshot somebody has to notice.

### D3 — The strip's cap is set by height, and height turned out to be the binding constraint

Two falsification conditions were committed in the spec **before anything was built**, each with a
remedy ladder. **Both failed**, and both remedies were applied rather than either criterion being
softened. `docs/specs/stacked-resource-histogram/m2-measurement.md` carries the raw figures and the
screenshots the judgement was made against.

**Condition 1, paint cost, failed on a discontinuity nobody expected.** At Fit zoom the delta p95
was +14.7 ms against a +2.0 ms bar. Sweeping the segment count found a **cliff at nine**: 0.5 ms at
eight, ~10 ms at nine, with `p50` flat at 0.3–0.4 ms across the whole sweep — a tail, not fill rate.
Two hypotheses were tested and **falsified** rather than assumed (sub-pixel bands: an even split
fails identically; distinct fill colours: nine segments in four colours still fails), and the
arithmetic does not explain it either, nine segments being ~13 % more fills than eight and not 20×.
The mechanism is **unattributed** and filed as `docs/TECH_DEBT.md` #226 rather than guessed at.

**Condition 2, legibility at 72 px, then cut the cap much further — and that is the finding.** Cost
was never the limit; vertical room was. On the spec's skewed profile (one dominant trade halving
into a tail — the shape the spec labels the draft's even-split arithmetic wrong for), six named
bands over 66 px of bar area put the fifth trade at 1.04 px and the aggregate at **0.52 px**, below
a pixel and unidentifiable in the screenshot:

| strip cap | thinnest band, peak column | judgement               |
| --------: | -------------------------: | ----------------------- |
|         6 |                    0.52 px | FAIL — sub-pixel        |
|         5 |                    1.05 px | FAIL — a hairline       |
|         4 |                    2.13 px | FAIL — a hairline       |
|     **3** |                **4.40 px** | **PASS** — thin, a band |

So `STRIP_STACK_CAP` is **3** while the dialog's `DEFAULT_STACK_CAP` is **8**. The two surfaces
differ in **how many** segments they name and never in what a segment means — which is exactly the
divergence the spec's remedy ladder sanctions, and why `cap` was a parameter from the first commit.

**What the cap costs is stated rather than left to be rediscovered.** On an _even_ six-trade split
every band is 9.43 px and all six would have been perfectly legible; three of those trades are now
folded into the aggregate for no visual reason. That is deliberate. A cap that varied with the data
would make a segment's presence a property of the plan rather than of its rank, and a constant tuned
to whichever profile happens to read best is the number-tuned-to-the-answer the condition exists to
prevent.

### D4 — Grouping by trade, which is where this beats P6 outright

ADR-0053 M3 already gave resources an adjacency-list `parentId` and a non-assignable `GROUP` kind,
so stacking by trade group is a **re-partition of the same derivation** rather than a second
pipeline — a dropdown where P6 wants five filter dialogs. It also repairs the feature's weakest
state rather than papering over it: a forty-resource programme stacked by resource is a handful of
named bands and "Other (36 resources)"; stacked by trade it is the picture a planner wanted.

An unparented resource **stands for itself** rather than falling into an "Ungrouped" bucket, because
a bucket named for the absence of a property reads as a group somebody created.

### D5 — Colour follows rank, and the alternative needs a schema change

Segment colour is the resource's index in the ranking. Re-ranking therefore repaints the chart,
which is a real cost — put to the product owner with the alternative, and the alternative is a
**persisted per-resource colour**, i.e. a schema change and its own epic. Filed as #225.

### D6 — No schema change, so database-architect was deliberately not engaged

§19.3 makes that agent unconditional for any schema change and says plainly that deciding a change
is too small is the judgement the agent exists to make. There is no model, column, index, constraint
or data migration here — confirmed against the diff, not assumed — so the trigger does not fire.
Recorded because "the agent was not run" should never be readable as an oversight.

### D7 — The CPM engine is not imported and no migration runs

`apps/api/` is untouched by this epic. The ADR-0034 recalculation parity gate is untouched by
construction — in its honest form: there is nothing here to hold parity for.

### D8 — What the gate pass found, and why two of them are the same defect

Six specialists over the combined diff. Security passed, having re-derived this ADR's parity claim
from the diff rather than citing it — and independently establishing that the server's DTO enforces
`@Max(200)` on the limit this epic raised, so the client change stays inside an already-enforced
ceiling. Frontend-performance passed, having independently reproduced the nine-segment cliff
(+9.8 ms) and the shipped cap (+0.2 ms) in this environment. **The other four blocked, on eleven
findings.**

**The two largest are decisions that were written down and not built** — the ADR-0081 shape, twice
in one epic, and both reached independently by two reviewers.

The **strip's legend** was decided by name in the spec's D5 (_"the chrome panel already exists …
the legend joins them"_), listed as a development step in the plan, and never written. So the
canvas strip — an `aria-hidden` element by ADR-0049 — carried up to four coloured bands with
**nothing on screen naming any of them**, and no way to learn the top one was an aggregate. Colour
as the sole channel with no alternative anywhere: a live WCAG 1.4.1 failure on the surface this
epic exists to improve.

The **dialog chart's segment boundary** is the same story inverted. The entire 1.4.11 argument for
a stack is that two adjacent fills never have to clear 3:1 against **each other**, because a
ground-coloured boundary always sits between them and every fill is gated at ≥ 3:1 against that
ground. The canvas painter implements it. The DOM chart drew bare backgrounds — so the argument was
true of one renderer and asserted of both, with the ramp's worst adjacent pair measuring 1.46:1.
The suppression threshold now lives in one module both renderers import, so they cannot disagree
about when a band is too thin to separate.

**Four more were mine, and one is this register's favourite shape aimed at me.** The panel resolved
its palette from `document.documentElement` — ADR-0102's exact defect — under a comment _I wrote in
the `var()` fix_ saying it read the canvas surface element, citing ADR-0102 by number. The code and
the comment describing it landed in the same commit and disagreed. jsdom returns `''` from either
root and falls through to identical fallbacks, so nothing could have caught it. Alongside: the
painter re-summing bucket totals (D1's own rule broken by D1's own author, agreeing only because
segment order happens to survive the trip); `groupSeries` grouping by immediate parent where US-8
and the control's label both say top-level; and the table's caption claiming _"ordered by total,
largest first"_ over a table that rendered whatever order it was handed, with both unit fixtures
coincidentally already descending so the false caption shipped green.

**And the coverage gaps were the plan's own written requirements.** `ResourceStackChart` had no
test file at all; the multi-segment paint path and its suppression boundary had none;
`stack-record.structural.test.ts` asserted against a **private mirror** of the table's summing
logic and imported no component, so the regression its own docblock described — wiring the table to
the chart's aggregated segments — would have left it passing unchanged. It renders the real
components now, verified red against a truncating table.

Every fix carries a regression test verified red against the defect first. The journey found two
more things by being run: the sibling spec broke because the picker gained an option and nobody had
run it (§19.8's rule, demonstrated), and `Stack by` is correctly shaded when an organisation has no
groups, which the new journey had assumed otherwise.

## Alternatives considered

- **A second server-side aggregation for the stack.** Rejected: `getResourceHistogram` already
  computes every series and _then_ slices, so the limit governs serialisation only. Stacking is a
  presentation decision and belongs where the renderer is.
- **A taller strip band.** Rejected on authority rather than merit: the band's height is canvas the
  last six epics have spent themselves defending, and taking 30 px of diagram to fit three more
  bands is a product-owner decision, not an implementer's.
- **A legibility-driven cap** (fold any band thinner than N px into the aggregate). Genuinely
  attractive — it would show six bands on the even plan and three on the skewed one — and rejected
  because it makes a segment's presence a property of the data. It is also outside the remedy ladder
  the spec committed to, which is where an implementer under time pressure should stop.
- **Withdrawing the strip stack and shipping the dialog alone** — the ladder's second rung. Not
  needed: three named trades plus the aggregate is the "who is driving this load" glance the strip
  exists for, and the dialog carries the detail.

## Consequences

- The strip and the dialog now disagree, on purpose, about how many trades they name. Anyone
  changing either cap should read D3 before assuming the numbers should match.
- `docs/TECH_DEBT.md` #226 is an unexplained performance discontinuity in a painter this product
  depends on. The cap leaves clearance from it; it does not explain it.
- #223 (the strip does not export or print, and the parity gate structurally cannot see that),
  #224 (`plan:scale-500`'s documented resource shape does not match the plan it seeds) and #225
  remain open, each with its reasoning.
- Non-blocking gate-pass findings are #228, each with the reason it was left.
- #227 was filed while writing this: 70 of 100 detailed register rows use a heading form the
  register's own convention line forbids, and `check:debt-status` cannot report it because
  ADR-0120's correct fix widened the parser to read both levels.

## References

- `docs/specs/stacked-resource-histogram/feature-spec.md`, `implementation-plan.md`,
  `m2-measurement.md` (+ the four legibility screenshots)
- ADR-0034 (conformance and the parity gate), ADR-0041 (levelling and over-allocation flags),
  ADR-0049 (the resource strip), ADR-0053 M3 (the resource hierarchy), ADR-0055 (surface scopes),
  ADR-0065 (one shared derivation), ADR-0097/ADR-0102 (the token ramp), ADR-0100 M4 (the
  token-unreachable-in-a-browser defect this repeats), ADR-0105 (when a register row is not a spec)
- `docs/TECH_DEBT.md` #223, #224, #225, #226, #227
