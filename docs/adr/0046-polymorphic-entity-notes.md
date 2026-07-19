# ADR-0046: Polymorphic entity notes

- **Status:** Accepted (Notes M1 — schema & cascade)
- **Date:** 2026-07-19
- **Deciders:** Product Owner (scope + Q1 body format), Solution Architect, Technical Lead;
  schema/indexes/CHECK/cascade designed with the database-architect

## Context

SchedulePoint records _what_ and _when_ a schedule does, but not _why_. The
[Notes feature](../specs/notes/feature-spec.md) adds attributed, time-ordered, **threaded**
annotations — a "weekly progress journey" — so the reasoning behind a schedule lives with it.
The product owner has **locked** the scope:

- A note is one **authored, timestamped** entry; an entity accumulates an ordered thread.
- v1 hangs off **plans + activities** only, but the model **must** extend to **clients +
  projects later with no rework**.
- Notes are **org-scoped, audited, soft-deleted**, and **cascaded/restored with their parent**
  via the existing `HierarchyLifecycleService`.
- Notes are **non-structural**: not a CPM input, and note writes are **not** pen-gated
  (ADR-0028) — the `PATCH …/activities/:id/progress` precedent.
- Body is **plain text, 1–5000 chars** (spec Q1 default).

The load-bearing design question is the **data model** for "a note that can belong to any one
of several entity types, extensibly, with real referential integrity and clean cascade
integration." That is architecturally significant (a new cross-cutting table shape + new
lifecycle wiring), hence this ADR.

Forces:

- **No-rework extensibility.** Adding client/project notes later must be additive — no new
  module, table, or component, no schema fork.
- **Referential integrity is not negotiable** (docs/DATABASE.md: the DB is the last line of
  defence). A note's parent pointer must be a real FK, and "exactly one parent, matching the
  discriminator" must be a DB invariant, not just service code.
- **Cascade correctness.** Deleting/restoring a plan or activity must hide/reveal its notes in
  the **same batch**, and an **activity** note swept by a **plan** delete must not be
  double-counted or missed.
- **Query patterns.** A per-entity thread (newest-first, cursor-paginated) and a per-plan
  **note-count badge** over activities must be indexed without N+1.

## Decision

**We will model notes as a single polymorphic `notes` table** with an `entity_type`
discriminator, **nullable typed parent FKs**, a DB **CHECK** pinning the parent to
`entity_type`, and **two denormalised scope columns** (`organization_id`, `plan_id`) that make
the note table a first-class citizen of the existing `HierarchyLifecycleService` cascade. The
CPM engine is **untouched** — notes are non-scheduling, so `compute.ts` and the recalc write
path never read or write them, and the migration is byte-parity (a catalog-only enum + table
create).

### Columns (see `apps/api/prisma/schema.prisma` `model Note`, `@@map("notes")`)

Every house standard: UUID v7 PK, snake_case via `@map`, `timestamptz` UTC, TEXT audit ids
(Better Auth ids are opaque TEXT — **`created_by` is the author**), optimistic-locking
`version`, soft delete + `delete_batch_id`. Plus:

- `entity_type` — `NoteEntityType` Postgres enum (`PLAN`, `ACTIVITY`; `CLIENT`/`PROJECT`
  reserved for later via `ALTER TYPE … ADD VALUE`).
- `plan_id` (`NOT NULL`, RESTRICT FK → `plans`) — the **cascade key on every note** and the
  **parent pointer for PLAN notes**. An ACTIVITY note carries its **activity's** `plan_id`
  (denormalised), so one sweep by `plan_id` catches both kinds. (The `Activity` precedent:
  `plan_id` is an activity's parent **and** its scope.) It becomes nullable — a safe
  expand-only `ALTER` — only when a parent-less client/project note lands.
- `activity_id` (nullable, RESTRICT FK → `activities`) — the **parent pointer for ACTIVITY
  notes**; NULL for PLAN notes.
- `organization_id` (`NOT NULL`, RESTRICT FK → `organizations`) — the tenant scope tag.
- Both scope columns are **copied from the resolved parent by the service inside the create
  transaction — never from client input** (the `Activity`/`ActivityDependency` invariant).
- `body` (`text`) — plain text, bounded 1–5000 by a CHECK (below).

### The exactly-one-parent CHECK (`ck_notes_exactly_one_parent`, raw SQL)

Prisma cannot express a CHECK, so it is hand-written in the migration:

```sql
CHECK (
    CASE "entity_type"
        WHEN 'PLAN'     THEN "plan_id" IS NOT NULL AND "activity_id" IS NULL
        WHEN 'ACTIVITY' THEN "activity_id" IS NOT NULL AND "plan_id" IS NOT NULL
        ELSE false
    END
)
```

- **`PLAN`** ⇒ parent is `plan_id` (set); no `activity_id`. `plan_id` also **is** the scope.
- **`ACTIVITY`** ⇒ parent is `activity_id` (set); `plan_id` set as the denormalised cascade
  scope.
- **`ELSE false` = fail-closed.** A future enum value inserted **before** its CHECK branch is
  added is **rejected** (a fail-loud reminder to amend the CHECK), never silently unenforced —
  the safest way to keep the CHECK "authoritative for all four future entity types."

**Extending to client/project later is bounded and additive:** `ALTER TYPE "NoteEntityType"
ADD VALUE 'CLIENT'/'PROJECT'`; add nullable `client_id`/`project_id` FK columns; `ALTER COLUMN
plan_id DROP NOT NULL` (client/project notes have no plan); and replace the CHECK adding a
`WHEN 'CLIENT'`/`WHEN 'PROJECT'` branch (and asserting the reserved columns NULL on the
existing branches). No note is re-homed, no existing row rewritten — the locked "no rework"
goal.

A second CHECK, `ck_notes_body_length` (`char_length(body) BETWEEN 1 AND 5000`), is the DB
backstop behind the DTO `@MinLength(1)@MaxLength(5000)`; the service trims-then-validates
(whitespace-only ⇒ 422 — the DB cannot trim).

### Cascade & restore integration (`HierarchyLifecycleService`)

Notes join the existing service-owned soft-delete/batch-restore machinery
(`apps/api/src/common/hierarchy/hierarchy-lifecycle.service.ts`) exactly like `activity_steps`
— they are **swept and restored as part of a parent's batch**, never a restore _root_ (so
`HierarchyEntity` is **not** extended with `'note'`). The wiring (built in Notes M1 Task 1.4,
not this schema slice):

