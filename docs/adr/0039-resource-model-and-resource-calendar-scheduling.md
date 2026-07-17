# ADR-0039: Resource model & resource-calendar scheduling

- **Status:** Accepted
- **Date:** 2026-07-17
- **Deciders:** James Ewbank (with Claude Code)

> **Accepted — governs milestone M7 (the resource dimension), rungs 1–2.** The
> product owner locked the four design decisions (2026-07-17): a **lean** resource
> model, **per-assignment `is_driving`** driver designation, a new
> **`RESOURCE_DEPENDENT`** `ActivityType` member, and a **dark/additive** schema.
> **M7.1** (this migration) lands the model; **M7.2** wires resource-dependent
> scheduling (ADR-0035 §23) and moves that clause to Accepted. It **builds on**
> [ADR-0037](0037-per-activity-calendars-and-instant-axis.md) (the
> per-activity calendar port — the seam rung 2 rides) and reuses the org calendar
> library ([ADR-0024](0024-working-day-calendars.md)). The no-resource path stays
> **byte-identical** — the golden suite ([ADR-0034](0034-engine-conformance-methodology.md))
> is the parity gate.

## Context

Every engine milestone to date (M1–M6, M5-epic) has reached documented P6-class
parity on **time** — hour/shift calendars, per-relationship lag, progress/retained
logic, constraints, float/critical, per-activity calendars, LOE + WBS-summary. What
the schema has **never modelled is a resource**: there is no `Resource` entity, no
assignment of a resource to an activity, no crew, crane, or concrete tonnage
(`schema.prisma` had `Client → Project → Plan → Activity → ActivityDependency` and a
`Calendar` library, and nothing resource-shaped). Every capability that depends on
knowing _who_ or _what_ does the work is therefore parked — most sharply the one
remaining ❌ on the conformance matrix:

- **Resource-dependent scheduling (ADR-0035 §23).** A construction activity is often
  gated not by its own calendar but by the **availability of the resource that does
  it**. The conformance fixture is explicit: **A6100** (a 600 t crawler-crane lift)
  has an activity calendar that would allow a May start, but the crane is on hire
  only 27-Jul → 21-Aug (a window-only calendar) — "if you get a May start you are
  using the wrong calendar." **A8300** runs an HV specialist who works Mon–Thu, so
  no work may land on a Friday. P6 models this as a **Resource-Dependent** activity
  type that schedules on the **driving resource's** calendar, not the activity's.
  SchedulePoint cannot represent it (`mapActivityType('RESOURCE_DEPENDENT')` returns
  `supported: false`).
- **The whole deferred quadrant** — levelling (S10), duration/units types (`dt_*`),
  percent-complete types (`pct_*`), cost / earned value / curves / accrual, and
  external / inter-project dates (S09) — all need, first, a resource/units model to
  hang off.

The contrast matters as much as the driving case: **A5500** is a `TASK`-dependent
activity assigned a resource whose own calendar differs from the activity calendar —
and here the **activity calendar wins**; the resource's calendar is **ignored**. So
"resource-calendar-drives" is a property of the **resource-dependent activity type**,
not of "having an assigned resource." Getting this type-gating right is the crux of
rung 2.

**Why now, and why cheap.** [ADR-0037](0037-per-activity-calendars-and-instant-axis.md)
already moved the engine onto an **absolute working-instant axis** where each
activity resolves onto its **own** `WorkingTimeCalendar` **port**, chosen by the
service and cached per-recalc. A resource's calendar is a natural extension of that
same port: rung 2 is, at heart, _"for a `RESOURCE_DEPENDENT` activity, resolve the
port from the driving resource's `calendar_id` instead of the activity's own"_ — a
**service-layer resolution change**, the pure engine staying calendar-agnostic. The
expensive half (the instant axis) is already paid for. This ADR governs the schema
(rung 1) and the semantics it enables (rung 2); the levelling, duration-type, and
cost/EV rungs will each get their own ADR when they land.

## Decision

We will introduce an **org-scoped resource dimension** — a `Resource` library and a
`ResourceAssignment` join — modelled exactly like the `Calendar` library, add a new
**`RESOURCE_DEPENDENT`** `ActivityType`, and schedule a resource-dependent activity
on its **driving resource's** `Calendar` **port** through the existing ADR-0037 seam
(service resolution; the engine stays calendar-agnostic).

### 1. A lean, org-scoped `Resource` (modelled on `Calendar`)

