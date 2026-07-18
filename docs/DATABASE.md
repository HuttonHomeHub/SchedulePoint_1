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
- **Money is `BIGINT` minor units + a currency code (EV1, ADR-0042).** The first
  money columns land with the cost/earned-value rung: the stored amounts
  `resource_assignments.budgeted_cost`/`actual_cost`,
  `activities.budgeted_expense`/`actual_expense`, and
  `baseline_activities.budgeted_cost` are all **`BIGINT` minor units** (e.g.
  pence/cents) in the plan's currency (`resources.cost_per_unit` is a **rate**, not
  a stored amount — see the house rule below); `plans.currency_code` is `CHAR(3)`
  ISO-4217 (a genuine fixed-width code — the "text unless a real limit applies"
  exception — format-guarded, nullable = inherit the org default). `BIGINT` (not
  `INTEGER`) because construction BACs exceed the ~£21M `INT` minor-unit ceiling;
  `BIGINT` (not `DECIMAL`) because money uses exact integer minor units with a
  single documented rounding point per derived index (ADR-0035 §29) — the
  schema's `DECIMAL(18,4)` columns (`budgeted_units`, `units_per_hour`,
  `max_units_per_hour`, `actual_units`) are physical **quantities**, not money.
  The house rule: **rate coefficients are `DECIMAL(18,4)`; stored money amounts are
  `BIGINT` minor units.** `resources.cost_per_unit` is a **cost-per-unit rate**
  (multiplies `budgeted_units` directly, aligned with the ADR-0040 units backbone),
  so it is `DECIMAL(18,4)` like its sibling rates — in minor units per unit of work
  (e.g. `5237.5000` pence/unit) so a derived amount is `round(budgeted_units ×
cost_per_unit)` minor units. Decimal keeps a composite rate exact rather than
  rounding it to a whole minor unit before the multiply.
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
| `idx_activities_calendar_id`                  | `(calendar_id)`                        | partial        | the delete-in-use guard's active-**activity** count `WHERE calendar_id = ? AND deleted_at IS NULL` (`WHERE deleted_at IS NULL AND calendar_id IS NOT NULL`); the activity twin of `idx_plans_calendar_id` (M5, ADR-0037)   |
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
| `resources_organization_id_created_at_id_idx` | `(organization_id, created_at, id)`    | full composite | `organization_id` FK + org-scoped active resource list + cursor sort — subsumes a standalone org index (the `Calendar` pattern)                                                                                            |
| `uq_resources_org_name`                       | `(organization_id, name)`              | partial unique | resource name unique per org among live rows (`WHERE deleted_at IS NULL`); backs `DUPLICATE_RESOURCE` (409)                                                                                                                |
| `uq_resources_org_code`                       | `(organization_id, code)`              | partial unique | optional `code` unique per org among live rows (`WHERE deleted_at IS NULL AND code IS NOT NULL`); NULL codes are exempt (the `uq_activities_plan_code` pattern)                                                            |
| `idx_resources_calendar_id`                   | `(calendar_id)`                        | partial        | the (extended) `CALENDAR_IN_USE` guard's active-resource count + the M7.2 driving-calendar load (`WHERE calendar_id = ? AND deleted_at IS NULL`); the `idx_activities_calendar_id` twin                                    |
| `idx_resources_delete_batch_id`               | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |
| `resource_assignments_organization_id_idx`    | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                               |
| `uq_resource_assignments_activity_resource`   | `(activity_id, resource_id)`           | partial unique | one **active** assignment per (activity, resource) (`WHERE deleted_at IS NULL`); backs `DUPLICATE_ASSIGNMENT` (409); its leftmost prefix `activity_id` subsumes an active-activity assignment-list index                   |
| `uq_resource_assignments_activity_driving`    | `(activity_id)`                        | partial unique | at most one **driving** assignment per activity (`WHERE is_driving AND deleted_at IS NULL`); the ≤1-driver backstop + the recalc "find the driving assignment" load                                                        |
| `idx_resource_assignments_resource_id`        | `(resource_id)`                        | partial        | the `RESOURCE_IN_USE` guard's active-assignment count (`WHERE resource_id = ? AND deleted_at IS NULL`)                                                                                                                     |
| `idx_resource_assignments_delete_batch_id`    | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |
| `activity_steps_organization_id_idx`          | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                               |
| `uq_activity_steps_activity_seq`              | `(activity_id, seq)`                   | partial unique | one **active** step per `(activity, seq)` (`WHERE deleted_at IS NULL`); backs the bulk-replace dup-seq (409); its leftmost prefix `activity_id` (pre-sorted by `seq`) subsumes an active-step list index                   |
| `idx_activity_steps_delete_batch_id`          | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                       |

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

### Plan: the mandatory data date (`planned_start`)

