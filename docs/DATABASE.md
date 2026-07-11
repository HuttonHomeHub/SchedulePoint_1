# Database Standards

> Standards and philosophy for the Blank App data layer: **PostgreSQL 17 + Prisma**.
> The schema in [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)
> is the single source of truth for the data model. See ADR-0008.

## Philosophy

1. **The database is a long-lived asset.** Data outlives code; schema decisions
   are made carefully and are hard to reverse. Model for correctness first.
2. **The database enforces integrity.** Constraints, foreign keys, and types are
   guardrails in the database, not just in application code — the DB is the last
   line of defence for data correctness.
3. **Migrations are the only way to change schema.** No manual edits to any
   environment; every change is a reviewed, versioned, committed migration.
4. **Access only through Prisma.** No hand-built SQL strings; parameterised
   queries always (also a security control — see `docs/SECURITY_STANDARDS.md`).
5. **Exact numeric data uses exact types.** If the app handles money, store it as
   integer minor units with an explicit currency — never floats (see
   [`API.md`](API.md)).

## Naming conventions

- **Tables:** plural `snake_case` (`reference_items`, `organization_members`).
- **Columns:** `snake_case` (`created_at`, `organization_id`).
- **Primary keys:** `id`, **UUID v7** (time-ordered) where possible for good
  index locality without exposing counts.
- **Foreign keys:** `<referenced_singular>_id` (`organization_id`).
- **Indexes:** `idx_<table>_<cols>`; **unique:** `uq_<table>_<cols>`;
  **checks:** `ck_<table>_<rule>`.
- **Enums:** `snake_case` type, `SCREAMING_SNAKE_CASE` values.
- **Booleans:** positive (`is_active`), not negated.
- In Prisma models we use `@@map`/`@map` so Prisma's `camelCase` fields map to
  `snake_case` columns, keeping both idioms clean.

## Migrations

- Generated and applied with **Prisma Migrate**. Locally: `prisma migrate dev`;
  in CI/prod: `prisma migrate deploy` (before the new app version serves
  traffic).
- **Committed and reviewed.** Migration SQL is part of the PR and read in review.
- **Expand/contract for zero-downtime:** add new nullable columns/tables first
  (expand), backfill, switch reads/writes, then remove the old (contract) in a
  later release — never a breaking rename in one step.
- **Forward-only in production.** "Rollback" = a new compensating migration plus
  redeploying the previous image; destructive changes are gated and reviewed
  with extra care.
- Migrations are deterministic and independent of application code state.

## Indexes

- **Index every column used in a `WHERE`, `JOIN`, `ORDER BY`, or foreign key.**
- Composite indexes follow the **leftmost-prefix** rule; order columns by
  selectivity/usage. Add **partial indexes** for common filtered queries (e.g.
  `WHERE deleted_at IS NULL`).
- Unique constraints for natural keys; back them with unique indexes.
- Indexes are not free (write cost, storage) — **add them for real query
  patterns, and measure** (`EXPLAIN ANALYZE`); remove unused ones.

## Constraints

- **Foreign keys** on every relationship, with explicit `ON DELETE` behaviour
  (usually `RESTRICT`; `CASCADE` only for true ownership/composition).
- **`NOT NULL`** by default; nullable is a deliberate decision.
- **`CHECK`** constraints for domain rules (e.g. non-negative amounts, valid
  enum ranges) — enforce invariants in the DB, not only in code.
- **Unique** constraints for anything that must be unique (scoped where relevant,
  e.g. unique name per organisation).

## Relationships

- Model relationships explicitly with foreign keys; prefer normalised design and
  denormalise only with a measured reason (documented).
- Many-to-many via an explicit **join table** with its own audit columns.
- Multi-tenant data carries its scoping key (e.g. `organization_id`) and is always
  filtered by it in queries (defence against cross-tenant leaks).

## Transactions

- **Wrap multi-step writes in a transaction** (`prisma.$transaction`) so they are
  atomic; the **service layer owns transaction boundaries**.
