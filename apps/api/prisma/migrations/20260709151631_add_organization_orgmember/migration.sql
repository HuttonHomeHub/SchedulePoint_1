-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('VIEWER', 'CONTRIBUTOR', 'PLANNER', 'ORG_ADMIN');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_members_organization_id_role_idx" ON "org_members"("organization_id", "role");

-- CreateIndex
CREATE INDEX "org_members_user_id_idx" ON "org_members"("user_id");

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique indexes (Prisma cannot express `WHERE deleted_at IS NULL`).
-- Slug is unique per deployment among live organisations; a soft-deleted org
-- releases its slug. A user is an active member of an org at most once; a
-- soft-deleted membership can be re-created.
CREATE UNIQUE INDEX "uq_organizations_slug" ON "organizations" ("slug") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_org_members_org_user" ON "org_members" ("organization_id", "user_id") WHERE "deleted_at" IS NULL;