`Plan.planned_start` (`@db.Date`, date-only) **is the CPM data date** (ADR-0023)
and is **`NOT NULL`** as of ADR-0033 M1. It was originally nullable (the M0
additive slice) and made mandatory in a single, deliberately isolated migration
(`…_require_plan_planned_start`) that first **backfilled** every existing NULL —
including soft-deleted plans, since the constraint applies to all rows — via a
first-non-null-wins chain (earliest **active** activity `constraint_date` →
earliest **active** activity `actual_start` → `created_at::date` → `CURRENT_DATE`)
and then ran `SET NOT NULL`. Backfill and constraint commit atomically in the one
migration transaction. This is a **forward-only, irreversible** change (the
backfilled dates are indistinguishable from originals afterward); a plan with only
soft-deleted activities falls through to `created_at::date`.

`Plan` also carries two single-row **mode** enums read with the plan and never
filtered across plans (so neither is indexed): `scheduling_mode` (`SchedulingMode`,
default `EARLY`; ADR-0033) and `progress_recalc_mode` (`ProgressRecalcMode`, default
`RETAINED_LOGIC`; ADR-0035 §1, M2). The recalc mode selects how the CPM engine
reschedules **out-of-sequence** remaining work — `RETAINED_LOGIC` keeps
incomplete-predecessor logic, `PROGRESS_OVERRIDE` drops the incoming bound from
incomplete predecessors, `ACTUAL_DATES` follows the ADR-0035 §1 actual-dates
treatment. `RETAINED_LOGIC` is behaviour-preserving in spirit; the column is
additive with a constant `DEFAULT` (no data migration) and the engine does not
consume it until the M2 engine tasks land. `Plan` also carries the single-row
boolean scheduling option `use_expected_finish_dates` (default `false`; ADR-0035
§9, M4 F5): when on, the engine's forward pass recomputes an in-progress activity's
remaining duration so its early finish lands on the activity's `expected_finish`
(see _Activity_ below). Like the mode enums it is read with the plan, never filtered
across plans (so unindexed), and additive with a constant `DEFAULT` (no data
migration) — default `false` is behaviour-preserving.

`Plan` also carries the single-row boolean scheduling option
`ignore_external_relationships` (default `false`; ADR-0043 / ADR-0035 §30.4, M1). When
on, the recalc **drops** every activity's external early-start **and** late-finish
bounds (the P6 "ignore relationships to/from other projects" toggle; see the external
dates on _Activity_ below), leaving internal constraints/logic untouched, so a planner
can compare the plan on its own logic vs. gated by its neighbours (scenario S09). Like
`make_open_ends_critical` / `level_resources` it is read with the plan, never filtered
across plans (so unindexed), and additive with a constant `DEFAULT` (no data migration)
— default `false` is behaviour-preserving.

### Activity: the schedule leaf

`Activity` follows every standard above and adds three column groups the deferred
scheduling slices depend on, persisted **now** so those slices are additive (no
wide `ALTER TABLE` + backfill later):

