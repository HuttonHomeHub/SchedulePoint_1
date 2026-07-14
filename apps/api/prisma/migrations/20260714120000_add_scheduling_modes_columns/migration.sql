-- Scheduling modes & Visual placement columns (ADR-0033, M0 Task 0.1).
--
-- Fully additive and reversible: a new enum, one plan column, and five activity
-- columns. Ships dark (no engine/service/DTO wiring yet). The mandatory
-- `planned_start` change is deliberately isolated in the NEXT migration
-- (…_require_plan_planned_start) because it is the one irreversible step.
--
-- Every ADD COLUMN here is either nullable or has a constant DEFAULT, so on
-- Postgres 11+ each is a metadata-only change (no table rewrite, no full-table
-- lock held for a scan) — fast and safe at any data volume.

-- CreateEnum
CREATE TYPE "SchedulingMode" AS ENUM ('EARLY', 'VISUAL');

-- Plan-level mode (ADR-0033). Default EARLY is behaviour-preserving; the DEFAULT
-- backfills every existing plan to EARLY in the same statement. Read with the plan
-- row, never filtered across plans, so no index.
ALTER TABLE "plans" ADD COLUMN "scheduling_mode" "SchedulingMode" NOT NULL DEFAULT 'EARLY';

-- Planner-owned placement INPUT (the only DTO-settable column of this set). Feeds
-- ONLY the engine's forward-only effective-Visual pass, never the pure-network
-- pass, so it cannot corrupt early_*/late_*/float. Date-only, like constraint_date.
ALTER TABLE "activities" ADD COLUMN "visual_start" DATE;

-- Effective-Visual OUTPUT — engine-owned (ADR-0033), the analogue of early_*/
-- is_critical: written only by the recalc's batched raw UPDATE, never from a write
-- DTO, and never touching version/updated_at/updated_by (a recalc stays invisible
-- to optimistic locking, ADR-0022). `visual_conflict` DEFAULT false backfills every
-- existing row to "no conflict" (reads false until the plan is first calculated in
-- Visual mode); the two dates and drift are nullable (null until first computed).
--
-- No index on any of these four. They are read as part of the already plan-scoped
-- activity load (served by the existing (plan_id, created_at, id) index) and, for
-- visual_conflict, aggregated over that same scope (a future conflictCount) — no
-- query filters or sorts by them. An index on a low-cardinality boolean no predicate
-- targets would only cost writes (docs/DATABASE.md: index real query patterns). A
-- partial "list conflicts" index (WHERE visual_conflict = true AND deleted_at IS
-- NULL) is an explicit ADR-0033 follow-up IF a conflicts panel is added later.
ALTER TABLE "activities" ADD COLUMN "visual_effective_start" DATE;
ALTER TABLE "activities" ADD COLUMN "visual_effective_finish" DATE;
ALTER TABLE "activities" ADD COLUMN "visual_conflict" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "activities" ADD COLUMN "visual_drift_days" INTEGER;

-- Down (forward-only in prod; documented for completeness): fully reversible —
--   ALTER TABLE "activities" DROP COLUMN "visual_drift_days";
--   ALTER TABLE "activities" DROP COLUMN "visual_conflict";
--   ALTER TABLE "activities" DROP COLUMN "visual_effective_finish";
--   ALTER TABLE "activities" DROP COLUMN "visual_effective_start";
--   ALTER TABLE "activities" DROP COLUMN "visual_start";
--   ALTER TABLE "plans" DROP COLUMN "scheduling_mode";
--   DROP TYPE "SchedulingMode";