- Keep transactions **short**; do no external I/O (HTTP, queue publish) inside a
  transaction — publish after commit.
- Choose isolation deliberately; use appropriate levels for read-modify-write on
  contended rows (see optimistic locking).

## Soft deletes

- Default to **soft delete** via a nullable `deleted_at timestamptz`. Deletes set
  the timestamp; **all queries exclude soft-deleted rows by default** (a Prisma
  extension/base repository enforces this centrally — never rely on every caller
  remembering).
- Unique constraints that must ignore deleted rows use **partial unique indexes**
  (`WHERE deleted_at IS NULL`).
- **Hard deletes** are reserved for compliance/erasure requests and are explicit,
  audited, and rare.

## Auditing

- Every table carries **`created_at`** and **`updated_at`** (`timestamptz`,
  UTC), maintained automatically.
- Ownership/change attribution via **`created_by`** / **`updated_by`** (the
  acting principal) where meaningful.
- Security- and sensitive changes also emit an **append-only audit-log
  entry** (who/what/when/before→after) — see `docs/SECURITY_STANDARDS.md`
  (Audit logging). The audit log is never mutated.

## Optimistic locking

- Mutable rows subject to concurrent edits carry an integer **`version`** column.
- Updates are conditional on the expected version
  (`WHERE id = ? AND version = ?`) and **increment it**; a zero-row update means
  someone else changed it → the API returns **409 Conflict** so the client can
  refetch and retry. This avoids lost updates without long-held locks.
- Demonstrated in the reference feature.

## Data types & conventions

- Timestamps: `timestamptz`, stored UTC. Text: `text` (not arbitrary
  `varchar(n)` unless a real limit applies). Money (if the app has any):
  `integer`/`bigint` minor units + currency code. Identifiers: `uuid`. Enums:
  Postgres enums via Prisma.
- No business logic in triggers/stored procedures unless justified and
  documented (keep logic in the app for testability).

## Domain hierarchy: scoping & cascade soft-delete (Client/Project/Plan/Activity)

The `clients`, `projects`, `plans`, and `activities` tables are the
organisation-scoped containers the scheduling domain hangs off (`Organization →
Client → Project → Plan → Activity`). They apply every standard above and share two
reusable conventions future descendant tables (notes, baselines, …) copy.
`Activity` is the **leaf** of this tree — the atomic unit of a schedule
(PROJECT_BRIEF §9). It persists its full field set up front (see _Activity: the
schedule leaf_ below) so the deferred scheduling slices are additive.

### Denormalised `organization_id`

`Project`, `Plan`, and `Activity` carry `organization_id` **directly**, in addition
to their parent FK (`client_id` / `project_id` / `plan_id`). It is a deliberate,
measured denormalisation (per _Relationships_ above):

- **Why.** Every scope/IDOR check and org-scoped query then filters a single
  indexed column instead of joining Plan → Project → Client to reach the org, and
  the query/authorisation shape is identical across all three modules.
- **Invariant.** A child's `organization_id` **always equals its parent's**. It is
  set by the service layer inside the create transaction (copied from the resolved
  parent), **never from client input**. The DB does not (cannot cheaply) enforce
  the equality; the service owns it and it is unit-tested.
- `Client.organization_id` is **native**, not denormalised — the organisation is a
  client's direct parent.
- `Activity.organization_id` is copied from its parent **plan** (same invariant).

### Cascade soft-delete + batch restore (`delete_batch_id`)

Deletes across the hierarchy are **soft and cascading, performed in the service
layer** — there is no DB `ON DELETE CASCADE`. Each table carries a nullable
`delete_batch_id UUID` (a correlation id, **not** a foreign key):

- **Delete.** In one `$transaction`, the target row and its whole _active_ subtree
  are soft-deleted (`deleted_at` set) and stamped with the **same** freshly-generated
  `delete_batch_id`.
