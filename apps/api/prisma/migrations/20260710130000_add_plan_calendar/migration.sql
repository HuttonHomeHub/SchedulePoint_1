-- AlterTable
ALTER TABLE "plans" ADD COLUMN "calendar_id" UUID;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial index (Prisma cannot express `WHERE ...`). Serves the delete-in-use guard,
-- which counts ACTIVE plans referencing a calendar (`WHERE calendar_id = ? AND
-- deleted_at IS NULL`) before allowing a calendar delete. Restricted to rows that
-- actually reference a calendar so it stays small. (It does not back the FK RESTRICT
-- referential check, which scans all referencing rows — but calendars are soft-deleted
-- only, so that check never fires; the service guard is the real one.)
CREATE INDEX "idx_plans_calendar_id" ON "plans" ("calendar_id") WHERE "deleted_at" IS NULL AND "calendar_id" IS NOT NULL;

-- Data migration (M5, ADR-0024): seed one Standard (Mon–Fri) calendar per existing
-- active organisation that lacks one, so every org has the default new plans point at.
-- `working_weekdays = 31` is the 7-bit mask 0b0011111 (Monday…Friday). Idempotent via
-- NOT EXISTS, so a re-run (or an org that already has a Standard) is a no-op.
-- `gen_random_uuid()` (Postgres built-in) is fine for these PKs — v4 vs the app's v7 is
-- irrelevant for a one-off seed. Existing plans keep `calendar_id = NULL` (opt-in
-- all-days-work); only NEW plans default to Standard (in the plans service).
INSERT INTO "calendars" ("id", "organization_id", "name", "working_weekdays", "version", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", 'Standard', 31, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o
WHERE o."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "calendars" c
    WHERE c."organization_id" = o."id" AND c."name" = 'Standard' AND c."deleted_at" IS NULL
  );
