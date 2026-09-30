# ADR-0166: Resource load and levelling start where the bar is drawn

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** James Ewbank (product owner — "Follow placed bars", 2026-09-30; Q1 (c), Q2 no, Q3–Q6
  defaults), with Claude Code
- **Amends:** ADR-0041 (§1, §3, §7), ADR-0071 (Gate B's scope), ADR-0044 (§3), ADR-0035 (§28, §31),
  ADR-0116 D7 / `docs/TECH_DEBT.md` #248 (the what-if's levelling basis)
- **Makes true:** ADR-0148's Consequences sentence "a placement shifts a span the levelling pass reads"
- **Spec:** [`docs/specs/placed-load-basis/`](../specs/placed-load-basis/feature-spec.md) (§4.8 is this
  ADR's outline). Register row: `docs/TECH_DEBT.md` #413.

## Context

Since ADR-0148 a bar is drawn where it is **placed**, and on 2026-09-29 the header's finish, baseline
variance, the revision comparison, the landing's standing and Earned Value moved to the placed dates
(#404, #405). Three resource readers did not:

- **The resource histogram** spread each assignment's units over `earlyStart`/`earlyFinish`
  (`loadResourceHistogramAssignments` selected only those two columns), and the canvas resource strip
  reads the same endpoint, so the load drawn under the bars was not the load of those bars.
- **Resource levelling** started every activity from its early date. Spec C2 found seven sites in
  `level.ts` that did so, not the two the row named: the pinned start and finish, a pinned activity's
  levelled dates, the sort key's start term, the levellable anchor, the negative-float clamp, the delay
  measurement and a non-participant's finish.
- **ADR-0148's Consequences** said a placement shifts a span the levelling pass reads. That was false:
  `level.ts` read no placement, and ADR-0041 carried no amendment from ADR-0148 (spec C3).

A planner who had moved two clashing lifts apart by hand still saw a clash reported and a levelled ghost
drawn for it, and two bars dragged into one week clashed on the plan without levelling seeing it.

## Decision

**Resource load and resource levelling read the span a bar is drawn on.** Levelling remains an overlay
and never an authority (ADR-0148 D9).

- **D1 — the histogram spreads units over the placed span.** The loader selects
  `visualEffectiveStart`/`visualEffectiveFinish` beside the early pair, and the service uses the placed
  pair, falling back to the early pair **as a pair** when either placed end is null (a plan never
  recalculated). The histogram engine's maths does not change, only its input and its docblocks.
  `RESOURCE_LOAD_BASIS_NOTE` reads "Load is counted where each bar is drawn."
- **D2 — levelling anchors on the placed span.** All seven sites move together, through one accessor
  switch in `levelSchedule`, so a pass cannot anchor on the placed date and measure, clamp or report
  against the early one. The pass still never writes a placement and never recomputes float (ADR-0041 §3
  and ADR-0148 D9 stand). The engine exposes the drawn span as in-memory `placedStartOffset` /
  `placedFinishOffset` on `EngineResult`, derived from the same instants that produce
  `visualEffectiveStart`/`Finish`, so the date and the offset cannot disagree. They are not persisted:
  no schema change.
- **D3 — under `PLACED` the priority key's float term is remaining float.** The composite key stays
  `levelingPriority` → float → start → id, but the float term is `remainingFloatMinutes` (the room a
  placement has not already spent) for a placed anchor and `totalFloat` for the network anchor. Only
  placed plans can see a different order (Q5).
- **D4 — `anchor` is a required option, and DCMA metric 12 is `NETWORK`.** `levelSchedule` takes
  `anchor: 'PLACED' | 'NETWORK'` with no default, so every caller states its basis (the rule
  `varianceBasisFor` and `pvBasisFor` follow). A recalculation and the conformance adapter pass
  `PLACED`. The critical-path test passes `NETWORK` (Q2, "no"): it tests the logic, a placement is stay-
  and-flag and does not move when logic pushes it, so anchoring on a placed completion carrier could FAIL
  a sound network. The consequence is stated where it lands: on a plan with hand-placed bars the metric's
  levelled schedule and the recalculation's can differ, and the verdict is about the network's.
- **D5 — the parity argument becomes Gates A, B and C.** Gate A (levelling off, the pass does not run)
  and Gate B (zero lag, no placement, the captured `level.parity.spec.ts` corpus) are unchanged and
  restated. **Gate C is new:** with levelling on and nothing placed, the placed anchor equals the early
  anchor for every participant wherever `visualEffective*` equals `early*` (ADR-0148 FC-11), so the
  output is today's. It is proven at the engine by the unedited corpus and S10, and at the product by
  LV1's unplaced twin. Its limit was C5, "suspected false for successors of progressed activities"; M0
  measured it real, and it was fixed first as ADR-0148 Amendment 1 (#421), so Gate C holds for those
  successors from that amendment. `computeSchedule`'s network and placed outputs are byte-identical
  before and after; two fields are added.
- **D6 — no flag, and the ghost ships with it.** ADR-0088 D1: the rollback is a commit boundary. The
  levelled-placement ghost predicate compares the levelled start with the **drawn** start
  (`visualEffectiveStart`), so a placed participant levelling left alone gets no ghost on its own bar.
  The engine and the web change lands in one release.

## Alternatives considered

The table is spec §4.9; in short, each was rejected for the reason given there.

- **Levelling moves the placed bars** (writes `visualStart`): levelling would become an authority,
  reversing ADR-0148 D9 and ADR-0041 §3, and could overwrite a placement made on purpose. Q1 (b).
- **An explicit "Apply levelled dates" command:** a real feature that adds a surface, a bulk structural
  write, undo and audit, so it needs its own spec. The product owner chose the ghost now and this later
  (Q1 (c)).
- **Move the histogram only:** the chart would show load levelling does not see.
- **Rebuild the placed instant in `level.ts` from the date string:** day-granular, it loses sub-day
  pushes (ADR-0070) and is a second derivation of one fact.
- **The histogram shows levelled load when levelling is on:** the chart would describe a position the
  plan is not in. A "levelled load" option can be added later (Q3).
- **A per-read basis on the histogram:** no baseline is involved, so there is no read-wide discriminator.
- **Metric 12 follows placed levelling:** see D4.

## Consequences

- **Public figures change meaning for plans with placements, and only those.** Histogram buckets and
  `leveledStart`, `leveledFinish`, `levelingDelayDays` and `leveledProjectFinish` are now measured from
  where the bar is drawn. Shapes are unchanged; `api` and `web` ship as minors, with the change in the
  first sentence of the changeset. External consumers reading them as early-date quantities see a
  difference on placed plans.
- **A planner used to total-float ordering can see a different order on a placed plan** (D3), stated in
  the schedule summary's copy.
- **The estate's day-one effect may be small** (few placed, resourced, levelled plans). The seed plan
  `plan:capability-levelling-placed` exhibits it as a matched pair with `plan:capability-levelling`.
- **The what-if's stated reason for levelling is corrected.** ADR-0116 D7 / #248 said the product "no
  longer persists" the pure network dates once `levelResources` is on. It does persist `early_*` on every
  recalculation beside the levelled columns; levelling is an overlay. The what-if levels so its verdict
  is measured on a levelled schedule, on the `NETWORK` anchor.
- **Curve-aware levelling is still not built** (ADR-0044 §3): the pass reads a flat `unitsPerHour`.

## References

- Spec and plan: [`docs/specs/placed-load-basis/`](../specs/placed-load-basis/feature-spec.md);
  measurement record [`m0-measurement.md`](../specs/placed-load-basis/m0-measurement.md).
- ADR-0148 (visual is the plan; D9 and Amendment 1), ADR-0041, ADR-0071, ADR-0044, ADR-0035, ADR-0116,
  ADR-0088, ADR-0081.
- Precedents: ADR-0025 Amendment 3 (#359, placed variance) and ADR-0042 Amendment 1 (#405 c, placed
  planned value).
