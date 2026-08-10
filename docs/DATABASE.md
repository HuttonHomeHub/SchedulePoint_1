# Database Standards

> Standards and philosophy for the SchedulePoint data layer: **PostgreSQL 17 +
> Prisma**. The schema in
> [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) — 28
> models across 48 committed migrations (counted 2026-08-09, `grep -c '^model '` /
> `ls migrations`, not memory) — is the single source of truth for the data model.
> See ADR-0008.

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

- **Tables:** plural `snake_case` (`resource_assignments`, `org_members`).
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

**Archive (`archived_at`) is _not_ soft delete** (ADR-0053 §4). Where a library row
must be **retired without breaking its references**, add a nullable
`archived_at timestamptz` alongside `deleted_at` — they are orthogonal, and every
combination of the two is legal (an archived row may later be deleted):

| Column        | Meaning                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `deleted_at`  | the row is **gone**; nothing active may reference it (the `*_IN_USE` guards keep that true) and it is excluded by default   |
| `archived_at` | the row is **retired but valid**; existing references stay live and behave identically, and only **new** usages are refused |

Rules for an archive column: it is **server-set** (a `POST …/archive` / `…/unarchive`
action, never a writable PATCH field); list endpoints take a **tri-state** filter
(`exclude` (default) / `include` / `only`); and — the non-obvious one — **an archived
row keeps its name**. Partial uniques stay predicated on `deleted_at IS NULL` only,
because unarchive is an unguarded, version-gated metadata write that must never be able
to fail on a name taken meanwhile. The accepted cost is that creating an **active** row
on an archived row's name is a 409 (the service should name the archived row in
`details` so the UI can offer "unarchive instead"). Soft delete may free its name
precisely because **restore** is already a guarded, conflict-capable operation.

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
  `activities.budgeted_expense`/`actual_expense`,
  `baseline_activities.budgeted_cost`/`budgeted_expense` and
  `baseline_assignments.budgeted_cost` (ADR-0071 M3) are all **`BIGINT` minor units** (e.g.
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

| Index                                         | On                                     | Kind           | Serves                                                                                                                                                                                                                         |
| --------------------------------------------- | -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clients_organization_id_created_at_id_idx`   | `(organization_id, created_at, id)`    | full composite | `organization_id` FK (leftmost prefix) + org-scoped active list + its `(created_at, id)` cursor sort — subsumes a standalone org index                                                                                         |
| `projects_client_id_created_at_id_idx`        | `(client_id, created_at, id)`          | full composite | `client_id` FK + list-projects-under-a-client + cursor sort — subsumes a standalone client index                                                                                                                               |
| `projects_organization_id_idx`                | `(organization_id)`                    | full           | `organization_id` FK (RESTRICT) + org-scoped IDOR loads (no org-wide ordered list exists, so no composite)                                                                                                                     |
| `plans_project_id_created_at_id_idx`          | `(project_id, created_at, id)`         | full composite | `project_id` FK + list-plans-under-a-project + cursor sort — subsumes a standalone project index                                                                                                                               |
| `plans_organization_id_idx`                   | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                                   |
| `uq_clients_org_name`                         | `(organization_id, name)`              | partial unique | name unique per org among live rows (`WHERE deleted_at IS NULL`); backs `NAME_TAKEN` (409) + name lookups                                                                                                                      |
| `uq_projects_client_name`                     | `(client_id, name)`                    | partial unique | name unique per client among live rows                                                                                                                                                                                         |
| `uq_plans_project_name`                       | `(project_id, name)`                   | partial unique | name unique per project among live rows                                                                                                                                                                                        |
| `activities_plan_id_created_at_id_idx`        | `(plan_id, created_at, id)`            | full composite | `plan_id` FK + list-activities-under-a-plan + cursor sort — subsumes a standalone plan index                                                                                                                                   |
| `activities_organization_id_idx`              | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                                   |
| `uq_activities_plan_name`                     | `(plan_id, name)`                      | partial unique | name unique per plan among live rows                                                                                                                                                                                           |
| `uq_activities_plan_code`                     | `(plan_id, code)`                      | partial unique | optional `code` unique per plan among live rows (`WHERE deleted_at IS NULL AND code IS NOT NULL`); NULL codes are exempt                                                                                                       |
| `idx_clients_delete_batch_id`                 | `(delete_batch_id)`                    | partial        | batch restore lookup (`WHERE delete_batch_id IS NOT NULL`); tiny — only soft-deleted rows carry a value                                                                                                                        |
| `idx_projects_delete_batch_id`                | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `idx_plans_delete_batch_id`                   | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `idx_plans_calendar_id`                       | `(calendar_id)`                        | partial        | the delete-in-use guard's active-plan count `WHERE calendar_id = ? AND deleted_at IS NULL` (`WHERE deleted_at IS NULL AND calendar_id IS NOT NULL`); calendars are soft-deleted only, so the FK RESTRICT check never fires     |
| `idx_activities_calendar_id`                  | `(calendar_id)`                        | partial        | the delete-in-use guard's active-**activity** count `WHERE calendar_id = ? AND deleted_at IS NULL` (`WHERE deleted_at IS NULL AND calendar_id IS NOT NULL`); the activity twin of `idx_plans_calendar_id` (M5, ADR-0037)       |
| `idx_activities_delete_batch_id`              | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `dependencies_plan_id_created_at_id_idx`      | `(plan_id, created_at, id)`            | full composite | `plan_id` FK + plan-level dependency list + cursor sort — subsumes a standalone plan index                                                                                                                                     |
| `dependencies_predecessor_id_idx`             | `(predecessor_id)`                     | full           | `predecessor_id` FK + "successors of X" list (edges out of X) + the cycle-walk adjacency load                                                                                                                                  |
| `dependencies_successor_id_idx`               | `(successor_id)`                       | full           | `successor_id` FK + "predecessors of X" list (edges into X)                                                                                                                                                                    |
| `dependencies_organization_id_idx`            | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                                   |
| `uq_dependencies_pred_succ_type`              | `(predecessor_id, successor_id, type)` | partial unique | at most one **active** link of each type per ordered pair (`WHERE deleted_at IS NULL`); backs `DUPLICATE_DEPENDENCY` (409); allows the SS+FF overlap ladder                                                                    |
| `idx_dependencies_delete_batch_id`            | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `calendars_organization_id_created_at_id_idx` | `(organization_id, created_at, id)`    | full composite | `organization_id` FK + org-scoped active calendar list + cursor sort — subsumes a standalone org index                                                                                                                         |
| `uq_calendars_org_name`                       | `(organization_id, name)`              | partial unique | ORG-tier calendar name unique per org among live rows (`WHERE deleted_at IS NULL AND scope = 'ORG'`, ADR-0053); backs `DUPLICATE_CALENDAR` (409)                                                                               |
| `uq_calendars_project_name`                   | `(project_id, name)`                   | partial unique | PROJECT-tier calendar name unique per project among live rows (`WHERE deleted_at IS NULL AND scope = 'PROJECT'`, ADR-0053); a name may be reused across tiers by design                                                        |
| `idx_calendars_project_id`                    | `(project_id)`                         | partial        | the project-delete cascade sweep (`WHERE project_id = ? AND deleted_at IS NULL`) + the `project_id` FK; predicated on `project_id IS NOT NULL` (not `scope`) so the planner can prove implication from a `project_id` equality |
| `calendar_exceptions_calendar_id_date_idx`    | `(calendar_id, date)`                  | full composite | `calendar_id` FK + the editor's list-all-exceptions load (all rows) ordered by date                                                                                                                                            |
| `calendar_exceptions_organization_id_idx`     | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                                   |
| `uq_calendar_exceptions_cal_date`             | `(calendar_id, date)`                  | partial unique | at most one **active** exception per `(calendar, date)` (`WHERE deleted_at IS NULL`); backs `DUPLICATE_EXCEPTION` (409) **and** the engine's active-exception load                                                             |
| `idx_calendars_delete_batch_id`               | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `idx_calendar_exceptions_delete_batch_id`     | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `resources_organization_id_created_at_id_idx` | `(organization_id, created_at, id)`    | full composite | `organization_id` FK + org-scoped active resource list + cursor sort — subsumes a standalone org index (the `Calendar` pattern)                                                                                                |
| `uq_resources_org_name`                       | `(organization_id, name)`              | partial unique | resource name unique per org among live rows (`WHERE deleted_at IS NULL`); backs `DUPLICATE_RESOURCE` (409)                                                                                                                    |
| `uq_resources_org_code`                       | `(organization_id, code)`              | partial unique | optional `code` unique per org among live rows (`WHERE deleted_at IS NULL AND code IS NOT NULL`); NULL codes are exempt (the `uq_activities_plan_code` pattern)                                                                |
| `idx_resources_calendar_id`                   | `(calendar_id)`                        | partial        | the (extended) `CALENDAR_IN_USE` guard's active-resource count + the M7.2 driving-calendar load (`WHERE calendar_id = ? AND deleted_at IS NULL`); the `idx_activities_calendar_id` twin                                        |
| `idx_resources_delete_batch_id`               | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `resource_assignments_organization_id_idx`    | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                                   |
| `uq_resource_assignments_activity_resource`   | `(activity_id, resource_id)`           | partial unique | one **active** assignment per (activity, resource) (`WHERE deleted_at IS NULL`); backs `DUPLICATE_ASSIGNMENT` (409); its leftmost prefix `activity_id` subsumes an active-activity assignment-list index                       |
| `uq_resource_assignments_activity_driving`    | `(activity_id)`                        | partial unique | at most one **driving** assignment per activity (`WHERE is_driving AND deleted_at IS NULL`); the ≤1-driver backstop + the recalc "find the driving assignment" load                                                            |
| `idx_resource_assignments_resource_id`        | `(resource_id)`                        | partial        | the `RESOURCE_IN_USE` guard's active-assignment count (`WHERE resource_id = ? AND deleted_at IS NULL`)                                                                                                                         |
| `idx_resource_assignments_delete_batch_id`    | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `activity_steps_organization_id_idx`          | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                                   |
| `uq_activity_steps_activity_seq`              | `(activity_id, seq)`                   | partial unique | one **active** step per `(activity, seq)` (`WHERE deleted_at IS NULL`); backs the bulk-replace dup-seq (409); its leftmost prefix `activity_id` (pre-sorted by `seq`) subsumes an active-step list index                       |
| `idx_activity_steps_delete_batch_id`          | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `notes_plan_id_created_at_id_idx`             | `(plan_id, created_at, id)`            | full composite | `plan_id` FK + the PLAN-notes thread list & newest-first cursor (filter `entity_type='PLAN'`, backward scan) + the plan cascade sweep by `plan_id` — subsumes a standalone `plan_id` index (ADR-0046)                          |
| `notes_organization_id_idx`                   | `(organization_id)`                    | full           | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                                   |
| `idx_notes_activity_created`                  | `(activity_id, created_at, id)`        | partial        | the ACTIVITY-notes thread list & newest-first cursor (`WHERE deleted_at IS NULL AND activity_id IS NOT NULL` — excludes PLAN notes + soft-deleted)                                                                             |
| `idx_notes_plan_activity_counts`              | `(plan_id, activity_id)`               | partial        | the badge note-counts `GROUP BY activity_id` for a plan (`WHERE deleted_at IS NULL AND entity_type='ACTIVITY'`; a grouped scan, no N+1)                                                                                        |
| `idx_notes_delete_batch_id`                   | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |
| `plan_shares_token_hash_key`                  | `(token_hash)`                         | full unique    | the guest bearer-token lookup; unique across ALL rows (incl. revoked/soft-deleted) so a hash resolves to at most one grant and is never reused (the `invitations.token_hash` precedent, ADR-0051)                              |
| `plan_shares_organization_id_idx`             | `(organization_id)`                    | full           | `organization_id` FK (RESTRICT) + org-scoped IDOR / audit loads                                                                                                                                                                |
| `idx_plan_shares_plan_id`                     | `(plan_id)`                            | partial        | list a plan's LIVE links + the plan-cascade filter (`WHERE deleted_at IS NULL`); partial (not a full composite backing the FK) because plans soft-delete only, so the plan FK RESTRICT check never fires                       |
| `idx_plan_shares_delete_batch_id`             | `(delete_batch_id)`                    | partial        | batch restore lookup                                                                                                                                                                                                           |

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
  `constraint_violated`, `external_driven`): nullable/defaulted, **never accepted
  from a write DTO**.
  They are populated by the CPM engine; until a plan is recalculated they read as
  null/false ("—" in the UI). `constraint_violated` (M4, ADR-0035 §7) is a
  defaulted (`false`) **NOT NULL** boolean — true when a mandatory pin
  (`MANDATORY_START`/`MANDATORY_FINISH`) drove the activity earlier than logic
  allowed (produce-and-flag; the schedule is produced as pinned, never repaired).
  `external_driven` (ADR-0043 M1 / ADR-0035 §30.3) is its direct analogue — a
  defaulted (`false`) **NOT NULL** boolean, true when an imported inter-project
  bound (`external_early_start`/`external_late_finish`) drove the activity's
  computed dates (produce-and-flag; external bounds are soft, so it never overlaps
  `constraint_violated`). It is the per-activity companion to the plan-level
  `externalDrivenCount` (a read-time `COUNT` over the same plan scope), letting the
  web show a per-row "External" badge beside the `constraint_violated` "Conflict"
  badge. Storing these avoids a wide migration when features that read them land.
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
- **Scope tier (ADR-0053).** A calendar belongs to one of two **tiers**: `scope = 'ORG'` (the
  shared organisation library — the only tier before ADR-0053 and the constant `DEFAULT`, so every
  pre-existing row is unchanged) or `scope = 'PROJECT'` with a non-null `project_id` (local to one
  project). The discriminator and the FK are pinned together by the **fail-closed**
  `ck_calendars_scope_parent` (`CASE scope WHEN 'ORG' THEN project_id IS NULL WHEN 'PROJECT' THEN
project_id IS NOT NULL ELSE false END`) — the ADR-0046 `ck_notes_exactly_one_parent` precedent, so a
  future third tier is rejected until the CHECK and the per-tier uniques are amended. Because it is a
  ROW constraint evaluated at statement end, a promote/narrow must set **both** columns in a single
  `UPDATE`. The `project_id` FK is `RESTRICT` and, like `activities.calendar_id`/`activities.parent_id`,
  does **not** enforce same-org — "the project is active and in this org" is a service check inside the
  write transaction. Binding a `calendar_id` anywhere goes through the one shared
  `assertCalendarUsableBy` guard; a project delete sweeps its project calendars (and their exceptions)
  into the project's own `delete_batch_id`, and never touches an ORG calendar (`project_id` is NULL).
- **Uniqueness & non-overlap.** Calendar names are unique **per tier** among live rows:
  `uq_calendars_org_name` (`WHERE deleted_at IS NULL AND scope = 'ORG'`) and
  `uq_calendars_project_name` (`WHERE deleted_at IS NULL AND scope = 'PROJECT'`), both backing
  `DUPLICATE_CALENDAR` (409) with a tier-specific message. A name may be reused **across** tiers by
  design (a project-local "Standard" beside the organisation's) — global uniqueness would let an
  org-level rename break unrelated projects and would forbid the common P6 project-local override. The
  old point-key `uq_calendar_exceptions_cal_date` is **replaced** by
  `ex_calendar_exceptions_no_overlap` — a **partial GiST `EXCLUDE`** (`WHERE deleted_at IS NULL`)
  over `daterange(start_date, end_date, '[]')` guaranteeing **at most one active exception
  covers any given day** (a day cannot be both a holiday and a worked window). It backs the add
  `DUPLICATE_EXCEPTION` (409); because `23P01` (exclusion_violation) is not a Prisma `P2002`, the
  service matches it by constraint name to map it to the 409.
- **Archive (ADR-0053 §4).** `calendars.archived_at` (nullable, no default; `NULL` = active)
  retires a calendar **without** unbinding it: an archived calendar stays bound to its plans,
  activities and resources and schedules identically — it is hidden from the pickers and the
  default library list, and refused only for a **new** binding at the `assertCalendarUsableBy`
  seam. It is therefore the only way to retire a calendar the `CALENDAR_IN_USE` guard —
  correctly — refuses to delete. It does **not** free the calendar's name (the per-tier uniques
  stay predicated on `deleted_at IS NULL` + the tier), it is still **counted by the
  scope-narrowing guard** (an archived referencer is a live one), and it is still **swept by the
  project-delete cascade** — which is why `idx_calendars_project_id` deliberately does _not_ gain
  an `archived_at IS NULL` term. See _Soft deletes → Archive is not soft delete_ above.
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

#### The cost snapshot's two levels — and why "no rows" is never the signal

ADR-0042 (EV1) amended ADR-0025 so a baseline freezes a **cost** as well as a schedule:
`baseline_activities.budgeted_cost`, one committed total per activity. **ADR-0071 M3
(CQ-1 option B)** amends it a second time, because Planned Value stopped being one cost over
one window: an assignment's cost is now phased over `[start ⊕ lag, finish)` while the
activity's own expense keeps `[start, finish)`, so the committed PV curve needs the frozen
cost **decomposed per component**. Three additions, all additive and all dark until the M3
service slice reads them:

| Addition                               | Shape                                                       | Meaning                                                                                 |
| -------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `baselines.cost_snapshot_level`        | `BaselineCostSnapshotLevel`, NOT NULL, `DEFAULT 'ACTIVITY'` | **the discriminator** — `ACTIVITY` = a total only; `ASSIGNMENT` = total + decomposition |
| `baseline_activities.budgeted_expense` | `BIGINT` nullable, no default                               | the activity-expense component, frozen; `NULL` = not decomposed                         |
| `baseline_assignments`                 | new table, one row per assignment                           | that assignment's frozen `budgeted_cost` **and** its frozen `lag_minutes`               |

**The back-fill is impossible, not skipped.** A baseline captured before this froze one number
per activity, and that number cannot be decomposed after the fact — the assignments it was made
of may since have been re-costed, re-lagged, added or unassigned, and their resources'
`cost_per_unit` may have moved. Any back-fill would compute a breakdown out of **today's** rows
and stamp it as history, which is precisely what ADR-0025's copy-not-reference rule exists to
prevent. Pre-ADR-0071 baselines therefore keep the **live-budget-shares approximation
permanently**, and the Earned-Value read carries both paths for good.

Which is why the discriminator exists, and why it is the load-bearing part of the design: a
baseline with **zero** `baseline_assignments` rows is either **(a)** captured before this
existed — undecomposable, so PV must fall back to live shares — or **(b)** captured from a plan
whose activities genuinely carry no resource assignments, in which case the snapshot is
**complete** and PV is exact with no assignment component at all. Those are opposite
instructions, and `count(*) = 0` cannot tell them apart. `cost_snapshot_level` can, and it is
the **only** thing that can. Never infer the level from a row count, and never from
`budgeted_expense IS NULL` — those are corroborating facts, not the decision. The constant
`DEFAULT 'ACTIVITY'` is true of every row that already exists **and** is the safe direction: a
write path not yet taught the new pass reads as approximate, never as exact-but-empty.

The pairing between the discriminator and the child rows **cannot be a CHECK** — they are in
different tables, and a CHECK sees one row of one table. It is a service invariant held inside
the single capture transaction (the "exactly one driving assignment" precedent); fail-closedness
lives at the TypeScript boundary, where the level is read with an exhaustive switch so a future
third level is a compile error rather than a silently mis-scaled PV curve.

`baseline_assignments` is a **sibling of `baseline_activities` in every respect**: `source_*` ids
are plain correlation UUIDs with **no** foreign key (so the snapshot survives the live assignment
being re-costed, unassigned or hard-purged), rows are immutable after capture, the full
housekeeping set applies, and the whole set soft-deletes with its parent baseline under one
`delete_batch_id`. Both the **cost and the lag** are frozen — a snapshot carrying frozen money
but reading the **live** lag would time-phase it through a window somebody edited afterwards.
`budgeted_units`, `units_per_hour`, `curve_type` and the activity's `accrual_type` are
deliberately **not** frozen: PV weights cost and phases it by the activity-level accrual
(ADR-0044 §32, unchanged), and the histogram and levelling read live rows by design — a snapshot
column nothing reads is a claim nobody checks. `budgeted_cost`/`lag_minutes` are **NOT NULL with
no default**, unlike their live counterparts: there are no pre-existing rows to default for, and
a default would let a capture record a number it never stated. A **JSONB column** on
`baseline_activities` was rejected on the house rules, not on taste — money is `BIGINT` minor
units precisely so nothing rounds it and a JSON number is a double in most drivers; the database
could enforce neither `cost >= 0` nor the lag range; and it would be the schema's first `json`
column, an ADR-level precedent rather than a convenience.

**Indexes on `baseline_assignments` — measured, per the ADR-0053 M4 rule that an index is added
on a measurement and not an instinct.** One partial unique does three jobs:

| Index                                                | On                                    | Kind           | Serves                                                                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `uq_baseline_assignments_baseline_source_assignment` | `(baseline_id, source_assignment_id)` | partial unique | the **freeze-once** invariant (`WHERE deleted_at IS NULL`) **and**, via its leftmost prefix, the whole Earned-Value read (`WHERE baseline_id = ? AND deleted_at IS NULL`) **and** the `baseline_id` FK |
| `baseline_assignments_organization_id_idx`           | `(organization_id)`                   | full           | `organization_id` FK (RESTRICT) + org-scoped IDOR loads                                                                                                                                                |
| `idx_baseline_assignments_delete_batch_id`           | `(delete_batch_id)`                   | partial        | batch restore lookup                                                                                                                                                                                   |

Measured on PostgreSQL 16.13 at 200 baselines × 1,000 components (200,000 rows, 54 MB, ANALYZEd,
best of 5 after warm-up), reading one baseline's whole component set: **1.181 ms** on the partial
unique (bitmap index scan; 10 index buffers + 1,000 heap blocks) vs **12.538 ms** with index scans
disabled (parallel seq scan, 199,000 rows removed by filter) — ~10.6×, and the sequential cost
grows with every baseline the tenant ever captured while the index scan's does not. A
`(baseline_id, source_activity_id)` composite mirroring `baseline_activities`' was measured and
**rejected**: the read loads the whole baseline and groups in memory, so the second column is never
a predicate — it bought 0.007 ms (1.188 ms), inside the run-to-run spread, for 9,736 kB and a third
index on every bulk capture insert. The unique is partial (not full) because baselines soft-delete
only, so the FK `RESTRICT` check never fires — the `idx_plan_shares_plan_id` precedent. No index on
`cost_snapshot_level` (read with its own row by id, never a predicate — the `scheduling_mode`
precedent) or on `budgeted_expense` (part of a snapshot loaded whole).

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
- **`lag_minutes`** (surface audit **F6**, ADR-0071 §1 / ADR-0035 §34) is the delay between the
  activity starting and **this** resource joining it — working **minutes**, `INTEGER NOT NULL
DEFAULT 0`. The constant default is the parity bar: metadata-only `ADD COLUMN` (no rewrite, no
  backfill — which is what makes the migration safe on the **self-migrating** image, ADR-0018)
  and every existing row keeps today's behaviour. It closes an **inverted** register finding:
  `engine/resource-histogram.ts` has taken a per-assignment `lagMinutes` since ADR-0044 rung 5
  and nothing could store one, so the caller hardcoded `0` — the ENGINE supporting what no
  storage could hold, where F2/F3 are storage supporting what no write path can produce.
  - **Unsigned**, deliberately unlike `dependencies.lag_minutes`, which is **signed** because a
    negative lag on a logic edge is a **lead** and means something. A resource cannot join before
    the work starts. Worse than meaningless: the read-model applies the lag only when `> 0`, so a
    negative would be **silently discarded** and the assignment would behave as unlagged while the
    API had said yes — a signed column would be a **trap dressed as symmetry**. That `> 0` guard
    is a **parity fast path, not a validation**.
  - **`ck_resource_assignments_lag_minutes_range`** (`BETWEEN 0 AND 5256000`, raw SQL) is the DB
    **backstop, never the primary reject** — the primary reject is the DTO's `@Min(0)
@Max(ASSIGNMENT_LAG_MINUTES_MAX)` (**N34**), which is what returns an actionable 422; a
    constraint violation would surface as a 500 and mean something bypassed the boundary. The
    `budgeted_units`/N14 and `units_per_hour`/N19 posture exactly. The ceiling (≈ 10 years) is the
    **same magnitude** as `ck_dependencies_lag_minutes_range` and
    `ck_plans_critical_float_threshold_minutes_range`, so the schema gives **one** answer to "how
    large may a working-minute quantity be". It does **not** make the calendar walk safe —
    5 256 000 _working_ minutes on a window-only calendar can still exceed the engine's ~200-year
    horizon, which is ADR-0071 §4's typed error and 422, not this constraint's job.
  - Measured on the **activity's own calendar** (ADR-0037) — what the read-model already uses. The
    lag eats **into** the activity: its dates do not move, the resource joins late and works a
    shorter window (`effFinish = a.finish`; product-owner decision 2026-08-02, CQ-3). **No
    `lag_calendar` sibling**, unlike `dependencies`: an edge sits between two activities on
    potentially different calendars and needs the ADR-0036 §6 seam; an assignment has exactly
    **one** natural frame. A sibling enum would create a resolution seam with **three** consumers
    (histogram, levelling, earned value) to keep in step, for a choice no fixture case asks for —
    additive if ever wanted.
  - **No index**, recorded rather than left as silence: read only as part of the plan-scoped
    assignment loads the histogram, levelling and EV already run — never a `WHERE`, `ORDER BY` or
    join predicate, so an index would be pure write cost (the `curve_type`/`is_driving`
    precedent). Nothing was measured because the change introduces **no new predicate to measure**
    — the ADR-0053 M4 rule that an index is added on a measurement, not an instinct. A partial
    `(organization_id) WHERE lag_minutes > 0` is the documented measure-first upgrade.
- **Driver designation.** `is_driving` marks THE driving resource of a
  `RESOURCE_DEPENDENT` activity (its calendar governs scheduling, M7.2). The partial
  unique `uq_resource_assignments_activity_driving (activity_id) WHERE is_driving AND
deleted_at IS NULL` guarantees **≤ 1** driver per activity in the DB; **"exactly
  one on a resource-dependent activity"** and **"a `MATERIAL` may not drive"** are
  **service** invariants (a partial-unique/FK cannot read the activity `type` or the
  resource `kind`). Duplicate assignments are blocked by `uq_resource_assignments_activity_resource
(activity_id, resource_id) WHERE deleted_at IS NULL` (backs `DUPLICATE_ASSIGNMENT`
  409), whose leftmost prefix also serves the "load an activity's assignments" query.
- **The resource tree (`parent_id` + `GROUP`, ADR-0053 §3).** `resources.parent_id` is a
  nullable **self-FK** (RESTRICT, Prisma relation `ResourceHierarchy`) — an adjacency list,
  the `activities.parent_id` precedent (ADR-0038). `NULL` = top level. The pool stays **one
  org-global pool**; this is a **navigation** tree, not a scoping tier, which is why
  cross-plan over-allocation and levelling are untouched. A new `ResourceKind` member
  **`GROUP`** is a non-assignable grouping node: `ck_resources_group_no_scheduling_fields`
  (a **same-row**, **fail-closed** `CASE … ELSE false`) forbids it a `calendar_id`,
  `max_units_per_hour` or `cost_per_unit`, and the service forbids it as an assignment
  endpoint (`GROUP_NOT_ASSIGNABLE`). Together those make the CPM/levelling/histogram/EV
  parity argument **structural** — all four read from `resource_assignments`.
  `ck_resources_parent_not_self` blocks the trivial 1-node cycle; **transitive acyclicity,
  same-org, "only a GROUP may parent" and depth ≤ 10** need the _parent_ row and so are
  **service** invariants, held under a new **org-scoped** `resource-tree` advisory lock
  (a per-resource lock cannot serialise two mirror reparents — they take different keys).
  Backed by the partial `idx_resources_parent_id (parent_id) WHERE deleted_at IS NULL AND
parent_id IS NOT NULL`; top-level rows are served by the existing
  `(organization_id, created_at, id)` composite and get no index of their own.
  **Name uniqueness stays org-wide and shared with leaf resources** (`uq_resources_org_name`)
  — deliberately unlike the per-tier calendar split, because a resource must have one
  globally unambiguous handle for levelling and the histogram. Because the CHECK names the
  `'GROUP'` literal, the enum member and everything referencing it are **two migrations**
  (`20260725130000_resource_group_kind`, `20260725130100_resource_hierarchy`): Postgres
  forbids using a label in the transaction that added it. Adding a future `ResourceKind`
  costs the same split, plus a new `WHEN` branch — an e2e round-trip over every enum value
  makes the omission a CI failure.
- **Archive (ADR-0053 §4).** `resources.archived_at` (nullable, no default; `NULL` = active) is
  the resource twin of `calendars.archived_at`, and is the case that shows why archive **cannot**
  be soft delete: a soft-deleted resource may not be referenced by an active assignment (exactly
  what `RESOURCE_IN_USE` protects), whereas an archived one **keeps every existing assignment** —
  still scheduling, levelling, loading the histogram and earning value byte-identically, even as
  the **driving** resource of a live activity. Only a **new** assignment is refused (422
  `RESOURCE_ARCHIVED`, a service check — a CHECK cannot read the assignment's resource row);
  editing an existing one still succeeds, and archiving is deliberately **not** blocked by use.
  Legal on a `GROUP`, with **no** subtree cascade (archive never cascades). Deleting an archived
  resource obeys the normal `RESOURCE_IN_USE` rules. `uq_resources_org_name`/`_code` keep their
  `deleted_at IS NULL` predicate (an archived row holds its name/code), and
  `idx_resources_parent_id` keeps its — the `GROUP` subtree cascade, the subtree in-use count and
  the reparent height walk must all traverse archived nodes.
- **Delete guards (service-owned).** A `RESOURCE_IN_USE` guard blocks soft-deleting a
  resource assigned to an **active** activity (409, mirroring `CALENDAR_IN_USE`) — for a
  `GROUP` the count spans its **whole active subtree**, and the delete then stamps that
  subtree with **one** `delete_batch_id` (the ADR-0038 subtree-cascade precedent), making
  the branch a single restore unit. A `GROUP` delete takes the tree lock as well, in the
  fixed order **org tree lock → per-resource assign locks ascending by id**, so a
  concurrent reparent cannot leave an active child under a deleted parent. And
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

### Note: polymorphic threaded annotations (ADR-0046)

The `notes` table (Notes M1, ADR-0046) is threaded, attributed, time-ordered commentary on a
plan or activity — a **single polymorphic table**, not per-entity tables, so client/project
notes drop in later with no rework. It follows every house standard (UUID v7 PK, snake_case via
`@map`, timestamptz UTC, TEXT audit ids, optimistic-locking `version`, soft delete +
`delete_batch_id`, scoped indexes) and is **non-scheduling** — the CPM engine never reads it and
note writes are not pen-gated (ADR-0028), so the migration is byte-parity (a catalog-only enum +
table create).

- **Polymorphism.** An `entity_type` discriminator (`NoteEntityType`: `PLAN`/`ACTIVITY`;
  `CLIENT`/`PROJECT` reserved) + **nullable typed parent FKs** (`plan_id`, `activity_id`; both
  `RESTRICT`). `client_id`/`project_id` arrive later as `ALTER TYPE … ADD VALUE` + nullable
  columns + a one-branch CHECK amendment — the locked "no rework" goal.
- **Exactly-one-parent CHECK** (`ck_notes_exactly_one_parent`, raw SQL — Prisma cannot express a
  CHECK). A `CASE entity_type … ELSE false`: `PLAN` ⇒ `plan_id` set, `activity_id` NULL;
  `ACTIVITY` ⇒ `activity_id` set, `plan_id` set. **`ELSE false` = fail-closed** — a future enum
  value inserted before its branch is added is rejected, never silently unenforced. A second
  CHECK `ck_notes_body_length` bounds the plain-text body to 1–5000 chars (spec Q1), the DB
  backstop behind the DTO 422 (the service trims-then-validates; the CHECK guards length only).
- **Two denormalised scope columns**, both service-copied from the resolved parent inside the
  create transaction (never client input — the `Activity`/`ActivityDependency` invariant):
  `organization_id` (the tenant scope tag) and **`plan_id` on _every_ note**. A PLAN note's
  parent **is** `plan_id`; an ACTIVITY note carries its **activity's** `plan_id` (the `Activity`
  precedent: `plan_id` is an activity's parent **and** scope), so the plan cascade is one
  join-free `updateMany WHERE plan_id IN (…)` catching both note kinds with **no double-count**.
  `plan_id` is `NOT NULL` for both v1 types and goes nullable (a safe expand-only ALTER) only
  when a parent-less client/project note lands.
- **Cascade & restore** reuse `HierarchyLifecycleService` (Task 1.4): a plan/project/client
  delete sweeps notes by `plan_id`; a single-activity (or WBS-subtree) delete sweeps that
  activity's notes by `activity_id`; both stamp the shared `delete_batch_id`. `CascadeCounts`
  gains a `notes` count. Restore is a plain `updateMany where deleteBatchId` with **no endpoint
  guard** — a note has exactly one parent and is always swept in its parent's batch, so restoring
  the batch reactivates it with its parent (and the parent's own `assertParentActive` top-down
  guard forbids resurrecting under a still-deleted ancestor) — the `activity_steps` precedent,
  unlike a dependency's endpoint-guarded restore. An individually-deleted note (M2
  `NotesService.remove`, its own fresh batch) never resurrects with a parent's batch.
- **Service-layer obligations the DB can't enforce (M2):** author-ownership on edit/delete
  (`created_by === principal.userId` else 403), `updated_by` on edit, the optimistic-`version`
  409, and that the denormalised `organization_id`/`plan_id` equal the parent's (the CHECK
  enforces shape, not value equality — a unit-tested service invariant, like every
  denormalised-scope sibling).

### PlanShare: External-Guest per-plan share links (ADR-0051)

The `plan_shares` table (Stage F, ADR-0051) is the grant behind the fifth product role
(PROJECT_BRIEF §5): a **revocable, optionally-expiring, READ-ONLY** link that lets
someone **outside** the organisation (a client rep, a subcontractor) view **exactly one
plan** — with **no Better Auth account and no org membership**. It is a bearer-token
grant dereferenced by a **session-less** token (the `ShareTokenGuard`, F-M1 Task 3,
resolves it to a `GuestPrincipal`, never a member `Principal`). It follows every house
standard (UUID v7 PK, snake_case via `@map`, timestamptz UTC, TEXT audit ids,
optimistic-locking `version`, soft delete + `delete_batch_id`, scoped indexes) and is
**non-scheduling** — the CPM engine never reads it and a guest never writes or holds the
pen (ADR-0028), so the migration is byte-parity (a single additive table create).

- **Denormalised `organization_id`**, service-copied from the plan inside the create
  transaction (**never** client input — the `PlanLock`/`Note` invariant
  `share.organization_id == plan.organization_id`), purely as the tenant scope tag for
  scoped audit reads. `RESTRICT` FK like every sibling (inert — plan → org `RESTRICT`
  fires first).
- **`token_hash`** stores the **SHA-256 hex** of the raw bearer token — the raw value is
  returned **once** on create and **never stored** (the `invitations.token_hash`
  precedent), so a database leak never yields a usable link. **`UNIQUE` across all rows**
  (including revoked / soft-deleted), full not partial, so a hash resolves to at most one
  grant and is never reused.
- **Participates in the plan soft-delete cascade.** Unlike the ephemeral `PlanLock` (whose
  plan FK is `CASCADE`), a link is a **preserved domain record**, so its plan FK is
  `ON DELETE RESTRICT` and it carries a **`delete_batch_id`**. The plan cascade
  (`HierarchyLifecycleService`, **F-M1 Task 4**, not yet wired) stamps a plan's live links
  with the plan's batch id via a plain `updateMany WHERE plan_id IN (…) AND deleted_at IS
NULL`, so a deleted plan's links **stop resolving** (the guard also re-checks the live
  plan, ADR-0051 §5) and a restore brings exactly that batch back — **no endpoint guard**
  (a link has exactly one parent; the `activity_steps`/`notes` precedent). `RESTRICT` is
  defence in depth: we never hard-delete, and it guards against an accidental hard delete
  orphaning links. A directly-deleted link (a future management action) gets its **own**
  fresh batch id (the dependency-leaf precedent) so a plan restore never resurrects it.
- **Liveness** is evaluated server-side against `now()` by the guard (§5): `token_hash`
  matches **AND** `revoked_at IS NULL` **AND** `deleted_at IS NULL` **AND** (`expires_at
IS NULL OR expires_at > now()`) **AND** the referenced plan is itself active. Any failure
  → a **uniform 404** (the guard leaks nothing about a token's existence). `expires_at`
  NULL = no expiry; `revoked_at` NULL = live, set = immediately dead (no token cache in v1,
  so revocation latency is one request); `last_accessed_at` is best-effort **coalesced**
  guest-access telemetry (§7), written without an edit-`version` bump.
- **Indexes.** The unique `token_hash` **is** the guest lookup. A partial
  `idx_plan_shares_plan_id` (`WHERE deleted_at IS NULL`) backs the management list + the
  cascade filter — partial (not a full composite backing the FK) because plans soft-delete
  only, so the plan FK check never fires (the `idx_plans_calendar_id` reasoning). A partial
  `idx_plan_shares_delete_batch_id` backs batch restore; `plan_shares_organization_id_idx`
  backs the org FK + scoped audit reads.
- **Service-layer obligations the DB can't enforce (F-M2/F-M3):** copying
  `organization_id` from the resolved plan (the CHECK-free denormalised-scope value
  equality, unit-tested like every sibling); asserting `plan:share` (Planner/Org-Admin)
  on create/list/revoke; returning the raw token **once** on create and **never** in the
  list; and the guest guard's uniform-404 resolution + live-plan re-check.

### MailEvent: operational telemetry, and the one ordinary table (staff console M1)

`mail_events` records one row per failed or abandoned send, making
`event: 'mail.send_failed'` durable instead of a log line nobody reads
(`docs/TECH_DEBT.md` #100). It is the **first table in this schema that deliberately follows
almost none of the conventions above**, and every departure is a decision rather than an
oversight — which is why it is documented here at length rather than listed.

- **It is NOT the audit shape, and that is load-bearing.** The reflex after ADR-0072 is to
  model a new "things that happened" table on `audit_events`. Here that would be a defect:
  `audit_events` refuses `UPDATE` and `DELETE` **in the database** (`ENABLE ALWAYS`
  triggers), and this row holds a **customer's full email address** (staff-console CQ-1,
  which overruled the domain-only proposal). The audit shape would therefore write customer
  addresses into a permanently unerasable table — the exact collision ADR-0085 D3 spent an
  entire decision avoiding for **one** column, repeated for every failed send. `mail_events`
  is **ordinary**: updatable (so ADR-0085 D1's tombstone can scrub `recipient` in place),
  deletable and expirable. **Do not add a trigger to this table.**
- **No `created_at`/`updated_at`**, against the rule in "Auditing" above. The producer writes
  inside the `catch` block that observes the failure, so `created_at` would equal
  `occurred_at` to the millisecond; and the only `UPDATE` this table will ever see is an
  erasure scrub, which is an audited act whose record belongs in `audit_events` — a stamp
  here would invite the row to be read as edited data rather than as a captured instant.
- **No `version`** (nothing edits a mail event concurrently — the `AuditEvent` reasoning) and
  **no `deleted_at`**: a soft delete that leaves the address in place defeats the single
  property that makes this table ordinary.
- **No `organization_id`**, against "Denormalised `organization_id`" above. Verification and
  password-reset mail is sent **before and outside** any membership — a sign-up verification
  precedes every organisation — so the column would be null for exactly the rows most often
  read and present only for invitations. The staff read is installation-wide by design;
  `correlation_id` reaches the Pino line where the request's org context lives. It would also
  drag a telemetry row into the organisation FK graph, where a `RESTRICT` can block an
  organisation delete.
- **`kind` / `outcome` are TEXT + value-list CHECKs, not Postgres enums** — the
  `audit_events.action` precedent, for its stated reason (Postgres needs **two** migrations to
  add an enum label and use it). This vocabulary is _observed_ to grow rather than suspected
  to: `test` is already specified for the CQ-3 staff send and is not a member of
  `MailFailureKind` today, so it is permitted from the start and M3 needs no migration.
  Values are `lower_snake` to equal `MailFailureKind` **value for value**, so the producer
  needs no mapping table — a mapping table is where two vocabularies drift.
- **`error_class`, never `error.message`.** A transport error's message routinely embeds the
  address it failed to reach in whatever shape the relay chose. There is deliberately no
  `message`/`detail` column, and `ck_mail_events_error_class_shape` makes the remaining hole
  structural rather than procedural: a constructor name or errno matches, anything long or
  punctuated enough to carry an address does not. `ck_mail_events_recipient_length` bounds the
  address at RFC 5321's 320 octets — a **length** check and not a format one, because a send
  can fail precisely _because_ the address was malformed, and rejecting that row would lose
  the record that explains the failure.
- **Retention is 12 months, and it is enforced** (ADR-0087). The number is deliberately the
  same as ADR-0085 D3's `auth.*` `subject_label` period rather than a second one. Until
  2026-08-10 it was a **ceiling, not a promise** — this application had no scheduler at all —
  and the sweep closes that: `RetentionSweepRunner` deletes in batches of 1,000 on
  `occurred_at`, hourly, capped at 50,000 rows a run. **The migration's own comment still says
  nothing enforces it, and cannot be corrected** — a landed migration is checksummed — so this
  paragraph is the current statement and that one is history.
  The delete is `ctid IN (SELECT ctid … ORDER BY occurred_at, id LIMIT 1000)`, **not** the
  single ranged `DELETE` this paragraph used to predict and **not** `id IN (…)`: ADR-0087 D6
  measured the `id` form's outer lookup degrading to a sequential scan as the batch grows or
  the table shrinks — 160 ms over 499k rows at batch 10,000, and 10.8× slower on the smaller
  table — which loses the one property a batched delete exists to guarantee.
- **One index, `(occurred_at, id)`** — full, not partial, and therefore declared in
  `schema.prisma` rather than as raw SQL: every row is in the read set (no soft delete, no org
  scope, no nullable leading column), so none of the `audit_events` partial-index reasoning
  applies. ASC read backwards, because both keys descend together. **No index on
  `recipient`** — an index on a plaintext address is a second copy of the address.
- **Service-layer obligations the DB can't enforce (M1-T2):** `kind` must be threaded into
  `SmtpMailService`'s private `send()` so the `ABANDONED` row can carry one (it is generic
  today and knows only the recipient, so a null there would blank the read's primary axis for
  precisely the hardest failures); the producer normalises `error_class` to a constructor name
  or errno **before** the insert (the CHECK is a backstop, and reaching it is a bug); and the
  write runs inside a `catch` block, so it **swallows its own failure** — a rejected insert
  must never become the second error of a failed send.

## Operational telemetry (installation-wide, not organisation-scoped)

Two tables. Neither is part of the `Organization → Client → … → Activity` hierarchy above,
neither carries an `organization_id`, and both are read by a staff member about the
installation rather than by a member about their own data. Both are **ordinary** tables —
updatable, deletable, expirable — and both migrations say so at length, because the reflex in
this repository after ADR-0072 is to model a new "things that happened" table on
`audit_events` and in both cases that would be a defect rather than a style choice.

### MailEvent: failed and abandoned sends (staff console M1)

The `mail_events` table (staff-console M1-T1, `docs/TECH_DEBT.md` #100) is the durable half of
a signal that today reaches nobody: `SmtpMailService` emits `event: 'mail.send_failed'` at four
sites and nothing acts on it. One row per failed or abandoned send, so a staff member can read a
history and the alerter has something to count. **Non-scheduling** — the CPM engine never reads
it — so the migration is byte-parity (a single additive table create).

**It is an ordinary table, and that is a requirement rather than a default.** The reflex after
ADR-0072 is to model a new "things that happened" table on `audit_events`; here that would be a
defect. `audit_events` refuses `UPDATE` and `DELETE` in the database (`BEFORE UPDATE OR DELETE` +
`BEFORE TRUNCATE`, `ENABLE ALWAYS`), and this row holds a **customer's full email address**
(staff-console CQ-1, which overruled the domain-only proposal). The audit shape would therefore
write customer addresses into a permanently unerasable table — exactly the collision ADR-0085 D3
spent a whole decision avoiding for a single column, repeated for every failed send. So the table
is **updatable** (ADR-0085 D1's tombstone can scrub `recipient` in place), **deletable** and
**expirable**. Do not add a trigger to it.

- **Retention: 12 months**, deliberately ADR-0085 D3's number and not a second one — two periods
  for one class of data is a question nobody can answer later. **Enforced since 2026-08-10**
  (ADR-0087): an in-process hourly sweep, batched on the leading index column, configurable by
  `RETENTION_MAIL_EVENTS_DAYS` and disableable with `RETENTION_SWEEP_ENABLED=false`. The period
  was a ceiling and is now a promise — the row, and with it the `recipient` address ADR-0085 D1
  kept erasable, is deleted. What is **still** unenforced is D3's own `auth.*` `subject_label`
  period on `audit_events`, which the sweep may never touch (`docs/TECH_DEBT.md` #118). The
  spec's §4.10 defaults table still says 90 days; that row predates CQ-1 and is stale.
- **`kind` and `outcome` are TEXT + a value-list CHECK, not Postgres enums** — the
  `audit_events.action` precedent, for its stated reason: an enum label costs **two** migrations
  (Postgres forbids adding and using one in a single transaction), a CHECK costs one. This
  vocabulary is _observed_ to grow rather than suspected — `test` is specified for the CQ-3 staff
  send and is not a member of `MailFailureKind` today — so it is permitted from the start and M3
  needs no migration at all. Deliberately **not** the `AuditOutcome` precedent: that enum is
  closed by construction (every act succeeds, is denied or fails), while `FAILED`/`ABANDONED`
  enumerate today's failure modes on a table named for _events_. `kind`'s values are lower_snake
  (not the SCREAMING enum convention) so they equal `MailFailureKind` value for value and the
  producer needs no mapping table — a mapping table is where two vocabularies drift.
- **`error_class`, never `error.message`.** A transport error's message routinely embeds the
  address it failed to reach in whatever shape the relay chose; storing the address in a column is
  a decision, storing it again inside a free-text blob is a leak wearing the decision's clothes.
  There is no `message`/`detail` column, and `ck_mail_events_error_class_shape` makes that
  structural rather than procedural: a constructor name or errno (`Error`, `ECONNREFUSED`)
  matches, a sentence with a space or an `@` does not. `ck_mail_events_recipient_length` bounds
  the one PII column at RFC 5321's 320 octets — a **length** check, not a format one, because a
  send can fail precisely _because_ the address was malformed and rejecting that row would lose
  the record that explains the failure.
- **Nullability.** `kind` and `outcome` are `NOT NULL` (every row is one of the two branches, and
  a null `kind` would blank the read's primary axis). `recipient` is nullable **as the erasure
  affordance**, not because a producer omits it: with no unique index to preserve, NULL is the
  honest scrub where `users.email` needs a non-routable tombstone. `error_class` is nullable
  because a rejection is `unknown` and a thrown null has no class to name — writing `'Unknown'`
  would dress an absence as a fact. `correlation_id` is nullable because
  `RequestContext.correlationId` is itself `string | null` and the ABANDONED site fires from a
  detached `.catch()` after the response has gone.
- **No `organization_id`, and that is a decision.** Verification and password-reset mail is sent
  before and outside any membership — a sign-up verification precedes every organisation — so the
  column would be null for exactly the rows most often read and present only for invitations,
  reading as a fact about the failure when it is only a fact about which message it was. The staff
  read is installation-wide by design and never filters on it, `correlation_id` reaches the log
  line where the request's org context lives, and an FK would drag a telemetry row into the
  organisation graph where a `RESTRICT` can block an organisation delete.
- **No `created_at`/`updated_at`/`version`/`deleted_at`.** The producer writes inside the catch
  block that observes the failure, so `created_at` would equal `occurred_at` on every row; the
  only `UPDATE` this table will see is an ADR-0085 scrub, which is an audited act whose record
  belongs in `audit_events`; nothing edits a row concurrently; and a soft delete that leaves the
  address in place defeats the single property that makes this table ordinary.
- **One index, `(occurred_at, id)`, declared in Prisma** — full, not partial, because every row
  is in the read set (no soft delete, no org scope, no nullable leading column), so none of the
  `audit_events` partial-index reasoning applies. Declared **ASC and read backwards**: the spec
  proposed `(occurred_at DESC, id DESC)`, but both keys descend together, so the newest-first
  cursor read is a plain backward scan of this one (the `activities`/`notes` `(…, created_at, id)`
  argument). `audit_events` spells `DESC` only because its indexes are raw SQL anyway. `recipient`,
  `kind` and `outcome` are **unindexed**; the numbers behind that are in the migration.
- **Service-layer obligations the DB can't enforce (M1-T2):** `kind` must be threaded into the
  private `send()` so an ABANDONED row can carry one; `error_class` must be normalised to a
  constructor name or errno before the insert (the CHECK is a backstop — reaching it is a bug);
  and the write runs inside a catch block, so it must swallow its own failure rather than turn a
  failed send into a second error. Note that an abandoned send legitimately writes **two** rows —
  the timeout (`FAILED`) and the late transport error (`ABANDONED`) — which is the distinction
  ADR-0075's `send()` docblock exists to preserve.

### CspReport: deduplicated CSP violation reports (staff console M4)

The `csp_reports` table (staff-console M4, `docs/TECH_DEBT.md` #8) is where browser evidence
lands instead of being discarded. The web origin ships its Content-Security-Policy in
**report-only** mode. Until 2026-08-09 `CSP_POLICY` carried no `report-uri`, no `report-to` and no
`Reporting-Endpoints`, so a violation existed only in whichever browser console happened to be open
and the documented way to enforce was to flip the header and walk six surfaces watching DevTools.
**All three now ship** (`acd035a`) — this paragraph described the state the table was designed
against and was already out of date when it was written, which is the drift ADR-0058 exists for. ADR-0074 records that
the one violation found that way was found **in production, after release**, by a person
watching a console — and that it came from a **dependency** (Zod 4's `allowsEval()` probe),
which appears nowhere in `apps/web/src`. **Non-scheduling** — the CPM engine never reads it —
so the migration is byte-parity (a single additive table create).

**One row per DISTINCT violation, not per report.** The key is
`(effective_directive, blocked_uri, document_uri, disposition)`; a repeat increments `count` and moves
`last_seen_at`. Ten thousand identical violations are one row with `count = 10000`. **`disposition` is in the key** (2026-08-09, on the schema review's recommendation). Left out, a
violation seen 500× during a report-only window and once after enforcement collapsed into one row
reading `count = 501, disposition = 'enforce'` — claiming 501 people were blocked when one was, on
exactly the transition this table exists to inform, with no way for a reader to recover the truth.
**Conflation and fragmentation are not symmetric failures**: one is invisible and overstates harm,
the other is visible and adds up, so the key errs toward the recoverable one. The accepted cost is
that a `null` disposition — the legacy body carries none in every engine — is its own bucket, so one
violation seen in one phase by two browsers can be two rows; that is the same fragmentation in its
mildest form and still the safe direction. It cost **no migration**: the hash is producer-computed,
so the column and index are unchanged and existing rows simply stopped matching, which is harmless
on retention-bounded telemetry and is said here so nobody reads the discontinuity as data loss.

Dedup is
the design rather than a later optimisation: it makes volume a property of the **policy**
(distinct violations) instead of a property of **traffic**, which on an unauthenticated
endpoint is a property of whoever is pointing at us.

- **The dedup key is a hash column, and that is the decision the table turns on.** A unique
  index over the three columns directly is not merely inelegant — it is a write path an
  unauthenticated caller can make **fail**. Measured before it was written (PostgreSQL 16.13,
  incompressible input, plain btree over the three text columns): 2,600 chars accepted;
  **2,700 chars → `ERROR: index row size 2776 exceeds btree version 4 maximum 2704`**; 8,192
  chars → `ERROR: index row requires 8264 bytes`. So a hostile URI does not merely fail to
  deduplicate, it errors, and the report is lost — on exactly the input the table exists to
  survive. `dedupe_hash` puts a fixed 64 hex characters in the index and length stops being
  reachable. Proved end to end on a freshly-migrated database: three inserts of the same 8 KB
  incompressible `blocked_uri` produce **one row with `count = 3`**, and the same value in a
  plain three-column unique index raises `index row requires 8264 bytes`.
- **A hostile-length test built from a repeated character proves nothing**, and that is worth
  knowing before writing one. The same experiment with `repeat('a', 8192)` was **accepted** by
  the plain three-column index: a btree compresses an index tuple that would not otherwise fit,
  and 8 KB of one character compresses to nothing. Use incompressible input.
- **The hash is computed by the producer, not the database**, and the alternatives were tried
  rather than reasoned about. A `GENERATED ALWAYS AS (…) STORED` column and an index expression
  both require `IMMUTABLE` functions, and `convert_to(text,'UTF8')` is **STABLE**
  (`pg_proc.provolatile = 's'`), so `sha256(convert_to(…))` is refused outright
  (`generation expression is not immutable` / `functions in index expression must be marked
IMMUTABLE`). pgcrypto's `digest()` is not installed, the `app` role is not superuser
  (`pg_user.usesuper = f`), and pgcrypto is not trusted, so a migration cannot install it.
  **This database cannot compute a strong hash.** It can compute `md5` — and md5 over
  attacker-controlled input, on a table whose purpose is to be evidence, hands a prober a way
  to merge a real violation into another row by collision. A generated column also **drifts**:
  declared as an ordinary column, `prisma migrate diff` reports `Altered column dedupe_hash
(changed from Nullable to Required, default changed from Some(DbGenerated(…)) to None)` and
  exits 2 — the CI failure TECH_DEBT #54 was. Silencing it needs
  `String? @default(dbgenerated("md5(…)"))`, i.e. a client type of `string | null` for a column
  that is never null, plus the SQL restated in the model where a later migration can quietly
  disagree with it. So the hash is `sha256Hex` in Node — the `Invitation.tokenHash` /
  `PlanShare.tokenHash` precedent (`common/tokens/token.ts:21`), already used twice in this
  schema for exactly this shape.
- **The hash joins on `\x1f` (UNIT SEPARATOR), not `|`.** The first version used a pipe and
  argued the collision was harmless. It is not: joined on a pipe,
  `('https://cdn/a|b.js', 'https://app/x')` and `('https://cdn/a', 'b.js|https://app/x')` produce
  the **same** digest — verified, both `40223a8b…` — so two genuinely different violations share
  one row and one count on a table an operator reads to decide what to fix. A control character
  cannot occur in a directive name or a URI. (The original argument, that forging a row on an
  unauthenticated endpoint is free anyway, holds for the **hostile** case and says nothing about
  the accidental one.) Note the migration comment below quoted a `\x1f` join while the producer
  used `|`, so the recompute it describes as "verified" could not have accepted a producer hash;
  the separator now matches what that comment always claimed.
- **A CHECK that recomputes the hash was tried and is deliberately not shipped.**
  Postgres does not enforce immutability inside a `CHECK`. It would make the separator and field
  order a database constant, so changing either in the producer refuses **every** row — and
  because this endpoint swallows its own write failures by design, the symptom is total, silent
  loss of reports rather than a failing test. A benign duplicate row from a producer bug is the
  better residual. `ck_csp_reports_dedupe_hash_shape` asserts only that the value **is** a
  sha256 hex digest, which is a fact about the column rather than about the producer.
- **The two URI columns are deliberately unbounded by any CHECK**, and this is the sharpest
  departure from the `mail_events` precedent. That table's `ck_mail_events_recipient_length`
  bounds a value **our own code** produces; here the producer transforms untrusted input, the
  endpoint answers **204 whatever happens**, and the write is swallowed — so a refused row is a
  **silently dropped report**. On the two columns that are themselves the evidence, losing the
  row is worse than losing the tail of a URL, and a length constraint would be reachable by
  exactly the hostile input the table exists to survive the moment the producer's cap and the
  constraint disagreed. The bound belongs at the boundary (`MAX_FIELD_LENGTH` = 1,024 and the
  body cap in `csp-report-body.ts`); the database's job is to make a hostile length **harmless**
  rather than to refuse it, which is what `dedupe_hash` buys.
- **The query string and fragment are stripped from every URL before the write**
  (`csp-report-body.ts`), and that is worth keeping for its own reason rather than as tidying: a
  URL's query is where identifiers live — a search term, an email in a redirect — and this is
  telemetry about a policy, not an access log with better retention than the one anyone agreed
  to. It also narrows the dedup key to the thing that identifies the violation, so one broken
  asset does not become one row per query string. `first_seen_at` likewise never moves on a
  repeat: it is what makes "this started when we deployed X" answerable.
- **No CHECK on this table may be able to REFUSE a row, and two of the originals could.** This is
  the rule the first migration applied to the URI columns and then contradicted twice, and it is
  the correction in `20260809170000_csp_reports_refusable_constraints`. Because the endpoint
  answers 204 and the producer swallows the write, a rejected `INSERT` is not an error anyone
  sees — it is a report that never existed, and browsers do not retry.
  - `ck_csp_reports_directive_shape` (`^[a-z][a-z0-9-]{0,63}$`) — **dropped.** Its stated
    reasoning (a shape, never a value list, because the directive vocabulary looks closed and is
    not) was right and stopped one step short: a shape is still a refusal. The shipped producer
    fell back to the legacy `violated-directive` **verbatim**, so `script-src 'self'` — the value
    several engines are the only ones to send — was answered 204 and recorded **nothing**.
    Measured through the real route: 204, zero rows. Normalising the directive to a bare token is
    the fix and belongs in the producer; the residual is a duplicate row, which the same migration
    already called "the better residual" when it rejected the hash-recomputing CHECK.
  - `ck_csp_reports_disposition` (`IN ('enforce','report')`) — **dropped.** Reachable from an
    unauthenticated POST (`disposition: 'enforcing'` → row refused → report gone) and from any
    future browser that adds a third value. A value list refuses what we did not anticipate, which
    is the argument used against a value list on `effective_directive` one bullet earlier.
  - Nothing replaces them, not even a length backstop: the URI columns beside them are unbounded
    on the same reasoning, and a length CHECK near `MAX_FIELD_LENGTH` becomes reachable the moment
    the cap and the constraint disagree. **The four CHECKs that remain are ones the producer
    structurally cannot violate** — a sha256 hex digest, a count that only increments, clamped
    int4 positions — with one exception, next.
- **`ck_csp_reports_seen_order` is kept, and it is currently reachable with no hostile input.**
  Measured: **16 concurrent reports of the same NEW violation record one, losing 15**; a burst of
  two loses one. It is **not** a race on the unique index — Prisma emits a correct
  `INSERT … ON CONFLICT (dedupe_hash) DO UPDATE`, and the same statement written by hand with
  `now()` on both branches records all 16 with zero errors. It is two clocks in one statement:
  `first_seen_at` is stamped by the Prisma query engine as it builds the INSERT, `last_seen_at` on
  the DO UPDATE branch is the `new Date()` the service took ~1 ms earlier, so the loser of the
  insert race updates with an instant older than the winner's `first_seen_at`. Repeats against an
  existing row are correct, so the loss falls entirely on a violation's **first burst** — which is
  when a newly-shipped policy breaks something for several people at once. The constraint is kept
  because it is true and because it is what surfaced the defect; **the fix is in the producer**
  (let the database stamp both instants).
- **`disposition` is nullable, and the null is the interesting case.** `enforce` vs `report` is
  the difference between "this **did** break" and "this **would have**", which is the whole
  transition the table informs. It is **absent by format, not by accident**: the Reporting API
  body always carries it, the legacy `application/csp-report` body carries it in some engines
  and not others. Defaulting a missing value to `report` invents the answer, and invents it in
  the direction that reads a real block as hypothetical. `NULL` says "the report did not say",
  which is true and is a third fact. **This paragraph shipped describing a producer that did the
  opposite** — `clean(disposition ?? 'report')`, with the e2e suite asserting `disposition:
'report'` for a body that carried none — so the column could not be null and the third fact did
  not exist. The producer is corrected to pass null through.
  It is **not** part of the dedup key, so it is last-writer-wins and reads as "as of
  `last_seen_at`, this was the disposition". Read that literally: a violation seen 500 times in
  report-only and once after enforcement shows `disposition = 'enforce'`, `count = 501`, and
  nothing separates it from 501 real blocks. **If the report-only → enforce transition is the
  decision this table serves, the disposition belongs in the dedup key**, where the two phases are
  two rows and the comparison is the answer. It costs no migration (the key is a producer-computed
  hash) and the transition is benign — old rows stop matching and dedup restarts.
- **No `original_policy`.** Both wire formats carry it; it is several hundred bytes,
  byte-identical on every row, and describes something `docker-compose.yml` already states and
  `apps/web/e2e-csp` already parses. It is also not in the dedup key, so the stored copy would
  be whichever report arrived most recently — the cost of storing it and none of the certainty.
  Absent for reasons of their own: `referrer` (a URL carrying identifiers, telling us nothing
  `document_uri` does not), `status_code` (has never decided anything here), `script_sample`
  (empty unless the policy carries `'report-sample'`, which it does not, and it echoes our own
  script text into a table read over the network), and `user_agent` (varies by version, so as a
  non-key column it preserves one arbitrary sample — and "enforcing breaks Safari" is not a
  different decision from "enforcing breaks").
- **`source_file` / `line_number` / `column_number` are kept**, on ADR-0074's own experience:
  `blocked_uri = 'eval'` names what broke and says nothing about what to change, and the code
  that caused that violation was in a dependency. Not in the key, so last-writer-wins — one
  worked example, which is all they need to be.
- **Nullability, per column.** The three key columns are `NOT NULL`, and that is a **dedup
  requirement rather than a preference**: in a Postgres unique index a NULL is distinct from
  every other NULL, so one nullable key column would silently turn the table back into one row
  per report — which is why the producer substitutes `'unknown'` rather than omitting a field.
  `dedupe_hash`, `count`, `first_seen_at`, `last_seen_at` are `NOT NULL` because the producer
  always knows them. `disposition` and the three source-location columns are nullable because
  they are **absent by format**: the two wire formats carry different field sets, so a missing
  value means "this reporter does not send it", not "something went wrong".
- **`count` is `INT`, not `BIGINT`**, and the arithmetic is recorded because an `integer`
  overflow **throws** on the one write this table performs. At the per-IP throttle this endpoint
  carries, saturating `int4` on a single row needs on the order of fifty thousand address-days
  aimed at one identical triple, against a 30-day retention that keeps resetting it. `BIGINT`
  would also put a `bigint` on the read, which does not survive `JSON.stringify`.
- **Retention: 30 days**, on `last_seen_at` and **not** `first_seen_at` — a violation that is
  still happening must not expire out from under the decision it informs. Deliberately a
  different number from `mail_events`' twelve months: that table holds a customer's address and
  inherits ADR-0085 D3's period, this one holds URLs, and a CSP finding is only interesting
  while the policy it describes is current. **Enforced since 2026-08-10** (ADR-0087): an
  in-process hourly sweep, batched on the leading index column, configurable by
  `RETENTION_CSP_REPORTS_DAYS`. That matters more here than for its sibling, because this table
  is written by an **unauthenticated** endpoint that strips the query string but not the path,
  so unique rows are mintable at roughly 1.73M/day per IP. The sweep bounds the residue after a
  flood stops; the per-IP throttle bounds a sustained one.
  **The caveat below survives the sweep unchanged, and is the reason the predicate is
  `last_seen_at`. Read "30 days" as a claim about ROWS, not about data age.** Because `last_seen_at` moves on
  every repeat, a violation that keeps happening never expires, and its `document_uri` — which may
  carry a plan or organisation id in its path — is retained for as long as it lasts, with a
  `first_seen_at` arbitrarily older than the period. That is the intended behaviour and not an
  oversight in the predicate (a live finding must not expire out from under the decision it
  informs), but it means the period bounds **staleness**, not retention, and the sentence "URLs are
  kept for 30 days" is not one this table supports.
- **One index beyond the unique key, `(last_seen_at, id)`** — full, not partial, and therefore
  declared in `schema.prisma`: every row is in the read set, so none of the `audit_events`
  partial-index reasoning applies. ASC read backwards (measured `Index Scan Backward`, 0.44 ms
  for the first page at 500,000 rows), which keeps this schema free of its first `sort:`. It is
  **not discretionary** — it also serves the retention sweep on its leftmost prefix.
- **No index on `count`, and that is measured rather than omitted.** The panel also wants
  most-frequent-first. At **500,000 rows** (174 MB — past any honest expectation, inside the
  hostile band) `ORDER BY count DESC, id DESC LIMIT 50` costs **49.8–55.1 ms** as a parallel seq
  scan plus a top-N heapsort over 22,404 buffers; a `(count, id)` index takes it to
  **0.30–0.39 ms** for **19 MB**. A 130–180× speed-up, and still not worth shipping: at
  **5,000 rows** the same unindexed sort costs **1.32–1.36 ms**, and 5,000 distinct violations
  is already generous when a correct policy yields tens. The 50 ms case needs a sustained
  hostile flood **and** is a staff-only read behind a throttle. The numbers are in the migration
  so adding it later is one step rather than a rediscovery (the ADR-0073 C1 rule).
- **The write side of that index, which the read measurement does not cover.** `last_seen_at` is
  indexed **and** rewritten on every repeat, so **no repeat can ever be a HOT update**: measured,
  2,000 repeats at a distinct millisecond each gave `n_tup_hot_upd = 0` and grew
  `csp_reports_last_seen_at_id_idx` 16 kB → 96 kB and `csp_reports_dedupe_hash_key` 16 kB → 32 kB
  for **one row**, each repeat writing a new heap tuple plus an entry in every index (reclaimed by
  autovacuum). Beware the obvious test: repeats inside the **same millisecond are HOT**, because
  `timestamptz(3)` rounds them to an equal value and Postgres then sees the column as unmodified —
  a tight loop measures 93% HOT and tells you nothing about production. The cost buys the
  newest-first read and the sweep, so it is worth paying; it also settles the `count` question
  from the other side, since a `(count, id)` index would add a fourth index entry per repeat but
  would **not** newly break HOT — indexing `last_seen_at` already did.
- **Service-layer obligations the DB can't enforce (M4).** Each is a real gap in the producer as
  it stands, not a hypothetical. (1) `effective_directive` must be normalised to a **bare
  token**: the legacy `violated-directive` field carries the serialised directive, value and all
  (`script-src 'self'`), and `csp-report-body.ts` falls back to it verbatim — stored that way the
  same violation keys differently per engine and the count that decides whether to enforce is
  split across two rows that read as two problems — and, until the CHECK was dropped, no row at
  all. (2) `disposition` must be `null` when the report did not say, and must never be defaulted.
  (3) The three source-location fields must be read from both wire formats — the shipped
  `NormalisedCspReport` carried no such fields, so `source_file`, `line_number` and
  `column_number` had **no writer at all** and were permanently null. (4)
  `line_number`/`column_number` must be clamped to safe integers or dropped to null — a JSON
  number outside `int4` fails at **cast** time, before any CHECK can see it. (5) The write
  swallows its own failure, because the endpoint answers 204 whatever happens and a rejected
  insert must never become a response — which is what converts every constraint on this table
  from a guard into a silent delete. (6) **Both timestamps must be stamped by the database**, or
  the first simultaneous burst of a new violation records one report and loses the rest; see
  `ck_csp_reports_seen_order` above.
- **The one thing to check before any of the above matters.** `app.use(json())` parses only
  `application/json`, and browsers post CSP reports as `application/csp-report` (report-uri) and
  `application/reports+json` (Reporting API). Measured against the real route: both real content
  types return **204 with zero rows recorded**; only `application/json` — which no browser sends,
  and which is what the e2e suite sends — records anything. The table cannot currently receive a
  report from a browser at all.

## Testing & performance

- Integration tests run against a **real Postgres** (see [`TESTING.md`](TESTING.md)).
- Profile with `EXPLAIN ANALYZE`; watch for N+1 (Prisma `include`/`select`),
  missing indexes, and unbounded queries. **Paginate everything.** See
  [`PERFORMANCE.md`](PERFORMANCE.md).
