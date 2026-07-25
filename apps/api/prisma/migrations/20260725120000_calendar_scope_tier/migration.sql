-- M1 Calendar scope tier: the P6-style PROJECT calendar tier (ADR-0053 §1, epic
-- "Library scoping & manageability", Task 1.2). See docs/DATABASE.md "Calendar &
-- CalendarException" and docs/specs/library-scoping-and-manageability/.
--
-- MODEL. A calendar gains a TIER: an enum discriminator (`scope`) plus a nullable typed
-- parent FK (`project_id`), kept in agreement by a FAIL-CLOSED `CASE … ELSE false` CHECK —
-- the ADR-0046 `notes` precedent (entity_type + nullable typed parent FKs +
-- ck_notes_exactly_one_parent). The redundancy the pair could suffer is exactly what the
-- CHECK removes, and a future third tier (CLIENT) is REJECTED until this CHECK and the
-- per-tier uniques are amended, rather than defaulting silently.
--
-- ADDITIVE, NO DATA MIGRATION. `scope` has a constant DEFAULT 'ORG' and `project_id` is
-- nullable with no default, so every existing row reads (ORG, NULL) — today's only tier and
-- today's exact behaviour. Both satisfy the CHECK. The unique-index swap is a strict WIDENING
-- for existing data: with every row at scope='ORG', `WHERE deleted_at IS NULL AND
-- scope = 'ORG'` selects exactly the rows the old predicate did, so the rebuild cannot fail
-- on data the old index already accepted.
--
-- NON-SCHEDULING / BYTE-PARITY. The CPM engine loads a calendar BY ID (the
-- WorkingTimeCalendar port) and never receives `scope` or `project_id`; `computeSchedule`'s
-- signature is unchanged. The ADR-0034 golden + scenario suite is structurally untouched.
--
-- LOCKS. Every statement is metadata-only or a scan of a small library table; the whole file
-- runs in ONE transaction (Prisma Migrate wraps a migration file on PostgreSQL), so the
-- drop/recreate of uq_calendars_org_name is ATOMIC — there is no window in which calendar-name
-- uniqueness is unenforced, and no CONCURRENTLY variant is possible (CREATE INDEX CONCURRENTLY
-- cannot run inside a transaction block). That matches the house precedent: the repo uses no
-- CONCURRENTLY anywhere, and 20260715120100_calendar_shift_model already replaced live
-- calendar-exception indexes inline.

-- CreateEnum: the calendar tier discriminator (ADR-0053 §1). MUST stay in lock-step with the
-- TypeScript `CalendarScope` union in @repo/types. CREATE TYPE is fully transactional and the
-- type is usable immediately in the same transaction (unlike `ALTER TYPE … ADD VALUE`), so the
-- ADD COLUMN below may follow directly.
CREATE TYPE "CalendarScope" AS ENUM ('ORG', 'PROJECT');

-- AddColumn: the tier. Constant DEFAULT 'ORG' ⇒ on PostgreSQL 11+ this is a METADATA-ONLY
-- change (the default is stashed in pg_attribute.attmissingval — NO table rewrite, NO full
-- scan; a brief ACCESS EXCLUSIVE for the catalog update), and it gives every existing row the
-- behaviour-preserving ORG tier. Same posture as m6_plan_float_options /
-- add_scheduling_modes_columns.
ALTER TABLE "calendars" ADD COLUMN "scope" "CalendarScope" NOT NULL DEFAULT 'ORG';

-- AddColumn: the owning project of a PROJECT-scoped calendar; NULL for an ORG one. Nullable
-- with no default ⇒ metadata-only (no rewrite, no scan), and every existing row reads NULL.
ALTER TABLE "calendars" ADD COLUMN "project_id" UUID;

-- AddForeignKey (ON DELETE RESTRICT — every hierarchy child; ON UPDATE CASCADE is Prisma's
-- default, written explicitly so `prisma migrate diff` sees no drift). Calendars soft-delete
-- only, so this referential check never actually fires; the real delete path is the
-- service-owned project cascade (Task 1.8), which stamps a project's calendars and their
-- exceptions with the project's delete_batch_id. RESTRICT is defence in depth against an
-- accidental hard delete orphaning a calendar. The FK scopes only to `projects` — it does NOT
-- enforce same-ORG (a cross-org project_id would satisfy it), exactly like activities.calendar_id
-- and activities.parent_id, so the "active AND in this org" check stays in the service (and is
-- covered by its own reject-path tests).
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma cannot express CHECK; docs/DATABASE.md: enforce invariants
-- in the DB, not only in code). Fail-closed agreement between the discriminator and the FK,
-- written as a CASE on `scope` with `ELSE false` so a future enum member added BEFORE its branch
-- lands is REJECTED (a fail-loud reminder to amend this CHECK), never silently unenforced — the
-- ck_notes_exactly_one_parent precedent.
--   ORG     ⇒ the shared org library: no owning project.
--   PROJECT ⇒ local to exactly one project: project_id set.
-- Adding a CLIENT tier later is a bounded amendment: one WHEN branch (asserting its own FK set
-- and the others NULL) + `client_id IS NULL` on these two branches + a third per-tier unique.
-- Because this is a ROW constraint evaluated at statement end, a promote/narrow MUST set both
-- columns in a SINGLE UPDATE (see CalendarRepository.updateIfVersionMatches).
ALTER TABLE "calendars" ADD CONSTRAINT "ck_calendars_scope_parent" CHECK (
    CASE "scope"
        WHEN 'ORG' THEN "project_id" IS NULL
        WHEN 'PROJECT' THEN "project_id" IS NOT NULL
        ELSE false
    END
);

