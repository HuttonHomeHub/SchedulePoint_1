# @repo/api

## 0.16.0

### Minor Changes

- [#94](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/94) [`4e78ff1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4e78ff11f9468ed8511f2e780dc2072abacc7050) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn on the remaining eight off-by-default web surfaces (Resources, Duration types, Resource
  levelling, Earned Value, Cost accrual, Activity steps, Resource curves, Inter-project external dates)
  by flipping their `VITE_*` flags from default-off to default-on — after clearing every documented
  pre-flip blocker. The engine/API behind each surface was already live; this exposes it in the UI by
  default.

  Pre-flip remediation (TECH_DEBT [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/38)/[#39](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/39)/[#40](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/40)/[#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)/[#44](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/44)):

  - **API (`@repo/api`)** — **Pen-gate resource-assignment writes** ([#39](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/39)): assign / edit / unassign now
    call `PlanEditLockService.assertHoldsPen` like the activity write path (a units/rate edit persists the
    owning activity's derived duration, a scheduling mutation), returning **423** to a non-holder when
    `PLAN_EDIT_LOCK_ENFORCED` is on; 423 e2e added. **Money overflow guards** (#40a): every integer
    minor-unit money field (`budgetedExpense`/`actualExpense`/`budgetedCost`/`actualCost`) gains
    `@Max(MONEY_MINOR_UNITS_MAX)` and every `Decimal(18,4)` field
    (`costPerUnit`/`maxUnitsPerHour`/`budgetedUnits`/`unitsPerHour`/`actualUnits`) `@Max(DECIMAL_18_4_MAX)`,
    so an over-range value is a clean **422** rather than a precision-loss / column-overflow 500; boundary
    specs added. **Engine-owned `external_driven`** ([#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)): a new per-activity boolean column mirroring
    `constraint_violated` (metadata-only migration), written by the recalc batched `unnest` UPDATE and
    aggregated in the read-summary so `externalDrivenCount` is truthful on a plain summary read.
  - **Types (`@repo/types`)** — `ActivitySummary` gains `externalDriven: boolean`; new
    `MONEY_MINOR_UNITS_MAX` / `DECIMAL_18_4_MAX` bounds.
  - **Web (`@repo/web`)** — **Row-actions `Menu`** ([#38](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/38)): the activities table's per-row actions move from
    a spread of ghost buttons to a single overflow `⋯` trigger opening the APG `Menu`
    (Logic/Progress/Resources/Steps/Edit/Delete, role-gated) — meeting the "dense row actions use a Menu,
    never hover-only" standard. **External badge** ([#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)): an "External" row badge in the Name cell mirrors
    the "Conflict" badge, driven by the engine's per-activity `externalDriven`. **Context gating** ([#44](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/44)):
    the Steps row action is coupled to Earned Value (its only consumer), and the resource loading-curve
    picker is hidden for zero-span milestones. Then all eight `flagDefaultOff` flags become `flagDefaultOn`.

  Parity: `compute.ts` and `level.ts` are untouched; `external_driven` is engine-owned output written on
  every recalc (false when not external-driven), so absent-data byte-parity holds and existing engine / EV
  goldens do not move. Not addressed here (documented follow-ups): #40b Contributor cost-progress wiring,
  [#42](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/42) shared `SelectField`, [#43](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/43) histogram bucket in URL.

### Patch Changes

- Updated dependencies [[`4e78ff1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4e78ff11f9468ed8511f2e780dc2072abacc7050)]:
  - @repo/types@0.14.0

## 0.15.0

### Minor Changes

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Cost accrual (M7 rung 5, ADR-0044 F1 / ADR-0035 §32). Each activity gains a settable `accrualType`
  (`START` / `UNIFORM` (default) / `END`) that governs **when** its cost lump-sum is recognised in the
  Earned-Value read's Planned-Value time-phasing — `START` at the activity start, `END` at its finish,
  `UNIFORM` linearly — reshaping the cost / cash-flow S-curve. It **never changes a CPM date**, feeds the
  scheduler nothing, and is a pure read-model extension of `earned-value.ts`: `UNIFORM` (or absent) is
  byte-identical to the pre-ADR-0044 phasing (the parity gate), so the existing Earned-Value goldens stay
  green. The engine (`compute.ts`) and the levelling pass (`level.ts`) are untouched.

  - **API (`@repo/api`)** — the create/update activity DTOs, the activity response DTO, and the EV read
    path (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`) all carry `accrualType`
    (reuses `activity:update`; the EV read stays `cost:read`-gated). `AccrualType` / `ACCRUAL_TYPES`
    round-trip through `@repo/types`.
  - **Types (`@repo/types`)** — `ActivitySummary` gains `accrualType: AccrualType`.
  - **Conformance** — the EV adapter reads the fixture's `expenses.accrual_type` and collapses per-expense
    → one activity value (ADR-0044 §Q4); new first-principles goldens assert the phased PV to the minor
    unit for **E001** (£45,000 crane mobilisation, `START` — full PV at the start), **E002** (£68,000,
    `UNIFORM` — 50% at mid-window) and **E004** (£3,500 retention, `END` — nothing until the finish), plus
    a `UNIFORM`→`START` flip differential. The `accrual_start` / `accrual_uniform` / `accrual_end`
    capability tags flip ✅ (32 ✅ / 1 ⚪); ADR-0035 gains an **Accepted §32**.
  - **Web (`@repo/web`)** — a **Cost accrual** select (Start / Uniform / End) in the activity form's
    "Cost & earned value" fieldset, behind the new **off-by-default** `VITE_COST_ACCRUAL` flag; wired
    through the create/update mutation and seeded from the row so a stored value round-trips when hidden.

  Deferred (later ADR-0044 slices, not in this change): the period-trend cost **S-curve** chart series
  (read-model + web), weighted **activity steps** (F2), and **resource loading curves** (F3).

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`272eb42`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/272eb420313809d0867ef81753ae4c705f631005) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM **duration types** now drive the resource-units triad (M7 rung 4, ADR-0040). An activity carries a
  `durationType` (FIXED_DURATION_AND_UNITS_TIME (default) / FIXED_DURATION_AND_UNITS / FIXED_UNITS /
  FIXED_UNITS_TIME) and a driving resource assignment carries a `unitsPerHour` rate; editing any one of
  {duration, units, units/time} recomputes the correct **other** field via the pure `resolveTriad`
  function so `Units = Duration × Units/Time` stays true — and for FIXED_UNITS / FIXED_UNITS_TIME the
  **duration is derived** from the driving resource's units ÷ rate and fed to the CPM engine unchanged
  (the engine is untouched; the no-rate path is byte-identical). The recompute runs at the write boundary,
  in one optimistic-locked transaction spanning the activity + its driving assignment: an activity duration
  edit recomputes the assignment's units/rate; an assignment units/rate edit (with an `editedField`) can
  recompute the owning activity's duration — each bumping the sibling's `version`, documented per-endpoint.
  Boundary rejects: negative `unitsPerHour` (N19, `@Min(0)` + DB CHECK) and a zero rate on a units-driven
  recompute (N20, 422 `UNITS_PER_HOUR_ZERO`, before any division). Additive DTO fields (`durationType`,
  `unitsPerHour`, `editedField`) + response exposure; new shared types `DurationType` / `EditedField`.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - EV2a: make the EV1 cost & percent-complete-type fields (ADR-0042) settable via the API. Passthrough only
  — no earned-value computation and no new endpoint (that is EV2b). Threads the already-landed schema columns
  through the create/update DTOs and the service/repository write paths so they persist without changing any
  behaviour. Client-settable inputs (all Planner/Org-Admin-gated writes): activities `percentCompleteType`
  (`DURATION` default / `UNITS` / `PHYSICAL`), `physicalPercentComplete` (0–100, N23), `budgetedExpense` /
  `actualExpense`; resources `costPerUnit` (cost rate, N22); assignments `budgetedCost` (null = derive later),
  `actualCost`, `actualUnits`; plan `eacMethod` (`CPI` default) / `currencyCode` (ISO-4217, nullable to clear).

  **Cost reads are Planner/Org-Admin only.** The commercially sensitive money **amounts** (`costPerUnit`,
  `budgetedCost` / `actualCost`, `budgetedExpense` / `actualExpense`) are deliberately NOT returned by the
  general entity GETs or in `@repo/types` summary types — they will be served only by the dedicated
  `cost:read`-gated Earned-Value read endpoint (EV2b), so a Viewer/Contributor can never read cost through a
  schedule read. The non-sensitive fields (`percentCompleteType`, `physicalPercentComplete`, `actualUnits` —
  a quantity like the already-public `budgetedUnits` —, `eacMethod`, `currencyCode`) remain in the summaries.
  Money on the wire is a plain `number` of minor units (`BIGINT` amounts → `Number(x)`, the `Decimal(18,4)`
  cost rate → `x.toNumber()`). Fully additive and behaviour-preserving: unset fields keep today's behaviour
  and nothing touches the CPM engine, recalc, or baseline capture.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - EV2b: wire the **Earned-Value read endpoint** (ADR-0042 §2). A new `cost:read`-gated
  `GET /organizations/:orgSlug/plans/:planId/schedule/earned-value` returns the plan's P6 Earned-Value
  analysis (BAC, PV/BCWS, EV/BCWP, AC/ACWP → SV, CV, SPI, CPI → EAC, ETC, TCPI, VAC) per activity, rolled
  up over the WBS tree, and as a plan total. It is a **pure read**: it consumes the persisted CPM dates
  plus the cost / %-complete inputs and runs the dependency-free `computeEarnedValue` module — no lock, no
  recompute, no engine write, so the recalc parity gate is untouched.

  **RBAC:** `cost:read` is Planner + Org Admin only, so a Viewer/Contributor never reads the commercially
  sensitive money through a schedule read (403); an unknown/cross-org plan is a 404 (anti-IDOR), resolved
  from the caller's own memberships before any load.

  **Baseline cost snapshot (the ADR-0025 amendment):** baseline **capture** now freezes each activity's
  budgeted cost — `Σ assignments (budgetedCost ?? round(budgetedUnits × costPerUnit)) + budgetedExpense`
  — into `baseline_activities.budgeted_cost`, giving the active baseline a committed PV reference. A plan
  with no cost data snapshots an integer `0` (a real "no budget"), so a baseline captured now always
  stores a value; only a pre-EV baseline (SQL NULL) makes the read report `costBaselineMissing` and fall
  back to the live budget for PV. Additive and behaviour-preserving — the CPM engine, recalc, and the
  general reads are unchanged, and cost stays out of every non-`cost:read` response.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Earned Value is now proven against the P6-class conformance fixture (EV3, ADR-0042 / ADR-0035 §29). A
  new fixture→EV adapter (`earned-value-adapter.ts`) grounds `computeEarnedValue` in real fixture cost and
  %-complete data — resource `price_per_unit`, assignment `budgeted_units`/`actual_units`, and `expenses`
  rows for `A4200`/`A7100`/`A8010`/`A6100`/`A3010`/`A10300` plus their two real WBS-summary ancestors
  (`W4000`/`W7000`) — with a first-principles golden (BAC/PV/EV/AC → SPI/CPI/EAC to the minor unit) and
  three differentials proving a flipped option changes the output: the `percentCompleteType` flip on
  `A4200` (the fixture's own physical-vs-duration divergence case), the `eacMethod` flip, and the
  cost-baseline present/absent flip. The `%-complete-type` (`pct_physical`/`pct_units`) and cost/EV
  (`cost_*`) halves of the capability matrix's deferred row flip to ✅ (resource curves, cost
  accrual/period trending, and activity steps stay ⚪, named later rungs). ADR-0035 gains an **Accepted**
  **§29** (percent-complete-type & earned-value semantics) plus **N22–N24**.

  The Earned-Value module and read endpoint also gain the **N24** read-time data-quality signal: a new
  `costWarningCount` on `PlanEarnedValue` / `PlanEarnedValueResult` counts leaf activities that show
  booked actual cost/units while apparently not started — surfaced, never rejected, so spend-without-
  progress (the exact CV signal) is visible rather than silently accepted. Additive field; `0` when no
  activity triggers it.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - **EV4a — conditional per-role cost reads (ADR-0042).** The money **amount** fields are readable again on
  the general entity responses, but ONLY when the caller holds `cost:read` (Planner + Org Admin),
  org-scoped — a Viewer/Contributor still NEVER sees cost. This supersedes the earlier EV2a "remove cost
  from all reads" cut with the security reviewer's preferred conditional-field-inclusion, and unblocks the
  EV4 web edit forms (which must read the current cost to prefill and not clobber it on save).

  Re-exposed (as `number | null` on the wire; `null` = unset OR caller-not-permitted): resource
  `costPerUnit`; assignment `budgetedCost` / `actualCost`; activity `budgetedExpense` / `actualExpense`.
  The gate is threaded via a `canReadCost` boolean the service computes once from the already-resolved
  organisation (`principal.can('cost:read', org.id)` — never `canAnywhere`, to avoid a cross-tenant IDOR)
  and passes to each response DTO's `.from(entity, canReadCost)` mapper. Every read path that returns these
  entities (resource get + list, activity get + list + plan-activities list, assignment list) gates
  consistently and **fails closed** — a non-`cost:read` caller gets `null` for every cost field. The
  `cost:read`-gated Earned-Value endpoint (EV2b) is unchanged. The `%`-complete / units / EAC / currency
  fields are unaffected (they were never gated). No schema, engine, or write-DTO changes.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - External / inter-project dates now persist and flow into the CPM recalc (ADR-0043 / ADR-0035 §30, M1).
  An activity carries two optional calendar-day fields `externalEarlyStart` (an SNET-shaped forward lower
  bound, floored at the data date) and `externalLateFinish` (an FNLT-shaped backward upper bound) — imported
  commitments gating it from another project; either, both, or neither may be set. They are **soft** bounds,
  never mandatory pins: the engine clamps early start UP to / late finish DOWN to them on the existing
  forward/backward passes and flags the activity external-driven, never setting `constraintViolated`. A new
  plan scheduling option `ignoreExternalRelationships` (default `false`, byte-parity) drops every external
  bound so a plan can be viewed on its own logic vs. gated by its neighbours. Boundary reject: an external
  late finish before the external early start when both are set returns **422** `EXTERNAL_FINISH_BEFORE_START`
  (N26), with a nullable-safe DB CHECK backstop. The recalc + `GET …/schedule/summary` roll-up expose an
  `externalDrivenCount` (engine-derived on a recalculation). Additive DTO/response fields on the activity and
  plan resources; new shared type fields on `ActivitySummary`, `PlanSummary`, and `PlanScheduleSummary`. The
  no-external / option-off path is byte-identical.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`21818b7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/21818b7af12c16f481d7547d6f9c1d0464a05a2c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Expose the **multiple-float-paths** analysis over REST (ADR-0035 §19), closing the one deferred piece of
  M6-F6. `GET /organizations/:orgSlug/plans/:planId/schedule/float-paths?target=&maxPaths=` returns the
  ranked contiguous driving chains into a target activity — path 0 the driving chain (relative float 0),
  branch paths in non-decreasing relative-float order, bounded by `maxPaths` (default 10, max 50). It is a
  read-only analysis (`schedule:read`, every member): it recomputes the schedule live through the same
  engine-input builder `recalculate` uses, so it can never drift from a recalculation, and never persists.
  Relative float is returned in working days. 422 if the plan has no start date; 404 if the target activity
  is not active in the plan; 400 if `target` is missing or not a UUID. Adds the shared `PlanFloatPath` /
  `PlanFloatPaths` types. Also a conformance-matrix reconcile: the Start-On/Finish-On both-pass pin, the
  N11 zero-working-hour hang guard, the N16 lag-horizon cap, and the minute-granular baseline (S01) are
  confirmed in-engine and marked supported (their notes had gone stale after the M1 minute rework).

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`a763a54`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a763a5488370935dfaa44b6dc68198f2706270a4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Resource **levelling** is now proven against the P6-class conformance fixture and its summary counts are
  surfaced on the HTTP schedule-summary (M7 levelling rung, ADR-0041 / ADR-0035 §28). The conformance
  adapter gains an opt-in `honorLevelling` demand-model build (capacity from `max_units_per_hour`, demand
  from every active assignment's `units_per_hour`); scenario **S10** runs as a runnable **leveled-date**
  differential (NL-CRANE600 A6100/A6200 + NL-HYDROPUMP A7700/A7730 serialise; mandatory A10100/A10500 are
  never moved) with the pure early/late/float layer byte-identical to S01 (Q2), plus a first-principles
  levelling golden. The `Resource levelling` capability row + S10 flip ✅ in the capability matrix, and
  ADR-0035 §28 (levelling semantics) + N21 (negative-capacity reject) are Accepted.

  The schedule summary (`PlanScheduleSummary` / `PlanScheduleSummaryDto`, both the recalculate result and
  the read endpoint) now carries `leveledActivityCount`, `levelingWindowExceededCount`,
  `selfOverAllocatedCount` and `leveledProjectFinish` — a read-time aggregate over the plan's engine-owned
  leveled columns, `0` / `null` when the plan does not level (`levelResources` off — the byte-identical
  parity path). Additive fields only; no behaviour change when levelling is off.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`7b29ccb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7b29ccb64208a29aed92836dc46bc35cb691a05b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - L1 resource-levelling schema fields wired through the API (ADR-0041, the additive DARK slice). Threads
  the already-landed schema columns through `@repo/types`, the DTOs, and the service/repository write paths
  so they round-trip without changing any behaviour. Client-settable inputs: `resources.maxUnitsPerHour`
  (capacity ceiling, null = uncapped, N21 `@Min(0)`), `activities.levelingPriority` (levelling tie-break,
  null = unset), and the plan options `plans.levelResources` / `plans.levelWithinFloatOnly`. Engine-owned
  overlay (response-echo only, never accepted from a write DTO): `activities.leveledStart` /
  `leveledFinish`, `levelingDelayDays` (echoed from stored `levelingDelayMinutes`), `levelingWindowExceeded`,
  and `selfOverAllocated` — all null/false until the L2 levelling pass writes them. Fully additive and
  byte-parity: with levelling off (the default) nothing runs and every plan recalculates unchanged. The L2
  engine pass and L3 conformance follow.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`7952f5e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7952f5e1c60119ff7ffb31f34908e401dfc2731e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM engine now schedules **Level-of-Effort** activities (M5-epic F1–F2, ADR-0035 §21). An LOE is a
  hammock: its dates are derived from the span of its earliest SS-predecessor start to its latest
  FF-successor finish, in a post-pass after the network is computed. An LOE **never drives or bounds a
  neighbour, never appears on the critical path or the project-finish/longest-path sets, and never inherits
  negative float** (its late dates are pinned to its early dates, so total float and free float are a
  non-negative 0). An LOE with no resolvable span — missing an SS predecessor or an FF successor — is
  **produced at a defined fallback and flagged** (N12), never rejected: a new engine-owned
  `activities.loe_no_span` boolean, written by the recalc's batched write and exposed as `loeNoSpan` on the
  activity schedule response and the `ActivitySummary` shared type, with a plan-level `loeNoSpanCount` on
  the schedule summary. With no `LEVEL_OF_EFFORT` activity present the new pass is a no-op and the
  golden/parity path is byte-identical; existing rows read `false` until the plan is recalculated.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`816d0a0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/816d0a09f262a1076f1a0aa1cd38b9590d2eec9b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - M7.1 resource-model schema foundation (ADR-0039, the resource dimension of the CPM engine). Adds an
  org-scoped `resources` library (a sibling of the calendar library: name, optional code, a
  `kind` enum LABOUR/EQUIPMENT/MATERIAL, an optional own `calendarId`) and a `resource_assignments`
  join (activity ↔ resource with `budgetedUnits` + an `isDriving` flag), plus a new `RESOURCE_DEPENDENT`
  `ActivityType` member and an engine-owned `resource_driver_missing` flag on `activities` (its writer is
  the M7.2 engine rung). DB invariants: partial-uniques enforce ≤1 driving assignment per activity and no
  duplicate active `(activity, resource)`; a CHECK backs the N14 non-negative-units reject. Fully additive
  and byte-parity — with no resource present, every existing plan recalculates unchanged. `@repo/types`
  mirrors the new `ActivityType` member. Schema + migration only; the resources module, assignment API,
  and §23 scheduling follow.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`62d7a97`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/62d7a974d752249fefa31ee7fea7e45e92a3e179) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - M7.1 resources module + resource-assignment API (ADR-0039, the resource dimension of the CPM engine).
  Adds an org-scoped resource library and the activity↔resource assignment join, mirroring the calendars
  module (soft-delete, cursor pagination, optimistic locking, deny-by-default RBAC + org scoping).

  New endpoints (all org-scoped): `POST/GET /organizations/:orgSlug/resources`,
  `GET/PATCH/DELETE /organizations/:orgSlug/resources/:resourceId`,
  `POST/GET /organizations/:orgSlug/activities/:activityId/assignments`, and
  `PATCH/DELETE /organizations/:orgSlug/assignments/:id`. New permissions: `resource:read` (every member)
  and `resource:create/update/delete/assign` (Planner + Org Admin only).

  Service-enforced invariants (ADR-0039): same-org for a resource's calendar and an assignment's
  activity/resource (the FK only scopes to the target table); `budgetedUnits` rejects negatives (N14);
  a resource in use by an active assignment can't be deleted (`RESOURCE_IN_USE`), and the existing
  `CALENDAR_IN_USE` guard now also counts resources; at most one driving assignment per activity — setting
  a driver is an in-transaction move; a `MATERIAL` resource may never drive. Adds the shared
  `ResourceKind` / `ResourceSummary` / `ResourceAssignmentSummary` types + a `RESOURCE_ERROR` map. The
  driving-resource-calendar scheduling (§23) and the `resource_driver_missing` writer follow in M7.2.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Resource loading curves (M7 rung 5, ADR-0044 F3 / ADR-0035 §31) — **the final capability-matrix slice**.
  Each resource assignment gains a settable `curveType` (`UNIFORM` (default) / `BELL` / `FRONT_LOADED` /
  `BACK_LOADED` / `DOUBLE_PEAK`) — a named P6 loading curve — plus a new pure read-model
  (`resource-histogram.ts`) that distributes each assignment's `budgetedUnits` across its effective span
  (`start + assignment-lag → finish`, on the activity's own calendar, ADR-0037) per the named 21-point
  profile and aggregates a **units-over-time histogram per resource**, **conserving units** exactly
  (`Σ buckets === Σ budgetedUnits`). It moves **no CPM date**, owns **no engine column**, and does **NOT**
  feed the levelling pass this rung (Q2). `UNIFORM`/absent is a **flat** load — byte-identical to a
  flat-rate distribution — so the parity gate is trivial. `compute.ts` and `level.ts` are untouched.

  - **API (`@repo/api`)** — the create/update assignment DTOs, the assignment response DTO, and the
    assignment repository/service all carry `curveType` (reuses the existing `resource:assign` permission;
    a plain enum, not cost-gated). New `GET …/schedule/resource-histogram` endpoint (`schedule:read` — the
    units histogram is **schedule data, not cost**, Q5) with a `granularity` param (`DAY`/`WEEK`/`MONTH`)
    and offset paging over the per-resource series; the `meta` carries the shared bucket axis, series total,
    and `curveNormalisedCount` (N29). The new pure `computeResourceHistogram` read-model is a dependency-free
    sibling of `float-paths.ts` / `earned-value.ts`.
  - **Types (`@repo/types`)** — `ResourceCurveType` / `RESOURCE_CURVE_TYPES`, the histogram response types
    (`ResourceHistogram*`, `HistogramGranularity`), and `curveType` on `ResourceAssignmentSummary`.
  - **Conformance** — a new `resource-histogram-adapter.ts` reads the fixture's `resource_curves` +
    `assignments.curve`; the built-in profile constants are asserted **byte-equal to the fixture's
    profiles** (self-baselined, no external oracle, ADR-0034). Goldens prove **AS0026** (FRONT_LOADED,
    2400 u), **AS0042** (BACK_LOADED, 640 u), **AS0015** (BELL, 1200 u) and **AS0043** (DOUBLE_PEAK, 560 u)
    distribute to the exact profile shape and sum to `budgetedUnits`, plus a UNIFORM-vs-FRONT_LOADED
    differential (`resultsDiffer`), the assignment-lag case (**AS0027**), and **N29** (a profile not summing
    to 100 ⇒ normalise to the budget, units conserved, counted). The `res_curve_bell` /
    `res_curve_front_loaded` / `res_curve_back_loaded` / `res_curve_double_peak` capability tags flip ✅ —
    **closing the matrix (34 ✅ / 0 ⚪)**; ADR-0035 gains an **Accepted §31** + N29.
  - **Web (`@repo/web`)** — a **loading-curve picker** (Uniform / Bell / Front-loaded / Back-loaded /
    Double-peak) on the resource-assignment dialog and a **Resource histogram** read view (a bar chart with
    a keyboard-navigable data-table equivalent for WCAG 2.2 AA), behind the new **off-by-default**
    `VITE_RESOURCE_CURVES` flag; the picker round-trips through the assignment create/update mutation.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`afd4690`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/afd4690ed6832ff43b4e551e530346bbaaaaec68) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM engine now schedules **resource-dependent** activities on their driving resource's calendar (M7.2,
  ADR-0035 §23 / ADR-0039). When a `RESOURCE_DEPENDENT` activity has a driving resource assignment, the
  schedule service resolves the activity's calendar port to that **resource's** calendar before the pass
  runs (fallback chain: driving-resource calendar → the activity's own calendar → the plan default); the
  engine then treats the activity exactly like a `TASK` for logic, so its duration advances and its float
  is measured on the resource's calendar. A `RESOURCE_DEPENDENT` activity with **no** driving assignment is
  **produced at the fallback calendar and flagged** (§23), never dropped: a new engine-owned
  `activities.resource_driver_missing` boolean, written by the recalc's batched write and exposed as
  `resourceDriverMissing` on the activity schedule response and the `ActivitySummary` shared type, with a
  plan-level `resourceDriverMissingCount` on the schedule summary. With no `RESOURCE_DEPENDENT` activity
  present the resolution is skipped entirely and the golden/parity path is byte-identical; existing rows
  read `false` until the plan is recalculated.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`7074b77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7074b7703ff1b9bf784676a87c5a692a49741bc6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - WBS activity hierarchy foundation (M5-epic F5, ADR-0038 / ADR-0035 §24). Activities gain an adjacency-list
  `parentId` (a nullable self-reference) and a new `WBS_SUMMARY` activity type, the groundwork for
  WBS-summary rollup. The create/update API accepts `parentId` and the response echoes it; the service
  validates it is an **active `WBS_SUMMARY` in the same plan** (a foreign/cross-plan/deleted id reads as 404) and that re-parenting introduces **no cycle** in the WBS tree. A **WBS summary carries no logic**:
  the dependency-create path rejects a link whose endpoint is a summary (422). Governed by the new ADR-0038
  (adjacency-list over a materialised path; parent tree acyclic + same-plan, orthogonal to the dependency
  DAG). Schema-only + validation — the rollup engine (F6) and flagged web surface (F8) follow; every
  existing activity reads `parentId = null`, so the path is behaviour-preserving.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`f62a361`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f62a361a998822e07fdcda1d9b061d230a43f969) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM engine now rolls up **WBS-summary** activity dates from their branch (M5-epic F6–F7, ADR-0035 §24).
  A `WBS_SUMMARY` carries no logic (it has no dependencies); in a post-pass after the network is computed —
  running **after** the Level-of-Effort derivation and **deepest-first** so nested summaries resolve
  child-before-parent — each summary's dates are derived from its **direct children** in the `parentId`
  tree: earliest child start to latest child finish. A summary **never drives a successor, never appears on
  the critical path or the longest-path set, and never defines the project finish**; its late dates are
  pinned to the rolled-up early dates, so total float and free float are a by-convention 0. An **empty**
  summary (no children) collapses to the data date. The engine's `EngineActivity` gains a `parentId` input
  (the WBS containment tree, orthogonal to the dependency graph). With no `WBS_SUMMARY` activity present the
  new pass is a no-op and the golden/parity path is byte-identical. The engine-conformance harness now
  schedules the fixture's three summaries (W4000/W5000/W7000), building the `parentId` tree from the
  fixture's dotted `wbs` codes; supported activities rise from 124 to 127 (relationship counts unchanged —
  summaries carry no logic).

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Weighted activity steps (M7 rung 5, ADR-0044 F2 / ADR-0035 §33). An activity gains a **weighted progress
  step checklist** (`activity_steps` child table — `seq` / `name` / `weight` / `percentComplete`) whose
  weight-weighted mean `Σ(w·p)/Σw` becomes the activity's **PHYSICAL** %-complete and **wins** over the
  manual `physicalPercentComplete` when steps are present. Steps feed the ADR-0042 `PHYSICAL` Earned-Value
  measure only — they **never change a CPM date**; with no steps the manual field stands exactly (the
  byte-identical parity path, so the existing EV goldens stay green). The engine (`compute.ts`) and the
  levelling pass (`level.ts`) are untouched; the pure resolver already in `earned-value.ts`
  (`rollupPhysicalPercent`) is unchanged — this change only adds layers around it.

  - **API (`@repo/api`)** — a steps sub-resource following the reference-template layering
    (controller → service → repository, deny-by-default, org-scoped): `GET …/activities/:activityId/steps`
    (list active, seq-ordered) and `PUT …/activities/:activityId/steps` (`{ version, steps: [...] }`
    bulk-replace, Q3) — retained rows updated in place, new ones appended, removed ones soft-deleted, the
    server assigns `seq`, and the parent **activity's** `version` is optimistic-locked (stale ⇒ 409). Reuses
    `activity:update` (a step is activity-write) — no new permission. **N28** (a step `percentComplete`
    outside 0–100 ⇒ 422 `STEP_PERCENT_OUT_OF_RANGE`) and a negative `weight` are DTO-boundary rejects,
    backstopped by DB CHECKs. The EV read (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`)
    loads each activity's active steps into the `PHYSICAL` rollup and reports a plan-level
    **`stepWeightZeroCount`** (N27 — all-zero-weight ⇒ manual fallback, never a divide-by-zero), mirroring
    `costWarningCount`. The soft-delete cascade is wired into `HierarchyLifecycleService` (steps sweep and
    restore with their activity under the same `delete_batch_id`, both directions).
  - **Types (`@repo/types`)** — new `ActivityStep`, `ActivityStepInput`, `ReplaceActivityStepsRequest`;
    `PlanEarnedValue` gains `stepWeightZeroCount`.
  - **Conformance** — the EV adapter reads the fixture's `steps` and attaches them to A4200 / A7100; new
    goldens assert the weighted-mean rollup **A4200 → 35.0005%** (the fixture's own
    `prog_rd_vs_pct_divergence` — steps-physical ≠ its 40% duration-%) and **A7100 → 0%**, a
    steps-present-vs-manual differential (`resultsDiffer`), and the N27 fallback + count. **N28** is
    DTO-tested. The `code_steps` capability tag flips ✅ (33 ✅ / 1 ⚪ — only resource curves remain);
    ADR-0035 gains an **Accepted §33** + N27/N28.
  - **Web (`@repo/web`)** — an `ActivityStepsEditor` (editable name / weight / %-complete rows with
    add/remove/reorder) opened from the activities table row menu behind the new **off-by-default**
    `VITE_ACTIVITY_STEPS` flag, showing the rolled-up physical % and a "steps override the manual %" note,
    wired to the bulk-PUT mutation (TanStack Query).

  Deferred (the last ADR-0044 slice, not in this change): **resource loading curves** (F3), the one
  remaining ⚪ capability row.

### Patch Changes

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`239aa77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/239aa77b8dd89fafe9ec07b73e1c0db69f224b5b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - WBS-summary soft-delete now cascades its `parentId` subtree (M5-epic F7.5, ADR-0038 / TECH_DEBT [#36](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/36)).
  Soft-deleting an activity resolves its active WBS subtree breadth-first — a leaf is just itself; a
  `WBS_SUMMARY` sweeps every descendant it heads — and stamps the whole subtree plus every incident
  dependency link with one `deleteBatchId`, so restoring the summary reactivates the branch together and
  a descendant deleted in an earlier batch is not resurrected. The restore guard is hardened
  symmetrically: an activity reactivates only while **both** its plan and (if grouped) its WBS-summary
  parent are active, so a separately-deleted child cannot come back under a still-deleted summary
  (`409 PARENT_DELETED`). Upholds ADR-0038's "no active row under a deleted ancestor" invariant on the
  `parent_id` axis, closing the gap before summaries become planner-creatable (F8). Service-only; a
  plan with no summaries is unaffected (every leaf resolves to itself).
- Updated dependencies [[`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`272eb42`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/272eb420313809d0867ef81753ae4c705f631005), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`21818b7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/21818b7af12c16f481d7547d6f9c1d0464a05a2c), [`a763a54`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a763a5488370935dfaa44b6dc68198f2706270a4), [`7b29ccb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7b29ccb64208a29aed92836dc46bc35cb691a05b), [`7952f5e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7952f5e1c60119ff7ffb31f34908e401dfc2731e), [`816d0a0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/816d0a09f262a1076f1a0aa1cd38b9590d2eec9b), [`62d7a97`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/62d7a974d752249fefa31ee7fea7e45e92a3e179), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`afd4690`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/afd4690ed6832ff43b4e551e530346bbaaaaec68), [`7074b77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7074b7703ff1b9bf784676a87c5a692a49741bc6), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1)]:
  - @repo/types@0.13.0

## 0.14.0

### Minor Changes

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM engine now computes **free float** (M6-F1, ADR-0035 §17–§20): how far each activity can slip without
  delaying the early start of any successor. It is measured on the activity's own working calendar
  (ADR-0037 §4), computed alongside total float, persisted to the new engine-owned `activities.free_float`
  column by the recalc's batched write, and exposed as `freeFloat` (whole working days) on the activity
  schedule response and the `ActivitySummary` shared type. An open end (no successors) carries its total
  float; free float is always ≤ total float. Existing rows read `null` until the plan is recalculated, and
  the golden/parity path is byte-identical.

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Selectable critical-path definition (M6-F2, ADR-0035 §17–§20). Plans gain two options:
  `criticalPathDefinition` (`TOTAL_FLOAT`, the P6 default, or `LONGEST_PATH`) and `criticalFloatThreshold`
  (whole working days, default 0). Under `LONGEST_PATH` the engine flags the contiguous chain of driving
  ties running back from the latest-finishing activities, so an open-ended, hugely-negative-float activity
  is no longer critical though it is under `TOTAL_FLOAT ≤ 0`. The threshold widens the total-float critical
  band. Both are echoed on the plan response and accepted on plan update; defaults are behaviour-preserving
  (the golden path and existing critical sets are unchanged). Conformance scenario **S07** now runs as a
  criticality-only differential.

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make-open-ends-critical option (M6-F4, ADR-0035 §20). A new plan flag `makeOpenEndsCritical` (default
  off) flags every open-ended activity — one with no predecessors or no successors — as critical, OR-ed
  with the active critical definition so it only ever adds open ends, never a mid-chain member. It is
  threaded through recalculation, echoed on the plan response, and accepted on plan update. Default off
  is behaviour-preserving (existing critical sets unchanged). Conformance scenario **S08** now runs as a
  criticality-only differential.

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Selectable total-float measure (M6-F3, ADR-0035 §18). A new plan option `totalFloatMode`
  (`FINISH` — the P6 default — `START`, or `SMALLEST`) chooses how `totalFloat` is measured: late−early
  finish, late−early start, or the lesser. It is computed on the activity's own working calendar,
  threaded through recalculation, echoed on the plan response, and accepted on plan update; the default
  `FINISH` is behaviour-preserving (existing float is byte-identical).

  Documented semantic: because float is measured on the activity's own calendar for both sides
  (ADR-0037 §4), the three modes coincide for unprogressed activities and diverge only for progressed
  ones — so the conformance fixture's mixed-calendar S13 divergence is deliberately not reproduced (a
  P6 multi-calendar-measurement artefact; see the capability matrix and ADR-0035 §18).

### Patch Changes

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - ALAP zero-free-float refinement (M6-F5, ADR-0035 §11). An activity flagged As-Late-As-Possible is now
  placed as late as its successors allow, so its **`freeFloat` is 0** — the machine-readable signal of that
  placement — while its pure `earlyStart`/`lateStart`/`totalFloat` stay untouched (display-only, per §11).
  An open end with no successors falls back to its late dates. Completes the M4 ALAP flag with the
  free-float pass, flipping the `con_alap` and `float_zero_free` capability rows to supported.

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Multiple float-path analysis (M6-F6, ADR-0035 §19). A new pure, read-only engine function
  `computeFloatPaths(activities, edges, options, target, maxPaths)` returns the ranked **contiguous
  driving chains** into a target activity — path 0 the driving chain (relative float 0), later paths
  entered at increasing total float — bounded by `maxPaths` and a per-chain depth guard. Every activity
  belongs to exactly one path (a partition, not a total-float sort). Conformance scenario **S11** now
  runs as a path-shape assertion into the fixture target A12500. Engine-only; the read endpoint is
  deferred (see the plan and `docs/DECISIONS.md`).
- Updated dependencies [[`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a)]:
  - @repo/types@0.12.0

## 0.13.0

### Minor Changes

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **Expected Finish** scheduling (M4-F5, ADR-0035 §9). A new per-activity `expectedFinish` target
  date plus a plan-level `useExpectedFinishDates` option: when the option is on, the CPM forward pass
  **recomputes** an in-progress activity's remaining work so its early finish lands on its expected
  finish (the day's working-end boundary), floored at the rescheduled start — a past target collapses the
  remaining to zero. When the option is off, or for a not-started/complete activity, the target is
  ignored and the schedule is byte-identical to the pure-progress path.

  `expectedFinish` is client-settable on the activity create/update DTOs and exposed on the activity
  response + shared `ActivitySummary`; `useExpectedFinishDates` is set via `UpdatePlanDto` and exposed on
  the plan response + shared `Plan` type, threaded through the recalculate contract like the progress
  recalc mode. The recalc log carries an `expectedFinishAppliedCount`. Two additive columns (a nullable
  activity date and a defaulted plan boolean) — no data migration; the golden suite is unchanged. The
  conformance golden (A6200) and the S12 on/off differential land with the F6 conformance slice.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Mandatory constraints now **produce-and-flag** instead of being silently parked (M4-F2, ADR-0035 §7).
  `MANDATORY_START`/`MANDATORY_FINISH` still pin their date with the same MSO/MFO arithmetic, but when a
  pin drives an activity earlier than its logic allows the engine now **produces the (impossible)
  schedule as pinned and flags it** — a new engine-owned `constraintViolated` boolean on each activity —
  surfacing the broken relationship as negative float on the predecessor, and never repairing it. A pin
  the network can satisfy is not flagged.

  The schedule summary's dishonest `parkedConstraintCount` is **replaced** by two honest counts:
  `constraintViolationCount` (mandatory pins that broke logic) and `constraintWarningCount` (the N15 case
  — a Start-No-Earlier-Than dated before the data date, honoured but unable to pull work back). The
  recalc response, read summary, and structured recalc log all carry the new counts; the summary strip
  shows "Constraint conflicts" / "Constraint warnings" figures with accessible explanations in place of
  the old "Parked constraints" figure. Plans with no mandatory constraints are byte-identical (the
  golden suite is unchanged) and report both counts as zero.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Activities can now be flagged **Schedule As-Late-As-Possible** (M4-F4, ADR-0035 §11). The new
  `scheduleAsLateAsPossible` boolean is a **display-only** placement preference: a flagged activity is
  rendered at its late-based position (its already-computed late dates), while the pure
  `early*`/`late*`/`totalFloat` schedule stays a pure function of the network — it is never a date
  constraint. The zero-**free**-float refinement (place only as late as successors allow) lands in M6;
  until then the late-based position is the render target.

  The flag is client-settable via the create/update DTOs, exposed read-only on the activity response and
  the shared `ActivitySummary`, threaded into the engine seam, and read on the recalc load. Additive,
  defaulted column — no data migration; the golden suite is unchanged (a new A9400-style golden pins the
  non-interference contract). The on-canvas editor for the flag is a later slice.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Activities can now carry a **secondary schedule constraint** (M4-F3, ADR-0035 §10). The primary
  constraint drives the forward pass (early dates) as before; the new
  `secondaryConstraintType`/`secondaryConstraintDate` pair drives the backward pass (late dates) — the
  canonical pairing is a forward primary + a backward secondary (e.g. an SNET that moves the early start
  plus an FNLT that tightens the late finish). A secondary of a forward-only kind (SNET/FNET) is a
  documented no-op on the backward clamp, and an activity with no secondary is scheduled byte-identically
  (the golden suite is unchanged).

  The pair is client-settable via the create/update DTOs with the same both-or-neither pairing rule as
  the primary (mirrored by a DB CHECK constraint), exposed read-only on the activity response and the
  shared `ActivitySummary`, and read on the recalc load. Additive, nullable columns — no data migration.

- [#84](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/84) [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Plan-level progress recalc mode (M2, ADR-0035 §1). Plans now carry a
  `progressRecalcMode` — `RETAINED_LOGIC` (default), `PROGRESS_OVERRIDE`, or
  `ACTUAL_DATES` — exposed on the plan response and settable via `PATCH` (like
  `schedulingMode`), and threaded into the CPM recalculation. It governs how an
  in-progress activity's remaining work treats predecessor logic when progress is
  out of sequence. Behaviour-preserving by default; an unprogressed plan is
  unaffected.

- [#84](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/84) [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Progress write boundary hardening (M2, ADR-0035 §6). The progress endpoint now
  accepts `remainingDurationDays` (converted to stored minutes; null derives it
  from percent complete) and validates actuals against the plan's data date:

  - **N07** — an actual start/finish after the data date is rejected
    (`ACTUAL_AFTER_DATA_DATE`).
  - **N08** — a complete activity with no actual finish has its finish repaired to
    the data date (logged warning).
  - **N18** — remaining > 0 on a complete activity is repaired to 0 (logged warning).

  N06 (finish before/without start) is unchanged. Actuals never move.

- [#84](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/84) [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Progress ingestion web controls (M2, ADR-0035), behind `VITE_PROGRESS_INGESTION`
  (off by default). When enabled:

  - The progress editor gains a **remaining duration** input (blank derives it from
    percent complete) plus **suspend / resume** dates for a paused activity — with
    client-side validation mirroring the API (resume ≥ suspend).
  - Plan settings gain a **recalc mode** picker — Retained Logic / Progress Override
    / Actual Dates — persisted with a targeted PATCH and applied on the next
    recalculation.

  The activity read model now exposes `remainingDurationDays`, `suspendDate`, and
  `resumeDate` (`@repo/types` + the activity response DTO), so the editor seeds and
  round-trips a stored value even with the inputs hidden. The engine, the settable
  API fields, and the plan recalc-mode column were already live; this slice only
  adds the flag-gated authoring UI.

- [#85](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/85) [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Surface progress-repair warnings and clarify the progress editor (M2 follow-up,
  ADR-0035 §6).

  - The progress endpoint (`PATCH …/activities/:id/progress`) now returns
    `meta.warnings` (a `ProgressWarning[]`) when it repairs a complete activity —
    `COMPLETE_WITHOUT_FINISH` (finish set to the data date) or
    `REMAINING_ON_COMPLETE` (remaining forced to zero). The write still succeeds and
    `data` reflects the corrected value; an ordinary report omits `meta`. Adds a
    reusable single-resource `ResourceEnvelope` for `{ data, meta }` responses.
  - The web progress editor announces those repairs on save, and a note makes clear
    the remaining/suspend/resume fields reschedule the remaining work rather than
    change the derived status.

- [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/82) [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Per-activity working-time calendars (M5, ADR-0037). Each activity can now carry its own
  `calendarId` (create/update/response API + shared `ActivitySummary`) — `null` inherits the plan
  default. The CPM engine moved to an **absolute working-instant** axis so each activity's duration,
  float, and dates are measured on **its own** calendar: a 24/7 commissioning activity inside a 5-day
  plan works across weekends, and a relationship's `PREDECESSOR`/`SUCCESSOR` lag now resolves to the
  endpoint activity's calendar (completing M3's forward-wiring). A plan where every activity inherits
  the plan calendar recalculates **byte-identically** (the golden suite is the parity gate). The
  activity calendar is validated in-org under the calendar advisory lock (like the plan picker), and
  the recalculation resolves each distinct calendar once (O(distinct calendars), not O(activities)).

### Patch Changes

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Conformance harness M4 flip (M4-F6). The differential adapter now **feeds** the fixture's advanced
  constraints instead of dropping them: the secondary constraint (§10), expected finish (§9) and
  as-late-as-possible (mapped to the placement flag, §11) are carried, and the mandatory pins pass
  through as produce-and-flag constraints (§7). Scenario **S12 (Expected Finish)** is now a runnable
  differential — it runs the S02 progressed network with the option on, so `resultsDiffer(S12, S02)`
  proves the fixture's A6200 lands on its expected finish. New negative-case assertions cover **N10**
  (an impossible mandatory pair is produced and flagged, never repaired) and **N15** (a constraint
  before the project start warns without pulling work back). The capability matrix flips the five M4
  rows (mandatory / expected-finish / secondary ✅, ALAP 🟡 with the M6 free-float note, zero-duration
  task ✅) plus S12, N01/N03, N10 and N15.

  Also refines Expected Finish (§9) to apply to **any incomplete activity** — an in-progress one's
  remaining and a not-started one's full duration — matching the ADR's A6200 (not-started) example; the
  backward pass uses the resized span so late dates stay consistent. Byte-parity of the golden suite is
  preserved (a new first-principles A6200 golden pins the resize).

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Engine: distinguish a zero-duration `TASK` from a milestone by **type**
  (`isMilestone`), not `duration === 0` (M4-F1, ADR-0035 §22). A zero-duration task
  keeps a real start + finish and is scheduled as a task; the project-finish
  tie-break's milestone privilege now keys off the milestone type. The change is
  date-neutral in the current model (the golden suite stays byte-identical) and
  expresses §22's intent in code.
- Updated dependencies [[`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd), [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd), [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8), [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec)]:
  - @repo/types@0.11.0

## 0.12.0

### Minor Changes

- [#80](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/80) [`1cdc8b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1cdc8b1d5ef80ddf6caa94fe90fff6b4c307893e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Per-relationship lag calendars (M3, ADR-0036 §6). Dependencies gain a `lagCalendar`
  field (`PREDECESSOR` / `SUCCESSOR` / `TWENTY_FOUR_HOUR` / `PROJECT_DEFAULT`, default
  `PROJECT_DEFAULT`) exposed on the create/update/response API, with a lag-calendar selector
  on the dependency editor (and a lag-calendar label in the Logic panel's link lists). The CPM
  engine now measures each edge's lag on that calendar: `TWENTY_FOUR_HOUR` schedules the lag as
  **elapsed** time (e.g. concrete cure's `168h` = 7 elapsed days, not 7 working days), while the
  other three coincide with the plan calendar today (Predecessor/Successor become distinct once
  per-activity calendars land in M5). The default path is unchanged — a plan with no 24-Hour
  lag recalculates byte-identically.

### Patch Changes

- Updated dependencies [[`1cdc8b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1cdc8b1d5ef80ddf6caa94fe90fff6b4c307893e)]:
  - @repo/types@0.10.0

## 0.11.0

### Minor Changes

- [#65](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/65) [`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling modes — mandatory project start + Visual planning (ADR-0033)

  Delivers ADR-0033's scheduling model. The **mandatory project start (M1)** is a live product
  change; the **Visual-planning surface (M2–M4)** ships behind the default-off `VITE_SCHEDULING_MODES`
  flag until enablement.

  **M1 — Mandatory project start (live):**

  - A plan can no longer exist without a start date. A backfill+NOT-NULL migration sets
    `plans.planned_start` for existing plans (CQ-6 chain: earliest active constraint date → actual
    start → creation day) and makes the column NOT NULL. `CreatePlanDto.plannedStart` is required (422
    without); `UpdatePlanDto` rejects an explicit `null` (the data date can be moved, never cleared).
    The web plan form requires it, and the ADR-0032 "first draw anchors to today" hack is gone.

  **M2–M4 — Visual planning (behind `VITE_SCHEDULING_MODES`):**

  - A plan-level `schedulingMode` (**Early** = computed-earliest CPM, **Visual** = hand-placed) with a
    toolbar mode selector, and a Planner-owned `Activity.visualStart` placement input fed through the
    engine's second, forward-only effective-Visual pass (placements pin the bar and push unplaced
    successors; the pure-network pass still owns early/late/float).
  - A Visual-mode canvas drag hand-places `visualStart` (no implicit SNET constraint); Early mode keeps
    the SNET path. Engine-owned conflict flags surface as an on-canvas warning triangle (shape, not
    colour-only) with a spoken read-out — placements are flagged, never auto-moved.
  - Navigation/data split: a "Go to date" view jump distinct from the persisted "Project start" anchor.
  - A read-only **Late-start overlay** renders bars from the late dates for float analysis (editing
    suppressed while on).

  Flag-off, the TSLD renders exactly as before.

### Patch Changes

- [#64](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/64) [`c073c75`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c073c750d7c329286bd3106cb3f5e6dc3501ceb0) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling-modes M0 dark foundations (ADR-0033)

  Additive, behind-the-flag foundations for the scheduling-modes feature — **no user-visible change**
  (nothing sets `visual_start` yet and no UI reads the flag; existing plans recalc identically):

  - **Schema (additive, reversible):** a `SchedulingMode` enum + `Plan.schedulingMode` (default `EARLY`),
    the Planner-owned `Activity.visualStart` placement input, and four engine-owned outputs
    (`visualEffectiveStart/Finish`, `visualConflict`, `visualDriftDays`) modelled like the CPM columns.
  - **Engine:** a second, forward-only _effective-Visual_ CPM pass — honours each `visualStart` exactly,
    pushes successors from the feasible finish, and emits the conflict/drift outputs. The pure
    forward/backward pass is untouched, so `early*`/`late*`/float stay a pure function of the network
    (proven by a golden-parity test).
  - **Recalc wiring:** `visual_start` feeds the engine and the four outputs are persisted by the same
    batched `unnest` UPDATE — still out of the optimistic-lock `version`/`updated_at` path.
  - **Flag:** `SCHEDULING_MODES_ENABLED` (`VITE_SCHEDULING_MODES`, default-off), gated on the canvas host.

  The mandatory-`plannedStart` migration and the UI (mode selector, Visual drag, Late overlay, Go-to-date)
  land in later milestones.

- Updated dependencies [[`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c)]:
  - @repo/types@0.9.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b)]:
  - @repo/types@0.8.0

## 0.10.0

### Minor Changes

- [#35](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/35) [`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the server core of the single-editor **plan edit-lock** (ADR-0028) — the last precondition to
  enabling the built TSLD editing surface. A new `PlanLock` lease (heartbeat + TTL with explicit
  release; presence = held, absence = free) backs an `edit-lock` sub-resource under a plan:
  GET status, POST acquire (with `takeover`), POST heartbeat, POST request, POST handoff, and DELETE
  release. Lock-precondition failures return a new **423 Locked** (`code: "LOCKED"`), distinct from the
  409 optimistic conflict, with a machine-readable `reason`
  (`PLAN_EDIT_LOCK_REQUIRED | PLAN_EDIT_LOCK_HELD | PLAN_EDIT_LOCK_LOST`). The holder grain is the
  **user** (re-entrant across tabs), and any Planner can **request control** of a live lock and take
  over after a grace window — or immediately if the holder has gone inactive — while an Org Admin can
  override immediately; acquire/request/hand-off/take-over serialise under the existing plan advisory
  lock. New permissions `plan:acquire_lock` / `plan:request_control` (Planner + Org Admin) and
  `plan:override_lock` (Org Admin). `@repo/types` gains the `PlanEditLockStatus` / `PlanEditLockActor`
  contracts and the `PLAN_EDIT_LOCK_*` reason union. No UI yet and no endpoint is pen-gated in this
  slice — inert until the front end and the write-gate land; `main` stays releasable.

- [#35](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/35) [`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the plan edit-lock **write-gate** (ADR-0028, M1 completion). Structural plan
  writes — activity create/update/delete/restore, the positions batch, dependency
  create/update/delete, and schedule recalculate — now assert the caller holds the
  plan edit-lock and return **423 `PLAN_EDIT_LOCK_REQUIRED`** otherwise (for graph
  writes and recalculate the check runs inside the plan advisory-lock transaction).
  The Contributor progress path, all reads, and plan-metadata edits stay ungated,
  and a holder sending a stale row `version` still gets the existing 409 — the two
  are distinct.

  The gate ships **behind a staged-rollout flag `PLAN_EDIT_LOCK_ENFORCED` (default
  off)**: enforcing it unconditionally would 423 the already-shipped, flag-on
  activities-table / dependency-editor / recalculate flows, which don't acquire a
  lock yet. So the whole mechanism lands inert; enforcement is enabled only once the
  front end acquires the pen across every editing entry point (edit-lock M2/M3).
  `main` stays releasable with no user-visible change.

### Patch Changes

- [#37](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/37) [`ce59178`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ce591786a5e3db36db2b5e061eb2fb4941e05a6c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the (flag-gated) TSLD on-canvas editing surface toward enablement — no
  user-visible change, both editing flags remain off by default.

  - **fix(web):** the coalesced keyboard-nudge now flushes a delta queued _behind_ an
    in-flight write on unmount (previously a `!busyRef` guard could silently drop it).
  - **perf(api):** the edit-lock heartbeat resolves the caller's own holder profile
    from the session instead of a `users` query — the common beat issues zero extra
    DB reads.
  - **test:** a flag-on Playwright harness (`test:e2e:edit`, wired into CI) that serves
    the app with the editing flags on and the API enforcing the lock, with pen-gating,
    single-actor pen-lifecycle, and keyboard-edit journeys (the latter automating the
    `Alt+←/→` history-suppression check on Chromium); plus a route-level `plan-detail`
    gating/reposition-seam test. Operators: see
    `docs/runbooks/tsld-editing-enablement.md` for the enablement procedure.

- Updated dependencies [[`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263)]:
  - @repo/types@0.7.0

## 0.9.0

### Minor Changes

- [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/31) [`fd8de38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fd8de385fe7f84c11359871345470e07f8bbc3f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add a batch **lane-position** endpoint for the Time-Scaled Logic Diagram (M8 M4, ADR-0026):
  `PATCH /organizations/:orgSlug/plans/:planId/activities/positions`. It moves one or more of a
  plan's activities to new lanes (`laneIndex`) in a single **all-or-nothing** transaction —
  backing on-canvas lane drag and the upcoming auto-arrange. Every id must be an active activity
  in the plan+org (anti-IDOR) and still match its optimistic-lock `version`, or the whole batch
  is rejected (409) and nothing moves. Requires `activity:update` (Planner/Org Admin). It is
  layout only: no dates change and no CPM recalculation runs (x = time is engine-owned; y = lane
  is stored). A `DUPLICATE_POSITION_ID` (422) guards a batch that names the same activity twice.

## 0.8.0

### Minor Changes

- [#29](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/29) [`5c3fbf4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5c3fbf47d3e900c3e73f9724713e8e677bcbc7c9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **live driving arrows** to the Time-Scaled Logic Diagram (M8 M3, ADR-0026).

  The CPM engine now computes, on every recalculate, whether each dependency is **driving** — the
  binding logic tie that sets its successor's early start (CPM/GPM "driver") — and persists it as the
  engine-owned `dependencies.is_driving` (ADR-0022 batched write; never touches `version`/`updated_at`,
  so a recalc stays invisible to optimistic locking). It's exposed as `DependencySummary.isDriving` on
  the dependency API. The flag is derived purely from the forward-pass timing, so computed dates are
  unchanged and the golden CPM suite still holds; an edge with slack, or one whose successor is clamped
  by a constraint above every incoming bound, is non-driving.

  On the TSLD canvas, driving links are now drawn **emphasised** — a heavier solid line — versus a thin
  dashed line for non-driving links, so "which relationships are actually driving the schedule" reads at
  a glance. The weight-plus-dash encoding never relies on colour (WCAG 1.4.1), matching the bar
  criticality cue, and the diagram legend gains **Driving link** / **Non-driving link** entries.

## 0.7.0

### Minor Changes

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baseline schema and permissions (M7, ADR-0025). New `baselines` and
  `baseline_activities` tables: a baseline is a named, frozen snapshot of a plan's
  schedule (the plan of record), and each `baseline_activities` row is a **self-contained
  copy** of an activity's identity and captured CPM dates — `source_activity_id` is a
  plain correlation UUID with **no foreign key**, so a baseline survives the source
  activities' 90-day hard purge and stays faithful even if a live activity is edited or
  deleted. A partial unique `uq_baselines_plan_active` guarantees **at most one active
  baseline per plan** in the database (not just in code); `uq_baselines_plan_name` keeps
  names unique per plan among live rows; both tables carry soft delete + batch restore and
  the documented scoped indexes (the `(baseline_id, source_activity_id)` index is the
  variance join key). Adds the `baseline:read` / `baseline:create` / `baseline:activate` /
  `baseline:delete` permissions (read for every member; write for Planner + Org Admin) and
  the shared `@repo/types` `BaselineSummary` / `BaselineDetail` / `BaselineActivitySnapshot`
  / `BaselineVarianceRow` / `PlanVarianceSummary` contracts. Schema and permissions only —
  the baselines module, variance read model, and web surface land next.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add baseline activate + delete with cascade (M7 Task B2, ADR-0025).
  `POST …/baselines/:id/activate` (200) makes a baseline the plan's active comparison
  baseline: under the plan write-lock it clears the current active row **before** setting
  the target, so the one-active-per-plan partial unique is never momentarily violated;
  it is idempotent and 404s if the baseline was deleted meanwhile. `DELETE …/baselines/:id`
  (204) soft-cascades the baseline and its snapshot rows under one `delete_batch_id`;
  deleting the active baseline simply leaves the plan with none active. Deny-by-default:
  `baseline:activate` / `baseline:delete` (Planner + Org Admin). The
  `HierarchyLifecycleService` now sweeps a plan's baselines (and their snapshot rows) into
  the batch when a plan/project/client is deleted, and restores them with the plan — so a
  baseline never dangles under a soft-deleted plan and comes back on restore with its active
  flag intact.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baselines capture/list/get API (M7 Task B1, ADR-0025). A new plan-scoped
  `baselines` module (controller → `BaselinesService` → `BaselineRepository`) exposes
  `POST` (capture), `GET` (list, cursor-paginated newest-first) and `GET /:id` (with the
  frozen activity snapshots) under `/api/v1/organizations/:orgSlug/plans/:planId/baselines`.
  Capturing freezes the plan's currently-persisted computed activities as a self-contained
  snapshot **under the plan write-lock** (the same advisory lock as recalculation, ADR-0022),
  so a snapshot is never taken mid-recalculation; the batched `createMany` writes up to a
  plan's worth of snapshot rows in one statement. The plan's **first** baseline is captured
  active; later captures are inactive. Deny-by-default: reads need `baseline:read` (every
  member), capture needs `baseline:create` (Planner + Org Admin); every route re-resolves the
  org scope from the caller's memberships and the plan within it (anti-IDOR). Capturing an
  empty or never-calculated plan is a `422 SCHEDULE_NOT_CALCULATED`; a duplicate name is a
  `409 DUPLICATE_BASELINE`. Activate/delete and the variance read model land next.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baseline variance read model (M7 Task C1, ADR-0025).
  `GET …/baselines/variance` joins the plan's live activities against the active baseline's
  snapshot on `source_activity_id` and returns per-activity **start/finish/float variance in
  working days** on the plan's calendar (reusing the engine's `workingDaysBetween` /
  `buildWorkingDayCalendar`, ADR-0024), signed so **positive = current later than baseline
  (behind)**, plus a `meta` roll-up (`PlanVarianceSummary`: active baseline id/name,
  `capturedAt`, worst finish slip, and counts behind / added / removed). An activity added
  after capture is `inBaseline: false`; a baselined activity no longer live is a `removed`
  row; a plan with no active baseline returns an empty list with `meta.baselineId = null`.
  The diff is a pure, exhaustively-unit-tested `computeVariance` helper. The read is bounded
  and plan-scoped (no cursor pagination — one build of the calendar, an O(n) join), so it
  stays within the M6/M7 performance budget; a CI smoke exercises it at 500 activities. The
  shared `Paginated` envelope now carries a typed `meta` so a bounded list can return the
  variance roll-up.

### Patch Changes

- Updated dependencies [[`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883)]:
  - @repo/types@0.6.0

## 0.6.0

### Minor Changes

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the pure `buildWorkingDayCalendar` factory to the CPM engine (M5, ADR-0024):
  a real working-day calendar from a weekday bitmask + dated exceptions (holidays
  and worked-weekends), implemented behind the existing `WorkingDayCalendar` port
  with O(1) week arithmetic + O(log H) binary search over sorted exceptions — no
  day-by-day scan, so recalculation stays within the M6 performance budget. Correct
  by construction: pinned to a naive day-by-day reference by a differential test and
  to the inverse invariant `workingDaysBetween(from, addWorkingDays(from, n)) === n`.
  Still an internal library — nothing consumes it yet; the calendar CRUD module and
  engine wiring land next.

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the working-day calendar schema and permissions (M5, ADR-0024). New `calendars`
  and `calendar_exceptions` tables: an org-scoped calendar is a 7-bit `working_weekdays`
  mask (Monday…Sunday) plus dated exceptions (holidays / worked weekends), with a
  `working_weekdays > 0 AND <= 127` CHECK, partial-unique names/exception-dates among
  live rows, soft delete + batch restore, and the documented indexes (the active
  `(calendar_id, date)` unique doubles as the engine's exception load). Adds the
  `calendar:read` / `calendar:create` / `calendar:update` / `calendar:delete` permissions
  (read for every member; write for Planner + Org Admin) and the shared `@repo/types`
  `Calendar`/`CalendarException` shapes plus a pure `WorkingWeekdays` bitmask helper (the
  single source of truth the API DTO validates against and the web toggle group binds to).
  Schema and permissions only — the CRUD module and engine wiring land next.

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the working-day calendar library CRUD API (M5, ADR-0024). A new org-scoped
  `calendars` module (controller → `CalendarsService` → `CalendarRepository`) exposes
  list / create / get / update / delete calendars plus an exception editor
  (add / remove dated holidays and worked-weekends), all under
  `/api/v1/organizations/:orgSlug/calendars`. Deny-by-default: reads need
  `calendar:read` (every member), writes need `calendar:create|update|delete`
  (Planner + Org Admin); every route re-resolves the org scope from the caller's
  memberships (anti-IDOR). The weekday mask is validated 1–127 (422), calendar names
  are unique per org and exception dates unique per calendar (409
  `DUPLICATE_CALENDAR` / `DUPLICATE_EXCEPTION`), updates use optimistic locking, and
  delete is a self-contained soft-cascade over the calendar and its exceptions
  (adding/removing an exception bumps the calendar's version). The delete-in-use
  guard and plan assignment land next (Task C1); nothing consumes a calendar for
  scheduling yet.

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire calendars into plans (M5 Task C1, ADR-0024). Plans gain a nullable
  `calendar_id` (FK to calendars, RESTRICT, partial-indexed); a null calendar means
  all-days-work (M6 back-compat). Each organisation is seeded a **Standard (Mon–Fri)**
  calendar — on org create and backfilled for existing orgs by the migration — and new
  plans default to it. A Planner can assign a plan's calendar via `PATCH plans/:id`
  (`calendarId`, validated to be an active calendar in the same organisation — a
  foreign/unknown id is a 404, indistinguishable from missing; null clears it), and a
  calendar referenced by an active plan can no longer be deleted (409 `CALENDAR_IN_USE`).
  Calendar assignment and the delete-in-use guard serialise on a calendar-scoped advisory
  lock, so a plan can never be assigned a calendar that is being deleted. `Plan.calendarId` is added to `@repo/types` and the plan
  response. Recalculation still ignores the calendar until Task C2 wires it into the
  engine.

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire the working-day calendar into CPM recalculation (M5 Task C2, ADR-0024) — the
  engine now computes **true working-day dates**. `ScheduleService.recalculate` loads
  the plan's calendar (`working_weekdays` + active exceptions) as part of the locked
  recalc snapshot, builds a `WorkingDayCalendar` once via `buildWorkingDayCalendar`, and
  injects it at the existing `ComputeOptions.calendar` port seam — **the pure engine's
  pass code is unchanged**. A plan with no calendar (or a defensively-missing one) uses
  `allDaysWorkCalendar`, so the null path is byte-identical to M6 and the golden suite
  still holds. Early/late start & finish now skip the calendar's non-working weekdays and
  holiday dates, and the project finish absorbs them. The calendar used is recorded in the
  recalc audit log. The calendar maths is O(1) week arithmetic + O(log H) per call (built
  once per recalc), so recalculation stays within the M6 performance budget; a perf smoke
  at 500 activities now also runs on a real Mon–Fri calendar.

### Patch Changes

- Updated dependencies [[`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14), [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14)]:
  - @repo/types@0.5.0

## 0.5.0

### Minor Changes

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Teach the CPM engine the six moderate schedule constraints. The forward pass
  clamps early dates (`SNET`, `FNET`, `MSO`, `MFO`) and the backward pass clamps
  late dates (`SNLT`, `FNLT`, `MSO`, `MFO`), converting each `constraintDate` to a
  working-day offset via the calendar port (ADR-0023). `MANDATORY_START` /
  `MANDATORY_FINISH` are parked as their moderate equivalents (`MSO` / `MFO`) and
  counted in the schedule summary's `parkedConstraintCount`. A constraint that the
  logic cannot satisfy surfaces as negative total float (and criticality), never
  an error.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the CPM engine's forward/backward pass to the pure scheduling library:
  early/late start & finish, total float, and critical / near-critical flags,
  computed in continuous working-day offsets and mapped to inclusive calendar
  dates via the `WorkingDayCalendar` port (ADR-0023). Honours all four
  relationship types (FS/SS/FF/SF) with signed lag and zero-duration milestones,
  proven against a golden suite of hand-worked networks. Still an internal library
  (unwired) — the recalculate endpoint that persists these values lands next.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Expose the CPM recalculation over HTTP: `POST
/organizations/:orgSlug/plans/:planId/schedule/recalculate` (permission
  `schedule:calculate`, Planner + Org Admin). It runs the engine, persists the
  computed columns, and returns the plan schedule summary (`200`); a plan with no
  start date returns `422 PLAN_START_REQUIRED`, and the unreachable DAG-invariant
  breach is logged distinctly and surfaces as an opaque `500`. Covered by an API
  e2e matrix (multi-path critical set, version/updated_by untouched, RBAC 403,
  IDOR/cross-org 404, 422 no-start) and a 500-activity performance smoke.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire the CPM engine to persistence (ADR-0022). Add the `schedule` module with a
  `ScheduleService.recalculate` that — under the plan-scoped advisory lock shared
  with the dependency cycle check (ADR-0021) — loads a plan's active activities and
  edges, runs the pure engine, and writes the seven engine-owned columns via a
  single batched raw `UPDATE … FROM unnest(...)` that never touches `version` or
  `updated_at`. Introduce the `schedule:read` (every member) and `schedule:calculate`
  (Planner + Org Admin) permissions. The recalculation is not yet exposed over HTTP —
  the endpoint lands next.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the read-side schedule summary: `GET
/organizations/:orgSlug/plans/:planId/schedule/summary` (permission
  `schedule:read`, every member) returns a plan's computed schedule roll-up from a
  single aggregate over the persisted engine columns — no recompute. It returns the
  identical `PlanScheduleSummary` shape as recalculate (data date, project finish,
  activity/critical/near-critical/parked counts), now a shared type in `@repo/types`.
  Null-safe for a never-calculated plan (null finish) and a plan with no start date
  (null data date).

### Patch Changes

- Updated dependencies [[`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c)]:
  - @repo/types@0.4.0

## 0.4.0

### Minor Changes

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Activity CRUD API — the leaf of the Client → Project → Plan → Activity
  hierarchy and the atomic unit of a schedule. Activities are created and listed
  under a parent plan (`POST`/`GET /organizations/:orgSlug/plans/:planId/activities`,
  cursor-paginated), and read/updated/soft-deleted/restored by id
  (`/organizations/:orgSlug/activities/:activityId` + `/restore`). Following the
  `plans` module: definition writes (name, code, description, type, duration,
  constraint, lane) are Planner + Org Admin only, org-scoped (anti-IDOR), with
  per-plan name and code uniqueness, optimistic locking, and soft-delete/restore
  via the shared four-level lifecycle (top-down `PARENT_DELETED` invariant). A
  milestone's duration is always coerced to 0, and a schedule constraint's type
  and date must be set (or cleared) together. Progress fields (status / % / actual
  dates) and the engine-owned CPM output columns are deliberately not writable
  here — progress gets its own Contributor-capable endpoint next.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity authorisation and lifecycle foundation. New permission codes
  `activity:read|create|update|delete|restore` follow the same Planner+Org-Admin
  "write" rule as the rest of the hierarchy, plus a separate
  `activity:update_progress` granted to Contributor upward — the first capability
  that distinguishes a Contributor from a Viewer, letting them report progress
  (status / % complete / actual dates) without being able to change logic. The
  shared `HierarchyLifecycleService` is extended from three levels to four:
  deleting a plan (or project, or client) now cascades to its activities in the
  same `delete_batch_id`, restoring the parent brings them back, and an activity
  can be soft-deleted/restored on its own (restore requires its parent plan to be
  active — `PARENT_DELETED` otherwise). Adds the `ActivitySummary`/`ActivityType`/
  `ActivityStatus`/`ConstraintType` cross-boundary contracts to `@repo/types`. The
  existing 3-level cascade is covered by regression tests.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity progress endpoint — `PATCH /organizations/:orgSlug/activities/:activityId/progress`.
  This is the Contributor-capable path: it requires only `activity:update_progress`
  (granted to Contributor upward), so a Contributor can record progress without the
  Planner-only `activity:update` that changes logic or definition — the first
  capability that distinguishes a Contributor from a Viewer. It moves
  `percentComplete` and the actual start/finish dates only; `status` is derived
  server-side (finish/100% → COMPLETE, start/any % → IN_PROGRESS, else NOT_STARTED)
  so it can never contradict the numbers, and an actual finish must have a start and
  cannot precede it (422). Definition endpoints continue to reject progress fields
  and vice-versa.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `Activity` domain table — the leaf of the Client → Project → Plan →
  Activity hierarchy and the atomic unit of a schedule — plus the `ActivityType`,
  `ActivityStatus` and `ConstraintType` enums and their migration. Each activity is
  plan-scoped with a denormalised `organization_id` (copied from the parent plan),
  soft-delete + `delete_batch_id`, audit columns (TEXT `created_by`/`updated_by`),
  and an optimistic-locking `version`; name — and optional `code` — are unique per
  plan among live rows via partial-unique indexes. The full field set is persisted
  now (definition: type/duration/constraint/lane; progress: status/percent/actuals;
  engine-owned CPM outputs: early/late dates, total float, critical flags; and a
  reserved `calendar_id`) so the deferred dependencies/calendars/CPM/canvas slices
  are additive. Schema + migration only — no module or endpoint behaviour yet.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Dependency CRUD API — the edges of a plan's schedule network. Dependencies
  are created and listed under a plan
  (`POST`/`GET /organizations/:orgSlug/plans/:planId/dependencies`, cursor-paginated),
  browsed by direction from an activity
  (`GET …/activities/:activityId/predecessors` and `…/successors`), and
  read/updated/soft-deleted by id (`/organizations/:orgSlug/dependencies/:dependencyId`).
  Following the activities module: writes are Planner + Org Admin only, org-scoped
  (anti-IDOR), with both endpoints loaded active and asserted to be in the same plan
  (no cross-plan links), the organisation/plan ids copied from the parent, per-plan
  `(predecessor, successor, type)` uniqueness (`409 DUPLICATE_DEPENDENCY`), a
  self-loop guard (`422 SELF_DEPENDENCY`), optimistic locking (type/lag only — the
  endpoints are immutable), and soft-delete via the shared lifecycle. Responses embed
  the endpoint activity summaries (no N+1). Cycle detection — the DAG guarantee of
  ADR-0021 — lands next.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Guarantee the plan's dependency graph stays acyclic (ADR-0021). Creating a
  dependency now runs its load-check-insert inside one transaction under a
  plan-scoped advisory lock: it loads the plan's active edges, walks forward from
  the proposed successor, and rejects the link with `409 CYCLE_DETECTED` if the
  predecessor is already reachable (which would close a cycle). The lock serialises
  concurrent creates within a plan, so the mirror-insert race (`A→B` ‖ `B→A`)
  resolves to exactly one success and one conflict — a cycle can never be persisted.
  Different plans never contend. A pure `wouldCreateCycle` detector (O(V+E)) is
  unit-tested for self/2-node/longer cycles and large graphs; an e2e race test
  asserts the concurrency guarantee.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Extend the shared HierarchyLifecycleService so soft-delete/restore includes
  activity dependencies (links). Deleting an activity now also soft-deletes its
  incident links (either direction) in the same batch; deleting a plan/project/
  client sweeps every link contained in the affected plans; a dependency can also
  be soft-deleted directly as its own leaf. Restore reactivates a batch's links
  **endpoint-guarded** — only where both endpoint activities are active — so a link
  whose other end was deleted separately stays soft-deleted (a bounded, documented
  edge case). The four-level M3 cascade/restore is unchanged and fully regression-
  covered.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity-dependency authorisation and contract foundation (ADR-0021). New
  `dependency:*` permission codes follow the hierarchy rule — `dependency:read` for
  every member, `dependency:create/update/delete` for Planner + Org Admin only
  (deliberately not Contributor). `@repo/types` gains the `DEPENDENCY_TYPES` const
  (FS/SS/FF/SF, source-of-truth kept in lock-step with the API's Prisma enum) and
  the `DependencySummary`/`DependencyEndpoint` contracts the dependency API and web
  logic editor agree on. Documentation: ADR-0021 records the DAG invariant and the
  service-layer cycle-prevention strategy; DECISIONS.md records the permission
  namespace and link cascade/restore behaviour.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `ActivityDependency` schema — the typed, lagged logic edge between two
  activities that turns a plan's activities (nodes) into a schedule network. The new
  `dependencies` table carries a `DependencyType` enum (`FS`/`SS`/`FF`/`SF`, default
  `FS`) and a signed working-day `lag_days`, with denormalised `organization_id` and
  `plan_id` (both `RESTRICT` FKs, copied from the endpoints, never client input) and
  two `RESTRICT` FKs to `activities` via named self-relations
  (`Activity.predecessorLinks` / `successorLinks`). Follows the house standards: UUID
  v7 PK, snake_case, timestamptz UTC, TEXT audit ids, optimistic-locking `version`,
  soft delete + `delete_batch_id`. Integrity is enforced in the DB as defence in
  depth: a partial-unique index on `(predecessor_id, successor_id, type)` among live
  rows (per-type uniqueness — allows the SS+FF overlap ladder, blocks exact
  duplicates), a `CHECK` forbidding self-loops, and a `CHECK` bounding `lag_days` to
  −3650…3650, plus direction/plan/org and batch-restore indexes. Schema + migration
  only — the CRUD API, `dependency:*` permissions, cycle detection and lifecycle
  cascade land in follow-up tasks.

### Patch Changes

- Updated dependencies [[`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6)]:
  - @repo/types@0.3.0

## 0.3.0

### Minor Changes

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the clients REST API — the top level of the Client → Project → Plan
  hierarchy. `GET/POST /organizations/:orgSlug/clients`,
  `GET/PATCH/DELETE /organizations/:orgSlug/clients/:clientId`, and
  `POST .../clients/:clientId/restore`. Reads are open to any member; create/
  update/delete/restore are Planner + Org Admin. Every route resolves the org
  scope from the caller's memberships (404 for non-members), names are unique per
  active org, updates use optimistic locking, and delete is a soft cascade to the
  client's projects and plans (restored together as one batch).

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the plans REST API — the leaf level of the Client → Project → Plan
  hierarchy and the future host of activities and the TSLD. Create and list are
  nested under a parent project
  (`GET/POST /organizations/:orgSlug/projects/:projectId/plans`); item operations
  are flat by id (`GET/PATCH/DELETE /organizations/:orgSlug/plans/:planId` and
  `POST .../plans/:planId/restore`). Plans carry `status` (`DRAFT`/`ACTIVE`/
  `ARCHIVED`, default `DRAFT`) and an optional date-only `plannedStart`
  (`YYYY-MM-DD`, stored without timezone drift and validated as a real calendar
  day). Reads are open to any member; create/update/delete/restore are Planner +
  Org Admin. The parent project is resolved active and in-org first (404
  otherwise) and its organisation id is copied onto the plan; names are unique per
  project among active rows; updates use optimistic locking; delete is a soft
  delete (a plan is a leaf); and restore requires the parent project to be active
  (`PARENT_DELETED` otherwise).

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the projects REST API — the middle level of the Client → Project → Plan
  hierarchy. Create and list are nested under a parent client
  (`GET/POST /organizations/:orgSlug/clients/:clientId/projects`); item operations
  are flat by id (`GET/PATCH/DELETE /organizations/:orgSlug/projects/:projectId`
  and `POST .../projects/:projectId/restore`). Reads are open to any member;
  create/update/delete/restore are Planner + Org Admin. The parent client is
  resolved active and in-org first (404 otherwise) and its organisation id is
  copied onto the project (never taken from input); names are unique per client
  among active rows; updates use optimistic locking; delete is a soft cascade to
  the project's plans; and restore brings the batch back but requires the parent
  client to be active (`PARENT_DELETED` otherwise).

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the organisation recycle-bin endpoint (`GET /organizations/:orgSlug/deleted`):
  one deletion-time-ordered, cursor-paginated list of soft-deleted clients,
  projects and plans, each carrying a `canRestore` flag that is false while an
  ancestor is still deleted (surfacing the top-down restore invariant). Reading
  requires hierarchy read (any member); restore stays on the existing per-entity,
  writer-only `.../{id}/restore` routes. Pagination is keyset over the union of the
  three tables by `(deletedAt, id)`.

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the hierarchy authorisation and lifecycle foundation: `client|project|plan`
  read/create/update/delete/restore permission codes (read for every member,
  write for Planner + Org Admin), a shared `HierarchyLifecycleService` implementing
  cascade soft-delete + batch restore (one `delete_batch_id` per delete, top-down
  `PARENT_DELETED` invariant, `NAME_TAKEN` on colliding restore), and the
  `ClientSummary`/`ProjectSummary`/`PlanSummary`/`PlanStatus`/`DeletedHierarchyItem`
  cross-boundary types.

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `Client`, `Project`, and `Plan` domain-hierarchy tables (and the
  `PlanStatus` enum) plus their migration — the organisation-scoped containers the
  scheduling features hang off. Each follows the house standards (UUID v7 PKs,
  snake_case columns, timestamptz UTC, soft delete, audit, optimistic-locking
  `version`) and adds two reusable conventions: a denormalised `organization_id` on
  `Project`/`Plan` (copied from the parent for single-column scope/IDOR checks) and
  a `delete_batch_id` correlation column that groups a row and its subtree for
  cascade soft-delete and one-shot batch restore. Parent FKs are `ON DELETE
RESTRICT`; name uniqueness is per immediate parent among live rows via partial
  unique indexes. Schema and migration only — no module/endpoint behaviour yet.

### Patch Changes

- Updated dependencies [[`a3e9e01`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a3e9e01d4684f945b48cd116374a545d39a7f9bc)]:
  - @repo/types@0.2.2

## 0.2.1

### Patch Changes

- [#8](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/8) [`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the API container crashing on boot with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
  `@repo/types` shipped raw TypeScript (its `exports` pointed at `src/index.ts`),
  which tools transpile but plain Node cannot load — so the production image
  crashed when the compiled API `require`d it. `@repo/types` now builds to
  `dist/` (ESM + declarations) and its `exports` resolve to the compiled output at
  runtime, while the `development`/`types` conditions still point at source so
  dev, tests, and typecheck are unchanged. The API and web Docker builds compile
  `@repo/types` before the app, and `turbo dev` depends on it too.

- [#4](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/4) [`d69e335`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d69e335041f51290b4acdfb107ac22d69de2e510) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the API container build: `pnpm deploy` now passes `--legacy`. pnpm v10
  changed `pnpm deploy` to require `inject-workspace-packages=true` (or `--legacy`)
  and otherwise fails with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`, which broke the
  `api` image build. The `--legacy` flag restores the pre-v10 deploy behaviour the
  multi-stage Dockerfile relies on.

- [#9](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/9) [`cd4b43c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cd4b43cbc8746d886ebed89d2293746d28de8166) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix two production-image runtime crashes. The generated Prisma client was missing
  from the deployed image (`pnpm deploy` rebuilds node_modules from the store and
  drops it), so the API crashed with "@prisma/client did not initialize yet" — the
  Dockerfile now regenerates the client inside the deployed tree. And the logger
  no longer crashes in development mode when `pino-pretty` (a devDependency, absent
  from the production image) can't be loaded: it falls back to JSON logging.

- [#7](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/7) [`efbc61d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/efbc61d3fcc379826607fc289766d93ab9d141ce) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make the API container self-migrating and publish GitHub Releases. The API image
  now ships the Prisma CLI + schema/migrations and applies pending migrations on
  startup (`prisma migrate deploy`) via its entrypoint, so a fresh database is
  migrated automatically — no out-of-band step. The release workflow now also
  creates a GitHub Release for each `vX.Y.Z` tag so the Releases tab reflects
  published versions.
- Updated dependencies [[`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40)]:
  - @repo/types@0.2.1

## 0.2.0

### Minor Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add organisation invitations and a transactional-mail port. Org Admins can
  invite by email with a role (`POST /organizations/:orgSlug/invitations`), list
  pending invites, and revoke them; invitees preview by token
  (`POST /invitations/preview`) and accept (`POST /invitations/accept`) to join.
  Tokens are stored hashed (raw value returned once + emailed), invitations expire,
  and accept is transactional. Adds a `MailService` port with a logging stub
  adapter (the accept URL is also returned so onboarding works without a provider)
  and the shared `InvitationSummary`/`InvitationPreview` contracts to `@repo/types`.
  Introduces a `410 Gone` error for expired/revoked invitations.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the organisations tenancy core. New `Organization` and `OrgMember` models
  (the canonical org-scoping foundation: UUID v7, soft-delete, audit, optimistic
  locking, partial-unique slug and one-membership-per-user indexes) and the
  `organizations` module: `POST /api/v1/organizations` (creator becomes Org Admin,
  atomically, with slug uniquification), `GET /api/v1/organizations` (the caller's
  orgs), and `GET /api/v1/organizations/:orgSlug` (404 for non-members —
  anti-enumeration). The auth seam now hydrates a principal's memberships and
  permissions from the database, so `/api/v1/me` returns real memberships and
  `principal.can(permission, orgId)` is enforced. Adds the shared
  `OrganizationSummary` contract to `@repo/types`.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add membership management. New endpoints under the organisation scope:
  `GET /api/v1/organizations/:orgSlug/members` (cursor-paginated roster with user
  profiles), `PATCH .../members/:memberId` (change role, Org Admin only, with
  optimistic locking and the last-Org-Admin invariant), and
  `DELETE .../members/:memberId` (soft-delete, Org Admin only, last-admin
  protected). Every route resolves the org scope from the caller's memberships
  (404 for non-members; 403 for insufficient role). Adds the shared
  `OrgMemberSummary` contract to `@repo/types`.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the invitation-accept flow and fix accessibility gaps found in review.

  API: invitation acceptance now enforces a verified email when
  `AUTH_REQUIRE_EMAIL_VERIFICATION` is on — a single flag that also drives Better
  Auth's `requireEmailVerification`, so the email-match identity check becomes a
  real proof of mailbox ownership the moment the verification-email loop lands
  (default off for the alpha; ADR-0016).

  Web: split the destructive colour into a solid `destructive` (button/chip
  surface) and a readable `destructive-text` for coloured text and state borders,
  so error text, invalid-field borders, and the form error summary meet WCAG AA
  contrast in both themes. The invitation-link field now uses the shared input
  primitive (proper focus ring), and the accept-invite screen announces its
  loading→resolved transitions via a polite live region.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Establish the core identity & tenancy model and adopt the SchedulePoint
  organisation role set (ADR-0016). `OrganizationRole` is now
  `ORG_ADMIN / PLANNER / CONTRIBUTOR / VIEWER` (replacing the placeholder
  `OWNER / MEMBER / VIEWER`); External Guest is modelled separately, not as a
  member role. The reference-feature role→permission map and RBAC tests are
  updated in step. No runtime behaviour changes yet.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire up authentication and the current-user endpoint (walking skeleton). Mounts
  Better Auth (`/api/auth/*`, email + password, cookie sessions) behind the
  `AuthContextService` seam, adds the identity tables (`users`, `sessions`,
  `accounts`, `verifications`) as the first migration, and exposes an
  authenticated `GET /api/v1/me` returning the signed-in user and their
  organisation memberships. Adds the shared `MeResponse` / `SessionUser` /
  `OrganizationRole` contracts to `@repo/types`.

### Patch Changes

- Updated dependencies [[`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf)]:
  - @repo/types@0.2.0
