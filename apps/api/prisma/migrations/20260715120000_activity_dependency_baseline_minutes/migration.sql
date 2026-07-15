-- Durations & lag: working-DAYS → working-MINUTES (ADR-0036, M1 storage rework).
--
-- The first of two migrations in the M1 unit-switch release (the second is
-- …_calendar_shift_model). Days literally CANNOT represent the target values (a
-- 4 h task, a 168 h elapsed lag, a night shift), so there is nothing to
-- dual-write — the switch is atomic within one release, forward-only, and ships
-- with the minute-aware engine behind the unchanged recalculate endpoint
-- (ADR-0036 §4.1/§7). The same forward-only posture as …_require_plan_planned_start.
--
-- The conversion is a SINGLE uniform factor M = 1440 (one elapsed day = 1440
-- minutes), which EQUALS the per-day window length the calendar migration writes.
-- Because every existing duration/lag is a whole working day and every existing
-- date lands on a day boundary, `× 1440` is a provably date-preserving
-- representation change — the M0 goldens stay green with NO re-baseline (§4.2/§4.7).
--
-- Each unit switch uses the lock-friendly ADD COLUMN → backfill → SET NOT NULL →
-- ADD CONSTRAINT … NOT VALID → VALIDATE CONSTRAINT pattern (VALIDATE takes only
-- SHARE UPDATE EXCLUSIVE, not blocking reads/writes; docs/DATABASE.md). ADD COLUMN
-- with a constant DEFAULT is metadata-only on Postgres 11+ (no table rewrite).
--
-- Forward-only in prod (docs/DATABASE.md): once minute-granular data is written
-- the dropped day columns have no representation, so "rollback" is a compensating
-- migration + prior image, not a down-migration (§4.6).

-- activities: duration_days → duration_minutes -------------------------------
-- Nullable ADD (value comes from another column), backfilled × 1440, then the
-- 480 (one 8 h day) fallback DEFAULT + NOT NULL. The service sets duration
-- explicitly (scaling a planner's "N days" by the plan calendar's day-minutes);
-- the DEFAULT is only a defensive fallback. The nonneg CHECK replaces the days one.
ALTER TABLE "activities" ADD COLUMN "duration_minutes" INTEGER;
UPDATE "activities" SET "duration_minutes" = "duration_days" * 1440;
ALTER TABLE "activities" ALTER COLUMN "duration_minutes" SET DEFAULT 480;
ALTER TABLE "activities" ALTER COLUMN "duration_minutes" SET NOT NULL;
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_duration_minutes_nonneg" CHECK ("duration_minutes" >= 0) NOT VALID;
ALTER TABLE "activities" VALIDATE CONSTRAINT "ck_activities_duration_minutes_nonneg";
ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_duration_days_nonneg";
ALTER TABLE "activities" DROP COLUMN "duration_days";

-- dependencies: lag_days → lag_minutes + lag_calendar seam --------------------
-- Prisma cannot express CHECK, so the range CHECK is raw SQL. The enum is the
-- ADR-0036 §6 resolution seam (M1 lands the column, M3 wires resolution) — it MUST
-- stay in lock-step with the LagCalendarSource union in @repo/types.
CREATE TYPE "LagCalendarSource" AS ENUM ('PREDECESSOR', 'SUCCESSOR', 'TWENTY_FOUR_HOUR', 'PROJECT_DEFAULT');

-- Constant-DEFAULT ADDs are metadata-only. lag_calendar default PROJECT_DEFAULT is
-- behaviour-preserving (today all lag resolves on the plan calendar). lag_minutes is
-- a SIGNED lag bounded to ±5_256_000 (≈ ±10 y), preserving the old ±3650-day intent
-- (§5 Q3); the N16 100,000 h lag is rejected at the boundary, not stored.
ALTER TABLE "dependencies" ADD COLUMN "lag_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "dependencies" ADD COLUMN "lag_calendar" "LagCalendarSource" NOT NULL DEFAULT 'PROJECT_DEFAULT';
UPDATE "dependencies" SET "lag_minutes" = "lag_days" * 1440;
ALTER TABLE "dependencies" ADD CONSTRAINT "ck_dependencies_lag_minutes_range" CHECK ("lag_minutes" BETWEEN -5256000 AND 5256000) NOT VALID;
ALTER TABLE "dependencies" VALIDATE CONSTRAINT "ck_dependencies_lag_minutes_range";
ALTER TABLE "dependencies" DROP CONSTRAINT "ck_dependencies_lag_days_range";
ALTER TABLE "dependencies" DROP COLUMN "lag_days";

-- baseline_activities: duration_days → duration_minutes ----------------------
-- Frozen snapshots stay faithful (ADR-0025): a 5-day baseline is still 5 days
-- (7200 min) and displays identically. No DEFAULT (a snapshot value is always
-- supplied at capture); no old days CHECK to drop (none was created for this table).
ALTER TABLE "baseline_activities" ADD COLUMN "duration_minutes" INTEGER;
UPDATE "baseline_activities" SET "duration_minutes" = "duration_days" * 1440;
ALTER TABLE "baseline_activities" ALTER COLUMN "duration_minutes" SET NOT NULL;
ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_duration_minutes_nonneg" CHECK ("duration_minutes" >= 0) NOT VALID;
ALTER TABLE "baseline_activities" VALIDATE CONSTRAINT "ck_baseline_activities_duration_minutes_nonneg";
ALTER TABLE "baseline_activities" DROP COLUMN "duration_days";
