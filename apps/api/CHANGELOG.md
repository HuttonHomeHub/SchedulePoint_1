# @repo/api

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
