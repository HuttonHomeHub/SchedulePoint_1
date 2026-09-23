# ADR-0152 — A row is chosen for how its links will route

- **Status:** Accepted
- **Date:** 2026-09-23
- **Milestones:** NetPoint-layout M4 (the optimiser, dark) and M5 (Tidy and Re-layout) landed
  2026-09-23
- **Supersedes:** nothing
- **Amends:** ADR-0149 D6 (the Arrange offer's predicate and its dialog); ADR-0069 (`packLanes`
  stays the importer's packer and becomes Re-layout's seed)
- **Spec:** [`docs/specs/netpoint-layout/`](../specs/netpoint-layout/) —
  [spec §4.5 and §4.8](../specs/netpoint-layout/feature-spec.md),
  [conditions](../specs/netpoint-layout/conditions.md),
  [M0 measurement](../specs/netpoint-layout/m0-measurement.md),
  [M4 record](../specs/netpoint-layout/m4-the-optimiser.md),
  [M5 record](../specs/netpoint-layout/m5-tidy-and-relayout.md)

## Context

Three epics (ADR-0149, ADR-0150, ADR-0151) routed links around rows that a rule had already chosen.
ADR-0150's M0 measured what was left: most of the links still hidden behind bars could not be
rescued by any corridor, because the fault was the row the bar sat in. ADR-0149 D5 and ADR-0150 D5
then measured three row-assignment **rules** (chain rows, depth-first, near-predecessors) and
rejected all three, because each was worse than the shipped `packLanes` on the product owner's
metrics.

The product owner set the priority order for a layout: no overlaps first, then no link hidden by a
bar, then fewer crossings. Their CQ-1 answer (2026-09-23) set the row budget to the plan's current
row count and added unlinked glyph contact directly below crossings.

## Decision

1. **A layout is scored lexicographically, in the product owner's order:** overlaps, links hidden
   behind bars, crossings, unlinked glyph contacts, then −same-row links, total travel and rows as
   tie-breaks. There are no weights, because the product owner gave an order rather than weights.
   The row budget is the seed's row count (CQ-1).
2. **The score is computed on the painter's own routes.** Layer 2's routing moved verbatim into
   `render/route-frame.ts`, and the painter and the objective both call it, so the objective judges
   the picture a planner sees. A structural test holds the painter to one `routeFrame` call. The
   product counters were checked against the M0 harness's independent recorder-based counters
   (FC-N0): they agree on every term across seven layouts, and the check was verified red with two
   planted defects.
3. **The search is a local search with strict improvement and count caps.** It runs in four phases:
   repair overlaps by `nearestFreeRow`, adjacent-row swaps, single-bar moves, then compaction. A move
   is accepted only if it strictly improves the score, so the result is **never worse than its
   seed** on the objective. A 200-plan property sweep found no violation (FC-N3). The caps are
   counts, never time, so a result does not depend on the machine it ran on. The search is
   deterministic for any input order.
4. **Two options, one search.** **Tidy** seeds from the rows the planner has. **Re-layout** seeds from
   `packLanes` over the drawn spans, which is what `Arrange` did before this ADR. Tidy's guarantee is
   against the planner's own layout. Re-layout's is against the pack, so Re-layout **can** score
   worse than the current layout. The dialog shows both options' before and after figures against
   the current layout, so a planner sees that before confirming.
5. **It runs in a module worker, and only on plans it can finish.** A whole Tidy measured 4.2 s on
   the 144-activity Unit 300 plan and 10.5 s at 400 activities (FC-N2 (b)). So:
   - Every run goes to a worker with progress and is aborted when the dialog closes.
   - The search is offered only up to 300 drawn activities (`OPTIMISE_MAX_ACTIVITIES`).
   - Above that, Tidy is shaded with the reason, and Re-layout is the plain pack, scored but not
     searched.
   - A 2,000-evaluation cap bounds the worst case as a count.

   This is the application's **first Web Worker**. It loads under the production
   Content-Security-Policy with no change to the policy, because the policy has no `worker-src`
   directive (`docker-compose.yml:148`) and so falls back to `script-src 'self'`, and Vite emits the worker as a same-origin
   file. `e2e-csp` proves it by opening Arrange on a real plan and recording no violation.

6. **No horizontal gap.** The search moves bars between rows and never moves them in time: dates are
   the engine's, and `laneIndex` is presentation only (ADR-0069).
7. **The offer states overlaps only.** The dock offer appears when activities overlap in their rows,
   and says how many. Counting hidden links needs a routed frame, which measured 259 ms against an
   8 ms bar for a render-path derivation (FC-N2 (a), failed by 32×). So hidden links are reported in
   the dialog, after the planner asks, and never on the render path.
8. **The write is exactly what was shown.** Confirm sends the moves from the same result the figures
   came from, through the existing positions batch (at most 2,000 rows, so a larger result is shaded
   with the reason), as one `autoArrangeCommand` and therefore one undo step.

## Consequences

- ADR-0069's `packLanes` stays the importer's packer and is now also Re-layout's seed. An imported
  plan is overlap-free, so the offer is silent on it. The `e2e-arrange` import case asserts that
  silence against a real `.xer` import.
- ADR-0149 D5's and ADR-0150 D5's rejected rules stay rejected. They were rules applied to every
  plan. This is a search that keeps a move only when it measurably helps.
- On Unit 300, Tidy takes hidden links 58 → 17 and crossings 360 → 204 at the same 21 rows. Same-row
  links (68 → 56) and travel (502 → 521) pay for it, which is the order the product owner set.
- An already-arranged plan opens the dialog and says "Already arranged", where the spec (US-2) said
  there would be no dialog. Finding out takes a search the render path cannot afford (decision 7).
- The search's figures are node timings. They bound the algorithm, not the product owner's hardware
  (`docs/TECH_DEBT.md` #75). The after-epic paint reading is owed at M6.
- The CPM engine is not imported and no migration runs.

## Alternatives considered

- **An exact ILP or SAT solver.** It would find the optimum, but its cost is unbounded and it is a
  dependency. Rejected.
- **Simulated annealing.** It accepts worsening moves, so it can end worse than its seed, which
  breaks Tidy's guarantee. Rejected.
- **A force-directed vertical layout.** It is continuous, and rows are discrete. Rejected.
- **A weighted sum.** The product owner gave an order, not weights, and any weights would be a number
  tuned to the fixtures. Rejected.
- **Counting hidden links in the offer.** Measured at 32× over its budget (decision 7). Rejected.
