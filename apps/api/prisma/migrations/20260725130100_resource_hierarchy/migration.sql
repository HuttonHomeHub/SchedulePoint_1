-- M3 Resource hierarchy, part 2 of 2: the adjacency-list parent link, the two CHECKs and the
-- children index (ADR-0053 §3, epic "Library scoping & manageability", Task 3.1). DEPENDS on
-- 20260725130000_resource_group_kind having COMMITTED — the GROUP CHECK below names the
-- 'GROUP' enum literal, which cannot be used in the transaction that added it (see part 1's
-- header for the exact Postgres rule).
--
-- MODEL. The org resource pool gains a MANAGEMENT LAYER, not a tier. The pool deliberately
-- stays ONE org-global pool — fragmenting it would destroy cross-plan over-allocation
-- detection and levelling (ADR-0041) and diverge from P6's enterprise pool — and gains an
-- ADJACENCY-LIST `parent_id` self-FK over it, the ADR-0038 activities.parent_id precedent.
-- Rejected there and here: a materialised path/code string (no referential integrity, and a
-- reparent rewrites every descendant).
--
-- ADDITIVE, NO DATA MIGRATION. `parent_id` is NULLABLE with NO default, so every existing row
-- reads NULL ("top level") — no backfill, no behaviour change. Both CHECKs are satisfied by
-- every existing row by construction (parent_id NULL, and no row can yet be a GROUP).
--
-- NON-SCHEDULING / BYTE-PARITY. The engine resolves a resource's calendar and its demand BY
-- ID and never receives `parent_id`; a GROUP carries no calendar, capacity, cost or
-- assignment. ADR-0034's golden + scenario suite is structurally untouched (ADR-0053 §6).
--
-- LOCKS. Every statement is metadata-only or a validation scan of a SMALL library table
-- (`resources` is hundreds-to-low-thousands of rows per tenant), so both CHECKs are added
-- VALID inline — a NOT VALID / VALIDATE CONSTRAINT split would buy nothing here and would
-- break the single-transaction property. The whole file runs in ONE transaction (Prisma
-- Migrate wraps a migration file on PostgreSQL), so the tree invariants are never
-- half-enforced; no CONCURRENTLY variant is possible or wanted (the repo uses none).

-- AddColumn: the adjacency-list parent link. NULL = a top-level resource; non-null = nested
-- under the referenced GROUP. Nullable with no default ⇒ on PostgreSQL 11+ a METADATA-ONLY
-- change (no table rewrite, no full scan; a brief ACCESS EXCLUSIVE for the catalog update) —
-- the same posture as activities.parent_id and calendars.project_id.
ALTER TABLE "resources" ADD COLUMN "parent_id" UUID;

