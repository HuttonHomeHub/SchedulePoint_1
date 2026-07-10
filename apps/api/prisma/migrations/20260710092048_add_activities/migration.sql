-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('TASK', 'START_MILESTONE', 'FINISH_MILESTONE', 'HAMMOCK', 'LEVEL_OF_EFFORT');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ConstraintType" AS ENUM ('SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO', 'MANDATORY_START', 'MANDATORY_FINISH');

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ActivityType" NOT NULL DEFAULT 'TASK',
    "duration_days" INTEGER NOT NULL DEFAULT 1,
    "calendar_id" UUID,
    "constraint_type" "ConstraintType",
    "constraint_date" DATE,
    "lane_index" INTEGER NOT NULL DEFAULT 0,
    "status" "ActivityStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "percent_complete" INTEGER NOT NULL DEFAULT 0,
    "actual_start" DATE,
    "actual_finish" DATE,
    "early_start" DATE,
    "early_finish" DATE,
    "late_start" DATE,
    "late_finish" DATE,
    "total_float" INTEGER,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "is_near_critical" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_plan_id_created_at_id_idx" ON "activities"("plan_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "activities_organization_id_idx" ON "activities"("organization_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints for the bounded numerics (docs/DATABASE.md: enforce domain
-- invariants in the DB, not only in code). Prisma cannot express CHECK, so they
-- are raw SQL. total_float is intentionally unconstrained (negative float is valid).
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_percent_complete" CHECK ("percent_complete" BETWEEN 0 AND 100);
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_duration_days_nonneg" CHECK ("duration_days" >= 0);
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_lane_index_nonneg" CHECK ("lane_index" >= 0);

-- A schedule constraint is meaningless without both its type and its date, so the
-- two are set together or not at all. The service enforces this, but the DB
-- guarantees it as defence-in-depth against any future code path (or direct SQL)
-- that bypasses the DTO/service layer — a half-set constraint would silently
-- corrupt CPM scheduling. NULL = NULL is UNKNOWN in SQL, so compare the IS NULL flags.
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_constraint_pair" CHECK (("constraint_type" IS NULL) = ("constraint_date" IS NULL));

-- Partial unique indexes (Prisma cannot express `WHERE deleted_at IS NULL`).
-- An activity's name — and, when present, its human-facing code — is unique per
-- PLAN among LIVE rows only. Soft-deleting a row frees its name/code for reuse.
-- These back the create/rename NAME_TAKEN (409) check and serve name/code lookups
-- (which always filter deleted_at IS NULL). `code` is optional, so its uniqueness
-- also excludes NULLs (many activities may have no code).
CREATE UNIQUE INDEX "uq_activities_plan_name" ON "activities" ("plan_id", "name") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "uq_activities_plan_code" ON "activities" ("plan_id", "code") WHERE "deleted_at" IS NULL AND "code" IS NOT NULL;

-- Partial index for batch restore (Prisma cannot express `WHERE ... IS NOT NULL`).
-- delete_batch_id is set only on the rows soft-deleted together in one operation
-- (an activity deleted on its own, or the whole plan/project/client subtree); a
-- partial index keeps it tiny while making the restore-by-batch query an index
-- lookup instead of a table scan.
CREATE INDEX "idx_activities_delete_batch_id" ON "activities" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;
