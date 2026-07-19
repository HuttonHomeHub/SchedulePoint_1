-- M1 Notes — the polymorphic `notes` table (ADR-0046): threaded, attributed,
-- time-ordered annotations on plans & activities (a "weekly progress journey"),
-- extensible to client/project with no rework. See docs/DATABASE.md "Notes" and
-- docs/adr/0046-polymorphic-entity-notes.md.
--
-- POLYMORPHIC SINGLE TABLE. One `notes` table serves every entity type via an
-- `entity_type` discriminator + nullable typed parent FKs, with a CHECK
-- (ck_notes_exactly_one_parent) pinning the parent pointer to entity_type. v1 hangs
-- off PLAN + ACTIVITY; CLIENT + PROJECT drop in later as `ALTER TYPE … ADD VALUE` +
-- nullable client_id/project_id columns + a one-branch CHECK amendment + one extra
-- cascade sweep — the locked "no rework" requirement (over per-entity tables).
--
-- NON-SCHEDULING. A note is NOT a CPM input: the engine (`compute.ts`) never reads it,
-- the recalc write path is untouched, and note writes are NOT pen-gated (ADR-0028). So
-- this migration is fully additive and byte-parity — a catalog-only enum + table create,
-- no rewrite of any existing table, every prior golden/scenario recalculates identically.
--
-- A FULL reference-template row, modelled exactly like activity_steps /
-- resource_assignments: UUID v7 PK, snake_case columns, timestamptz UTC, soft delete +
-- delete_batch_id, TEXT audit ids (Better Auth ids are opaque TEXT — `created_by` IS the
-- author), optimistic-locking `version`, scoped indexes. TWO denormalised scope columns,
-- both service-copied from the resolved parent inside the create transaction (NEVER
-- client input; the Activity/ActivityDependency invariant):
--   * organization_id — the tenant scope tag every org-scope/IDOR check filters.
--   * plan_id — the CASCADE key on EVERY note. A PLAN note's parent IS this plan; an
--     ACTIVITY note carries its activity's plan_id (denormalised) so the plan-cascade
--     sweep is ONE `updateMany WHERE plan_id IN (…)` catching BOTH kinds with no
--     double-count (Task 1.4). plan_id doubles as the PLAN-note parent pointer (the
--     Activity precedent: plan_id is an Activity's parent AND its scope). It is NOT NULL
--     for both v1 types; it becomes NULLABLE (a safe expand-only ALTER) only when a
--     parent-less CLIENT/PROJECT note lands.
--
-- CHECKs (raw SQL — Prisma cannot express CHECK; docs/DATABASE.md: enforce invariants in
-- the DB, not only in code):
--   * ck_notes_exactly_one_parent — the exactly-one-parent invariant, written as a CASE
--     on entity_type with `ELSE false` so a future enum value inserted BEFORE its CHECK
--     branch is added FAILS CLOSED (a fail-loud reminder to amend the CHECK), never
--     silently unenforced. PLAN ⇒ activity_id NULL (parent = plan_id); ACTIVITY ⇒
--     activity_id NOT NULL (parent = activity_id); plan_id NOT NULL in both (parent +
--     scope). Adding CLIENT/PROJECT later is a bounded amendment: two WHEN branches +
--     asserting the reserved columns NULL on the existing branches.
--   * ck_notes_body_length — body is 1–5000 chars (Q1 default), the DB backstop behind
--     the DTO @MinLength(1)@MaxLength(5000) 422. The service trims-then-validates
--     (whitespace-only ⇒ 422); the CHECK guards the length bounds only (it cannot trim).
--
-- INDEXES. Two Prisma-expressible + three raw-SQL partials (Prisma cannot express a WHERE
-- predicate). Justified in docs/DATABASE.md; see that table for the full rationale.

-- CreateEnum: the polymorphic discriminator. v1 = PLAN + ACTIVITY; CLIENT/PROJECT are a
-- later non-breaking `ALTER TYPE "NoteEntityType" ADD VALUE …`.
CREATE TYPE "NoteEntityType" AS ENUM ('PLAN', 'ACTIVITY');

-- CreateTable: one authored, timestamped thread entry. organization_id + plan_id are
-- DENORMALISED from the parent; activity_id is the ACTIVITY-note parent (NULL for PLAN
-- notes). body is TEXT (bounded 1–5000 by ck_notes_body_length below).
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entity_type" "NoteEntityType" NOT NULL,
    "plan_id" UUID NOT NULL,
    "activity_id" UUID,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: FULL composite (plan_id, created_at, id) — the activities_plan_id_created
-- _at_id_idx pattern. Backs the plan_id FK (RESTRICT, leftmost prefix), the PLAN-notes
-- thread list + its newest-first cursor (the query filters entity_type='PLAN' AND
-- deleted_at IS NULL on top; ORDER BY created_at DESC, id DESC is a backward index scan),
-- AND the plan cascade sweep by plan_id. Full (not partial) like every sibling scope
-- composite; subsumes a standalone plan_id index.
CREATE INDEX "notes_plan_id_created_at_id_idx" ON "notes"("plan_id", "created_at", "id");

-- CreateIndex: org FK (RESTRICT) + org-scoped IDOR loads (the denormalised-org sibling
-- pattern; notes are never listed org-wide, so no composite here).
CREATE INDEX "notes_organization_id_idx" ON "notes"("organization_id");

-- AddForeignKey: notes.organization_id → organizations (RESTRICT — never hard-deleted;
-- guards against orphaning). ON UPDATE CASCADE is Prisma's default.
ALTER TABLE "notes" ADD CONSTRAINT "notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: notes.plan_id → plans (RESTRICT — notes soft-delete only; the service
-- sweeps them with the plan under one delete_batch_id, Task 1.4). RESTRICT is defence in
-- depth (the referential check never fires because we never hard-delete).
ALTER TABLE "notes" ADD CONSTRAINT "notes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: notes.activity_id → activities (RESTRICT — the ACTIVITY-note parent;
-- NULL for PLAN notes). Notes soft-delete only; a single-activity delete sweeps its
-- notes by activity_id under the same batch (Task 1.4). RESTRICT is defence in depth.
ALTER TABLE "notes" ADD CONSTRAINT "notes_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma cannot express CHECK). The exactly-one-parent
-- invariant, authoritative for all four future entity types. CASE on entity_type with
-- `ELSE false` ⇒ FAIL CLOSED: a future enum value inserted before its branch is added is
-- rejected (a fail-loud reminder to amend this CHECK), never silently unenforced.
--   PLAN     ⇒ parent = plan_id (set); no activity.
--   ACTIVITY ⇒ parent = activity_id (set); plan_id set as the denormalised cascade scope.
-- Adding CLIENT/PROJECT later: add two WHEN branches (each asserting its own FK set and
-- the others NULL) and assert client_id/project_id IS NULL on the PLAN/ACTIVITY branches
-- — the "one-line-per-type amendment" the model is designed for.
ALTER TABLE "notes" ADD CONSTRAINT "ck_notes_exactly_one_parent" CHECK (
    CASE "entity_type"
        WHEN 'PLAN' THEN "plan_id" IS NOT NULL AND "activity_id" IS NULL
        WHEN 'ACTIVITY' THEN "activity_id" IS NOT NULL AND "plan_id" IS NOT NULL
        ELSE false
    END
);

