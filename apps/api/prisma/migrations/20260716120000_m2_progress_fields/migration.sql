-- M2 progress ingestion: remaining duration, suspend/resume & recalc mode
-- (Engine Conformance Framework, ADR-0035 §1–§6, M2 Task T1).
--
-- Fully additive and reversible: one new enum, one plan column, and three activity
-- columns (all nullable or constant-DEFAULT). No data migration — every new column
-- is legal empty (NULL) and the plan mode backfills to RETAINED_LOGIC in the same
-- statement. Ships dark: the engine/boundary/service do not consume these until
-- T2–T7. Same forward-only posture as the earlier additive slices (docs/DATABASE.md).
--
-- Every ADD COLUMN here is either nullable or has a constant DEFAULT, so on Postgres
-- 11+ each is a metadata-only change (no table rewrite, no full-table scan lock) —
-- fast and safe at any data volume. The two CHECKs use the lock-friendly
-- ADD CONSTRAINT … NOT VALID → VALIDATE CONSTRAINT pattern (VALIDATE takes only
-- SHARE UPDATE EXCLUSIVE, not blocking reads/writes; docs/DATABASE.md). On a fresh
-- (empty) table there is nothing to validate, so this is purely defensive form.

-- CreateEnum -----------------------------------------------------------------
-- The out-of-sequence progress recalc mode (ADR-0035 §1). MUST stay in lock-step
-- with the TypeScript `ProgressRecalcMode` union in @repo/types (added in a later
-- M2 task).
CREATE TYPE "ProgressRecalcMode" AS ENUM ('RETAINED_LOGIC', 'PROGRESS_OVERRIDE', 'ACTUAL_DATES');

-- Plan-level recalc mode. Default RETAINED_LOGIC is behaviour-preserving in spirit;
-- the DEFAULT backfills every existing plan in the same statement. Read with the
-- plan row, never filtered across plans, so no index (mirrors scheduling_mode).
ALTER TABLE "plans" ADD COLUMN "progress_recalc_mode" "ProgressRecalcMode" NOT NULL DEFAULT 'RETAINED_LOGIC';

-- Activity progress columns --------------------------------------------------
-- Independent remaining duration in working MINUTES (P6-faithful). NULL ⇒ derive
-- from percent_complete × duration_minutes; non-null ⇒ used verbatim. The nonneg
-- CHECK bounds a supplied value only — NULL is always legal (the derive path).
-- Mirrors ck_activities_duration_minutes_nonneg.
ALTER TABLE "activities" ADD COLUMN "remaining_duration_minutes" INTEGER;
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_remaining_duration_minutes_nonneg" CHECK ("remaining_duration_minutes" >= 0) NOT VALID;
ALTER TABLE "activities" VALIDATE CONSTRAINT "ck_activities_remaining_duration_minutes_nonneg";

-- Suspend/resume (ADR-0035 §4). Calendar days, like actual_start/finish. Nullable-
-- safe date-order CHECK: only enforced when BOTH are set (either NULL is legal), so
-- it never blocks the common no-suspend path. Same >= form as
-- ck_calendar_exceptions_date_order, made null-tolerant for the two-nullable pair.
ALTER TABLE "activities" ADD COLUMN "suspend_date" DATE;
ALTER TABLE "activities" ADD COLUMN "resume_date" DATE;
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_resume_after_suspend" CHECK ("resume_date" IS NULL OR "suspend_date" IS NULL OR "resume_date" >= "suspend_date") NOT VALID;
ALTER TABLE "activities" VALIDATE CONSTRAINT "ck_activities_resume_after_suspend";

-- Down (forward-only in prod; documented for completeness): fully reversible —
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_resume_after_suspend";
--   ALTER TABLE "activities" DROP COLUMN "resume_date";
--   ALTER TABLE "activities" DROP COLUMN "suspend_date";
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_remaining_duration_minutes_nonneg";
--   ALTER TABLE "activities" DROP COLUMN "remaining_duration_minutes";
--   ALTER TABLE "plans" DROP COLUMN "progress_recalc_mode";
--   DROP TYPE "ProgressRecalcMode";
