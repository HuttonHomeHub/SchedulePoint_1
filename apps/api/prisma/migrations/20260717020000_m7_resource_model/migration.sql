-- M7.1 Resource model + assignment: the resource dimension of the CPM engine
-- (Engine Conformance Framework, ADR-0034/0035 §23 + §25 / M7 rung 1, governed by
-- ADR-0039).
--
-- This slice is SCHEMA + validation foundation only — NO scheduling behaviour. It
-- introduces an org-scoped `resources` LIBRARY (a sibling of the calendar library,
-- not a hierarchy level), a `resource_assignments` join tying a resource to an
-- activity with a budgeted quantity + a driving flag, the `ResourceKind` enum, a new
-- `RESOURCE_DEPENDENT` `ActivityType` member, and the engine-owned
-- `resource_driver_missing` flag on `activities` (whose WRITER is the M7.2 rung-2
-- engine task, not this slice — it lands now so M7.2 needs no wide ALTER of the large
-- activities table).
--
-- Fully additive and byte-parity: with no `resources` / no `resource_assignments` /
-- no `RESOURCE_DEPENDENT` activity present, every prior golden + scenario recalculates
-- byte-identically (the ADR-0034/0037 parity gate). The two new columns on existing
-- tables are constant-DEFAULT / new-nullable so there is no data migration:
--   * `resource_driver_missing` is BOOLEAN NOT NULL DEFAULT false — every existing row
--     reads false; a NOT NULL column with a constant default is metadata-only in
--     Postgres 11+ (no table rewrite).
--   * `ALTER TYPE ... ADD VALUE` is a catalog-only insert (a new label appended to the
--     enum), not a table rewrite. Nothing in THIS migration references
--     'RESOURCE_DEPENDENT' (the value added by ADD VALUE cannot be *used* in the same
--     transaction, but no column/index/CHECK here uses it), so the ordering is safe.
--
-- Invariants the DB cannot express are SERVICE-enforced (recorded in ADR-0039), each
-- to be unit-tested when the resources module lands:
--   (a) same-org — a ResourceAssignment's activity + resource, and a Resource's
--       calendar, must be in the SAME org (the FKs scope only to their target table,
--       not to an org — the activities.calendar_id / activities.parent_id precedent).
--   (b) exactly ONE driving assignment on a RESOURCE_DEPENDENT activity — the partial
--       unique below guarantees the ≤1 half; "exactly one" and "a MATERIAL may not
--       drive" need the activity type / resource kind, which a CHECK/partial-unique
--       cannot read.
--   (c) RESOURCE_IN_USE delete guard — a resource assigned to an ACTIVE activity may
--       not be soft-deleted (mirrors CALENDAR_IN_USE); and the CALENDAR_IN_USE guard
--       must be EXTENDED to also count active resources referencing the calendar.
--   (d) soft-deleting an activity SHOULD sweep its active assignments (same
--       delete_batch_id), like the incident-dependency cascade in
--       HierarchyLifecycleService (a lifecycle follow-on).

-- CreateEnum: the resource kind. LABOUR / EQUIPMENT (the fixture's NONLABOUR) /
-- MATERIAL. MUST stay in lock-step with the `ResourceKind` union in @repo/types.
CREATE TYPE "ResourceKind" AS ENUM ('LABOUR', 'EQUIPMENT', 'MATERIAL');

-- AddEnumValue: the resource-dependent activity type (ADR-0035 §23). Standalone (see
-- header) — appended, so existing enum ordinals are unchanged. MUST stay in lock-step
-- with the `ActivityType` union in @repo/types.
ALTER TYPE "ActivityType" ADD VALUE 'RESOURCE_DEPENDENT';

-- AddColumn: engine-owned RESOURCE_DEPENDENT driver-missing produce-and-flag output
-- (ADR-0039 rung 2). Mirrors loe_no_span / constraint_violated exactly: NOT NULL
-- DEFAULT false, never accepted from a write DTO, written only by the M7.2 recalc's
-- batched UPDATE (never touching version/updated_at/updated_by, ADR-0022). Reads false
-- everywhere until M7.2, so the byte-parity golden path is unchanged.
ALTER TABLE "activities" ADD COLUMN "resource_driver_missing" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: the org-scoped resource library (a Calendar sibling). organization_id
-- is NATIVE; the lean field set (kind + optional own calendar) reserves availability/
-- cost/EV columns for their later rungs (ADR-0039).
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "kind" "ResourceKind" NOT NULL,
    "calendar_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable: the Activity ↔ Resource join. organization_id is DENORMALISED from the
-- endpoints (service-copied, never client input). budgeted_units is the schema's first
-- Decimal — DECIMAL(18,4), an exact numeric for an assigned quantity (hours, m³, te,
-- each); the ck_..._budgeted_units_nonneg CHECK backs the N14 boundary reject.
CREATE TABLE "resource_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "budgeted_units" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "is_driving" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "resource_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: full composite covering the org FK (leftmost prefix), the org-scoped
-- active-list query AND its (created_at, id) cursor sort — the Calendar/Client pattern.
CREATE INDEX "resources_organization_id_created_at_id_idx" ON "resources"("organization_id", "created_at", "id");

-- CreateIndex: full org index backing the FK (RESTRICT) + org-scoped IDOR loads.
CREATE INDEX "resource_assignments_organization_id_idx" ON "resource_assignments"("organization_id");

-- AddForeignKey: resources.organization_id → organizations (RESTRICT — never
-- hard-deleted; guards against orphaning). ON UPDATE CASCADE is Prisma's default.
ALTER TABLE "resources" ADD CONSTRAINT "resources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: resources.calendar_id → calendars (RESTRICT — the same posture as
-- plans.calendar_id / activities.calendar_id, ADR-0037). Nullable → inherit the plan
-- calendar. The FK does NOT enforce same-org; the service does (ADR-0039).
ALTER TABLE "resources" ADD CONSTRAINT "resources_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: resource_assignments.organization_id → organizations (RESTRICT).
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: resource_assignments.activity_id → activities (RESTRICT — assignments
-- soft-delete only; the service sweeps them with the activity, ADR-0039 (d)).
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: resource_assignments.resource_id → resources (RESTRICT — the
-- RESOURCE_IN_USE service guard is the real protection; RESTRICT is defence in depth).
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma cannot express CHECK; docs/DATABASE.md: enforce
-- invariants in the DB, not only in code). budgeted_units may never be negative — the
-- DB backstop behind the DTO @Min(0) boundary reject (N14, ADR-0035 §25), guaranteeing
-- the invariant even if a future code path or direct SQL bypasses the DTO.
ALTER TABLE "resource_assignments" ADD CONSTRAINT "ck_resource_assignments_budgeted_units_nonneg" CHECK ("budgeted_units" >= 0);

