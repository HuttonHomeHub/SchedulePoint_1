# Part C — falsification conditions

- **Epic:** [`./part-c-feature-spec.md`](./part-c-feature-spec.md) ·
  [`./part-c-implementation-plan.md`](./part-c-implementation-plan.md)
- **Status:** Approved
- **Written:** 2026-09-22, against `501fbd0c` (`web-v0.140.1` / `api-v0.72.0`)
- **Committed alone, before any harness file exists.** That is the whole point of this file: a
  threshold written after its measurement is a number tuned to the answer, and the git order is the
  only evidence that it was not (ADR-0128's ordering; ADR-0097 Landing C's harness that returned
  `PROCEED` from an `undefined`; ADR-0121's two conditions that failed and were honoured rather than
  softened).

Every condition names what makes it fail and what happens then. A condition without a withdrawal
clause is a decoration.

---

## What the product owner decided, and what each decision costs a condition

Eight decisions, across two rounds, are approved constraints rather than preferences:

1. **No height ceiling** — "whatever reads best". The verdict is crossings and link length, never row
   count. This is what makes FC-C2's bar high rather than low: height is being spent without limit,
   so a small improvement is not worth offering.
2. **Measure the three candidates; the product owner chooses** (CQ-C1). FC-C2 is therefore a floor on
   what may be **offered**, never the decision.
3. **More gutter** — FC-C3.
4. **Arrange-button scope only** — FC-C6 is what makes that checkable.
5. **The router before the layout rule** — so a zero-height change is measured before any height is
   spent.
6. **The WBS band default: derived, and confirmed by M-C0** (CQ-C4, answered 2026-09-22). Recorded in
   full below, because it changes when FC-C8's flip may land.
7. **Ship the export and minimap costs; do not cap rows** — FC-C7's withdrawal clause points at the
   export and the minimap, never at the packer.
