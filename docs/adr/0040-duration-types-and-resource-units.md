# ADR-0040: Duration types & the resource-units model

- **Status:** Accepted
- **Date:** 2026-07-17
- **Deciders:** James Ewbank (with Claude Code)

> **Accepted — governs milestone M7 (the resource dimension), rung 4 (duration/units
> types, `dt_*`).** The product owner locked the design decisions (2026-07-17): model
> **all four** P6 duration types (default `FIXED_DURATION_AND_UNITS_TIME`); the planned
> **rate** (`units/time`) lives on the **driving `ResourceAssignment`**, not the
> `Resource`; the recompute that keeps `Units = Duration × Units/Time` true is a **pure
> service-boundary** concern (the CPM engine is untouched); and the schema is
> **dark/additive**. **F1** (this slice) lands the schema + this ADR; **F2** adds the
> pure `resolveTriad` recompute function; **F3** wires it into the two write paths; **F4**
> (rung B) flips the conformance `dt_*` rows and Accepts the ADR-0035 clauses. It
> **builds on** [ADR-0039](0039-resource-model-and-resource-calendar-scheduling.md) (the
> `Resource`/`ResourceAssignment` model + `budgetedUnits` + `isDriving` — this rung adds
> the `unitsPerHour` to that same assignment) and [ADR-0036](0036-hour-granular-calendars-and-durations.md)
> (durations in working **minutes** — the triad is minute-exact). The no-rate path stays
> **byte-identical** — the golden suite ([ADR-0034](0034-engine-conformance-methodology.md))
> is the parity gate.

## Context

[ADR-0039](0039-resource-model-and-resource-calendar-scheduling.md) gave SchedulePoint a
**resource dimension** — an org-scoped `Resource` library and a `ResourceAssignment` join
carrying a **budgeted quantity** (`budgeted_units`), a **driving** flag (`is_driving`),
and a new `RESOURCE_DEPENDENT` `ActivityType` that schedules on its driving resource's
calendar. But the model is **static**: an activity's `duration_minutes`, its assignment's
`budgeted_units`, and the rate at which the resource produces are three unrelated numbers.
It does not model the identity every real planning tool enforces:

> **Units = Duration × Units/Time** — the budgeted work of a driving resource equals the
> activity's working duration times the rate (units per working hour) at which that
> resource produces.

Because that identity is unmodelled, SchedulePoint cannot answer the questions a planner
asks constantly — "double the crew (rate); how short does this get?" (units held ⇒
**duration** recomputes), "fixed 5-day crane hire at this rate; how many lifts?" (**units**
recompute), "400 m³ at a fixed 8 days; what daily rate?" (**units/time** recomputes). P6
encodes the answer as an activity's **Duration Type** — one of four values deciding **which
of {Duration, Units, Units/Time} is held and which is recomputed** when a planner edits
another. The conformance fixture carries a `duration_type` on **every** activity (all four
P6 values appear, dominated by the default `FIXED_DURATION_AND_UNITS_TIME`) and a
`units_per_hour` on **every** assignment, and the capability matrix marks the `dt_*` row
**⚪ Deferred — "needs the resource/units model."** That model now exists; this is the rung
that consumes it.

**Why now, and why cheap.** The triad is a **pure arithmetic identity** in the
working-minute units [ADR-0036](0036-hour-granular-calendars-and-durations.md) already
established, resolved **once at the write boundary** — exactly as P6 resolves duration
types at data entry, not during scheduling. It needs **no new CPM-pass logic and no engine
axis change**: for the two units-driven types the derived working duration is written into
`duration_minutes`, which the engine already reads and places on the ADR-0037/0039 port.
It is the cheapest, highest-value next rung before the heavier deferred quadrant (levelling
— a new scheduling pass; cost / earned value — a whole new dimension). This ADR governs the
**schema** (F1) and the **semantics** it enables (F2/F3 the recompute, F4 the conformance);
the recompute **function** (`resolveTriad`) and its wiring are F2/F3 code, not this slice.

## Decision

