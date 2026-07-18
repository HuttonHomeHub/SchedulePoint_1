# ADR-0043: Inter-project external dates (activity-level external early-start / late-finish + ignore-external)

- **Status:** Accepted (Milestone 1 — external dates as an activity input + ignore-external; the live
  cross-plan solve remains deferred to a future, separately-ADR'd Milestone 2)
- **Date:** 2026-07-18
- **Deciders:** Product Owner (approved the five critical questions at their recommended defaults),
  Solution Architect, Technical Lead; schema reviewed with database-architect

## Context

SchedulePoint's CPM engine is functionally complete through conformance milestone M7
(30 ✅ / 2 ⚪ on the [capability matrix](../specs/engine-conformance-framework/CAPABILITY_MATRIX.md)).
**External / inter-project dates** (`net_external_*`, `interproject`; scenario **S09**) is
one of the two remaining ⚪ dimensions and the **only** one with no ADR. The product owner
selected it next because it unblocks **programme / multi-plan scheduling**.

Real construction programmes span several plans (engineering, procurement, construction,
start-up, multiple contractors). An activity in one plan is routinely gated by a date that
lives in **another** plan: a vendor delivery, an IFC drawing release, a downstream
commissioning window. P6 planners model this and toggle **"ignore relationships to/from
other projects"** daily to see a plan on its own logic vs. gated by its neighbours.

The conformance fixture encodes this as **per-activity imported instants**, not as live
edges to another plan's live schedule:

- `activities.external_early_start` — five activities carry one (A2120, A2200, A2210,
  A2220, A2230). A2120 carries **both** an internal FS predecessor **and** an external
  early start; the note is explicit: _"The later of the two must drive."_
- `activities.external_late_finish` — A12500 (RFSU milestone) carries one from the
  downstream Start-Up project, **alongside** its own `FINISH_ON` constraint.
- Scenario **S09** flips a single boolean: _"Ignore external relationships → all five
  external early starts drop; procurement chain pulls left."_

Forces:

- **Byte-parity gate (ADR-0034/0037).** `computeSchedule` is PURE and its golden suite is
  the regression net. Any new dimension must be byte-identical when the plan carries no
  external data — so the design cannot change the pass structure or the signature lightly.
- **Tenancy / org-scoping (ADR-0016, ADR-0012).** "Inter-project" spans plans within an
  org. The recalc endpoint (ADR-0022) is **plan-scoped**. A design that reaches into
  another plan's live schedule introduces cross-plan authorisation and orchestration.
- **Constraint machinery already exists.** SNET clamps the forward pass; FNLT the backward
  pass (`constraints.ts` `clampForwardStart`/`clampBackwardFinish`). An external early
  start is an SNET-shaped lower bound; an external late finish an FNLT-shaped upper bound —
  but they must be **distinguishable** from internal constraints so the ignore-external
  toggle can drop _only_ the external ones, and so an activity can carry an internal
  constraint **and** an external bound at once (A12500).
- **Smallest-correct-first-slice discipline (CLAUDE.md §19).** The fixture proves the axis
  with **static imported dates + a toggle** — a live cross-plan solve is not required to
  score S09.

## Decision

**We will model external dates as an activity-level scheduling input plus a plan-level
ignore-external option, clamped inside the existing CPM passes — and we will defer a live
cross-plan solve to a later, separately-ADR'd milestone.**

Concretely, for **Milestone 1**:

1. **Two nullable per-activity instants** (absolute working-instants, ADR-0037):
   `activities.external_early_start` and `activities.external_late_finish`
   (`TIMESTAMPTZ NULL`). NULL = none (the parity default). These are **imported
   commitments** from another project, stored absolutely (independent of this plan's data
   date).
2. **One plan-level option** `plans.ignore_external_relationships`
   (`BOOLEAN NOT NULL DEFAULT false`), mirroring the existing scheduling-option columns
   (`make_open_ends_critical`, `use_expected_finish_dates`, `level_resources`).
3. **Engine: two clamps, no new pass.** On the **forward** pass the early start is clamped
   **up** to the external early start (`max`, floored at the data date) — SNET-shaped; on
   the **backward** pass the late finish is clamped **down** to the external late finish
   (`min`) — FNLT-shaped. Both are gated on `!ignoreExternalRelationships`. Measured on the
   activity's own calendar (ADR-0037). `computeSchedule`'s **signature is unchanged**; two
   new optional `EngineActivity` fields and one new `ComputeOptions` flag are added, so
   absent inputs + option off ⇒ **byte-identical** output.
4. **External bounds are soft, never pins.** An external date behaves like SNET/FNLT, not
   like `MANDATORY_*`/`FINISH_ON`: it never overrides a hard pin, never sets
   `constraintViolated`. When it is the binding bound the engine flags the activity
   **external-driven** and increments `externalDrivenCount` (observability only, mirroring
   `constraintViolationCount`/`loeNoSpanCount`).
5. **Ignore-external drops both directions.** The toggle drops external early starts **and**
   external late finishes (the option is "ignore relationships to/from other projects"),
   leaving internal SNET/FNLT/logic untouched.

The ambiguous behaviours and negatives are documented in a new **ADR-0035 §30** (see
below), Accepted with Milestone 1.

**Deferred to Milestone 2 (not decided here):** a first-class **live cross-plan
relationship** whose external dates are auto-derived from the linked plan's computed
schedule and kept fresh — cross-plan edges + a cross-plan DAG/cycle invariant (extending
ADR-0021), cross-plan authorisation (a link spans two plans/projects), staleness/
propagation (ADR-0009 job), and programme-level recalc orchestration above ADR-0022. This
gets its own ADR amendment when it reaches the roadmap.

### New ADR-0035 §30 (SchedulePoint CPM semantics — external / inter-project dates)

To be added to the semantics ledger and Accepted with M1:

- **§30.1 External early start = SNET-shaped forward bound**, floored at the data date;
  `earlyStart = max(networkEarlyStart, externalEarlyStart, dataDate)`. When both an
  internal predecessor and an external early start exist, **the later drives** (A2120).
- **§30.2 External late finish = FNLT-shaped backward bound**;
  `lateFinish = min(networkLateFinish, externalLateFinish)`. If it is earlier than logic
  can achieve, **total float goes negative** on the driving chain (surfaced, not an error).
- **§30.3 External bounds are soft**, never mandatory pins; they never set
  `constraintViolated` and coexist with an internal constraint on the same activity
  (A12500's `FINISH_ON` + external late finish).
- **§30.4 Ignore-external drops both** external early starts and late finishes; internal
  constraints/logic are untouched (S09).
- **Negatives:**
  - **N25** — external early start **before the data date** → **honour but do not pull
    back**: clamp to the data-date floor and count a soft warning (mirrors N15).
  - **N26** — external late finish **before** external early start (both set) → **boundary
    reject** at the DTO/service (`EXTERNAL_FINISH_BEFORE_START`, 422), with an optional DB
    CHECK backstop (mirrors N06 actual-finish-before-start).

## Alternatives considered

- **Reuse the existing SNET/FNLT constraint fields** (no new columns). Rejected: it
  destroys the internal-vs-external distinction the fixture/P6 draw — the ignore-external
  toggle must drop _only_ external bounds, and an activity must carry an internal
  constraint **and** an external bound simultaneously (A12500). Distinct columns are
  required.
- **A dedicated engine pass for external dates.** Rejected: they are two more clamps on the
  existing passes; a new pass risks the byte-parity gate and adds cost for no gain.
- **Build the live cross-plan solve now.** Rejected as the first slice: L–XL; needs
  cross-plan DAG + authz + propagation; **not required** to score S09 / `net_external_*`
  (the fixture uses static imported dates). Sequenced as Milestone 2.
- **Store external dates as offsets from the data date.** Rejected: external dates are
  **absolute** commitments from another project (a vendor delivery), independent of this
  plan's data date; absolute instants (ADR-0037 axis) survive a data-date change.
- **Model external dates as a boolean "is external" flag on an existing relationship.**
  Rejected for M1: there is no live cross-plan edge yet; the fixture models the _dates_, not
  the edges. Relationship-level linkage is the Milestone 2 concern.

## Consequences

**Positive.**

- The engine's last un-ADR'd P6-class axis is designed and scored: the `net_external_*` /
  `interproject` capability row and **S09** flip ⚪ → ✅.
- Planners model inter-project interfaces without abusing constraints, and can compare
  "own logic" vs. "gated" in one toggle.
- Zero risk to the parity gate: additive optional inputs, no new pass, unchanged signature.
- A clean foundation for Milestone 2 (the imported-date model is exactly what a live solve
  would populate automatically).

**Negative / neutral.**

- External dates in M1 are **manually entered / imported**, not auto-synced from another
  plan — they can go stale if the source plan changes (accepted trade-off; M2 addresses it).
- Two more nullable columns + one plan boolean; additive migration, no backfill.
- One more scheduling option for planners to understand (mitigated by UI copy + docs).

**Follow-ups / new debt.**

- **Milestone 2** (live cross-plan linkage) needs its own ADR: cross-plan DAG/cycle
  invariant, cross-plan authorisation (a new permission or dual-scope check — the M1 slice
  needs **no** new permission, reusing activity-write / plan-settings), propagation/
  staleness, programme recalc orchestration.
- Keep the capability matrix + ADR-0035 ledger in lock-step (ADR-0034 living-matrix rule).

## References

- Feature spec: [`docs/specs/inter-project-dates/feature-spec.md`](../specs/inter-project-dates/feature-spec.md)
- Implementation plan: [`docs/specs/inter-project-dates/implementation-plan.md`](../specs/inter-project-dates/implementation-plan.md)
- Semantics ledger: [`docs/adr/0035-schedulepoint-cpm-semantics.md`](0035-schedulepoint-cpm-semantics.md) (new §30, N25/N26)
- Conformance methodology: [`docs/adr/0034-engine-conformance-methodology.md`](0034-engine-conformance-methodology.md)
- Date/calendar axis: ADR-0023, ADR-0036, [ADR-0037](0037-per-activity-calendars-and-instant-axis.md)
- Execution/persistence: [ADR-0022](0022-cpm-execution-and-persistence-model.md); DAG invariant: [ADR-0021](0021-dependency-graph-dag-invariant.md); scheduling modes: [ADR-0033](0033-scheduling-modes-and-canvas-planning.md)
- Tenancy / authz: [ADR-0016](0016-core-identity-tenancy-role-model.md), [ADR-0012](0012-authorization-rbac-scoped.md)
- Fixture: `packages/engine-conformance/fixtures/` (`activities.csv` external columns; `TEST_MATRIX.md` S09)
- Engine seams: `apps/api/src/modules/schedule/engine/{compute,constraints,types}.ts`; recalc: `apps/api/src/modules/schedule/schedule.service.ts`