- **Add `notes: number` to `CascadeCounts`** (initialised in both `cascadeSoftDelete` and
  `restoreBatch`).
- **Plan / project / client delete** → a new `deleteNotesUnderPlans(planIds)` helper:
  `tx.note.updateMany({ where: { planId: { in: planIds }, deletedAt: null }, data: stamp })`.
  Because **every** note carries `plan_id`, this **single** `updateMany` catches PLAN **and**
  ACTIVITY notes under the plans in one shot — **no double-count** (an activity note is matched
  once, by its own denormalised `plan_id`, never separately by activity). Called alongside the
  existing `deleteLinksUnderPlans` / `deleteStepsUnderPlans` leaf sweeps.
- **Single-activity (or WBS-subtree) delete** → a new `deleteNotesForActivities(subtreeIds)`
  helper: `tx.note.updateMany({ where: { activityId: { in: subtreeIds }, deletedAt: null },
data: stamp })`, alongside `deleteLinksForActivities` / `deleteStepsForActivities`. Deleting
  one activity sweeps **only that activity's** notes; plan notes are untouched (correct).
- **Restore** (`restoreBatch`, the `batchId` branch) → `counts.notes = tx.note.updateMany({
where: { deleteBatchId: batchId }, data: restore }).count` — **no endpoint guard**.

**Restore guard = batch cohesion (not a per-row guard).** Unlike a dependency (two endpoints,
one possibly in a different batch → the `restoreLinksInBatch` endpoint guard), a note has
**exactly one parent** and is **always swept in that parent's batch**. So restoring the batch
reactivates each note **with** its parent, and the parent's own `assertParentActive`
(top-down restore) already forbids resurrecting a parent under a still-deleted ancestor. A note
therefore **cannot** land active under a deleted parent — the `activity_steps` precedent. An
**individually** deleted note (the M2 `NotesService.remove`, its own fresh `delete_batch_id`,
like a directly-deleted dependency leaf) carries a **different** batch id, so restoring a
parent never resurrects it (spec: individual note restore is out of v1).

### Indexes (justified; see docs/DATABASE.md "Note")

| Index                             | On                              | Kind              | Serves                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `notes_plan_id_created_at_id_idx` | `(plan_id, created_at, id)`     | full composite    | `plan_id` FK (RESTRICT) + the **PLAN-notes thread** list & newest-first cursor (filter `entity_type='PLAN'`, backward scan) + the **plan cascade sweep** by `plan_id`; subsumes a standalone `plan_id` index |
| `notes_organization_id_idx`       | `(organization_id)`             | full              | `organization_id` FK + org-scoped IDOR loads                                                                                                                                                                 |
| `idx_notes_activity_created`      | `(activity_id, created_at, id)` | partial (raw SQL) | the **ACTIVITY-notes thread** list & newest-first cursor; `WHERE deleted_at IS NULL AND activity_id IS NOT NULL` (excludes PLAN notes + soft-deleted)                                                        |
| `idx_notes_plan_activity_counts`  | `(plan_id, activity_id)`        | partial (raw SQL) | the **badge note-counts** `GROUP BY activity_id` for a plan; `WHERE deleted_at IS NULL AND entity_type='ACTIVITY'` (a grouped scan, no N+1)                                                                  |
| `idx_notes_delete_batch_id`       | `(delete_batch_id)`             | partial (raw SQL) | **batch restore** lookup; `WHERE delete_batch_id IS NOT NULL` (tiny — only soft-deleted rows carry a value)                                                                                                  |