-- Per-tier name uniqueness. The old org-wide partial unique is DROPPED and recreated NARROWED
-- to the ORG tier, and a PROJECT-tier twin is added. Atomic (one transaction): uniqueness is
-- never unenforced, and a duplicate cannot slip in between the two statements. For existing
-- (all-ORG) rows the new ORG predicate is semantically IDENTICAL to the old one — a strict
-- widening, so the rebuild cannot fail on data the old index already accepted. DROP INDEX takes
-- a brief ACCESS EXCLUSIVE; CREATE UNIQUE INDEX takes SHARE (blocks writes, allows reads).
-- Predicates are keyed on `scope`, NOT on `project_id IS NULL/NOT NULL`: the tier is the rule
-- being expressed, so a future CLIENT tier gets its OWN name index instead of silently sharing
-- (and colliding in) the ORG namespace — the same fail-closed extensibility the CHECK buys.
-- A name may be reused ACROSS tiers by design (ADR-0053 §1): a project may hold its own
-- "Standard" beside the organisation's, and the UI disambiguates with a tier badge.
DROP INDEX "uq_calendars_org_name";
CREATE UNIQUE INDEX "uq_calendars_org_name" ON "calendars" ("organization_id", "name") WHERE "deleted_at" IS NULL AND "scope" = 'ORG';
CREATE UNIQUE INDEX "uq_calendars_project_name" ON "calendars" ("project_id", "name") WHERE "deleted_at" IS NULL AND "scope" = 'PROJECT';

-- Partial index (Prisma cannot express `WHERE …`). Backs (a) the PROJECT-DELETE CASCADE sweep
-- `WHERE project_id = ? AND deleted_at IS NULL` — both the id pre-select (to sweep those
-- calendars' exceptions) and the updateMany — and (b) the project_id FK as defence in depth.
-- Without it that sweep is a SEQUENTIAL SCAN of the whole global `calendars` table on every
-- project delete. Restricted to LIVE rows that actually carry a project so it stays tiny (an ORG
-- calendar has project_id NULL and is excluded) — mirroring idx_plans_calendar_id /
-- idx_activities_calendar_id / idx_resources_calendar_id / idx_activities_parent_id exactly.
-- Deliberately SINGLE-COLUMN and predicated on `project_id IS NOT NULL`, not `scope = 'PROJECT'`:
-- PostgreSQL can prove `project_id = ? ⇒ project_id IS NOT NULL` but CANNOT prove
-- `project_id = ? ⇒ scope = 'PROJECT'`, so uq_calendars_project_name (whose leftmost prefix is
-- project_id) does NOT serve the scope-free cascade sweep. No (created_at, id) tail: M1 has no
-- "this project's own calendars, cursor-ordered" query — the project-usable list is an OR over
-- the org composite, which already returns rows in cursor order.
CREATE INDEX "idx_calendars_project_id" ON "calendars" ("project_id") WHERE "deleted_at" IS NULL AND "project_id" IS NOT NULL;

-- Down (forward-only in prod; documented for completeness). Reversible in this order — the
-- indexes and constraints, then the columns, then the type; the org unique is restored to its
-- pre-M1 predicate (a widening back, safe only while no PROJECT-tier duplicate exists, which is
-- true iff no project calendar was ever created):
--   DROP INDEX "idx_calendars_project_id";
--   DROP INDEX "uq_calendars_project_name";
--   DROP INDEX "uq_calendars_org_name";
--   CREATE UNIQUE INDEX "uq_calendars_org_name" ON "calendars" ("organization_id", "name") WHERE "deleted_at" IS NULL;
--   ALTER TABLE "calendars" DROP CONSTRAINT "ck_calendars_scope_parent";
--   ALTER TABLE "calendars" DROP CONSTRAINT "calendars_project_id_fkey";
--   ALTER TABLE "calendars" DROP COLUMN "project_id";
--   ALTER TABLE "calendars" DROP COLUMN "scope";
--   DROP TYPE "CalendarScope";
