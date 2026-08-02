-- ADR-0068: a calendar carries an hours-per-day.
--
-- The day↔minute factor for every day-denominated public field measured on a calendar
-- (`durationDays`, `lagDays`, `totalFloat`, …). Storage and the CPM engine are minutes; days are a
-- convenience over them, and this column is the conversion. Before it existed the factor was the
-- constant 1440, which was correct for every calendar in the system because nothing could author a
-- weekly pattern that was not full days.
--
-- The DEFAULT is that same constant and is non-volatile, so this is a metadata-only ADD COLUMN on
-- PostgreSQL: no table rewrite, no backfill, and every existing row keeps today's behaviour exactly.
-- The CPM engine never reads it (the WorkingTimeCalendar port is built from shift + exception rows
-- only), so the ADR-0034 recalc parity gate is structurally untouched.
ALTER TABLE "calendars"
  ADD COLUMN "hours_per_day_minutes" INTEGER NOT NULL DEFAULT 1440;

-- 1 minute .. 24 hours. NOT NULL, so no `IS NULL OR` guard is needed (contrast
-- ck_resources_max_units_per_hour_nonneg, which is nullable). NOT VALID + VALIDATE mirrors
-- ck_dependencies_lag_minutes_range; on a table this size the two-step is free and keeps the
-- pattern uniform. Deliberately NOT constrained against the calendar's own longest working day —
-- that is a cross-row property of `calendar_shifts`, the same reason no working-time guard lives on
-- this table, and a P6 `day_hr_cnt` of 8 beside a 10-hour Saturday is ordinary.
ALTER TABLE "calendars" ADD CONSTRAINT "ck_calendars_hours_per_day_minutes_range"
  CHECK ("hours_per_day_minutes" BETWEEN 1 AND 1440) NOT VALID;
ALTER TABLE "calendars" VALIDATE CONSTRAINT "ck_calendars_hours_per_day_minutes_range";

-- The factor CAPTURED at baseline freeze (ADR-0068 §5, applying ADR-0025's snapshot-copy rule).
-- Reading the live calendar instead would let a later calendar edit rewrite what a two-year-old
-- baseline reports as its captured durations and float.
ALTER TABLE "baselines"
  ADD COLUMN "hours_per_day_minutes" INTEGER NOT NULL DEFAULT 1440;

ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_hours_per_day_minutes_range"
  CHECK ("hours_per_day_minutes" BETWEEN 1 AND 1440) NOT VALID;
ALTER TABLE "baselines" VALIDATE CONSTRAINT "ck_baselines_hours_per_day_minutes_range";

-- No index on either column: both are read only by id alongside their own row, so there is no new
-- predicate to serve (docs/DATABASE.md — index query patterns, not columns).