The full composite is full (not partial) so it matches every sibling scope composite; the
partial indexes are raw SQL because Prisma cannot express a `WHERE` predicate and are **not**
declared as `@@index` (to avoid a conflicting full index) — the `calendar_id` /
`delete_batch_id` precedent.

## Alternatives considered

- **Per-entity note tables (`plan_notes`, `activity_notes`, …).** Simpler FKs (each note has a
  single non-null parent, no discriminator or CHECK). **Rejected:** it duplicates the module,
  table, and thread component per entity type, multiplies the cascade wiring, and **directly
  violates** the locked "drop client/project in later with no rework" requirement — each new
  entity type is a new table + module + component + cascade branch.
- **Pure `entity_id` + `entity_type` polymorphism (no typed FKs).** One `entity_id` UUID with
  no foreign key. **Rejected:** it discards real referential integrity (nothing stops an
  `entity_id` pointing at a deleted/foreign/nonexistent row), and the cascade could not be a
  simple FK-scoped `updateMany`. The typed-FK variant keeps a real `RESTRICT` FK per parent.
- **A generic "comments on anything" engine.** Over-scoped for v1; the typed-FK polymorphic
  table already extends cleanly to client/project without the added complexity.
- **Denormalising `plan_id` only on PLAN notes (activity notes keyed solely by `activity_id`).**
  **Rejected:** the plan cascade would then need `plan_id IN (…) OR activity.plan_id IN (…)` —
  two predicates, risking double-counting an activity note or a join per sweep. Carrying
  `plan_id` on **every** note makes the plan sweep one clean `updateMany` (the locked cascade
  requirement).

## Consequences

**Positive**

- One module, one table, one thread component serve every entity type; client/project notes
  are a nullable-column + one-branch-CHECK + one-cascade-sweep addition — **no rework**.
- Real referential integrity per parent (typed `RESTRICT` FKs) **and** a DB-enforced
  exactly-one-parent invariant (fail-closed for future types).
- Cascade/restore is a clean, join-free `updateMany` on an indexed `plan_id` / `activity_id` /
  `delete_batch_id`, reusing the proven `HierarchyLifecycleService` batch mechanism with no
  endpoint guard.
- Thread list and badge counts are covered by targeted (partial) indexes — no N+1, cursor
  pagination, org-scoped.
- **The CPM engine is untouched.** Notes are non-scheduling; the migration is byte-parity and
  the recalc/golden suites are unaffected.

**Negative / neutral**

- `plan_id` does **double duty** (parent-for-PLAN-notes + scope-for-all-notes) — documented in
  the model comment and here, and consistent with the `Activity` precedent, but a reader must
  not "fix" it into two columns.
- The exactly-one-parent invariant lives in a raw-SQL CHECK (not the Prisma schema), so the
  schema and migration must be kept in lock-step (the house convention for all CHECKs).
- Making `plan_id` nullable for client/project notes is a future expand-only migration — cheap
  and safe, but a deliberate step (noted above).

**Service-layer obligations the DB cannot enforce (M2 must uphold):**

- **Author-ownership** for edit/delete-own — `note.createdBy === principal.userId` else **403**
  (the RBAC model is role→permission, not row-level; the DB stores the author but cannot scope
  the mutation).
- **`updated_by` on edit** (and `updated_by` = actor on cascade, already stamped by the service).
- **Optimistic `version`** conditional update → **409** on stale (the mutable-row convention).
- **Denormalised `organization_id`/`plan_id` copied from the resolved parent**, never client
  input (the CHECK enforces shape, not that the values match the parent's org/plan — a
  service-owned, unit-tested invariant, like every denormalised-scope sibling).
- **Non-pen-gated writes** — no `assertHoldsPen` in the notes module (the progress precedent).

## References

- Feature spec / plan: [`docs/specs/notes/feature-spec.md`](../specs/notes/feature-spec.md),
  [`docs/specs/notes/implementation-plan.md`](../specs/notes/implementation-plan.md)
- Schema: `apps/api/prisma/schema.prisma` (`model Note`, `enum NoteEntityType`)
- Migration: `apps/api/prisma/migrations/20260719000000_notes/migration.sql`
- Lifecycle machinery: `apps/api/src/common/hierarchy/hierarchy-lifecycle.service.ts`
- Standards: [`docs/DATABASE.md`](../DATABASE.md) (denormalised scope, cascade soft-delete,
  soft deletes, optimistic locking, indexes, CHECK constraints)
- Related: ADR-0012 (RBAC + resource scope), ADR-0016 (tenancy/roles), ADR-0021 (DAG /
  service-owned cascade), ADR-0025/0038/0044 (the descendant-table + child-table precedents),
  ADR-0028 (edit-lock "pen" — deliberately not applied)
