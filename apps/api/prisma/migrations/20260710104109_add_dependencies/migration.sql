-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateTable
CREATE TABLE "dependencies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "predecessor_id" UUID NOT NULL,
    "successor_id" UUID NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lag_days" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dependencies_plan_id_created_at_id_idx" ON "dependencies"("plan_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "dependencies_predecessor_id_idx" ON "dependencies"("predecessor_id");

-- CreateIndex
CREATE INDEX "dependencies_successor_id_idx" ON "dependencies"("successor_id");

-- CreateIndex
CREATE INDEX "dependencies_organization_id_idx" ON "dependencies"("organization_id");

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (docs/DATABASE.md: enforce domain invariants in the DB, not only
-- in code). Prisma cannot express CHECK, so they are raw SQL.
--
-- Defence-in-depth against a self-loop: an activity can never depend on itself. The
-- service also rejects pred == succ with a 422 (SELF_DEPENDENCY) before any write, but
-- this guarantees a self-edge — the trivial 1-node cycle — can never persist even if a
-- future code path or direct SQL bypasses the service.
ALTER TABLE "dependencies" ADD CONSTRAINT "ck_dependencies_no_self_loop" CHECK ("predecessor_id" <> "successor_id");

-- lag_days is a signed working-day lag (negative = lead), bounded to a sane range that
-- matches the CreateDependencyDto bound (−3650…3650 ≈ ±10 years). Keeps a typo/overflow
-- from corrupting the (future) CPM forward/backward pass.
ALTER TABLE "dependencies" ADD CONSTRAINT "ck_dependencies_lag_days_range" CHECK ("lag_days" BETWEEN -3650 AND 3650);

-- Partial unique index (Prisma cannot express `WHERE deleted_at IS NULL`).
-- At most one ACTIVE link of each type between a given ordered (predecessor, successor)
-- pair: a pair may hold up to four distinct-typed links (the SS+FF overlap "ladder"
-- idiomatic to construction/linear scheduling) but never two of the same type. Backs the
-- create DUPLICATE_DEPENDENCY (409) check; a soft-deleted link frees its triple for reuse.
CREATE UNIQUE INDEX "uq_dependencies_pred_succ_type" ON "dependencies" ("predecessor_id", "successor_id", "type") WHERE "deleted_at" IS NULL;

-- Partial index for batch restore (Prisma cannot express `WHERE ... IS NOT NULL`).
-- delete_batch_id is set only on links soft-deleted together in one operation (a link
-- deleted on its own, or an activity/plan/project/client cascade stamping its incident/
-- contained links); a partial index keeps it tiny while making restore-by-batch an index
-- lookup instead of a table scan. See docs/DATABASE.md (link soft-delete/cascade is
-- service-owned — HierarchyLifecycleService, task A3).
CREATE INDEX "idx_dependencies_delete_batch_id" ON "dependencies" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;