-- CheckConstraint (raw SQL). body is 1–5000 chars (Q1 default) — the DB backstop behind
-- the DTO @MinLength(1)@MaxLength(5000) 422. Guards the length bounds only; the service
-- trims-then-rejects whitespace-only bodies (it cannot trim in a CHECK).
ALTER TABLE "notes" ADD CONSTRAINT "ck_notes_body_length" CHECK (char_length("body") >= 1 AND char_length("body") <= 5000);

-- Partial index (Prisma cannot express `WHERE …`). The ACTIVITY-notes thread list + its
-- newest-first cursor (`WHERE activity_id = ? AND deleted_at IS NULL ORDER BY created_at
-- DESC, id DESC` — a backward index scan). Partial on `deleted_at IS NULL` (active only)
-- AND `activity_id IS NOT NULL` (excludes PLAN notes, whose activity_id is NULL) keeps it
-- tight — the uq_activities_plan_code `AND code IS NOT NULL` precedent. The activity_id FK
-- RESTRICT would want an all-rows index, but notes soft-delete only so it never fires.
CREATE INDEX "idx_notes_activity_created" ON "notes" ("activity_id", "created_at", "id") WHERE "deleted_at" IS NULL AND "activity_id" IS NOT NULL;

-- Partial index (Prisma cannot express `WHERE …`). The badge note-counts endpoint:
-- `SELECT activity_id, COUNT(*) WHERE plan_id = ? AND entity_type = 'ACTIVITY' AND
-- deleted_at IS NULL GROUP BY activity_id` — plan_id leads (filter), activity_id follows
-- (the group key), so one plan resolves via a grouped index scan (no N+1 per row). Partial
-- on active ACTIVITY notes only — the time-ordered composite above does not serve this
-- distinct grouped query.
CREATE INDEX "idx_notes_plan_activity_counts" ON "notes" ("plan_id", "activity_id") WHERE "deleted_at" IS NULL AND "entity_type" = 'ACTIVITY';

-- Partial index (Prisma cannot express `WHERE …`) for batch restore (set only on rows
-- soft-deleted together with their parent). Tiny — only soft-deleted rows carry a value;
-- the delete_batch_id sibling precedent.
CREATE INDEX "idx_notes_delete_batch_id" ON "notes" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Down (forward-only in prod; documented for completeness). Reversible — drop the table
-- (which drops its FKs, CHECKs, and indexes) then the enum:
--   DROP TABLE "notes";
--   DROP TYPE "NoteEntityType";
