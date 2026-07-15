-- Calendar: 7-bit weekday mask + whole-day exceptions → intraday shift patterns
-- + time-window exceptions (ADR-0036, M1 storage rework).
--
-- The second of two migrations in the M1 unit-switch release (the first is
-- …_activity_dependency_baseline_minutes). Adds two OWNED-VALUE child tables
-- (CalendarShift, CalendarExceptionWindow — the PlanLock precedent: no soft-delete,
-- no version, no audit ids, no denormalised org_id, FK ON DELETE CASCADE), turns
-- CalendarException.date into an inclusive [start_date, end_date] range, and drops
-- the mask + whole-day is_working flag.
--
-- The backfill uses the SAME uniform full-day window [0, 1440) that pairs with the
-- × 1440 duration/lag factor (§4.2): every SET weekday of the old mask becomes one
-- 00:00–24:00 shift row, and every worked exception (is_working = true) becomes one
-- 00:00–24:00 window; holidays become zero-window ranges. Because that window
-- length EQUALS the duration factor, every existing plan — calendared and
-- null-calendar — reproduces byte-identical dates (§4.2), so the M0 goldens stay
-- green with NO re-baseline. Re-shaping migrated calendars to realistic shifts is
-- deferred to planners (§5 Q2): a reviewed golden diff, never a silent one.
--
-- Order (§4.4): create children → backfill the weekly pattern from the mask →
-- migrate exceptions to ranges → backfill exception windows from is_working → drop
-- the mask and flag LAST (after every row that reads them is backfilled). The three
-- EXCLUDE constraints need btree_gist (stock contrib) for the (int/date-range WITH &&)
-- operator classes; non-overlap is a per-(calendar[,weekday]) local invariant the DB
-- can enforce cheaply (docs/DATABASE.md: the DB is the last line of defence).
--
-- Forward-only in prod (docs/DATABASE.md, §4.6): once minute-granular windows are
-- written the dropped mask/flag have no representation.

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateTable: calendar_shifts ----------------------------------------------
-- The weekly working pattern, normalised: per weekday a sorted list of [start, end)
-- minute windows. weekday 0 = Monday … 6 = Sunday (the old mask's bit convention).
-- Non-overlap within (calendar, weekday) is the ex_calendar_shifts_no_overlap GiST
-- EXCLUDE; per-row bounds/order are CHECKs. Prisma cannot express CHECK or EXCLUDE,
-- so they are raw SQL.
CREATE TABLE "calendar_shifts" (
    "id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_calendar_shifts_weekday_range" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "ck_calendar_shifts_minute_bounds" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440),
    CONSTRAINT "ck_calendar_shifts_window_order" CHECK ("start_minute" < "end_minute"),
    CONSTRAINT "ex_calendar_shifts_no_overlap" EXCLUDE USING gist ("calendar_id" WITH =, "weekday" WITH =, int4range("start_minute", "end_minute") WITH &&)
);

-- The engine load IS this index: WHERE calendar_id = ? ORDER BY weekday,
-- start_minute; it also backs the FK (leftmost prefix). This table has no other
-- access path (no org_id, no soft-delete), so no other index.
CREATE INDEX "calendar_shifts_calendar_id_weekday_start_minute_idx" ON "calendar_shifts"("calendar_id", "weekday", "start_minute");

-- CreateTable: calendar_exception_windows -----------------------------------
-- The windows that REPLACE a CalendarException range's weekly pattern; zero rows
-- for that exception = a holiday / non-work block. Same OWNED-VALUE treatment and
-- same bounds/order CHECKs + GiST EXCLUDE as calendar_shifts.
CREATE TABLE "calendar_exception_windows" (
    "id" UUID NOT NULL,
    "calendar_exception_id" UUID NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_exception_windows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_calendar_exception_windows_minute_bounds" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440),
    CONSTRAINT "ck_calendar_exception_windows_window_order" CHECK ("start_minute" < "end_minute"),
    CONSTRAINT "ex_calendar_exception_windows_no_overlap" EXCLUDE USING gist ("calendar_exception_id" WITH =, int4range("start_minute", "end_minute") WITH &&)
);

-- Engine load IS this index: WHERE calendar_exception_id = ? ORDER BY start_minute;
-- it also backs the FK (leftmost prefix).
-- Prisma truncates this name to 63 chars (…_start_minu_idx); the raw name below
-- MUST match exactly so `prisma migrate diff` sees no drift.
CREATE INDEX "calendar_exception_windows_calendar_exception_id_start_minu_idx" ON "calendar_exception_windows"("calendar_exception_id", "start_minute");

