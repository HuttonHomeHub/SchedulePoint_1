-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "planned_start" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_organization_id_created_at_id_idx" ON "clients"("organization_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "projects_client_id_created_at_id_idx" ON "projects"("client_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

-- CreateIndex
CREATE INDEX "plans_project_id_created_at_id_idx" ON "plans"("project_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "plans_organization_id_idx" ON "plans"("organization_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique indexes (Prisma cannot express `WHERE deleted_at IS NULL`).
-- Names are unique among LIVE rows only, scoped to the immediate parent: a client
-- name is unique per organisation, a project name per client, a plan name per
-- project. Soft-deleting a row frees its name for reuse, and the same name may
-- exist under a different parent. These back the create/rename NAME_TAKEN (409)
-- check and also serve name lookups (which always filter deleted_at IS NULL).
CREATE UNIQUE INDEX "uq_clients_org_name" ON "clients" ("organization_id", "name") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_projects_client_name" ON "projects" ("client_id", "name") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_plans_project_name" ON "plans" ("project_id", "name") WHERE "deleted_at" IS NULL;

-- Partial indexes for batch restore (Prisma cannot express `WHERE ... IS NOT NULL`).
-- delete_batch_id is set only on the (few) rows soft-deleted together in one
-- operation; a partial index keeps it tiny while making "fetch every row in this
-- batch" (the restore query) an index lookup instead of a table scan.
CREATE INDEX "idx_clients_delete_batch_id" ON "clients" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

CREATE INDEX "idx_projects_delete_batch_id" ON "projects" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

CREATE INDEX "idx_plans_delete_batch_id" ON "plans" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;