`resources` is a **reusable org-scoped library**, a sibling of the calendar library
(not a hierarchy level), following **every** house standard exactly like `Calendar`:
UUID v7 PK, snake_case via `@map`, `timestamptz` UTC, `NOT NULL` by default, soft
delete + `delete_batch_id`, TEXT audit ids, optimistic-locking `version`, scoped
indexes. `Resource.organization_id` is **native** (the org is its direct parent,
like `Calendar`/`Client`).

Columns: `name`, an optional short `code` (a natural-key handle), an optional
`description`, a `kind` (`ResourceKind`: `LABOUR` | `EQUIPMENT` | `MATERIAL` — the
fixture's `NONLABOUR` maps to `EQUIPMENT`), and an **optional `calendar_id`** FK to
the org `Calendar` (`onDelete: Restrict`, the same posture as
`activities.calendar_id`, ADR-0037). A resource with no calendar inherits the plan
calendar at schedule time.

**Deliberately lean.** `kind` + an optional own calendar are all rung-1 needs.
Availability (`max_units`), **cost**, and **earned-value** columns are **reserved**
for their later rungs (levelling / cost / EV) and are added only when those rungs
land — mirroring how `activities.calendar_id` was reserved by ADR-0024 rather than
forward-declaring a wide, speculative schema. A resource references an **existing**
`Calendar`; SchedulePoint does **not** add a separate resource-calendar model (the
fixture's `RESOURCE`-type calendars are just calendars).

### 2. A `ResourceAssignment` join with per-assignment `is_driving`

`resource_assignments` ties an `Activity` to a `Resource` with a budgeted quantity.
It carries a **denormalised `organization_id`** (copied from its endpoints by the
service inside the create transaction, **never** client input — the
`Activity`/`ActivityDependency` pattern), so an org-scope/IDOR check filters one
indexed column without a join. It follows the same house standards (soft delete,
audit, `version`).

- **`budgeted_units`** — `DECIMAL(18,4)` (the schema's first exact-numeric column,
  per `docs/DATABASE.md` "exact data uses exact types"), `DEFAULT 0`. A
  `ck_resource_assignments_budgeted_units_nonneg` (`>= 0`) CHECK is the DB backstop
  behind the DTO `@Min(0)` boundary reject (**N14**, ADR-0035 §25), so a bypass can
  never persist a negative.
- **`is_driving`** — a boolean designating **the** driving resource of a
  `RESOURCE_DEPENDENT` activity. We chose a **per-assignment flag** over a
  `driving_resource_id` FK on the activity: the flag does not duplicate the
  resource↔activity link the assignment already is, and it lets "this assignment is
  the driver **and** carries these units" be one row. **At most one** driving
  assignment per activity is guaranteed in the DB by a **partial unique**
  `uq_resource_assignments_activity_driving (activity_id) WHERE is_driving AND
deleted_at IS NULL`.

### 3. `RESOURCE_DEPENDENT` as a new `ActivityType` member

We add `RESOURCE_DEPENDENT` to the `ActivityType` enum (alongside `LEVEL_OF_EFFORT`
and `WBS_SUMMARY`) rather than a boolean flag, so `type` stays the **single source
of scheduling behaviour** and mirrors the fixture/P6. A companion engine-owned
`activities.resource_driver_missing` boolean (produce-and-flag, exactly like
`loe_no_span` / `constraint_violated`: defaulted false, never accepted from a write
DTO, written only by the recalc's batched `UPDATE`) lands **now** so the M7.2 rung-2
slice needs no wide `ALTER` of the large `activities` table; its **writer** is the
M7.2 engine task, not this migration.

### 4. Resource-dependent scheduling reuses the ADR-0037 port seam (rung 2, §23)

For a `RESOURCE_DEPENDENT` activity, the schedule service resolves the engine
calendar **port** from the **driving resource's** `calendar_id` (fallback order:
driving-resource calendar → activity calendar → plan default), reusing the existing
per-recalc `portByCalId` cache so the crane calendar is built at most once. Every
other type is unchanged, so the **contrast is type-gated** for free: a `TASK`
activity with an assigned resource on another calendar keeps the activity calendar
(A5500), and the assignment is inert for scheduling. The pure engine gains only (a)
a `RESOURCE_DEPENDENT` type it treats like `TASK` for logic, and (b) the
`resource_driver_missing` produce-and-flag when no driver resolves. **No axis
change.** _(Rung 2 is M7.2 code; this ADR fixes its semantics.)_

### Invariants (the FK can't express them; the service owns them)

Recorded here so a future reader does not "simplify" them into the DB, and each is
to be unit-tested when the resources module lands:

- **(a) Same-org.** A `ResourceAssignment`'s `activity_id` and `resource_id`, and a
  `Resource`'s `calendar_id`, must be in the **same org**. The FKs scope only to
  their target table (a cross-org id satisfies them), so the service checks scope
  inside the write transaction — the identical limitation and remedy as
  `activities.calendar_id` (ADR-0037) and `activities.parent_id` (ADR-0038).
- **(b) Exactly one driver on a resource-dependent activity.** The partial unique
  guarantees the **≤ 1** half in the DB; **"exactly one"** (a `RESOURCE_DEPENDENT`
  activity needs a driver) and **"a `MATERIAL` resource may not drive"** need the
  activity's `type` / the resource's `kind`, which a CHECK/partial-unique cannot
  read — so they are transactional service checks (reject on write; the engine
  additionally **produces-and-flags** `resource_driver_missing` at recalc rather
  than crashing).
- **(c) `RESOURCE_IN_USE` delete guard.** A resource assigned to an **active**
  activity may not be soft-deleted — a service guard returning `409
RESOURCE_IN_USE` with a count, mirroring `CALENDAR_IN_USE` (the guard counts only
  **active** referencers; `RESTRICT` is defence in depth). Symmetrically, the
  **`CALENDAR_IN_USE` guard must be extended** to also count active resources
  referencing a calendar (a resource is now a third referencer, alongside active
  plans and activities) — backed by `idx_resources_calendar_id`.
- **(d) Assignment cascade.** Soft-deleting an activity should **sweep its active
  assignments** (stamped with the same `delete_batch_id`), like the incident-edge
  cascade in `HierarchyLifecycleService` — a lifecycle follow-on, not this schema
  slice.

### Indexes (justified; raw-SQL partials in the migration)

Full composites/single indexes are declared in `schema.prisma` (`@@index`); partial
(unique and non-unique) indexes are raw SQL in the migration (Prisma cannot express
a `WHERE`). `resources`: `(organization_id, created_at, id)` (org FK + active list +
cursor — the `Calendar`/`Client` pattern); partial unique `uq_resources_org_name`
(active name per org) and `uq_resources_org_code` (active code per org where set —
the `uq_activities_plan_code` pattern); partial `idx_resources_calendar_id` (the
`CALENDAR_IN_USE` / driving-calendar load — the `idx_activities_calendar_id` twin);
partial `idx_resources_delete_batch_id`. `resource_assignments`:
`(organization_id)` (FK + IDOR); partial unique
`uq_resource_assignments_activity_resource` `(activity_id, resource_id) WHERE
deleted_at IS NULL` (backs `DUPLICATE_ASSIGNMENT`; its **leftmost prefix**
`activity_id` **subsumes** a standalone active-`activity_id` index, so none is
added); partial unique `uq_resource_assignments_activity_driving` `(activity_id)
WHERE is_driving AND deleted_at IS NULL` (the ≤ 1-driver backstop **and** the recalc
"find the driving assignment" load); partial `idx_resource_assignments_resource_id`
(the `RESOURCE_IN_USE` count); partial `idx_resource_assignments_delete_batch_id`.

### Additivity (the parity gate)

Everything is additive: two new tables, one new enum, one appended enum value, and
two constant-default columns on existing tables (`resource_driver_missing` on
`activities`, all-`false`). No data migration. With no `Resource` / no
`ResourceAssignment` / no `RESOURCE_DEPENDENT` activity, the engine and recalc are
**byte-identical** to the pre-epic output across every prior golden + scenario —
the ADR-0034/0037 gate.

## Alternatives considered

- **A wider forward-declared schema now** (cost / curve / EV / at-completion / max
  units up front). Rejected: speculative columns for rungs whose semantics are not
  yet designed (levelling and cost/EV each need their own ADR); a lean model that
  extends per rung is the ADR-0024 precedent (`calendar_id` reserved, not the whole
  calendar model forward-declared). _Product-owner default: lean._
- **`driving_resource_id` FK on the activity** instead of a per-assignment
  `is_driving` flag. Simpler to read, but it **duplicates** the resource↔activity
  link the assignment already is, and does not extend to "this assignment is the
  driver **and** carries these units." Rejected in favour of the flag + a DB
  partial-unique guaranteeing ≤ 1 driver.
- **`RESOURCE_DEPENDENT` as a boolean flag** rather than an `ActivityType` member.
  Rejected: the fixture and P6 treat it as an activity **type** with distinct
  scheduling; a new enum member mirrors `LEVEL_OF_EFFORT`/`WBS_SUMMARY` and keeps
  `type` the single source of scheduling behaviour.
- **A separate resource-calendar entity.** Rejected: a resource's calendar is an
  ordinary org `Calendar` (the fixture's `RESOURCE`-type rows are just calendars);
  reusing the library avoids a parallel model, and the ADR-0037 port seam already
  consumes `Calendar`.
- **Fold resource-dependent scheduling into per-activity calendars with no resource
  model** (let a planner pick the crane's calendar as the activity calendar).
  Rejected: it loses the resource as first-class data (no assignment, no path to
  levelling/cost/EV) and mis-models the contrast (A5500 needs the resource
  **without** its calendar driving). §23 is explicitly about the **driving
  resource's** calendar.
- **Do levelling in rungs 1–2.** Rejected: levelling is an XL scheduling-algorithm
  change (its own ADR/sub-epic); rungs 1–2 deliberately **produce-and-report**
  over-allocation rather than resolve it (fixture §7).

## Consequences

- **Positive.** SchedulePoint gains a general, forward-compatible resource model
  (org-scoped library + activity assignment) that unblocks the entire deferred
  quadrant; the conformance matrix's last ❌ can flip in M7.2 and ADR-0035 §23 move
  to Accepted; the model is referentially sound (real FKs, ≤ 1-driver and
  no-duplicate partial-uniques, non-negative-units CHECK) and follows the reference
  template exactly, so there is no new cross-cutting pattern. Fully additive — the
  byte-parity path is unchanged.
- **Negative / cost.** Four invariants (same-org, exactly-one-driver +
  material-never-drives, `RESOURCE_IN_USE`, assignment cascade) live in the
  **service**, not the DB, and must be covered by explicit reject-path tests; they
  cannot be weakened without revisiting this ADR. The `CALENDAR_IN_USE` guard grows
  a third referencer (active resources). `resource_driver_missing` joins the
  engine-owned-column contract (ADR-0022) and must be written only by the recalc
  `UPDATE`, never a write DTO.
- **Neutral / follow-ups.** `@repo/types` must gain `ResourceKind`, the
  `RESOURCE_DEPENDENT` `ActivityType` member, and `ResourceSummary` /
  `ResourceAssignmentSummary` in lock-step (a separate task). M7.1 F2/F3 build the
  `resources` module + assignment write path from the reference template; M7.2
  (F4–F5) wires the driving-calendar resolution + conformance and Accepts §23.
  **Later rungs each get their own ADR:** resource **levelling** (S10, XL),
  **duration/units types** (`dt_*`), **cost / earned value / curves / accrual**, and
  **external / inter-project** (S09). CLAUDE.md §16's ADR list and
  `docs/adr/README.md` gain an ADR-0039 row.

## References

- [`docs/specs/engine-conformance-framework/M7-resource-dimension-feature-spec.md`](../specs/engine-conformance-framework/M7-resource-dimension-feature-spec.md)
  and [`…/M7-resource-dimension-implementation-plan.md`](../specs/engine-conformance-framework/M7-resource-dimension-implementation-plan.md)
  (the approved design; §23 rung 1 = this migration).
- [ADR-0035](0035-schedulepoint-cpm-semantics.md) **§23** (resource-dependent
  scheduling — Accepts under M7.2) and **§25** (N14 negative-units reject).
- [ADR-0037](0037-per-activity-calendars-and-instant-axis.md) (the
  per-activity calendar port + absolute-instant axis — the seam rung 2 rides) and
  [ADR-0024](0024-working-day-calendars.md) / [ADR-0036](0036-hour-granular-calendars-and-durations.md)
  (the org calendar library a resource references).
- [ADR-0038](0038-wbs-activity-hierarchy.md) (the "FK can't scope to plan/org, the
  service does" precedent) and [ADR-0022](0022-cpm-execution-and-persistence-model.md)
  (the engine-owned-column write contract for `resource_driver_missing`).
- [ADR-0034](0034-engine-conformance-methodology.md) (the parity
  gate); [ADR-0012](0012-authorization-rbac-scoped.md) / [ADR-0016](0016-core-identity-tenancy-role-model.md)
  (tenancy & RBAC + resource scoping).
- [`docs/DATABASE.md`](../DATABASE.md) (schema standards — partial indexes, CHECK
  constraints, FK `onDelete` posture, cascade soft-delete + `delete_batch_id`).
- Migration `apps/api/prisma/migrations/20260717020000_m7_resource_model/`.