-- AddForeignKey (both ON DELETE CASCADE — true composition: an owned window has no
-- existence apart from its parent; CASCADE only fires on a rare hard purge).
ALTER TABLE "calendar_shifts" ADD CONSTRAINT "calendar_shifts_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_exception_windows" ADD CONSTRAINT "calendar_exception_windows_calendar_exception_id_fkey" FOREIGN KEY ("calendar_exception_id") REFERENCES "calendar_exceptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the weekly pattern (BEFORE working_weekdays is dropped): each SET bit w
-- of the 7-bit mask (bit 0 = Monday … bit 6 = Sunday) → one full-day [0, 1440)
-- shift row on weekday w. gen_random_uuid() (Postgres built-in, already used by the
-- Standard-calendar seed) is fine for these low-volume owned rows — v4 vs the app's
-- v7 is irrelevant for a backfill.
INSERT INTO "calendar_shifts" ("id", "calendar_id", "weekday", "start_minute", "end_minute", "created_at", "updated_at")
SELECT gen_random_uuid(), c."id", w."weekday", 0, 1440, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "calendars" c
CROSS JOIN generate_series(0, 6) AS w("weekday")
WHERE ((c."working_weekdays" >> w."weekday") & 1) = 1;

-- Migrate exceptions to inclusive [start_date, end_date] ranges. All existing rows
-- are single-day, so end_date = start_date. The RENAME carries the old
-- (calendar_id, date) index and the uq_calendar_exceptions_cal_date partial unique
-- onto the renamed column (both are re-shaped below).
ALTER TABLE "calendar_exceptions" RENAME COLUMN "date" TO "start_date";
ALTER TABLE "calendar_exceptions" ADD COLUMN "end_date" DATE;
UPDATE "calendar_exceptions" SET "end_date" = "start_date";
ALTER TABLE "calendar_exceptions" ALTER COLUMN "end_date" SET NOT NULL;
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "ck_calendar_exceptions_date_order" CHECK ("end_date" >= "start_date") NOT VALID;
ALTER TABLE "calendar_exceptions" VALIDATE CONSTRAINT "ck_calendar_exceptions_date_order";

-- Backfill exception windows (BEFORE is_working is dropped): each worked exception
-- (is_working = true) → one full-day [0, 1440) window; holidays (is_working = false)
-- get no window rows, which IS the holiday encoding in the new model.
INSERT INTO "calendar_exception_windows" ("id", "calendar_exception_id", "start_minute", "end_minute", "created_at", "updated_at")
SELECT gen_random_uuid(), e."id", 0, 1440, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "calendar_exceptions" e
WHERE e."is_working" = true;

ALTER TABLE "calendar_exceptions" DROP COLUMN "is_working";

-- Swap the point-key uniqueness for range non-overlap. The old partial unique
-- (uq_calendar_exceptions_cal_date) and the old (calendar_id, date) index — both
-- now sitting on start_date after the RENAME — are replaced by:
--   * ex_calendar_exceptions_no_overlap: a GiST EXCLUDE guaranteeing at most one
--     ACTIVE exception covers any given day (a day cannot be both a holiday and a
--     worked window), now over ranges. Backs the add DUPLICATE_EXCEPTION (409).
--   * calendar_exceptions_calendar_id_start_date_idx: (calendar_id, start_date)
--     backing the FK, the editor's list-all, and the engine's active load ordered
--     by start_date.
DROP INDEX "uq_calendar_exceptions_cal_date";
DROP INDEX "calendar_exceptions_calendar_id_date_idx";
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "ex_calendar_exceptions_no_overlap" EXCLUDE USING gist ("calendar_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&) WHERE ("deleted_at" IS NULL);
CREATE INDEX "calendar_exceptions_calendar_id_start_date_idx" ON "calendar_exceptions"("calendar_id", "start_date");

-- Retire the mask (LAST — read by the weekly-pattern backfill above). A window-only
-- calendar (zero shift rows; work comes only from positive exceptions) is now VALID,
-- so the old non-zero guard is dropped, not replaced.
ALTER TABLE "calendars" DROP CONSTRAINT "ck_calendars_working_weekdays_range";
ALTER TABLE "calendars" DROP COLUMN "working_weekdays";