We will make the resource model **dynamic** by adding a per-activity **`duration_type`**
(a four-value enum) and a per-assignment **`units_per_hour`** (the planned rate) to the
existing ADR-0039 model, keep the `Units = Duration × Units/Time` identity true through a
**pure service-boundary recompute** resolved at every write, and leave the **CPM engine
untouched** — it reads the already-resolved `duration_minutes` exactly as today. This ADR
fixes the schema and the invariants; the recompute code lands in F2/F3.

### 1. `units/time` lives on the driving `ResourceAssignment`, not the `Resource`

We add **`resource_assignments.units_per_hour`** — the planned **rate** at which the
driving resource produces on **this** activity — **not** a `resource.max_units_per_hour`.
P6 (and the fixture) put the planned rate **per assignment** because "how fast this crew
works **here**" is an activity-level planning decision, distinct from "how much of this
crew exists" (an availability cap). `resource.max_units_per_hour` remains **reserved for
levelling** (a later rung, ADR-0039's lean-model posture): it is an availability envelope
consumed by a resource-levelling pass, a different concept that must not be conflated with
the driving rate. Only the **driving** assignment (`is_driving`, the ADR-0039 ≤1-driver
partial-unique) participates in the triad; a non-driving assignment's units/rate are
independent bookkeeping and never drive the activity's duration.

`units_per_hour` is a **`Decimal(18,4)?`** (nullable), mirroring the `budgeted_units`
precedent exactly for type and placement. It is an **exact numeric** (`docs/DATABASE.md`:
exact data uses exact types), and it is a **client-settable** definition field — unlike the
engine-owned `resource_driver_missing`.

### 2. The four-value `DurationType` enum on the activity (default `FIXED_DURATION_AND_UNITS_TIME`)

We add a **new Prisma enum** `DurationType` with **all four** P6 values —
`FIXED_DURATION_AND_UNITS_TIME` | `FIXED_DURATION_AND_UNITS` | `FIXED_UNITS` |
`FIXED_UNITS_TIME` — and **`activities.duration_type DurationType @default(FIXED_DURATION_AND_UNITS_TIME)`**.
The fixture uses all four; the default is the dominant one, so modelling three-plus-coerce
would mis-score conformance on the majority of activities. A closed enum mirrors P6 exactly.

`duration_type` is a **client-settable** definition column (a Planner picks it, like
`type`/`constraint_type`), **not** engine-owned. It carries **no index**: it is read on the
**full-plan recalc load** (already plan-scoped by `(plan_id, created_at, id)`) and is never
a `WHERE`/`JOIN`/`ORDER BY` predicate — the `secondary_constraint_type` /
`schedule_as_late_as_possible` precedent on the same table.

### 3. `Units = Duration × Units/Time` is a service-boundary invariant; `resolveTriad` is F2

The identity is kept true by a **pure, I/O-free** recompute function — `resolveTriad(type,
editedField, {D, U, R})` — resolved **in the write transaction** by whichever write path
(activity duration/type edit, or assignment units/rate edit) changed a quantity, then
persisting the changed columns (`duration_minutes` and/or `units_per_hour` /
`budgeted_units`). The **`duration_type` names which quantity is recomputed** given which
the planner edited; **duration is auto-derived only under the two units-driven types**
(`FIXED_UNITS`, `FIXED_UNITS_TIME`) and only on the complementary edit, in which case
`duration_minutes := roundHalfUp((U / R) × 60)` is written and fed to the engine unchanged.
The full truth table, the "edit a held field" priority order, and the rounding rule are the
**ADR-0035 §26/§27** contract (Accepted under F4). **`resolveTriad` itself — the function,
its truth table, its guards, and its wiring — is F2/F3 code, deliberately NOT part of this
schema slice**; this ADR fixes only that the recompute is a **service-boundary** concern
(not the engine, not on-read) and that the identity is a post-write invariant.

**Why service boundary, not the engine.** Putting the recompute in the CPM pass would make
the engine non-pure (it would need units/rate + duration type as inputs and mutate duration
mid-pass), break the byte-parity gate, and couple a **data-entry** concern to the scheduling
algorithm. Duration types are resolved once, at edit time, in P6 too. (Progress-driven
remaining-duration recompute — the `pct_units` behaviour — genuinely **is** a recalc-time
concern, which is exactly why it is the **deferred earned-value rung**, not this one.)

### 4. Nullability semantics: `units_per_hour` NULL = triad inert = parity

`units_per_hour` is **nullable with no default**. A NULL rate — an activity with no driving
assignment, or a driving assignment on which no rate has been entered — means the triad is
**inert**: `resolveTriad` is a **no-op**, `duration_minutes` is exactly whatever the planner
entered, and nothing is derived. This is the **parity gate**: with no `units_per_hour` on
any driving assignment, the engine and recalc are **byte-identical** to the pre-rung output
across every prior golden + scenario (the ADR-0034/0037/0039 gate). The whole feature is
**dark** until a rate is supplied, so `main` stays releasable throughout the epic and no
server feature flag is required. Preserving this NULL-inert semantics is a hard requirement
(recorded here so a future reader does not add a `DEFAULT 0`, which would silently activate
the triad on every existing assignment).

### 5. Boundary rejects — N19 (negative rate) and N20 (zero-rate divisor)

Two negative cases are added to the ADR-0035 §25 ledger (Accepted under F4):

- **N19 — negative rate.** `units_per_hour < 0` is rejected at the API boundary (a DTO
  `@Min(0)`, F3). The DB backstop is a raw-SQL
  **`ck_resource_assignments_units_per_hour_nonneg (units_per_hour IS NULL OR units_per_hour
  > = 0)`** CHECK, mirroring the ADR-0039 `ck_resource_assignments_budgeted_units_nonneg`
(N14) precedent — a bypass can never persist a negative. The CHECK is **nullable-safe**
(`IS NULL OR …`) so it never blocks the common no-rate path.
- **N20 — zero-rate divisor.** A `units_per_hour` of **0** on a **units-driven recompute**
  (`D := U / R`) would divide by zero. This is rejected **in the service, before any
  division** (`UNITS_PER_HOUR_ZERO`, F3) so `resolveTriad` is a **total** function that
  never yields NaN/Infinity/a negative duration. N20 is a **service** guard (a CHECK cannot
  read the activity's `duration_type` to know whether the rate is a divisor), so this ADR
  fixes the semantics, not a DB constraint. (A 0 rate that is not a divisor is harmless, but
  the F3 rule rejects 0 on any units-driven type to keep the boundary simple; documented in
  ADR-0035 §27.)

### 6. The CPM engine is untouched

The pure engine gains **nothing** from this rung. It reads `duration_minutes` exactly as
today and places it on the ADR-0037/0039 calendar port. For a `FIXED_UNITS` /
`FIXED_UNITS_TIME` activity the _derived_ working duration has already been written into
`duration_minutes` at edit time (§3), and the hours→minutes scaling is a fixed `×60`
(calendar-independent), so a `RESOURCE_DEPENDENT` + `FIXED_UNITS` activity composes with the
driving-calendar seam without a special case. **No axis change, no new pass, no new
engine-owned column.**

### Reserved, NOT added (the ADR-0039 lean-model posture)

To avoid a speculative wide schema for rungs whose semantics are not yet designed, this
slice adds **only** `duration_type` and `units_per_hour`. The following are **deliberately
NOT added** and are reserved for their owning later rungs:

- **`resource.max_units_per_hour`** — an availability cap for **resource levelling** (its
  own ADR/sub-epic).
- **`resource_assignments.actual_units` / `remaining_units` / `at_completion_units` /
  `curve` / `assignment_lag`** — the **percent-complete / earned-value** rung, which changes
  how remaining duration is measured under progress (a recalc-time re-derivation) and needs
  cost/curve columns. That is a separate, heavier milestone with its own ADR.

This mirrors how ADR-0024 reserved `activities.calendar_id` and ADR-0039 reserved cost/EV
columns, rather than forward-declaring a wide speculative schema.

## Invariants (the service owns them; recorded so they are not "simplified" into the DB)

Each is to be unit-tested when F2/F3 land:

- **(a) Identity after every write.** After any quantity edit, the stored
  `duration_minutes`, `budgeted_units`, and `units_per_hour` satisfy `budgetedUnits =
(durationMinutes ÷ 60) × unitsPerHour` to `Decimal(18,4)` precision (with the documented
  half-up integer-minute rounding on a derived duration; the shown dependent is re-derived
  from the rounded duration so the displayed triad is self-consistent). A CHECK cannot span
  the activity + assignment rows, so this is a service invariant.
- **(b) Duration derives only under the two units-driven types.** `duration_minutes` is
  auto-changed **only** for `FIXED_UNITS` / `FIXED_UNITS_TIME`, and only on the complementary
  edit (the ADR-0035 §26 table). Every other type/edit holds the duration.
- **(c) Only the driving assignment participates.** A multi-assignment activity resolves the
  triad against its **single** driving assignment (the ADR-0039 ≤1-driver partial-unique);
  non-driving assignments' units/rate are inert for scheduling.
- **(d) The derived field is server-computed, never trusted from the client.** The client's
  value for a recomputed field is ignored/overwritten by `resolveTriad`; only the
  explicitly-edited field is taken as input (precedence on a multi-field write: the edited
  field wins, ties broken duration → units → rate). A data-integrity/IDOR concern for the
  security review (F3).
- **(e) NULL rate ⇒ no-op ⇒ byte-parity** (§4). With no `units_per_hour` on any driving
  assignment, `resolveTriad` changes nothing and the recalc output is byte-identical.
- **(f) N19/N20 totality** (§5). Negative rate rejected at the boundary + CHECK; zero rate
  rejected before any division; the pure function never yields NaN/Infinity/negative
  duration.

## Additivity (the parity gate)

Everything is additive: **one new enum** (`DurationType`), **one constant-default column**
on `activities` (`duration_type DEFAULT 'FIXED_DURATION_AND_UNITS_TIME'` — a NOT NULL column
with a constant default is metadata-only in Postgres 11+, no table rewrite; every existing
row reads the default), and **one new-nullable column** on `resource_assignments`
(`units_per_hour`, no default, NULL everywhere until a rate is entered) plus its
nullable-safe CHECK. **No data migration.** With no `units_per_hour` present the engine and
recalc are byte-identical to the pre-rung output.

**Reversibility.** The repo uses **forward-only** Prisma migrations in production
(ADR-0018's self-migrating image), so no down migration is authored; the direction is
recorded as a comment in `migration.sql` for completeness. In principle the change is
reversible — drop the two columns (which drops the CHECK) and drop the enum type — with the
one Postgres caveat that a materialised enum label cannot be dropped in place (`DROP TYPE`
after the column is gone is fine; there is no `ALTER TYPE … DROP VALUE`), the same caveat
ADR-0039 documented for `RESOURCE_DEPENDENT`.

## Alternatives considered

- **Put `units/time` on the `Resource` (`max_units_per_hour`).** Rejected: P6 and the
  fixture carry the **planned rate per assignment**; `resource.max_units_per_hour` is an
  **availability cap** for levelling (a different concept, reserved by ADR-0039). Using it
  would conflate "how fast this crew works here" with "how much of this crew exists."
- **Recompute inside the CPM engine (at recalc time).** Rejected: it makes the engine
  non-pure, breaks the byte-parity gate, and couples data entry to scheduling. The triad is
  resolved once at edit time in P6 too. (Progress-driven `pct_units` re-derivation is a
  genuine recalc-time concern — hence the deferred EV rung.)
- **Compute the dependent field on read instead of storing it.** Rejected: the engine reads
  `duration_minutes`, so a **derived** duration must be **persisted** for the engine to see
  it; storing the whole resolved triad keeps reads cheap and the identity auditable. A tiny
  rounding residual is documented, not hidden.
- **Model three duration types + coerce the default.** Rejected: the fixture uses **all
  four**, and the default `FIXED_DURATION_AND_UNITS_TIME` is the most common — coercing it
  mis-scores conformance on the majority of activities. Four is a closed P6 enum.
- **Include percent-complete types now (`pct_physical`/`pct_units`/`code_steps`).**
  Rejected: they change how **remaining duration / % complete** is measured under
  **progress**, need `actual_units`/`remaining_units`/`curve`, and re-derive at recalc time
  — a separate, heavier earned-value rung. Clean cut at the planning-time triad.
- **A wider forward-declared schema now** (cost / curve / EV / at-completion / max-units up
  front). Rejected: speculative columns for rungs whose semantics are not yet designed; a
  lean model that extends per rung is the ADR-0024/0039 precedent.

## Consequences

- **Positive.** The resource model becomes **dynamic**: assigned units + a rate now **drive
  duration** for the units-driven types, closing the loop ADR-0039 opened, with **zero
  engine risk** (the engine is untouched and the parity suite is the net). Referentially
  sound — the `units_per_hour` CHECK backs the boundary reject, and the identity is an
  auditable, unit-tested service invariant. Follows the reference template exactly (no new
  cross-cutting pattern). Fully additive — the byte-parity path is unchanged. Unblocks the
  conformance `dt_*` rows (F4 flips ⚪ → ✅) and lays the units foundation the later
  earned-value rung needs.
- **Negative / cost.** The `Units = Duration × Units/Time` identity and the N20 zero-rate
  guard live in the **service** (a CHECK cannot span the two rows or read `duration_type`),
  so they must be covered by explicit tests (F2/F3) and cannot be weakened without revisiting
  this ADR. A quantity write now loads the driving assignment alongside the activity (a
  single indexed join via the `(activity_id) WHERE is_driving` partial-unique — no N+1;
  backend-performance-reviewer). A derived duration carries a documented sub-minute rounding
  residual on the shown units (absorbed by re-deriving the dependent).
- **Neutral / follow-ups.** `@repo/types` gains `DURATION_TYPES` / `DurationType` and the
  `durationType` / `unitsPerHour` fields on the summaries in lock-step (F1). **F2** builds
  the pure `resolveTriad` module; **F3** wires it into the activity + assignment write paths
  (adding the `editedField` discriminator DTOs); **F4** teaches the conformance adapter to
  resolve each fixture activity's `duration_minutes` via the same function, flips the
  **Duration types** matrix row, and moves **ADR-0035 §26/§27 + N19/N20** to Accepted. The
  later rungs each get their own ADR: **percent-complete / earned value / cost / curves**
  (which adds `actual_units`/`remaining_units`/`curve` + a recalc-time re-derivation) and
  **resource levelling** (which consumes the still-reserved `resource.max_units_per_hour`).
  `CLAUDE.md` §16's ADR list and `docs/adr/README.md` gain an ADR-0040 row.

## References

- [`docs/specs/duration-types-and-units/feature-spec.md`](../specs/duration-types-and-units/feature-spec.md)
  and [`…/implementation-plan.md`](../specs/duration-types-and-units/implementation-plan.md)
  (the approved design; §4 = this schema slice, F1).
- [ADR-0039](0039-resource-model-and-resource-calendar-scheduling.md) (the
  `Resource`/`ResourceAssignment` model + `budgeted_units` + `is_driving` + the lean-model
  posture this rung extends) and [ADR-0036](0036-hour-granular-calendars-and-durations.md)
  (durations in working minutes — the triad is minute-exact).
- [ADR-0037](0037-per-activity-calendars-and-instant-axis.md) (the per-activity /
  driving-resource calendar port the derived duration is placed on) and
  [ADR-0022](0022-cpm-execution-and-persistence-model.md) (the engine-owned-column write
  contract `duration_type`/`units_per_hour` are the client-settable **counterpoint** to).
- [ADR-0035](0035-schedulepoint-cpm-semantics.md) **§26/§27** (the duration-type recompute
  contract + the units/time home & derivation boundary — Accept under F4) and **§25**
  (N19/N20 negative cases).
- [ADR-0034](0034-engine-conformance-methodology.md) (the parity gate) and
  [ADR-0012](0012-authorization-rbac-scoped.md) / [ADR-0016](0016-core-identity-tenancy-role-model.md)
  (tenancy & RBAC + resource scoping).
- [`docs/DATABASE.md`](../DATABASE.md) (schema standards — exact `Decimal` types, raw-SQL
  CHECK constraints, additive constant-default columns, no-index-without-a-query-pattern).
- Migration `apps/api/prisma/migrations/20260717030000_m7_duration_types_and_units/`.