8. **Offer Arrange after an import** — and the offer lands in the canvas dock, because the import
   report cannot carry it (the report is the dry run's, rendered before the plan exists).

### CQ-C4's answer, and the condition it adds

The band default was asked for as **on**. It ships **derived** — on exactly when
`computeArrangeChanges()` is empty, so there are no blank rows to expose — because a straight flip is
the only design that puts a permanent defect in front of readers who cannot clear it: toggles are
never persisted (`use-tsld-canvas-ui-state.ts:195` holds them in `useState`), so nobody opts out
durably, and `Arrange` is `penGated: true` (`tsld-toolbar-items.tsx:2926-2932`), so a Viewer or a
Contributor without the lock cannot press the remedy at all.

**The answer adds a gate that FC-C8 alone does not carry.** The derived default is built at M-C2, but
**the flip is held until M-C0-T3 reports whether 12 rows genuinely reads better than 27**. The
premise of turning the band on is that a shorter diagram is a better one, and that has never been
measured: 12 rows offer 11 gutters where 27 offer 26, against an unchanged 188 links, so corridor
traffic per gutter rises ~2.4× as the diagram compresses. If crossings per link rise across that
compression, the flip is wrong independently of the Viewer problem, and the derived default lands
with its predicate inverted or not at all.

**Withdrawal clause.** If M-C0-T3 shows crossings per link rising 27 → 12, the band default stays
**off**, the dock still offers the press, and the finding is filed. It is **not** an argument for
reverting `#364` — those 13 rows paint nothing whatever the band does.

---

## FC-C1 — the crossing metric discriminates, or nothing is judged on it

Run against two layouts already known to differ enormously on every existing proxy: `web-v0.140.1`'s
shipped layout, and the source-order layout (12.96 mean |Δlane| / 73 long links — the epic's worst
measured configuration). **Whole-plan crossings per link must differ by ≥ 3×.**

**Non-vacuity control, asserted first:** attributed link polylines == the independently computed
visible-edge count, else **throw**. A metric that examined nothing reports zero crossings and looks
like a triumph.

**Why this condition exists at all.** Every number this epic has produced — mean |Δlane|, >5-lane
links, `vhv-gutter-probe`'s excursions — is a per-link **magnitude**. A crossing is a property of a
**pair**. No function of per-link magnitudes can determine a pairwise property, so the complaint has
never been measured by anything here.

**Withdrawal clause.** If it does not discriminate, the metric is wrong and is **replaced before any
candidate is measured**. Nothing else in M-C0 is worth running. No candidate is judged on an
instrument that cannot tell the best-known layout from the worst-known one.

## FC-C2 — a candidate earns its height, or it is not offered

On Unit 300, at identical framing, zoom and plan, a candidate reduces **whole-plan crossings per link
by ≥ 50 %** against the `web-v0.140.1` baseline.

**Where 50 % comes from, since a round number is a warning sign.** It is not derived from a prior
remedy — Part A's FC-3 did that, setting ≥ 20 % / ≥ 30 % from what the _free_ remedy delivered. This
remedy is paid in a currency the product owner has said they will spend without limit, so a bar at or
below FC-3's would mean "spend unlimited height" buys no more than "spend nothing". It is derived
instead from what the condition is **for**: a floor on what may be **offered**. The decision is
CQ-C1, taken by the product owner on the numbers and the pictures, per their own instruction. A
halving is the smallest change this epic is willing to put in front of them as worth vertical space.

**Withdrawal clause.** A candidate below the floor is **not offered**, and is recorded as measured and
rejected rather than dropped. If **all three** fall below it, the layout rule is withdrawn, M-C4 does
not happen, and the epic finishes at the gutter and — if it earned its place — the router. That is
the same shape as Part A's M3 withdrawal, and is deliberately made cheap.

## FC-C3 — the gutter earns its rows

At the chosen pitch, a rendered image at **1646** shows two runs through one gutter as two lines,
clear of both bar edges; and **FC-6 holds**: every glyph family (task, milestone, LOE, WBS summary)
and every decoration (progress band, constraint pin, feasible window, fan-out anchors, selection and
hover rings) draws within `[screenYOfLane(L), screenYOfLane(L+1))`. FC-6 is Part A's condition,
reused verbatim **including its withdrawal clause: if it cannot be satisfied, the geometry changes,
not the gate.**

**Judged on a rendered image**, not on arithmetic — "two distinguishable runs" is a claim about what a
reader can see, and this epic exists because a diagram that satisfied every number was still hard to
read.

**Withdrawal clause.** If no candidate pitch shows two distinguishable runs, the pitch stays at 28 and
the gutter is recorded as **not the term** — itself a finding, because it would mean the complaint is
entirely row assignment and corridor choice.

## FC-C4 — paint cost, in two separately-judged limbs

ADR-0128 probe, `canvas-draw`, 500 and 2,000, **one press by the product owner on their own
hardware**. No CI gate, ever (ADR-0128's refusal, which follows from that decision rather than being
a gap in it). Dropped-frame percentage **≤ baseline + 2.00 pp** (ADR-0127 D8a's bar), **with the
machine's own run-to-run spread reported beside it** — a delta smaller than the spread is
**INDETERMINATE**, not a pass (ADR-0128's fourth verdict).

**Limb A, the layout. Prediction committed here: the delta is ≤ 0.** `fitToContent` deliberately
ignores the lane axis (`viewport.ts:200-216` — `originY` is pinned to the padding and `extent.maxLane`
is discarded), so the visible lane band at Fit is constant whatever the row count; and `cull` is a
rect intersection on both axes, so spreading the same activities over more rows puts **fewer** bars in
that band. **If the delta is > 0 this prediction is falsified**, and that is recorded as a finding
rather than quietly dropped.

**Limb B, the router. A delta > 0 is expected** and the 2.00 pp bar is the test. Additionally
`paint.routing-budget.test.ts` must stay green **without being edited**; if it has to be relaxed, the
search is unbounded and the router is withdrawn.

**Judging them separately is not tidiness:** a layout that saves frames and a router that costs them
would net out to "no change" and hide both.

## FC-C5 — determinism, at both tiers

Two runs on one plan produce byte-identical lane assignments **and** byte-identical routed polylines.
Permuting the input `activities` and `edges` arrays changes neither.

**Verified red** against a router that consults `scene.edges` in array order without imposing a total
order — a named mutation, per ADR-0110 D5: _a gate is finished when it has been made to fail by the
defect it was written for._ `scene.edges` order is a server response, not a total order.

## FC-C6 — byte-identity when not asked

`packLanes` with the objective **omitted**, and with it set to the neutral value, are two **separate**
cases and both are byte-identical to today's output. `routeOrthogonal` without the crossing parameter
is byte-identical point for point — the existing obstacle parameter's own parity rule
(`link-routing.ts:158-160`) extended rather than restated.

This is what makes the Arrange-only scope checkable rather than asserted: the importer calls
`packLanes` directly (`interchange.service.ts:1096`), so if the omitted case is byte-identical, import
cannot have changed.

## FC-C7 — the deliverable and the overview survive the height

**Export.** At the chosen candidate on the largest measured fixture, either the `whole` PNG's natural
raster is within `EXPORT_MAX_PX` (8192) per side, or `scaledToFit` fires and the product owner has
accepted it (CQ-C2, answered: ship, report, file). **Measured at `devicePixelRatio = 1.75`, their own
display, and not at 1** — the raster is `size × dpr`, so the CSS-px headroom is 1.75× smaller than the
constant suggests.

**Minimap.** `pxPerLane` at the chosen candidate on Unit 300, measured and reported against the
baseline **in the configuration the reader is in** — 27 lanes, i.e. `120 / 27 = 4.4 px per lane`, not
the 10 px this epic's first draft quoted from the band-on-after-Arrange case. A rendered pair
accompanies it.

**Withdrawal clause.** If either is judged unacceptable, the remedy is **not** a row cap on the packer
— the product owner removed that constraint deliberately — but a cap **in the export**, or a minimap
change, each of which is its own scope and is filed rather than smuggled in.

## FC-C8 — the derived band default is correct, cheap, and pinned

Three limbs, because the design fails differently in three ways and one assertion would hide two of
them.

**Correctness.** On a plan whose lanes are scene-first, the band defaults **on** and the drawn extent
contains **no blank row**; on a plan whose lanes are not, it defaults **off**. Asserted as the
predicate's two branches, **verified red** against a default that ignores the predicate — which is
today's shipped behaviour, so the red run is free to produce.

**The blank-row defect is unreachable.** On an imported, never-arranged plan, at every role, the count
of drawn-extent rows holding no painted bar is **0**. **Verified red against the unconditional flip** —
the alternative this design rejects — which must produce **13** on Unit 300, or the measurement is not
discriminating between the two designs at all.

**Cost.** Deriving the default runs `packLanes` once per plan load. At `scale-2000` (2,160 activities)
the derivation completes within **16 ms**, one frame, measured rather than asserted.
**Withdrawal clause.** Over budget, the derivation moves behind the existing on-demand path and the
default falls back to **off** with the strip still offered — strictly today's behaviour plus an offer,
and therefore always available as the safe landing.

**And one thing FC-C8 deliberately does not assert**, stated so its absence is a decision: that a
planner's _manual_ toggle survives a refetch. It does not and cannot — toggles are `useState` — so
seeding once per plan id is the whole of the contract, and anything stronger would be a persistence
feature nobody has asked for.

---

## What is not a condition here, and why

- **A row-count ceiling.** Removed deliberately by the product owner. FC-C7 reports what height costs
  the export and the minimap; it does not bound it.
- **A CI gate on paint cost.** ADR-0128 refused one, and that refusal follows from where the
  measurement has to be taken — the operator's own machine — rather than being a gap in it.
- **A wall-clock bar on the harness.** ADR-0058: two of this repository's slowest CI samples changed
  no test and no workflow.