- **Definition** (`type`, `duration_minutes`, `duration_type`,
  `constraint_type`/`constraint_date`,
  `secondary_constraint_type`/`secondary_constraint_date`,
  `external_early_start`/`external_late_finish`, `lane_index`,
  `schedule_as_late_as_possible`, optional
  `code`) — Planner-owned. The **external / inter-project dates**
  `external_early_start`/`external_late_finish` (ADR-0043 / ADR-0035 §30, M1) are two
  optional **imported instants** that gate an activity from another project: the early
  start is an `SNET`-shaped forward **lower** bound (an upstream project's hand-over),
  the late finish an `FNLT`-shaped backward **upper** bound (a downstream project's
  window). Like the constraint pairs they are **client-settable** (a write DTO sets
  them), **NOT** engine-owned; either, both, or neither may be set; the engine clamps
  early start up to / late finish down to them on the **existing** forward/backward
  passes (no new pass), **gated on** `plan.ignore_external_relationships`, and they are
  **soft** bounds (never mandatory pins — they never set `constraint_violated`).
  Uniquely among the schedule-day columns they are `TIMESTAMPTZ` **absolute
  working-instants** (the ADR-0037 axis), **not** `@db.Date` — see the calendar-day
  note below. Additive & nullable (no data migration); unindexed (read only on the
  full-plan recalc load, never a query predicate — the `secondary_constraint`
  precedent). `duration_type` (M7 rung 4, ADR-0040) is a **client-settable**
  (NOT engine-owned) `DurationType` enum — `FIXED_DURATION_AND_UNITS_TIME` (the **default**),
  `FIXED_DURATION_AND_UNITS`, `FIXED_UNITS`, `FIXED_UNITS_TIME` — naming which of the triad
  {`duration_minutes`, an assignment's `budgeted_units`, its `units_per_hour`} is
  **recomputed** vs held when a planner edits another, keeping `Units = Duration ×
Units/Time` true. The recompute is a **pure service-boundary** concern resolved at write
  time (F2/F3), **not** the CPM engine — which reads the resulting `duration_minutes`
  unchanged. Additive with a constant `DEFAULT` (no data migration); unindexed (read only
  on the full-plan recalc load, never a query predicate — the `secondary_constraint_type`
  precedent). The **secondary** constraint pair (ADR-0035 §10, M4 F3)
  mirrors the primary pair exactly and is equally **client-settable** (NOT
  engine-owned): the primary drives the CPM forward pass, the secondary drives the
  backward pass. `schedule_as_late_as_possible` (ADR-0035 §11, M4 F4) is a defaulted
  (`false`) **NOT NULL** boolean that is likewise **client-settable** (NOT
  engine-owned) — a **display-only** placement preference: the ALAP pass shows the
  activity's start as late as its successors allow while the pure `early_*`/`late_*`/
  `total_float` network stays untouched (the effective-Visual precedent). Additive
  with a constant `DEFAULT` (no data migration); unindexed (never a query predicate).
  Since ADR-0036 (M1) `duration_minutes`
  is an integer count of **working minutes** (the engine schedules in working-minute
  offsets over intraday shift calendars); milestones are `0`. The public API stays
  **day-denominated** (`durationDays`) — the service converts at the boundary by the plan
  calendar's day length (factor `1440` for a full-day window; ADR-0036 §7), so no HTTP
  contract changed. A defensive `DEFAULT 480` (one 8 h day) applies only to a direct-DB
  insert; the service always sets the value explicitly.
- **Progress** (`status`, `percent_complete`, `actual_start`, `actual_finish`,
  `remaining_duration_minutes`, `suspend_date`, `resume_date`, `expected_finish`) —
  Contributor-updatable via a dedicated progress path, never via a definition
  update. `remaining_duration_minutes` (ADR-0035 §1, M2) is an **independent,
  P6-faithful** remaining-work count in working minutes: **`NULL` ⇒ the engine
  derives remaining from `percent_complete × duration_minutes`**; **non-null ⇒ the
  explicit value is used verbatim**, decoupled from percent so out-of-sequence
  productivity stays faithful and the negative case **N18** (remaining `> 0` on a
  complete activity) is detectable. It is day-denominated at the API boundary
  (ADR-0036 §7), like `duration_minutes`. `suspend_date`/`resume_date` (ADR-0035 §4,
  engine-wired in a later M2 task) are calendar days (`@db.Date`, like
  `actual_start/finish`); a suspended activity's remaining work is floored at
  `max(data date, resume_date)`. All three are **additive & nullable** (no data
  migration); the engine does not consume them until the M2 engine tasks land.
  `expected_finish` (ADR-0035 §9, M4 F5) is a **client-settable** (NOT engine-owned),
  nullable target finish date for an in-progress activity (calendar day, `@db.Date`);
  when the plan option `use_expected_finish_dates` is on, the engine's forward pass
  recomputes `remaining_duration_minutes` so the early finish lands on it (floored per
  the M2 data-date rule), otherwise it is ignored. It is additive & nullable (no data
  migration) and unindexed (read only on the full-plan recalc load).
- **CPM output — engine-owned** (`early_start`/`early_finish`,
  `late_start`/`late_finish`, `total_float`, `is_critical`, `is_near_critical`,
  `constraint_violated`): nullable/defaulted, **never accepted from a write DTO**.
  They are populated by the CPM engine; until a plan is recalculated they read as
  null/false ("—" in the UI). `constraint_violated` (M4, ADR-0035 §7) is a
  defaulted (`false`) **NOT NULL** boolean — true when a mandatory pin
  (`MANDATORY_START`/`MANDATORY_FINISH`) drove the activity earlier than logic
  allowed (produce-and-flag; the schedule is produced as pinned, never repaired).
  Storing these avoids a wide migration when features that read them land.
- **`calendar_id`** is the activity's own working-time calendar (**M5, ADR-0037**):
  a nullable, **client-settable** UUID FK to `calendars` (`onDelete: Restrict`),
  mirroring `Plan.calendar` exactly. `null` means **inherit the plan default** —
  resolution order `activity.calendarId → plan.calendarId → all-minutes`. The FK
  alone does **not** enforce same-org (a cross-org `calendarId` satisfies it), so the
  org-scope check stays in the service (like the plan picker). `RESTRICT` never
  actually fires (calendars soft-delete only); the `CALENDAR_IN_USE` service guard —
  which now unions active plans **and** active activities (`WHERE deleted_at IS NULL`)
  — is the real protection, `RESTRICT` is defence in depth. Backed by the partial
  `idx_activities_calendar_id`.

Calendar-day fields (`constraint_date`, `actual_start/finish`, `expected_finish`, the
CPM `*_start/finish` columns) are `@db.Date` (date-only, no timezone), like
`Plan.planned_start` — a schedule day is a calendar day, not an instant. The
**exception** is the external / inter-project dates
`external_early_start`/`external_late_finish`, which are `TIMESTAMPTZ` **absolute
working-instants** (the ADR-0037 axis): they are **imported commitments from another
project** (a vendor delivery, a downstream window), independent of this plan's data
date, so they are stored absolutely — a data-date change must never move them —
whereas the day columns above are all relative to this plan's own schedule.

`activities` is the first domain table with bounded numerics, so it is also the
first to carry **`CHECK` constraints** (per _Constraints_ above — enforce
invariants in the DB, not only in code): `ck_activities_percent_complete`
(0–100), `ck_activities_duration_minutes_nonneg` (≥ 0),
`ck_activities_remaining_duration_minutes_nonneg` (≥ 0 — bounds a **supplied**
remaining only; `NULL` is always legal, that is the derive path),
`ck_activities_lane_index_nonneg`
(≥ 0), `ck_activities_resume_after_suspend` (**nullable-safe**: `resume_date IS
NULL OR suspend_date IS NULL OR resume_date >= suspend_date` — enforced only when
both suspend/resume dates are set, so it never blocks the common no-suspend path),
`ck_activities_constraint_pair` — a schedule constraint's `constraint_type`
and `constraint_date` are both set or both null (never one without the other), so a
half-set constraint can never corrupt CPM scheduling even if a future code path
bypasses the service — `ck_activities_secondary_constraint_pair`, the identical
both-null-or-both-set invariant for the secondary pair (ADR-0035 §10, M4 F3), and
`ck_activities_external_finish_after_start` (**nullable-safe**: `external_late_finish
IS NULL OR external_early_start IS NULL OR external_late_finish >= external_early_start`
— an external window is enforced non-inverted only when **both** ends are set, mirroring
`ck_activities_resume_after_suspend`), the DB backstop behind the DTO's 422
`EXTERNAL_FINISH_BEFORE_START` (ADR-0043 / ADR-0035 §30 N26). They
are raw SQL in the migration (Prisma cannot express `CHECK`). `total_float` is
deliberately unconstrained — negative float is valid.

### Dependency: the schedule edge

The `dependencies` table (Prisma model `ActivityDependency`, `@@map("dependencies")` —
the shorter plural reads cleaner and matches the API module name) is the **edge** of the
schedule network: a typed, lagged logic tie between two activities in a plan
(`FS`/`SS`/`FF`/`SF` + a signed working-minute `lag_minutes`, since ADR-0036). Together with
`activities` (the nodes) it forms the directed graph the CPM engine walks. It follows every
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
- **Lag units & the lag-calendar seam (ADR-0036 §6).** `lag_minutes` is a signed
  **working-minute** lag; the public API stays day-denominated (`lagDays`) and the service
  converts at the boundary (×1440). A `lag_calendar` enum column (`LagCalendarSource`:
  `PREDECESSOR`/`SUCCESSOR`/`TWENTY_FOUR_HOUR`/`PROJECT_DEFAULT`, default `PROJECT_DEFAULT`)
  is the **per-relationship lag-calendar seam** — M1 lands the column; M3 wires resolution and
  exposes it. It must stay in lock-step with the `LagCalendarSource` union in `@repo/types`.
- **CHECK constraints** (raw SQL — defence-in-depth). `ck_dependencies_no_self_loop`
  (`predecessor_id <> successor_id`) guarantees a self-edge (the trivial 1-node cycle) can
  never persist even if the service's 422 `SELF_DEPENDENCY` guard is bypassed;
  `ck_dependencies_lag_minutes_range` bounds `lag_minutes` to **−5 256 000…5 256 000** (≈ ±10
  years = ±3650 days × 1440, preserving the old day-range intent). The broader **DAG (no-cycle)
  invariant** is a graph-wide
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

The `calendars`, `calendar_shifts`, `calendar_exceptions` and `calendar_exception_windows`
tables (M5, ADR-0024; reworked to intraday granularity by **ADR-0036**, M1) are the
org-scoped **working-time calendar library** that fills the CPM engine's
`WorkingTimeCalendar` port. Since ADR-0036 a `Calendar` is an **intraday weekly pattern** —
per weekday a list of `[start_minute, end_minute)` **shift windows** (`calendar_shifts`) —
plus dated `CalendarException` ranges whose **windows** (`calendar_exception_windows`)
_replace_ that period's pattern: zero windows = a holiday/non-work block, a non-empty list =
worked overtime or a window-only working period. This expresses split shifts, 24 h, a
midnight-crossing night shift (two adjacent-day windows, never a wrap), and window-only
calendars whose base week is empty. The public API stays **weekday-mask / whole-day-exception
denominated** (ADR-0036 §7): the service materialises each set weekday of the mask as one
full-day `[0, 1440)` shift and each `isWorking` exception as one full-day window, and
reconstructs the mask/`isWorking` on read — so the HTTP contract is unchanged and richer
shift authoring is an additive follow-on. `Calendar` and `CalendarException` follow every
house standard (UUID v7 PK, snake_case via `@map`, timestamptz UTC, soft delete +
`delete_batch_id`, TEXT audit ids, optimistic-locking `version`, scoped indexes);
`calendar_shifts` and `calendar_exception_windows` are **owned-value child tables** (the
`PlanLock` precedent: no soft-delete, no `version`, no audit ids, no denormalised
`organization_id`, FK `ON DELETE CASCADE`) — they have no existence apart from their parent.

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
- **Window bounds & non-overlap CHECK/EXCLUDE** (raw SQL — Prisma cannot express either).
  Both window tables carry `ck_*_minute_bounds` (`0 ≤ start_minute`, `end_minute ≤ 1440`),
  `ck_*_window_order` (`start_minute < end_minute`), and a **btree_gist `EXCLUDE`** guaranteeing
  windows never overlap within a day (per `(calendar_id, weekday)` for shifts, per
  `(calendar_exception_id)` for exception windows). The old `ck_calendars_working_weekdays_range`
  (mask `> 0`) guard is **dropped, not replaced**: a window-only calendar (empty base week, work
  only from positive exceptions) is now valid, and the "no working time in the horizon" check
  moved into the pure `buildWorkingTimeCalendar` factory (the N11 hang backstop). `weekday` is a
  `smallint` (0 = Monday … 6 = Sunday) with `ck_calendar_shifts_weekday_range` (0–6).
- **Uniqueness & non-overlap.** `uq_calendars_org_name` (partial, `WHERE deleted_at IS NULL`)
  keeps a calendar name unique per org among live rows (backs `DUPLICATE_CALENDAR` 409). The
  old point-key `uq_calendar_exceptions_cal_date` is **replaced** by
  `ex_calendar_exceptions_no_overlap` — a **partial GiST `EXCLUDE`** (`WHERE deleted_at IS NULL`)
  over `daterange(start_date, end_date, '[]')` guaranteeing **at most one active exception
  covers any given day** (a day cannot be both a holiday and a worked window). It backs the add
  `DUPLICATE_EXCEPTION` (409); because `23P01` (exclusion_violation) is not a Prisma `P2002`, the
  service matches it by constraint name to map it to the 409.
- **Ranged exceptions.** `CalendarException` carries an inclusive `[start_date, end_date]`
  **range** (single-day when `start_date = end_date`; `ck_calendar_exceptions_date_order`
  enforces `end_date ≥ start_date`), so a multi-day shutdown is one row.
- **Indexes.** `(organization_id, created_at, id)` on `calendars` backs the org FK, the active
  library list and its cursor sort (same full-composite pattern as `Client`).
  `calendar_exceptions(calendar_id, start_date)` backs the FK, the editor's list-all load, and
  the engine's active-exception load ordered by `start_date`; `organization_id` backs its FK and
  IDOR loads. The owned-value tables are indexed exactly on their sole access path —
  `calendar_shifts(calendar_id, weekday, start_minute)` and
  `calendar_exception_windows(calendar_exception_id, start_minute)` — which is both the engine's
  load order and the FK's leftmost prefix.
- **Cascade.** Both FKs are `RESTRICT`; calendars/exceptions are never hard-deleted.
  Soft-deleting a calendar stamps it and its exceptions with one `delete_batch_id` so
  restore brings the set back — the same service-owned mechanism as the hierarchy. A
  **delete-in-use guard** (`CalendarsService`) counts active plans **and (M5, ADR-0037)
  active activities** referencing the calendar and returns **409 `CALENDAR_IN_USE`**
  before any delete, so a calendar referenced by an active plan or activity can never be
  removed (soft delete never trips the DB FK, so the service check is the real guard;
  `RESTRICT` is defence in depth). The guard counts only **active** referencers
  (`WHERE deleted_at IS NULL`): a soft-deleted plan or activity must not block a calendar
  delete — an asymmetry the DB-level `RESTRICT` cannot express (it fires on **any**
  referencing row regardless of soft-delete), which is exactly why the service guard,
  not the FK, is the enforcement point. `activities.calendar_id` is now an **active**,
  client-settable FK (**M5, ADR-0037** activated the reserved ADR-0024 column) —
  `RESTRICT`, backed by the partial `idx_activities_calendar_id`, the activity twin of
  `idx_plans_calendar_id`.

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

### Resource & ResourceAssignment: the resource dimension

The `resources` and `resource_assignments` tables (M7.1, ADR-0039) are the CPM
engine's **resource dimension**. A `Resource` is an org-scoped, reusable **library**
entity — a crew, a plant item, a material — modelled exactly like `Calendar` (a
**sibling** of the Client→Project→Plan tree, not a hierarchy level). A
`ResourceAssignment` ties a `Resource` to an `Activity` with a budgeted quantity and
a **driving** flag. Both follow every house standard (UUID v7 PK, snake_case via
`@map`, timestamptz UTC, soft delete + `delete_batch_id`, TEXT audit ids,
optimistic-locking `version`, scoped indexes). This slice is the **model** only —
assignment is reference data until an activity is made resource-dependent (M7.2), so
with no resources the schedule is byte-identical (the parity gate).

- **Deliberately lean (ADR-0039).** `Resource` carries `name`, an optional short
  `code`, `description`, a `kind` (`ResourceKind`: `LABOUR`/`EQUIPMENT`/`MATERIAL`),
  and an **optional `calendar_id`** FK to the org `Calendar`. Availability
  (`max_units`), **cost**, and **earned-value** columns are **reserved** for their
  later rungs (levelling / cost / EV), added only when those rungs land — the
  `activities.calendar_id`-was-reserved precedent (ADR-0024). A resource references
  an existing `Calendar`; there is no separate resource-calendar model.
- **Scope.** `Resource.organization_id` is **native** (the org is its direct parent,
  like `Calendar`/`Client`). `ResourceAssignment.organization_id` is **denormalised**
  from its endpoints (copied by the service, never client input — the `Activity`/
  `ActivityDependency` pattern), so an org-scope/IDOR check and the cascade batch
  filter one indexed column. The FK on `resources.calendar_id` (and on an
  assignment's `activity_id`/`resource_id`) does **not** enforce same-org — a
  cross-org id satisfies it — so the **service** owns the same-org check (the
  `activities.calendar_id`/`parent_id` limitation & remedy, ADR-0037/0038).
- **`budgeted_units`** is the schema's **first `Decimal`** (`DECIMAL(18,4)`, an exact
  numeric per _Data types_ above), `DEFAULT 0`. `ck_resource_assignments_budgeted_units_nonneg`
  (`>= 0`, raw SQL) is the DB backstop behind the DTO `@Min(0)` boundary reject (N14,
  ADR-0035 §25) — a bypass can never persist a negative.
- **`units_per_hour`** (M7 rung 4, ADR-0040) is the driving assignment's planned **rate**
  (units of work per working hour) — the `Units/Time` term of the triad `Units = Duration ×
Units/Time`. An **exact numeric** (`DECIMAL(18,4)`) like `budgeted_units`, but **nullable
  with no default**: `NULL` means the triad is **inert** (`duration_minutes` stays as
  entered) — the **parity gate** (with no rate on any driving assignment the recalc is
  byte-identical; a `DEFAULT 0` is deliberately omitted so it never silently activates on
  existing rows). `ck_resource_assignments_units_per_hour_nonneg` (`units_per_hour IS NULL
OR >= 0`, raw SQL — nullable-safe) is the DB backstop behind the DTO `@Min(0)` reject
  (**N19**), mirroring the `budgeted_units`/N14 precedent. Only the **driving** assignment
  participates in the triad; a **zero** rate on a units-driven recompute is a **service**
  reject (**N20** — a CHECK cannot read the activity's `duration_type` to know the rate is a
  divisor). `resource.max_units_per_hour` (a levelling availability cap) and the assignment
  cost/earned-value columns stay **reserved** for their later rungs (ADR-0040).
- **Driver designation.** `is_driving` marks THE driving resource of a
  `RESOURCE_DEPENDENT` activity (its calendar governs scheduling, M7.2). The partial
  unique `uq_resource_assignments_activity_driving (activity_id) WHERE is_driving AND
deleted_at IS NULL` guarantees **≤ 1** driver per activity in the DB; **"exactly
  one on a resource-dependent activity"** and **"a `MATERIAL` may not drive"** are
  **service** invariants (a partial-unique/FK cannot read the activity `type` or the
  resource `kind`). Duplicate assignments are blocked by `uq_resource_assignments_activity_resource
(activity_id, resource_id) WHERE deleted_at IS NULL` (backs `DUPLICATE_ASSIGNMENT`
  409), whose leftmost prefix also serves the "load an activity's assignments" query.
- **Delete guards (service-owned).** A `RESOURCE_IN_USE` guard blocks soft-deleting a
  resource assigned to an **active** activity (409, mirroring `CALENDAR_IN_USE`), and
  the `CALENDAR_IN_USE` guard is **extended** to also count active resources
  referencing a calendar (a third referencer, alongside active plans + activities) —
  backed by `idx_resources_calendar_id`. Soft-deleting an activity **sweeps its
  active assignments** (same `delete_batch_id`, like the incident-edge cascade) — a
  `HierarchyLifecycleService` follow-on. FKs are `RESTRICT` throughout (defence in
  depth; these tables soft-delete only, so the referential check never fires).
- **Engine-owned flag.** `activities.resource_driver_missing` (added by this
  migration) is a produce-and-flag output exactly like `loe_no_span`/`constraint_violated`:
  defaulted false, never accepted from a write DTO, written only by the M7.2 recalc
  `UPDATE` (never touching `version`/`updated_at`, ADR-0022). It lands now so M7.2
  needs no wide `ALTER` of the large `activities` table.

### Earned Value: cost, %-complete-type & the cost baseline (EV1)

The `percent-complete-earned-value` rung (EV1, ADR-0042; amends ADR-0025) activates
the cost columns ADR-0039 **reserved** and adds the %-complete-type inputs — all
**additive, nullable/constant-default, and DARK** (Earned Value is a pure
**read-model** computed on a read endpoint in EV2; there is **no write pass and no
engine-owned EV column**, so the CPM parity gate is structurally trivial — nothing on
the recalc write path changes). An unset value leaves every existing recalc / progress
/ baseline path **byte-identical**. Money follows the `BIGINT` minor-units rule above.

- **`resources.cost_per_unit`** (`DECIMAL(18,4)?`, minor units per unit — a **rate
  coefficient** like `units_per_hour`, not a stored money amount) — the
  ADR-0039-reserved cost rate, now live: cost-per-unit (P6 "Price/Unit"), `NULL` = no
  cost (contributes 0). `ck_resources_cost_per_unit_nonneg` (nullable-safe, **N22**)
  mirrors `ck_resources_max_units_per_hour_nonneg` (N21).
- **`resource_assignments.budgeted_cost`** (`BIGINT?`, **override** — `NULL` derives
  `budgeted_units × cost_per_unit` at read time, Q1), **`actual_cost`** (`BIGINT NOT
NULL DEFAULT 0`, progress), **`actual_units`** (`DECIMAL(18,4) NOT NULL DEFAULT 0`,
  progress — the units-% numerator). `>= 0` CHECKs: `_budgeted_cost_nonneg`
  (nullable-safe, N22), `_actual_cost_nonneg` (N22), `_actual_units_nonneg` (N14
  precedent).
- **`activities.percent_complete_type`** (`PercentCompleteType` enum
  `DURATION`/`UNITS`/`PHYSICAL`, **DEFAULT `DURATION`** = behaviour-preserving; it
  selects the EV performance measure and **changes no CPM date**),
  **`physical_percent_complete`** (`SMALLINT?`, `NULL` = unset;
  `ck_activities_physical_percent_complete_range` 0–100 nullable-safe, **N23**), and
  **`budgeted_expense`/`actual_expense`** (`BIGINT?` lump-sum, `NULL` = none; `>= 0`
  CHECKs, N22). No index (plan-scoped EV load only — the `secondary_constraint_type`
  precedent).
- **`plans.eac_method`** (`EacMethod` enum `CPI`/`REMAINING_AT_BUDGET`/`CPI_TIMES_SPI`,
  **DEFAULT `CPI`** = P6's headline `EAC = BAC / CPI`, Q3) and **`currency_code`**
  (`CHAR(3)?` ISO-4217, `ck_plans_currency_code_iso4217` nullable-safe format guard;
  `NULL` = inherit the org default). Single-row plan options, unindexed.
- **`baseline_activities.budgeted_cost`** (`BIGINT?`) — the **cost baseline** (ADR-0025
  amendment): the activity's budgeted cost **frozen at capture**, immutable, giving the
  active baseline a committed PV/BCWS reference. `NULL` for a baseline captured before
  this rung ⇒ PV falls back to the live budget (`costBaselineMissing`), never an error.
  `ck_baseline_activities_budgeted_cost_nonneg` (nullable-safe, defence-in-depth).

**N24** (actual cost/units on a not-started activity) is a **warn, not a reject** — the
EV read surfaces it as a count — so it is deliberately **not** a CHECK. No new index is
added: every EV column is read within an already plan-scoped or org-scoped load and is
never a query predicate.

### Resource curves, cost accrual & weighted steps (M7 rung 5)

The `resource-curves-accrual-steps` rung (ADR-0044; ADR-0035 §31/§32/§33) closes the last
capability-matrix row with **two enum columns** and **one child table**, all **additive,
constant-default / new-table, and read-model only** — the pure CPM engine (`compute.ts`)
and the levelling pass (`level.ts`) are untouched, so each is byte-identical when its data
is absent. Landed as three independently shippable slices (cost accrual → weighted steps →
resource curves).

- **`activities.accrual_type`** (`AccrualType` enum `START`/`UNIFORM`/`END`, **DEFAULT
  `UNIFORM`** = today's linear phasing = byte-parity; F1-1, ADR-0044 §1). Client-settable;
  governs **when** the activity's expense lump-sum is recognised in the Earned-Value /
  cost read-model's PV & AC time-phasing (the cost / cash-flow S-curve) — it changes no CPM
  date and no engine column. **No index** — read only on the plan-scoped EV load, never a
  query predicate (the `percent_complete_type` precedent).
- **`resource_assignments.curve_type`** (`ResourceCurveType` enum
  `UNIFORM`/`BELL`/`FRONT_LOADED`/`BACK_LOADED`/`DOUBLE_PEAK`, **DEFAULT `UNIFORM`** = flat
  load = byte-identical histogram; F3-1, ADR-0044 §3). Client-settable; names the P6 profile
  the resource-histogram read-model distributes the assignment's `budgeted_units` by across
  the activity duration (span = duration − assignment lag), conserving units. It shapes the
  histogram only — moves no date and does **not** feed the levelling pass this rung (Q2). The
  21-point profile constants live in the read-model, not the DB. **No index** — read only on
  the plan-scoped histogram/EV assignment load, never a query predicate (the `is_driving`
  precedent — a low-cardinality enum read with the whole plan's assignments).
- **`activity_steps`** — a new **reference-template child table** (F2-1, ADR-0044 §2): a
  weighted checklist per activity feeding the `PHYSICAL` Earned-Value measure. When an
  activity has steps its physical %-complete rolls up as the weighted mean `Σ(wᵢ·pᵢ)/Σ(wᵢ)`
  and **wins** over the manual `physical_percent_complete`; with no steps the manual field
  behaves exactly as today (parity). It follows every house standard (UUID v7 PK, snake_case
  via `@map`, timestamptz UTC, soft delete + `delete_batch_id`, TEXT audit ids,
  optimistic-locking `version`, scoped indexes); `organization_id` is **denormalised** from
  the parent activity (service-copied, never client input — the `ResourceAssignment`
  pattern). Columns: `seq` (int ordering, service-assigned contiguous), `name` (TEXT, bounded
  at the DTO like every sibling name), `weight` (`DECIMAL(18,4)` — the exact-quantity
  precision mirroring `budgeted_units`; a relative quantity, not money, so Decimal not
  `BIGINT`), and `percent_complete` (`SMALLINT NOT NULL DEFAULT 0`).
  - **CHECKs** (raw SQL): `ck_activity_steps_weight_nonneg` (`weight >= 0`; all-zero weights
    are legal — they trigger the **N27** rollup fallback to the manual physical %, never a
    divide-by-zero, never a reject) and `ck_activity_steps_percent_complete_range` (`0–100`;
    the **N28** DB backstop behind the DTO 422 `STEP_PERCENT_OUT_OF_RANGE`, mirroring
    `ck_activities_physical_percent_complete_range` but **not** nullable-safe since the column
    is `NOT NULL`).
  - **Partial unique** `uq_activity_steps_activity_seq (activity_id, seq) WHERE deleted_at IS
NULL` (raw SQL) — one active step per `(activity, seq)`; a soft-deleted step frees its
    `seq` for reuse. Its leftmost prefix `activity_id` (pre-sorted by `seq`) **subsumes** a
    standalone active-step list index (the `uq_resource_assignments_activity_resource`
    precedent), so no separate `activity_id` index is added; the FK RESTRICT check never
    fires because steps soft-delete only.
  - **Soft-delete cascade is service-owned** (no DB cascade; FK `ON DELETE RESTRICT`):
    soft-deleting an activity **should** sweep its active steps under the **same**
    `delete_batch_id` — the identical mechanism `HierarchyLifecycleService` already applies
    to a soft-deleted activity's incident dependency edges and resource assignments
    (ADR-0039 (d)). This is a lifecycle-service follow-on for the **F2 build**, not a schema
    change.

The two enums `AccrualType` and `ResourceCurveType` are Postgres enums (Prisma-managed), each
kept in lock-step with its `@repo/types` union by the build features.

## Testing & performance

- Integration tests run against a **real Postgres** (see [`TESTING.md`](TESTING.md)).
- Profile with `EXPLAIN ANALYZE`; watch for N+1 (Prisma `include`/`select`),
  missing indexes, and unbounded queries. **Paginate everything.** See
  [`PERFORMANCE.md`](PERFORMANCE.md).
