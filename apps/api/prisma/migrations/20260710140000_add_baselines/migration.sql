-- CreateTable
CREATE TABLE "baselines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_date" DATE,
    "captured_project_finish" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baseline_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "baseline_id" UUID NOT NULL,
    "source_activity_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL DEFAULT 'TASK',
    "duration_days" INTEGER NOT NULL,
    "baseline_start" DATE,
    "baseline_finish" DATE,
    "late_start" DATE,
    "late_finish" DATE,
    "total_float" INTEGER,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "baseline_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "baselines_plan_id_created_at_id_idx" ON "baselines"("plan_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "baselines_organization_id_idx" ON "baselines"("organization_id");

-- CreateIndex
CREATE INDEX "baseline_activities_baseline_id_source_activity_id_idx" ON "baseline_activities"("baseline_id", "source_activity_id");

-- CreateIndex
CREATE INDEX "baseline_activities_organization_id_idx" ON "baseline_activities"("organization_id");

-- AddForeignKey
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baseline_activities" ADD CONSTRAINT "baseline_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baseline_activities" ADD CONSTRAINT "baseline_activities_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique index (Prisma cannot express `WHERE ...`). AT MOST ONE active
-- baseline per plan — the comparison baseline (ADR-0025). The WHERE clause ignores
-- both inactive AND soft-deleted rows, so a plan may hold many baselines with only
-- one active, and activate flips it atomically under the plan write-lock (the index
-- is the concurrency backstop).
CREATE UNIQUE INDEX "uq_baselines_plan_active" ON "baselines" ("plan_id") WHERE "is_active" = true AND "deleted_at" IS NULL;

-- Partial unique index (Prisma cannot express `WHERE deleted_at IS NULL`).
-- Baseline name is unique per plan among ACTIVE rows; a soft-deleted name is free to
-- reuse. Backs the capture DUPLICATE_BASELINE (409) check.
CREATE UNIQUE INDEX "uq_baselines_plan_name" ON "baselines" ("plan_id", "name") WHERE "deleted_at" IS NULL;

-- Partial indexes for batch restore (Prisma cannot express `WHERE ... IS NOT NULL`).
-- delete_batch_id is set only on rows soft-deleted together in one operation (a
-- baseline and its snapshot rows cascade-stamped with the same batch id, and again
-- when a plan/project/client delete cascades to them); a partial index keeps it tiny
-- while making restore-by-batch an index lookup. See docs/DATABASE.md (soft-delete /
-- cascade is service-owned — HierarchyLifecycleService).
CREATE INDEX "idx_baselines_delete_batch_id" ON "baselines" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_baseline_activities_delete_batch_id" ON "baseline_activities" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;
