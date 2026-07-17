# ADR-0041: Resource levelling — the opt-in resource-constrained pass

- **Status:** Accepted
- **Date:** 2026-07-17
- **Deciders:** James Ewbank (with Claude Code)

> **Accepted — governs milestone M7 (the resource dimension), the resource-**levelling** rung
> (`levelling_test`, scenario S10).** It **activates** the `resource.max_units_per_hour` column that
> [ADR-0039](0039-resource-model-and-resource-calendar-scheduling.md) reserved **"for levelling"** as the
> per-resource capacity ceiling, and consumes the driving assignment's `units_per_hour`
> ([ADR-0040](0040-duration-types-and-resource-units.md)) as the per-period demand rate. Levelling is a
> **separate, opt-in second pass** on top of the pure CPM network schedule
> ([ADR-0022](0022-cpm-execution-and-persistence-model.md)): the network (early/late/float/critical) is
> computed **first and unchanged**; levelling then delays activities within the resource-constrained
> model. It reuses the engine's **absolute working-instant axis** and per-resource calendar port
> ([ADR-0037](0037-per-activity-calendars-and-instant-axis.md)) to measure demand on each resource's own
> working time, and the [ADR-0036](0036-hour-granular-calendars-and-durations.md) horizon + iteration cap
> to stay bounded. With `levelResources` **off** (the default) the recalculate output is **byte-identical**
> to today — the [ADR-0034](0034-engine-conformance-methodology.md) golden suite is the parity gate.
> The levelling **semantics** (heuristic, priority, float-first, mandatory-never-moved, window conflict)
> are documented as a new [ADR-0035](0035-schedulepoint-cpm-semantics.md) **§28**, Accepted with this
> rung's conformance slice.

## Context

Construction planners assign resources — crews, plant, equipment — to activities. When the total
assigned demand on a resource during a working period exceeds that resource's capacity, the plan is
**over-allocated** and cannot be executed as drawn (two cranes when one is on hire; 200% of a single
hydrotest pump). Since M7 landed, SchedulePoint can model resources and assignments
([ADR-0039](0039-resource-model-and-resource-calendar-scheduling.md)), a driving assignment's
productivity rate ([ADR-0040](0040-duration-types-and-resource-units.md)), and resource-dependent
scheduling ([ADR-0035](0035-schedulepoint-cpm-semantics.md) §23) — but it can neither **detect** nor
**resolve** over-allocation. The `resource.max_units_per_hour` column was deliberately **reserved "for
levelling"** by ADR-0039 and never wired; the conformance fixture's `levelling_test` objects and
scenario **S10** ("level resources — serialise over-allocations") sit unrunnable at ⚪.

**Resource levelling** is the P6/CPM answer and a headline construction-planning feature: an opt-in
pass that **delays activities** — spending total float first, then extending the schedule — until no
resource's per-period demand exceeds its capacity. The fixture is explicit about the shape:

- **NL-CRANE600** (`max_units_per_hour = 1`): **A6100** and **A6200** are SS+0 and both demand it —
  200% allocation; levelling must **serialise** them. Serialising conflicts with the crane-hire
  window's end (21-Aug): _"extend past it or report the conflict — both defensible; pick one and
  document it."_
- **NL-HYDROPUMP** (max 1): **A7700** and **A7730** both FS+0 from A7600 — must serialise.
- **Levelling must NEVER move a Mandatory-constrained activity** (A10100, A10500).

Three forces shape the decision. First, **levelling is NP-hard** — no CPM tool solves it optimally, so
we must pick and document a **deterministic heuristic** (the golden suite needs a reproducible oracle,
ADR-0034). Second, the **parity gate**: every prior engine rung kept the default recalculate
byte-identical, and levelling must too (it is opt-in). Third, the **prerequisites are already paid
for**: the capacity input (reserved `max_units_per_hour`), the demand input (`units_per_hour` ×
working duration), the instant axis + per-resource calendars, and the synchronous recalc + engine-owned
batched write all exist — levelling is a **second pass** over that machinery, not new infrastructure.

## Decision

We will implement resource levelling as an **opt-in, pure, second engine pass** using a **deterministic
serial priority-list heuristic**, orchestrated by the existing synchronous recalculate under the
plan-scoped lock, persisting engine-owned leveled columns via the existing batched write. The pure CPM
network float/critical stays **authoritative**; leveled dates are an additive overlay. This ADR fixes
the model and the invariants; the pass code and the ADR-0035 §28 semantics land with the rung.

### 1. A serial priority-list heuristic (not parallel, not optimal)

The pass schedules activities **one at a time**, highest-priority first, each into the **earliest
capacity-feasible working window at or after its early start**. This is the classic construction
method and what P6's "level resources" applies. It is chosen over **parallel** (time-stepped) levelling
— harder to make deterministic across ties, no accuracy gain at our scale — and over an **optimising
solver** (ILP/metaheuristic) — disproportionate for a live, sub-second, per-plan recalc. Determinism is
guaranteed by a **single documented composite priority key**: `levelingPriority` (client-settable,
lower = higher priority) → **total float asc** → **early start asc** → **activity id asc**. So goldens
are reproducible and shuffling input order cannot change the result.

