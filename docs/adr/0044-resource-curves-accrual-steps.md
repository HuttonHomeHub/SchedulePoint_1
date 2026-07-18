# ADR-0044: Resource loading curves, cost accrual & weighted activity steps (the final resource-side rung)

- **Status:** Proposed (M7 rung 5; each sub-feature Accepts with its owning slice — §31 curves / §32 accrual /
  §33 steps in ADR-0035's acceptance ledger)
- **Date:** 2026-07-18
- **Deciders:** Product Owner (to answer the five critical questions at their recommended defaults),
  Solution Architect, Technical Lead; schema to be reviewed with database-architect

## Context

SchedulePoint's CPM engine and resource stack are functionally complete through M7: resources (ADR-0039), the
duration/units triad (ADR-0040), resource levelling (ADR-0041), and Earned Value as a pure read-model (ADR-0042)
have all landed. After inter-project dates (ADR-0043, scenario S09), the
[capability matrix](../specs/engine-conformance-framework/CAPABILITY_MATRIX.md) stands at **31 ✅ / 1 ⚪**, and
**exactly one ⚪ row remains**:

> **"Resource curves, cost accrual & activity steps"** — fixture tags `code_steps`, `accrual_start` /
> `accrual_uniform` / `accrual_end`, and `res_curve_bell` / `res_curve_front_loaded` / `res_curve_back_loaded`
> / `res_curve_double_peak`.

Closing it **completes the matrix** (the only remaining sketched item beyond it — the external _live cross-plan
solve_ — is a deferred future milestone, not a matrix row). The P6-class fixture encodes the three behaviours
concretely:

- **`resource_curves`** — five named 21-point profiles (LINEAR, FRONT_LOADED, BACK_LOADED, BELL, DOUBLE_PEAK);
  each assignment references one via `assignments.curve`. A curve distributes an assignment's `budgeted_units`
  across the activity's duration (a resource loading histogram) — it does **not** move any date.
- **`expenses.accrual_type`** — `START` (e.g. a £45k crane mobilisation, all at the start), `UNIFORM` (spread),
  `END` (e.g. retention, all at finish). Accrual changes **when** cost is recognised — the PV / cash-flow
  S-curve — not any date.
- **`steps`** — a weighted checklist per activity (`weight`, `percent_complete`) whose weighted mean is the
  activity's **physical %-complete**, feeding the ADR-0042 `PHYSICAL` Earned-Value measure (the fixture's own
  A4200 `prog_rd_vs_pct_divergence`: physical 35% via steps ≠ duration 40%).

Forces:

- **Byte-parity gate (ADR-0034/0041/0042).** `compute.ts` is PURE and its golden suite is the regression net;
  `level.ts` is byte-identical when `levelResources` is off; EV owns no engine column. Any new dimension must be
  byte-identical when its data is absent.
- **Correct layering.** The load-bearing question is _which layer each sub-feature touches_ — the CPM engine
  (parity-critical), the levelling pass, or a pure read-model. Getting this right determines the whole parity
  story.
- **Smallest-correct-first-slice discipline (CLAUDE.md §19).** SchedulePoint already collapsed the fixture's
  per-expense expense table to a single activity lump-sum (ADR-0042) and reused the calendar library rather than
  build parallel models — the smallest faithful model for each sub-feature should follow that grain.
- **ADR-0041 intersection.** Levelling reads a **flat** `units_per_hour` as demand. A curve reshapes
  demand-over-time, so _curve-aware levelling_ would change `level.ts` and the S10 golden — an engine-adjacent
  change that must be an explicit choice, not a side effect.

## Decision

**We will add all three as additive read-model / input concerns that leave the pure CPM engine (`compute.ts`)
and — in this rung — the levelling pass (`level.ts`) untouched; and we will document the ambiguous semantics in
ADR-0035 §31/§32/§33 (accept-with-slice) with negatives N27–N29.** Concretely:

