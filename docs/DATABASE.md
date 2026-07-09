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

## Domain hierarchy: scoping & cascade soft-delete (Client/Project/Plan)

The `clients`, `projects`, and `plans` tables are the organisation-scoped
containers the scheduling domain hangs off (`Organization → Client → Project →
Plan`). They apply every standard above and establish two reusable conventions
future descendant tables (activities, notes, baselines, …) copy.

### Denormalised `organization_id`

`Project` and `Plan` carry `organization_id` **directly**, in addition to their
parent FK (`client_id` / `project_id`). It is a deliberate, measured denormalisation
(per _Relationships_ above):

- **Why.** Every scope/IDOR check and org-scoped query then filters a single
  indexed column instead of joining Plan → Project → Client to reach the org, and
  the query/authorisation shape is identical across all three modules.
- **Invariant.** A child's `organization_id` **always equals its parent's**. It is
  set by the service layer inside the create transaction (copied from the resolved
  parent), **never from client input**. The DB does not (cannot cheaply) enforce
  the equality; the service owns it and it is unit-tested.
- `Client.organization_id` is **native**, not denormalised — the organisation is a
  client's direct parent.

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

| Index                                       | On                                  | Kind           | Serves                                                                                                                                 |
| ------------------------------------------- | ----------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `clients_organization_id_created_at_id_idx` | `(organization_id, created_at, id)` | full composite | `organization_id` FK (leftmost prefix) + org-scoped active list + its `(created_at, id)` cursor sort — subsumes a standalone org index |
| `projects_client_id_created_at_id_idx`      | `(client_id, created_at, id)`       | full composite | `client_id` FK + list-projects-under-a-client + cursor sort — subsumes a standalone client index                                       |
| `projects_organization_id_idx`              | `(organization_id)`                 | full           | `organization_id` FK (RESTRICT) + org-scoped IDOR loads (no org-wide ordered list exists, so no composite)                             |
| `plans_project_id_created_at_id_idx`        | `(project_id, created_at, id)`      | full composite | `project_id` FK + list-plans-under-a-project + cursor sort — subsumes a standalone project index                                       |
| `plans_organization_id_idx`                 | `(organization_id)`                 | full           | `organization_id` FK + org-scoped IDOR loads                                                                                           |
| `uq_clients_org_name`                       | `(organization_id, name)`           | partial unique | name unique per org among live rows (`WHERE deleted_at IS NULL`); backs `NAME_TAKEN` (409) + name lookups                              |
| `uq_projects_client_name`                   | `(client_id, name)`                 | partial unique | name unique per client among live rows                                                                                                 |
| `uq_plans_project_name`                     | `(project_id, name)`                | partial unique | name unique per project among live rows                                                                                                |
| `idx_clients_delete_batch_id`               | `(delete_batch_id)`                 | partial        | batch restore lookup (`WHERE delete_batch_id IS NOT NULL`); tiny — only soft-deleted rows carry a value                                |
| `idx_projects_delete_batch_id`              | `(delete_batch_id)`                 | partial        | batch restore lookup                                                                                                                   |
| `idx_plans_delete_batch_id`                 | `(delete_batch_id)`                 | partial        | batch restore lookup                                                                                                                   |

The scope/list composites are **full (not partial on `deleted_at`)** so they also
back the FK `RESTRICT` check, which must find referencing rows _including_
soft-deleted ones; the active-list query filters `deleted_at IS NULL` on top of the
already-ordered index scan (cheap at the target scale of ≤ ~100 plans/org). No
redundant single-column FK index is added where a composite's leftmost prefix
already covers it.

## Testing & performance

- Integration tests run against a **real Postgres** (see [`TESTING.md`](TESTING.md)).
- Profile with `EXPLAIN ANALYZE`; watch for N+1 (Prisma `include`/`select`),
  missing indexes, and unbounded queries. **Paginate everything.** See
  [`PERFORMANCE.md`](PERFORMANCE.md).