### 2. Capacity on `resource.max_units_per_hour`; demand from the assignments

We **activate** `resource.max_units_per_hour` (ADR-0039 reserved) as the per-resource capacity ceiling:
`Decimal(18,4)?`, **NULL = uncapped** (never over-allocated — the parity-preserving default), nullable-safe
`>= 0` CHECK (**N21**, ADR-0035 §25). Demand at a working instant is the **sum of the `unitsPerHour` of
every active assignment whose activity is running then** (all assignments consume capacity, not only the
schedule-driving one), measured on the **resource's own working calendar** (ADR-0037). Feasibility is
checked by an **event-driven interval sweep** over assignment start/finish events — O(events·log), not a
per-working-minute scan — bounded by the ADR-0036 horizon + iteration cap (a resource never freed
terminates and flags, never hangs — the N11/N16 posture). A resource whose **single** activity's demand
exceeds capacity is flagged `selfOverAllocated` (cannot be fixed by delay; not split).

### 3. A second pass over an unchanged network; the network float/critical stays authoritative

The pure `computeSchedule` network pass runs **first and unchanged**, producing early/late/float/critical
as a function of logic only. Levelling runs **after**, consuming that result plus the demand model, and
produces per-activity **leveled start/finish** + a **`levelingDelay`** (working minutes on the activity's
calendar) and plan-level counts. The pure early/late/float/critical are **not recomputed** on the leveled
dates (leveling-aware float is a reserved later rung); leveled dates are an **additive overlay**. This
keeps the parity gate trivially true and the critical path meaningful. _(This is offered as the default
for decision — see the critical questions in the spec.)_

### 4. Level within float first, then extend (opt-out)

A candidate delay that fits within the activity's **total float** preserves the project finish; only when
float is exhausted does levelling **extend** the schedule. A plan option **`levelWithinFloatOnly`**
(default `false`, matching P6's off-by-default "level only within float") forbids extension, leaving any
residual over-allocation **flagged** rather than resolved.

### 5. Exclusions — activities levelling never moves

Mandatory-constrained (`MANDATORY_START`/`MANDATORY_FINISH`), Level-of-Effort, WBS-summary, milestone,
and time-fixed progressed activities are **never delayed** by levelling. They occupy the resource profile
at their network position so other activities level around them (aligning with ADR-0035 §7 mandatory,
§21 LOE, §24 WBS). A residual over-allocation caused by a pinned activity is **reported**, never resolved
by moving the pinned activity.

### 6. Availability-window conflict — produce-and-flag (default)

When serialising pushes an activity **past a resource's availability window** (the window-only crane-hire
calendar ending 21-Aug), the default is **extend past the window and flag the breach**
(`levelingWindowExceeded`, an engine-owned produce-and-flag + plan count, exactly like `constraintViolated`
/ `resourceDriverMissing`) — never a hang, never a silent success. The fixture flags this as the one
genuinely contested call ("pick one and document it"); it is recorded as a **critical open question** in
the spec and, once decided, as ADR-0035 §28.

### 7. Opt-in, additive persistence — the parity gate

Levelling runs only when the plan's **`levelResources`** flag is on (and the plan has assignments), so the
default path is **dark** — no server feature flag needed (the ADR-0040 precedent). New schema is additive:
`max_units_per_hour` activation (nullable), `activities.leveling_priority` (client-settable, constant
default), `plans.level_resources` + `plans.level_within_float_only` (default false), and **engine-owned**
`activities.leveled_start` / `leveled_finish` / `leveling_delay_minutes` (written only by the recalc
batched `UPDATE … FROM unnest(...)`, never a write DTO, never touching `version`/`updated_at` — the
ADR-0022 contract). With levelling off, recalculate is **byte-identical** to the pre-rung output across
every golden + scenario (the ADR-0034/0039/0040 gate).

### Invariants (the service/engine own them; recorded so they are not "simplified")

- **(a) Determinism.** Same plan + priorities ⇒ same leveled dates, independent of input order (the
  composite key). Unit-tested by shuffling input order.
- **(b) No post-level over-allocation** except where provably impossible (a pinned mandatory activity, an
  exhausted window under `levelWithinFloatOnly`, or `selfOverAllocated`), which is **flagged**, not hidden.
- **(c) Mandatory/LOE/WBS/milestone/time-fixed activities never move** (§5).
- **(d) Engine-owned leveled columns** are never client-writable and never bump `version`/`updated_at`.
- **(e) Off-path byte-parity** (§7).
- **(f) Boundedness.** The feasibility search terminates within the ADR-0036 horizon/iteration cap; a
  never-freed resource flags, never loops.

## Alternatives considered

- **Level inside the CPM network pass (one combined pass).** Rejected: couples resource constraints to
  the pure algorithm, breaks byte-parity, and makes float meaningless. P6 and this design keep levelling a
  separate pass on top of CPM.