-- Partial unique index (Prisma cannot express `WHERE ...`). Resource name is unique
-- per org among ACTIVE rows; a soft-deleted name is free to reuse. Backs the create
-- DUPLICATE_RESOURCE (409) check (the uq_calendars_org_name pattern).
CREATE UNIQUE INDEX "uq_resources_org_name" ON "resources" ("organization_id", "name") WHERE "deleted_at" IS NULL;

-- Partial unique index. Optional short `code` is unique per org among ACTIVE rows
-- where set; NULL codes are exempt (a natural-key handle — mirrors
-- uq_activities_plan_code exactly).
CREATE UNIQUE INDEX "uq_resources_org_code" ON "resources" ("organization_id", "code") WHERE "deleted_at" IS NULL AND "code" IS NOT NULL;

-- Partial index. Backs the (extended) CALENDAR_IN_USE guard's active-resource count
-- (`WHERE calendar_id = ? AND deleted_at IS NULL`) and the M7.2 driving-calendar load.
-- Restricted to LIVE rows that carry a calendar so it stays tiny — the twin of
-- idx_plans_calendar_id / idx_activities_calendar_id. (It does not back the FK RESTRICT
-- referential check, which scans all referencing rows incl. soft-deleted — but
-- calendars soft-delete only, so that check never fires; the service guard is real.)
CREATE INDEX "idx_resources_calendar_id" ON "resources" ("calendar_id") WHERE "deleted_at" IS NULL AND "calendar_id" IS NOT NULL;

-- Partial index for batch restore (set only on rows soft-deleted together).
CREATE INDEX "idx_resources_delete_batch_id" ON "resources" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Partial unique index. At most ONE ACTIVE assignment per (activity, resource); a
-- soft-deleted assignment frees the pair for reuse. Backs the create
-- DUPLICATE_ASSIGNMENT (409) check. Its leftmost prefix (activity_id) ALSO serves the
-- "load an activity's active assignments" query, so no standalone activity_id index is
-- added (the composite subsumes it).
CREATE UNIQUE INDEX "uq_resource_assignments_activity_resource" ON "resource_assignments" ("activity_id", "resource_id") WHERE "deleted_at" IS NULL;

-- Partial unique index. Guarantees at most ONE driving assignment per activity in the
-- DB (the ≤1 half of the "exactly one driver on a resource-dependent activity"
-- invariant; the "exactly one" + "MATERIAL may not drive" halves are service-enforced).
-- It is ALSO the recalc "find THE driving assignment of this activity" load
-- (`WHERE activity_id = ? AND is_driving AND deleted_at IS NULL`).
CREATE UNIQUE INDEX "uq_resource_assignments_activity_driving" ON "resource_assignments" ("activity_id") WHERE "is_driving" AND "deleted_at" IS NULL;

-- Partial index. Backs the RESOURCE_IN_USE delete guard's active-assignment count
-- (`WHERE resource_id = ? AND deleted_at IS NULL`) — the analogue of
-- idx_resources_calendar_id for the resource → assignment direction.
CREATE INDEX "idx_resource_assignments_resource_id" ON "resource_assignments" ("resource_id") WHERE "deleted_at" IS NULL;

-- Partial index for batch restore (set only on rows soft-deleted together with the
-- activity that owns them).
CREATE INDEX "idx_resource_assignments_delete_batch_id" ON "resource_assignments" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Down (forward-only in prod; documented for completeness). Reversible in this order —
-- drop the tables (which drops their FKs, CHECK, and indexes) and the new column, then
-- the new type; the 'RESOURCE_DEPENDENT' enum value cannot be dropped in place
-- (Postgres has no DROP VALUE — a compensating migration would recreate the type), but
-- a spare unused label is harmless:
--   DROP TABLE "resource_assignments";
--   DROP TABLE "resources";
--   ALTER TABLE "activities" DROP COLUMN "resource_driver_missing";
--   DROP TYPE "ResourceKind";
--   -- 'RESOURCE_DEPENDENT' stays on the ActivityType enum (no in-place DROP VALUE).