1. **Cost accrual — a pure read-model semantic.** Add `activities.accrual_type` (`START | UNIFORM | END`,
   default `UNIFORM`). The EV read-model (`earned-value.ts`) time-phases the activity's expense lump-sum per the
   accrual type: `START` recognises the full amount at the activity start, `END` at the finish, `UNIFORM`
   linearly (exactly today's math). It also gains an optional **period trend** series (the cost/PV S-curve).
   **No engine change, no new table**; `UNIFORM`/absent ⇒ **byte-identical EV** (the parity gate).

2. **Weighted steps — a small child table feeding physical %.** Add an `activity_steps` child model
   (`seq`, `name`, `weight`, `percent_complete`; reference-template child — org-denormalised, soft-delete,
   audit, version; partial-unique `(activity_id, seq)`; CHECKs `weight ≥ 0`, `percent_complete 0–100`). When
   steps exist, the activity's physical %-complete is the weighted mean `Σ(wᵢ·pᵢ)/Σ(wᵢ)` and **wins** over the
   manual `physicalPercentComplete`; with no steps the manual field behaves exactly as today (ADR-0042 parity).
   Steps feed the `PHYSICAL` EV measure only — **no engine change**.

3. **Resource curves — a named enum + a histogram read-model.** Add
   `resource_assignments.curve_type` (`UNIFORM | BELL | FRONT_LOADED | BACK_LOADED | DOUBLE_PEAK`, default
   `UNIFORM`) with the built-in P6 21-point profiles baked into a new pure **`resource-histogram.ts`**
   read-model that distributes each assignment's `budgeted_units` across the activity's duration (span =
   duration − assignment lag), conserving units, and feeds cost time-phasing. **Curves do NOT feed the levelling
   pass this rung** — levelling stays flat-rate (Q2). No curve/`UNIFORM` ⇒ flat load ⇒ byte-identical histogram
   & EV. A **user-defined point-array curve library is deferred** (Q1); the named enum fully serves the fixture.

4. **Negatives (ADR-0035, boundary vs read-model).** **N27** — all step weights 0 ⇒ the rollup falls back to the
   manual physical % and counts a warning (never divide-by-zero, never reject). **N28** — step %-complete out of
   0–100 ⇒ boundary reject (`STEP_PERCENT_OUT_OF_RANGE`, 422; the ADR-0042 N23 precedent). **N29** — a curve
   profile that does not sum to 100 ⇒ normalise to `budgeted_units` (units conserved) + a warning.

5. **Conformance (ADR-0034 three tiers), per slice.** Structural gate (new types/coverage); differentials
   (flip accrual / steps-present / curve → the read-model output differs); self-baselined goldens
   (first-principles, no external oracle) — A4200 → 35.0005% physical, E001 START £45k full-at-start,
   a front-loaded histogram that integrates to `budgeted_units`. Each slice flips its capability tags ✅ in the
   PR that lands it; F3 closes the matrix (32 ✅ / 0 ⚪).

6. **Scope / build order.** One covering ADR (this one); three independently shippable slices in the order
   **cost accrual → weighted steps → resource curves** (parity-cleanest / most standalone first). Deferred:
   curve-aware levelling (Q2), a user-defined curve library (Q1), a per-expense expense child table (Q4),
   stored period snapshots (a live read is always current, the ADR-0042 precedent).

## Alternatives considered

- **Feed curves into levelling now (curve-aware demand).** More faithful to a real resource-limited solve, but
  changes `level.ts`'s demand sweep and the S10 golden — an engine-adjacent XL change that breaks the clean
  read-model parity story. Deferred to a later rung (Q2); curves land as a histogram read-model first.
- **A user-defined curve library (point-array curves as org entities).** More flexible, but a whole parallel
  model + CRUD + authoring UI for value the named P6 enum already delivers against the fixture. Deferred (Q1).
- **A full per-expense expense child table (per-expense accrual like the fixture).** SchedulePoint already
  models a single activity lump-sum expense (ADR-0042); one `accrualType` per activity faithfully time-phases
  it. A per-expense table is only warranted if multiple differently-accruing expenses per activity are a real
  need (Q4). Rejected as the first slice.
- **Persist histogram / cost-trend / physical % as engine-owned columns (recompute on recalc).** Rejected: like
  EV, these change whenever cost/progress/curve inputs change, not only on recalc — a live read is always
  current and keeps the recalc parity gate trivial (the ADR-0042 precedent).
- **Drop the manual `physicalPercentComplete` in favour of steps.** Rejected: the manual field is the no-steps
  parity path and the N27 fallback; steps-win-when-present is additive and safe.

## Consequences

**Positive.**

- The **last ⚪ capability-matrix row completes** (⚪ → ✅; 32 ✅ / 0 ⚪) — the fixture is fully scored.
- Planners get a **realistic resource histogram**, a **correctly time-phased cost/cash-flow S-curve**, and
  **weighted physical-progress rollup**, each independently shippable and flagged.
- **Parity is preserved by construction** — the pure CPM engine and the levelling pass are untouched; every
  slice is byte-identical when its data is absent.

**Negative / neutral.**

- One new child table (`activity_steps`) and two enum columns to maintain in lock-step with `@repo/types` and
  the conformance adapter.
- Two deliberate deferrals create known future rungs: **curve-aware levelling** (Q2) and a **user-defined curve
  library** (Q1). These are documented as out-of-scope, not gaps.
- A new `cost:read`-gated cost trend and `schedule:read` histogram add read surface (no new coarse permission).

**Follow-ups / new debt.**

- ADR-0035 gains §31 (curves) / §32 (accrual) / §33 (steps) + N27–N29 in its acceptance ledger, each Accepting
  with its slice.
- CAPABILITY_MATRIX row + summary updated in the landing PRs (living-matrix rule); the final `res_curve_*` PR
  closes the matrix and updates the summary tally.
- If Q2 is later answered "curve-aware levelling", that is a separate ADR amending ADR-0041 and re-baselining
  S10.

## References

- Feature spec: [`../specs/resource-curves-accrual-steps/feature-spec.md`](../specs/resource-curves-accrual-steps/feature-spec.md)
- Implementation plan: [`../specs/resource-curves-accrual-steps/implementation-plan.md`](../specs/resource-curves-accrual-steps/implementation-plan.md)
- Semantics ledger to amend: [`0035-schedulepoint-cpm-semantics.md`](0035-schedulepoint-cpm-semantics.md) (§31/§32/§33, N27–N29)
- Capability matrix (the last ⚪ row): [`../specs/engine-conformance-framework/CAPABILITY_MATRIX.md`](../specs/engine-conformance-framework/CAPABILITY_MATRIX.md)
- Builds on: ADR-0039 (resource model), ADR-0040 (units/duration triad), ADR-0041 (levelling), ADR-0042
  (percent-complete types & Earned Value), ADR-0025 (baselines / cost baseline), ADR-0037 (own-calendar axis),
  ADR-0034 (conformance methodology), ADR-0016/0012 (tenancy / RBAC)
- Fixture: `packages/engine-conformance/fixtures/` (`resource_curves`, `expenses.accrual_type`, `steps`)