- **Parallel (time-stepped) levelling.** Rejected for now: harder to make deterministic across ties (the
  golden requirement), no accuracy gain at our scale. Could be added as a selectable method later.
- **Optimising solver (ILP / metaheuristic).** Rejected: disproportionate for a live sub-second per-plan
  recalc; not what "level resources" means to construction planners.
- **Recompute float on the leveled dates (leveling-aware float).** Deferred (§3): defensible P6 behaviour,
  but it complicates the parity gate and the meaning of the critical path; kept as a later rung with the
  pure-network float authoritative now.
- **Activity splitting / stretching to resolve over-allocation.** Out of scope (a named later rung): S10
  expects **serialisation**, and splitting needs a segment/duration model we don't have.
- **Report-and-stop on a window conflict** (vs extend-and-flag). A defensible answer to the fixture's open
  question; offered as the critical decision, with extend-and-flag as the default (§6).
- **Put capacity on the assignment, or add a new capacity model.** Rejected: `resource.max_units_per_hour`
  was reserved for exactly this (ADR-0039); an availability ceiling is a property of the **resource**, not
  the assignment (which carries the demand rate, ADR-0040).
- **Background/queued levelling.** Rejected now: the synchronous path meets the ADR-0022 budget at target
  sizes; the queue stays the documented escape hatch.

## Consequences

- **Positive.** SchedulePoint gains the headline P6 levelling capability on an opt-in basis; the reserved
  `max_units_per_hour` becomes live capacity; `levelling_test` + S10 flip ⚪ → ✅ and ADR-0035 gains a
  documented §28 with a per-milestone acceptance row. Fully additive — the byte-parity path is unchanged.
  Deterministic, so goldens are reproducible. Reuses the instant axis, resource calendars, recalc, and
  engine-owned write — **no new infrastructure and no new cross-cutting pattern**.
- **Negative / cost.** The levelling pass is an **XL** addition to the engine and the recalc's cost centre
  — bounded by the event-driven sweep + horizon cap + a 2,000-activity perf assert, but a real new load
  when opted-in. The heuristic is **not optimal** (levelling is NP-hard) — a documented judgement call
  (ADR-0035 §28, north-star not parity, ADR-0034), recoverable but to be socialised with planners. The
  window-conflict policy (§6) and the network-float-authoritative choice (§3) are genuine tool-divergence
  points offered as critical questions. Leveled columns join the engine-owned-column contract and must be
  written only by the recalc `UPDATE`.
- **Neutral / follow-ups.** `@repo/types` gains the capacity/priority/leveled fields + plan-summary counts
  in lock-step. **Later rungs each get their own ADR:** resource **curves / histograms**, **cost / earned
  value / accrual**, **%-complete types**, **resource smoothing** (time-limited), **splitting / stretching**,
  **leveling-aware float**, and **multi-project levelling**. A **flagged web surface**
  (`VITE_RESOURCE_LEVELLING`) is deferred to a later slice. `CLAUDE.md` §16's ADR list and
  `docs/adr/README.md` gain an ADR-0041 row when this is Accepted.

## References

- [`docs/specs/resource-levelling/feature-spec.md`](../specs/resource-levelling/feature-spec.md) and
  [`…/implementation-plan.md`](../specs/resource-levelling/implementation-plan.md) (this rung's design + plan).
- [ADR-0039](0039-resource-model-and-resource-calendar-scheduling.md) (the `Resource`/`ResourceAssignment`
  model; `max_units_per_hour` reserved "for levelling" — activated here) and
  [ADR-0040](0040-duration-types-and-resource-units.md) (`units_per_hour` — the demand rate).
- [ADR-0037](0037-per-activity-calendars-and-instant-axis.md) (absolute-instant axis + per-resource
  calendar port — demand is measured on the resource's own calendar) and
  [ADR-0036](0036-hour-granular-calendars-and-durations.md) (minute granularity + the horizon/iteration cap).
- [ADR-0022](0022-cpm-execution-and-persistence-model.md) (synchronous recalc + engine-owned batched write
  — levelling adds a second pass under the same contract) and
  [ADR-0035](0035-schedulepoint-cpm-semantics.md) (the CPM-semantics contract — a new **§28** + **N21**
  Accept with this rung).
- [ADR-0034](0034-engine-conformance-methodology.md) (the parity gate + S10) and
  [`CAPABILITY_MATRIX.md`](../specs/engine-conformance-framework/CAPABILITY_MATRIX.md) (the `levelling_test`
  - S10 rows this rung flips).
- [ADR-0012](0012-authorization-rbac-scoped.md) / [ADR-0016](0016-core-identity-tenancy-role-model.md)
  (tenancy & RBAC + resource scoping) and [ADR-0028](0028-plan-edit-lock.md) (the edit pen on recalc).
- [`docs/DATABASE.md`](../DATABASE.md) (schema standards — exact `Decimal`, raw-SQL CHECKs, additive
  constant-default columns, engine-owned columns, no-index-without-a-query-pattern).
