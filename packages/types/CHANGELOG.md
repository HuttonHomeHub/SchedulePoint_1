# @repo/types

## 0.12.0

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

## 0.11.0

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

## 0.10.0

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

## 0.9.0

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

## 0.8.0

### Minor Changes

- [#41](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/41) [`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the "date constraints" loop in the UI. The activity form's constraint
  selector now offers only the **six** kinds the CPM engine honours exactly as
  labelled (`SNET`/`SNLT`/`FNET`/`FNLT`/`MSO`/`MFO`); the two `MANDATORY_*` kinds —
  which the engine silently parks as their moderate equivalents (ADR-0023 §6) — are
  no longer newly selectable, so a planner can't set a constraint that behaves
  differently than it reads. An activity that already carries a parked value keeps it
  as an honest, spelled-out option ("Mandatory start — applied as Must start on") and
  is **never silently changed** on open.

  A set constraint is now visible without opening each row: a text **Constraint**
  column in the activities table (`"SNET · 01 May 2026"`, with the full label as its
  accessible name), a small **pin** on the constrained edge of a bar on the TSLD
  canvas (a shape cue, not colour — with a legend entry and a spoken equivalent in the
  diagram's accessible listbox), and an explanation of the "Parked constraints" figure
  in the schedule summary.

  `@repo/types` gains `SELECTABLE_CONSTRAINT_TYPES` / `PARKED_CONSTRAINT_TYPES` /
  `isParkedConstraintType` (the honoured-as-labelled set, mirroring the engine). No
  API, database, or engine change — the constraint write path, optimistic locking, and
  pen gating are untouched.

## 0.7.0

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

## 0.6.0

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

## 0.5.0

### Minor Changes

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

## 0.4.0

### Minor Changes

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the read-side schedule summary: `GET
/organizations/:orgSlug/plans/:planId/schedule/summary` (permission
  `schedule:read`, every member) returns a plan's computed schedule roll-up from a
  single aggregate over the persisted engine columns — no recompute. It returns the
  identical `PlanScheduleSummary` shape as recalculate (data date, project finish,
  activity/critical/near-critical/parked counts), now a shared type in `@repo/types`.
  Null-safe for a never-calculated plan (null finish) and a plan with no start date
  (null data date).

## 0.3.0

### Minor Changes

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity-dependency authorisation and contract foundation (ADR-0021). New
  `dependency:*` permission codes follow the hierarchy rule — `dependency:read` for
  every member, `dependency:create/update/delete` for Planner + Org Admin only
  (deliberately not Contributor). `@repo/types` gains the `DEPENDENCY_TYPES` const
  (FS/SS/FF/SF, source-of-truth kept in lock-step with the API's Prisma enum) and
  the `DependencySummary`/`DependencyEndpoint` contracts the dependency API and web
  logic editor agree on. Documentation: ADR-0021 records the DAG invariant and the
  service-layer cycle-prevention strategy; DECISIONS.md records the permission
  namespace and link cascade/restore behaviour.

## 0.2.2

### Patch Changes

- [#10](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/10) [`a3e9e01`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a3e9e01d4684f945b48cd116374a545d39a7f9bc) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix `@repo/types` so it resolves under classic `tsc` without a prior build.
  Its top-level `types` field pointed at `./dist/index.d.ts`, but the API compiles
  with `moduleResolution: "Node"`, which ignores `exports` and reads that field —
  so any `tsc` run outside Turbo's `^build` graph (the `verify-template.sh`
  type-check and the e2e Playwright web server) failed with `TS2307` because
  `dist/` had not been built. The field now points at `./src/index.ts`, so
  type-checking resolves from source everywhere; the Node runtime is unaffected
  because it resolves the `exports.default` condition to `./dist/index.js`.

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

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire up authentication and the current-user endpoint (walking skeleton). Mounts
  Better Auth (`/api/auth/*`, email + password, cookie sessions) behind the
  `AuthContextService` seam, adds the identity tables (`users`, `sessions`,
  `accounts`, `verifications`) as the first migration, and exposes an
  authenticated `GET /api/v1/me` returning the signed-in user and their
  organisation memberships. Adds the shared `MeResponse` / `SessionUser` /
  `OrganizationRole` contracts to `@repo/types`.