-- AddForeignKey (ON DELETE RESTRICT — every hierarchy child; ON UPDATE CASCADE is Prisma's
-- default, written explicitly so `prisma migrate diff` sees no drift). A self-FK, so the
-- validation scan touches only `resources` and passes instantly against an all-NULL column.
-- Resources soft-delete only, so this referential check never actually fires; the real delete
-- path is the service-owned SUBTREE CASCADE (deleting a GROUP soft-deletes its whole active
-- subtree under ONE delete_batch_id, the ADR-0038 precedent). RESTRICT is defence in depth
-- against an accidental hard delete orphaning a branch. The FK does NOT enforce SAME-ORG — a
-- cross-org parent_id satisfies it — exactly like resources.calendar_id and
-- activities.parent_id, so "active AND in this org" stays a SERVICE check inside the write
-- transaction, under the org-scoped resource-tree advisory lock, with its own reject tests.
ALTER TABLE "resources" ADD CONSTRAINT "resources_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma cannot express CHECK; docs/DATABASE.md: enforce
-- invariants in the DB, not only in code). The trivial 1-NODE cycle — a resource that is its
-- own parent — can never persist even if the service's ancestor walk were bypassed.
-- Nullable-safe: a NULL parent_id (top level) is always legal. TRANSITIVE acyclicity is a
-- graph-wide property no CHECK can express; that is the service's ancestor walk under
-- acquireResourceTreeWriteLock, the exact analogue of ck_activities_parent_not_self + the
-- ADR-0038 walk.
ALTER TABLE "resources" ADD CONSTRAINT "ck_resources_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- CheckConstraint. A GROUP is a pure grouping node: no working calendar, no capacity ceiling,
-- no cost rate. Unlike ADR-0038's "only a summary may be a parent" (which needs the PARENT row
-- and is therefore service-only), this rule is SAME-ROW and so is legally expressible — cheap
-- defence in depth behind the DTO/service 422 reject. It is the column half of the parity
-- argument: a GROUP contributes zero capacity, zero demand and zero cost to levelling / the
-- histogram / EV BY CONSTRUCTION, not by convention.
--
-- Written FAIL-CLOSED as a `CASE … ELSE false` over EVERY label rather than
-- `kind <> 'GROUP' OR (…)`: `kind` has just been promoted from a mere label to a CAPABILITY
-- discriminator ("may this carry a calendar, a ceiling and a rate, and may it be assigned?"),
-- and the plausible future members (CREW, TEAM, SUBCONTRACTOR, EXPENSE) are precisely the ones
-- for which that question is live. The OR form answers it silently as "yes, everything
-- allowed"; ELSE false REJECTS the row until an author adds a branch — the
-- ck_notes_exactly_one_parent (ADR-0046) and ck_calendars_scope_parent (ADR-0053 §1, this same
-- epic) precedent. NULL-safe by construction: `kind` is NOT NULL so a branch always matches.
--
-- COST OF THE FAIL-CLOSED FORM, for the next author: adding a ResourceKind member means (1)
-- `ALTER TYPE … ADD VALUE` in one migration file, then (2) DROP + re-ADD this CHECK with the
-- new branch in a SEPARATE, later file — the same two-file dance as M3, for the same reason.
-- `prisma migrate dev` generates only (1); it will NEVER amend this raw-SQL CHECK. The CI
-- guard that makes that omission LOUD instead of a production surprise is the round-trip test
-- in resource-hierarchy.e2e-spec.ts that inserts one row per ResourceKind value.
ALTER TABLE "resources" ADD CONSTRAINT "ck_resources_group_no_scheduling_fields" CHECK (
    CASE "kind"
        WHEN 'GROUP' THEN "calendar_id" IS NULL AND "max_units_per_hour" IS NULL AND "cost_per_unit" IS NULL
        WHEN 'LABOUR' THEN true
        WHEN 'EQUIPMENT' THEN true
        WHEN 'MATERIAL' THEN true
        ELSE false
    END
);

-- Partial index (Prisma cannot express `WHERE …`). Backs the three real `parent_id = ?` /
-- `parent_id IN (…)` query shapes: (a) the children-of-a-group read (`GET …/resources?parentId=`),
-- (b) the DESCENDANT BFS that resolves a GROUP's active subtree for the delete cascade and its
-- subtree RESOURCE_IN_USE count, and (c) the reparent guard's descendant-height walk.
-- Restricted to LIVE rows that actually carry a parent so it stays tiny — most resources are
-- top-level and are excluded — mirroring idx_activities_parent_id / idx_resources_calendar_id /
-- idx_calendars_project_id exactly. The predicate is on `parent_id IS NOT NULL`, which
-- PostgreSQL CAN prove from both `parent_id = ?` and `parent_id IN (…)`, so the index is usable
-- for every shape above. Deliberately SINGLE-COLUMN: a group holds tens of children, so the
-- list's (created_at, id) cursor sort is a trivial top-N; a (parent_id, created_at, id) tail is
-- the measure-first upgrade if a tenant ever nests thousands under one group. TOP-LEVEL rows
-- (`parent_id IS NULL`) get NO index of their own — they are the MAJORITY of the live table
-- (an index over them would be nearly the whole set: poor selectivity, pure write cost), and
-- resources_organization_id_created_at_id_idx already returns them pre-sorted in cursor order
-- with a cheap residual filter. The same composite serves the whole-library fetch unchanged.
CREATE INDEX "idx_resources_parent_id" ON "resources" ("parent_id") WHERE "deleted_at" IS NULL AND "parent_id" IS NOT NULL;

-- Down (forward-only in production; documented for completeness). Reversible in this order —
-- the index and CHECKs, then the FK, then the column:
--   DROP INDEX "idx_resources_parent_id";
--   ALTER TABLE "resources" DROP CONSTRAINT "ck_resources_group_no_scheduling_fields";
--   ALTER TABLE "resources" DROP CONSTRAINT "ck_resources_parent_not_self";
--   ALTER TABLE "resources" DROP CONSTRAINT "resources_parent_id_fkey";
--   ALTER TABLE "resources" DROP COLUMN "parent_id";
--   -- 'GROUP' stays on the ResourceKind enum (part 1; no in-place DROP VALUE).