- **Restore.** Restoring clears the soft-delete on **exactly the rows sharing that
  batch id**, so a descendant deleted separately _earlier_ (a different batch) is
  not resurrected — history is preserved. Restore is top-down: a row whose parent
  is still deleted cannot be restored (the "no active row under a deleted ancestor"
  invariant, surfaced as `409 PARENT_DELETED`).
- **FKs stay `ON DELETE RESTRICT`.** We never hard-delete; `RESTRICT` is a guard
  against an accidental hard delete orphaning children, not the delete mechanism.

### Indexes (and their rationale)

Managed composite indexes are declared in `schema.prisma` (`@@index`, Prisma-named);
partial indexes are **raw SQL in the migration** because Prisma cannot express a
`WHERE` predicate.

| Index                                         | On                                     | Kind           | Serves                                                                                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients_organization_id_created_at_id_idx`   | `(organization_id, created_at, id)`    | full composite | `organization_id` FK (leftmost prefix) + org-scoped active list + its `(created_at, id)` cursor sort — subsumes a standalone org index                                                                                     |
| `projects_client_id_created_at_id_idx`        | `(client_id, created_at, id)`          | full composite | `client_id` FK + list-projects-under-a-client + cursor sort — subsumes a standalone client index                                                                                                                           |
| `projects_organization_id_idx`                | `(organization_id)`                    | full           | `organization_id` FK (RESTRICT) + org-scoped IDOR loads (no org-wide ordered list exists, so no composite)                                                                                                                 |
| `plans_project_id_created_at_id_idx`          | `(project_id, created_at, id)`         | full composite | `project_id` FK + list-plans-under-a-project + cursor sort — subsumes a standalone project index                                                                                                                           |
| `plans_organization_id_idx`                   | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                               |
| `uq_clients_org_name`                         | `(organization_id, name)`              | partial unique | name unique per org among live rows (`WHERE deleted_at IS NULL`); backs `NAME_TAKEN` (409) + name lookups                                                                                                                  |
| `uq_projects_client_name`                     | `(client_id, name)`                    | partial unique | name unique per client among live rows                                                                                                                                                                                     |
| `uq_plans_project_name`                       | `(project_id, name)`                   | partial unique | name unique per project among live rows                                                                                                                                                                                    |
| `activities_plan_id_created_at_id_idx`        | `(plan_id, created_at, id)`            | full composite | `plan_id` FK + list-activities-under-a-plan + cursor sort — subsumes a standalone plan index                                                                                                                               |
| `activities_organization_id_idx`              | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                               |
| `uq_activities_plan_name`                     | `(plan_id, name)`                      | partial unique | name unique per plan among live rows                                                                                                                                                                                       |
| `uq_activities_plan_code`                     | `(plan_id, code)`                      | partial unique | optional `code` unique per plan among live rows (`WHERE deleted_at IS NULL AND code IS NOT NULL`); NULL codes are exempt                                                                                                   |
| `idx_clients_delete_batch_id`                 | `(delete_batch_id)`                    | partial        | batch restore lookup (`WHERE delete_batch_id IS NOT NULL`); tiny — only soft-deleted rows carry a value                                                                                                                    |
| `idx_projects_delete_batch_id`                | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |
| `idx_plans_delete_batch_id`                   | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |
| `idx_plans_calendar_id`                       | `(calendar_id)`                        | partial        | the delete-in-use guard's active-plan count `WHERE calendar_id = ? AND deleted_at IS NULL` (`WHERE deleted_at IS NULL AND calendar_id IS NOT NULL`); calendars are soft-deleted only, so the FK RESTRICT check never fires |
| `idx_activities_delete_batch_id`              | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |
| `dependencies_plan_id_created_at_id_idx`      | `(plan_id, created_at, id)`            | full composite | `plan_id` FK + plan-level dependency list + cursor sort — subsumes a standalone plan index                                                                                                                                 |
| `dependencies_predecessor_id_idx`             | `(predecessor_id)`                     | full           | `predecessor_id` FK + "successors of X" list (edges out of X) + the cycle-walk adjacency load                                                                                                                              |
| `dependencies_successor_id_idx`               | `(successor_id)`                       | full           | `successor_id` FK + "predecessors of X" list (edges into X)                                                                                                                                                                |
| `dependencies_organization_id_idx`            | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                               |
| `uq_dependencies_pred_succ_type`              | `(predecessor_id, successor_id, type)` | partial unique | at most one **active** link of each type per ordered pair (`WHERE deleted_at IS NULL`); backs `DUPLICATE_DEPENDENCY` (409); allows the SS+FF overlap ladder                                                                |
| `idx_dependencies_delete_batch_id`            | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |
| `calendars_organization_id_created_at_id_idx` | `(organization_id, created_at, id)`    | full composite | `organization_id` FK + org-scoped active calendar list + cursor sort — subsumes a standalone org index                                                                                                                     |
| `uq_calendars_org_name`                       | `(organization_id, name)`              | partial unique | calendar name unique per org among live rows (`WHERE deleted_at IS NULL`); backs `DUPLICATE_CALENDAR` (409)                                                                                                                |
| `calendar_exceptions_calendar_id_date_idx`    | `(calendar_id, date)`                  | full composite | `calendar_id` FK + the editor's list-all-exceptions load (all rows) ordered by date                                                                                                                                        |
| `calendar_exceptions_organization_id_idx`     | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                               |
| `uq_calendar_exceptions_cal_date`             | `(calendar_id, date)`                  | partial unique | at most one **active** exception per `(calendar, date)` (`WHERE deleted_at IS NULL`); backs `DUPLICATE_EXCEPTION` (409) **and** the engine's active-exception load                                                         |
| `idx_calendars_delete_batch_id`               | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |
| `idx_calendar_exceptions_delete_batch_id`     | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |

The scope/list composites are **full (not partial on `deleted_at`)** so they also
back the FK `RESTRICT` check, which must find referencing rows _including_
soft-deleted ones; the active-list query filters `deleted_at IS NULL` on top of the
already-ordered index scan (cheap at the target scale of ≤ ~100 plans/org). No
redundant single-column FK index is added where a composite's leftmost prefix
already covers it.

### Cascade now runs four levels deep

The cascade soft-delete / batch-restore mechanism above extends unchanged to
`Activity`: deleting a plan (or project, or client) soft-deletes its activities in
the **same `delete_batch_id`**, and restoring the parent brings them back. The
shared `HierarchyLifecycleService` is entity-agnostic and gained `'activity'` as a
fourth level (delivered with the activities module); `activities` is a **leaf** —
it has its own soft-delete/restore but no children, so `assertParentActive` for an
activity checks its parent **plan**.

### Activity: the schedule leaf

`Activity` follows every standard above and adds three column groups the deferred
scheduling slices depend on, persisted **now** so those slices are additive (no
wide `ALTER TABLE` + backfill later):

- **Definition** (`type`, `duration_days`, `constraint_type`/`constraint_date`,
  `lane_index`, optional `code`) — Planner-owned. `duration_days` is an integer
  count of **working days** (= calendar days until the Calendars slice adds
  working patterns); milestones are `0`.
- **Progress** (`status`, `percent_complete`, `actual_start`, `actual_finish`) —
  Contributor-updatable via a dedicated progress path, never via a definition
  update.
- **CPM output — engine-owned** (`early_start`/`early_finish`,
  `late_start`/`late_finish`, `total_float`, `is_critical`, `is_near_critical`):
  nullable/defaulted, **never accepted from a write DTO**. They are populated by
  the CPM engine (a later slice); until then they read as null/false ("—" in the
  UI). Storing them now avoids a wide migration when the engine lands.
- **`calendar_id`** is a **reserved** nullable UUID column with **no FK relation
  yet** — the Calendars slice adds the FK and makes it settable. It is not client-
  settable in this slice.

Calendar-day fields (`constraint_date`, `actual_start/finish`, the CPM `*_start/
finish` columns) are `@db.Date` (date-only, no timezone), like `Plan.planned_start`
— a schedule day is a calendar day, not an instant.

`activities` is the first domain table with bounded numerics, so it is also the
first to carry **`CHECK` constraints** (per _Constraints_ above — enforce
invariants in the DB, not only in code): `ck_activities_percent_complete`
(0–100), `ck_activities_duration_days_nonneg` (≥ 0), `ck_activities_lane_index_nonneg`
(≥ 0), and `ck_activities_constraint_pair` — a schedule constraint's `constraint_type`
and `constraint_date` are both set or both null (never one without the other), so a
half-set constraint can never corrupt CPM scheduling even if a future code path
bypasses the service. They are raw SQL in the migration (Prisma cannot express
`CHECK`). `total_float` is deliberately unconstrained — negative float is valid.

### Dependency: the schedule edge

The `dependencies` table (Prisma model `ActivityDependency`, `@@map("dependencies")` —
the shorter plural reads cleaner and matches the API module name) is the **edge** of the
schedule network: a typed, lagged logic tie between two activities in a plan
(`FS`/`SS`/`FF`/`SF` + a signed working-day `lag_days`). Together with `activities` (the
nodes) it forms the directed graph the CPM engine (a later slice) walks. It follows every
standard above — UUID v7 PK, snake_case via `@map`, timestamptz UTC, soft delete, audit
with **TEXT** `created_by`/`updated_by`, optimistic-locking `version`, `delete_batch_id`.

- **Denormalised scope.** Like `Activity`, a dependency carries both `organization_id`
  **and** `plan_id` directly (each a `RESTRICT` FK), copied from its two endpoints by the
  service inside the create transaction — **never from client input**. Invariant:
  `dep.plan_id == predecessor.plan_id == successor.plan_id` and
  `dep.organization_id == predecessor.organization_id`. This powers the plan-level list,
  the single-query cycle-check edge load, and the plan-level cascade without a join.
- **Two endpoint FKs to `activities`.** `predecessor_id` and `successor_id` are both
  `RESTRICT` FKs to `activities.id`, modelled in Prisma as **explicitly named
  self-relations** (`"DependencyPredecessor"` / `"DependencySuccessor"`) so Prisma can
  disambiguate the back-relations (`Activity.predecessorLinks` are the edges where the
  activity is the predecessor; `Activity.successorLinks` where it is the successor). Two
  FKs to one table **require** named relations or Prisma errors.
- **CPM output — engine-owned** (`is_driving`): a defaulted (`false`) **NOT NULL** boolean,
  the edge-level analogue of the activity CPM columns above. It is `true` when this
  dependency is the **binding** tie that determines its successor's early start (a
  "driving" logic relationship in CPM/GPM). **Never accepted from a write DTO** — it is
  recomputed on every recalculate by the CPM engine's batched raw `UPDATE`, which touches
  engine columns alone (never `version`/`updated_at`/`updated_by`), so a recalc is
  invisible to optimistic locking (ADR-0022). It reads `false` until the plan is first
  calculated. **No index**: the canvas reads it as part of the already plan-scoped
  dependency load and never filters or sorts by it, so an index on a low-cardinality
  boolean would cost writes for no read benefit.
- **Uniqueness is per `(predecessor, successor, type)`.** The partial unique index
  `uq_dependencies_pred_succ_type` (`WHERE deleted_at IS NULL`, raw SQL) allows a pair to
  hold up to four distinct-typed links — the **SS+FF overlap "ladder"** idiomatic to
  construction/linear scheduling — while blocking exact duplicates; a soft-deleted link
  frees its triple for reuse. It backs the create `DUPLICATE_DEPENDENCY` (409) check.
- **Direction indexes** (`predecessor_id`, `successor_id`) back the activity
  predecessors/successors direction lists **and** the two FKs; `predecessor_id` also
  serves the cycle-walk adjacency load. `(plan_id, created_at, id)` covers the plan FK,
  the plan-level list and its cursor sort; `organization_id` backs its FK and IDOR loads.
- **CHECK constraints** (raw SQL — defence-in-depth). `ck_dependencies_no_self_loop`
  (`predecessor_id <> successor_id`) guarantees a self-edge (the trivial 1-node cycle) can
  never persist even if the service's 422 `SELF_DEPENDENCY` guard is bypassed;
  `ck_dependencies_lag_days_range` bounds `lag_days` to **−3650…3650** (≈ ±10 years,
  matching the create DTO). The broader **DAG (no-cycle) invariant** is a graph-wide
  property the DB cannot express as a CHECK — it is enforced by a service-layer
  reachability walk inside the create transaction (a later task / ADR-0021).
- **Link soft-delete/cascade is service-owned.** Both endpoint FKs are `RESTRICT`; links
  are never hard-deleted. Deleting an activity soft-deletes its **incident** links (where
  it is predecessor **or** successor) and a plan/project/client cascade soft-deletes the
  links **contained** in the affected plans — all stamped in the same `delete_batch_id`;
  restore is **endpoint-guarded** (a batch's links reactivate only where both endpoints
  are active). This lives in the shared `HierarchyLifecycleService` (task A3), consistent
  with the four-level hierarchy cascade above.

### Calendar & CalendarException: the working-week library

The `calendars` and `calendar_exceptions` tables (M5, ADR-0024) are the org-scoped
**working-day calendar library** that fills the CPM engine's `WorkingDayCalendar`
port. A `Calendar` is a **weekly pattern** — a 7-bit `working_weekdays` mask (bit 0 =
Monday … bit 6 = Sunday) — plus a sparse list of dated `CalendarException`s that flip a
single day (`is_working = false` a holiday, `is_working = true` a worked weekend). Both
follow every house standard (UUID v7 PK, snake_case via `@map`, timestamptz UTC, soft
delete + `delete_batch_id`, TEXT audit ids, optimistic-locking `version`, scoped
indexes).

- **Scope.** `Calendar.organization_id` is **native** (the org is its direct parent,
  like `Client`). `CalendarException.organization_id` is **denormalised** from its
  parent calendar (copied by the service, never client input — like `Activity`), so an
  org-scope/IDOR check and the cascade batch filter one indexed column without a join.
  The calendar library is a **sibling** of the Client→Project→Plan tree, not part of it;
  a `Plan` references its default calendar via the nullable `plans.calendar_id` FK
  (`RESTRICT`, backed by the partial `idx_plans_calendar_id`), which is why calendars are
  not a hierarchy level. A null `calendar_id` means all-days-work (M6 back-compat); new
  plans default to the org's seeded **Standard (Mon–Fri)** calendar, seeded on org create
  and backfilled for existing orgs by the M5 data migration.
- **`working_weekdays` CHECK** (raw SQL — defence-in-depth). `ck_calendars_working_weekdays_range`
  bounds the mask to **`> 0 AND <= 127`**: it must have at least one working weekday (an
  empty pattern would make the engine's `addWorkingDays` non-terminating — mirrored by the
  pure factory throwing on `0` and by the shared `WorkingWeekdays.isValid` helper) and no
  bits outside the 7-day week. Stored as `smallint` (2 bytes is ample for a 7-bit value).
- **Uniqueness.** `uq_calendars_org_name` (partial, `WHERE deleted_at IS NULL`) keeps a
  calendar name unique per org among live rows (backs `DUPLICATE_CALENDAR` 409).
  `uq_calendar_exceptions_cal_date` (partial) allows **at most one active exception per
  `(calendar, date)`** — a day cannot be both a holiday and a worked day — and, being an
  active-row index keyed by `(calendar_id, date)`, it **doubles as the engine's
  active-exception load** (`WHERE calendar_id = ? AND deleted_at IS NULL ORDER BY date`),
  the Organization-slug precedent. A soft-deleted row frees its key for reuse.
- **Indexes.** `(organization_id, created_at, id)` on `calendars` backs the org FK, the
  active library list and its cursor sort (same full-composite pattern as `Client`). On
  `calendar_exceptions`, `(calendar_id, date)` (full) backs the calendar FK and the
  editor's list-all-exceptions load over **all** rows (the partial unique only covers
  active ones); `organization_id` backs its FK and IDOR loads.
- **Cascade.** Both FKs are `RESTRICT`; calendars/exceptions are never hard-deleted.
  Soft-deleting a calendar stamps it and its exceptions with one `delete_batch_id` so
  restore brings the set back — the same service-owned mechanism as the hierarchy. A
  **delete-in-use guard** (`CalendarsService`) counts active plans referencing the
  calendar and returns **409 `CALENDAR_IN_USE`** before any delete, so a calendar
  referenced by an active plan can never be removed (soft delete never trips the DB FK, so
  the service check is the real guard; `RESTRICT` is defence in depth). The reserved
  `activities.calendar_id`
  column stays reserved — **per-activity calendars are deferred** (they break the engine's
  continuous-offset arithmetic; ADR-0024).

### Baseline & BaselineActivity: the plan-of-record snapshot

The `baselines` and `baseline_activities` tables (M7, ADR-0025) freeze a plan's schedule
as a **named plan of record** that the live schedule is compared against (PROJECT_BRIEF
§8/§11, Journey 4). A `Baseline` names the snapshot; a `BaselineActivity` is one
activity's frozen copy. Both follow every house standard (UUID v7 PK, snake_case via
`@map`, timestamptz UTC, soft delete + `delete_batch_id`, TEXT audit ids,
optimistic-locking `version`, scoped indexes).

- **Snapshot-copy, not reference (ADR-0025).** `BaselineActivity` **duplicates** each
  activity's identity (`code`, `name`, `type`, `duration_days`) and its captured CPM
  dates (`baseline_start`/`baseline_finish` = the captured early start/finish,
  `late_start`/`late_finish`, `total_float`, `is_critical`). `source_activity_id` is a
  **plain correlation UUID with NO foreign key** — so the snapshot survives the source
  activity's 90-day hard purge (§13) and stays faithful even if the live activity is
  edited or deleted. Variance joins live activities to the snapshot on this id.
- **Scope.** `Baseline.organization_id` is **denormalised** from its plan;
  `BaselineActivity.organization_id` from its parent baseline (copied by the service,
  never client input — the `Activity` pattern), so an org-scope/IDOR check and the cascade
  batch filter one indexed column. Baselines are **descendants of a plan** (`plan_id` FK,
  `RESTRICT`), not a new hierarchy level.
- **One active per plan.** `uq_baselines_plan_active` (partial, `WHERE is_active = true
AND deleted_at IS NULL`) guarantees **at most one active baseline per plan** — the
  comparison baseline — in the database, not just in code. `activate` flips it atomically
  under the plan write-lock (the same advisory lock as `ScheduleService.recalculate`,
  ADR-0022); the partial unique is the concurrency backstop. The plan's **first** baseline
  is captured active; later captures are inactive until activated. Deleting the active
  baseline simply leaves the plan with none active.
- **Uniqueness.** `uq_baselines_plan_name` (partial, `WHERE deleted_at IS NULL`) keeps a
  baseline name unique per plan among live rows (backs `DUPLICATE_BASELINE` 409); a
  soft-deleted name is free to reuse.
- **Denormalised capture fields.** `captured_at` (the freeze instant), `data_date` (the
  plan's `planned_start` at capture) and `captured_project_finish` (the plan's latest
  inclusive finish at capture) let the list panel render without loading snapshot rows.
- **Indexes.** `(plan_id, created_at, id)` on `baselines` backs the plan FK, the
  list-baselines-for-a-plan query and its cursor sort. On `baseline_activities`,
  `(baseline_id, source_activity_id)` is both the variance join key and the
  load-all-rows-for-a-baseline path (so no standalone `baseline_id` index); each table's
  `organization_id` backs its FK and IDOR loads.
- **Cascade.** Both FKs are `RESTRICT`; nothing is hard-deleted. A baseline and its
  snapshot rows soft-delete together under one `delete_batch_id`, and a
  plan/project/client delete cascades to contained baselines the same way (the
  `HierarchyLifecycleService` gains a `'baseline'` level) — restore brings the set back.
  Capture reads its snapshot **inside the plan write-lock**, so it is never taken
  mid-recalculation.

### PlanLock: the edit-lock lease

The `plan_locks` table (ADR-0028) is the **single-editor "pen"** — the human-facing
coordination layer above optimistic `version` (409) and the plan advisory lock. It
is deliberately **not** a domain record, and departs from the hierarchy template on
purpose (a future reader should not "fix" these into the standard shape):

- **PK is `plan_id`, not a UUID v7 `id`.** The one-lock-per-plan invariant made
  physical: **presence = someone holds the pen, absence = free.** No second table,
  no partial unique — the PK _is_ the uniqueness.
- **No soft-delete, no `version`, no `created_by`/`updated_by`, no
  `delete_batch_id`.** It is ephemeral coordination state; the "gone" signal is
  `expires_at < now()` (a lapsed lease reads as free and is overwritten on the next
  acquire — **no sweeper** in v1). Frequent heartbeats deliberately live off `Plan`
  so they never touch `Plan.version`/`updated_at` (the same derived-vs-edited
  separation as ADR-0022's engine columns).
- **The `plan_id` FK is the schema's only `ON DELETE CASCADE`** (every hierarchy
  child is `RESTRICT`). Those are `RESTRICT` because they are soft-deleted domain
  records an accidental hard delete must never orphan; a lock is the opposite —
  transient state wholly owned/composed by its plan (DATABASE.md: "CASCADE only for
  true ownership/composition"), with nothing to preserve. Plans soft-delete in
  normal use so the FK never fires; `CASCADE` only matters on a rare hard purge,
  where the lock must vanish with the plan and never **block** it. Mirrors the
  `Session`/`Account → User` `CASCADE` precedent for library-managed ephemeral rows.
- **`organization_id`** is denormalised from the plan (copied by the service inside
  the acquire transaction, **never** client input; invariant
  `lock.organization_id == plan.organization_id`) as the tenant scope tag, with a
  `RESTRICT` FK like every sibling — inert in practice (plan → org `RESTRICT` fires
  first). **`holder_user_id` / `requested_by_user_id`** are bare `TEXT` with **no
  FK** — Better Auth ids are opaque TEXT attribution stamps, so they follow the
  `created_by`/`accepted_by_user_id` convention, not the `OrgMember.user_id`
  membership FK.
- **`requested_by_user_id` / `requested_at`** hold at most one _pending_ peer
  request-control (newest wins, ADR-0028 Q-A); the service clears them on every
  holder change, and "grace elapsed" is a pure `now() − requested_at` comparison —
  nothing to schedule or sweep.
- **Indexes.** The PK covers both the status read and the heartbeat (a single-row
  `UPDATE … WHERE plan_id AND holder_user_id AND expires_at > now()` — the extra
  predicates filter the one PK-selected row for free). Only `@@index([organization_id])`
  is added, backing the FK and org-scoped audit reads; nothing on
  `holder_user_id`/`expires_at` (they would only add write cost on the hot path).

## Testing & performance

- Integration tests run against a **real Postgres** (see [`TESTING.md`](TESTING.md)).
- Profile with `EXPLAIN ANALYZE`; watch for N+1 (Prisma `include`/`select`),
  missing indexes, and unbounded queries. **Paginate everything.** See
  [`PERFORMANCE.md`](PERFORMANCE.md).
