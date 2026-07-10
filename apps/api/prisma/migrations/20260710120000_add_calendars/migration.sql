-- CreateTable
CREATE TABLE "calendars" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "working_weekdays" SMALLINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_exceptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_working" BOOLEAN NOT NULL,
    "label" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "calendar_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendars_organization_id_created_at_id_idx" ON "calendars"("organization_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "calendar_exceptions_calendar_id_date_idx" ON "calendar_exceptions"("calendar_id", "date");

-- CreateIndex
CREATE INDEX "calendar_exceptions_organization_id_idx" ON "calendar_exceptions"("organization_id");

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraint (docs/DATABASE.md: enforce domain invariants in the DB, not only
-- in code). Prisma cannot express CHECK, so it is raw SQL.
--
-- working_weekdays is a 7-bit weekday mask (bit 0 = Monday … bit 6 = Sunday). It must
-- be non-zero (a pattern with no working weekday would make the engine's addWorkingDays
-- non-terminating — mirrored by the factory throwing on 0) and at most 127 (no bits
-- outside the 7-day week). This guarantees the invariant even if a future code path or
-- direct SQL bypasses the DTO/factory validation.
ALTER TABLE "calendars" ADD CONSTRAINT "ck_calendars_working_weekdays_range" CHECK ("working_weekdays" > 0 AND "working_weekdays" <= 127);

-- Partial unique index (Prisma cannot express `WHERE deleted_at IS NULL`).
-- Calendar name is unique per organisation among ACTIVE rows; a soft-deleted name is
-- free to reuse. Backs the create DUPLICATE_CALENDAR (409) check.
CREATE UNIQUE INDEX "uq_calendars_org_name" ON "calendars" ("organization_id", "name") WHERE "deleted_at" IS NULL;

-- Partial unique index (Prisma cannot express `WHERE deleted_at IS NULL`).
-- At most one ACTIVE exception per (calendar, date): a day cannot be both a holiday and
-- a worked day, and a soft-deleted exception frees its (calendar, date) for reuse. This
-- active-row index on (calendar_id, date) is also exactly the engine's active-exception
-- load (WHERE calendar_id = ? AND deleted_at IS NULL ORDER BY date). Backs the add
-- DUPLICATE_EXCEPTION (409) check.
CREATE UNIQUE INDEX "uq_calendar_exceptions_cal_date" ON "calendar_exceptions" ("calendar_id", "date") WHERE "deleted_at" IS NULL;

-- Partial indexes for batch restore (Prisma cannot express `WHERE ... IS NOT NULL`).
-- delete_batch_id is set only on rows soft-deleted together in one operation (a calendar
-- and its exceptions cascade-stamped with the same batch id); a partial index keeps it
-- tiny while making restore-by-batch an index lookup instead of a table scan. See
-- docs/DATABASE.md (soft-delete/cascade is service-owned — HierarchyLifecycleService).
CREATE INDEX "idx_calendars_delete_batch_id" ON "calendars" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_calendar_exceptions_delete_batch_id" ON "calendar_exceptions" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;
