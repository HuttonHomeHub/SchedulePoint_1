-- M6 plan float & critical options: four plan-level CPM options + two enums
-- (Engine Conformance Framework, ADR-0035 §17–§20, M6 Tasks F2–F4).
--
-- Fully additive and reversible: two new enums and four plan columns, each with a
-- constant DEFAULT. No data migration — every DEFAULT backfills every existing plan
-- in the same statement to its P6/behaviour-preserving value (TOTAL_FLOAT / 0 /
-- FINISH / false), so the byte-parity golden path is unchanged. critical_path_
-- definition + critical_float_threshold are consumed by the engine now (M6-F2);
-- total_float_mode + make_open_ends_critical ship dark (stored now, consumed in a
-- later M6 task, F3/F4). Same forward-only posture as the earlier additive slices
-- (docs/DATABASE.md).
--
-- Every ADD COLUMN here has a constant DEFAULT, so on Postgres 11+ each is a
-- metadata-only change (no table rewrite, no full-table scan, no lock held beyond a
-- brief ACCESS EXCLUSIVE for the catalog update) — fast and safe at any data volume
-- (same posture as add_scheduling_modes_columns and m4_expected_finish).
--
-- No new index on any of the four: they are single-row plan columns read with the
-- plan row, never filtered or sorted across plans (like scheduling_mode /
-- progress_recalc_mode / use_expected_finish_dates), so an index would only cost
-- writes for no read benefit (docs/DATABASE.md: index real query patterns, not
-- columns). critical_float_threshold is left UNCONSTRAINED (no >= 0 CHECK), mirroring
-- the other option ints (0 and positive expected).

-- CreateEnum -----------------------------------------------------------------
-- How the CPM engine decides criticality (ADR-0035 §17). MUST stay in lock-step with
-- the TypeScript `CriticalPathDefinition` union in @repo/types (added in a later M6 task).
CREATE TYPE "CriticalPathDefinition" AS ENUM ('TOTAL_FLOAT', 'LONGEST_PATH');

-- Which float total float is measured from (ADR-0035 §18). MUST stay in lock-step with
-- the TypeScript `TotalFloatMode` union in @repo/types (added in a later M6 task).
CREATE TYPE "TotalFloatMode" AS ENUM ('START', 'FINISH', 'SMALLEST');

-- Plan-level float & critical options --------------------------------------
-- Criticality definition. Default TOTAL_FLOAT is P6/behaviour-preserving; the DEFAULT
-- backfills every existing plan in the same statement. Read with the plan row, never
-- filtered across plans, so no index (mirrors scheduling_mode). Consumed by the engine
-- now (M6-F2).
ALTER TABLE "plans" ADD COLUMN "critical_path_definition" "CriticalPathDefinition" NOT NULL DEFAULT 'TOTAL_FLOAT';

-- TOTAL_FLOAT threshold in whole WORKING DAYS (day-denominated public option, ADR-0036
-- §7; the service multiplies by 1440 to pass working minutes to the engine). Default 0
-- is P6/behaviour-preserving and backfills every existing plan. Unconstrained (no
-- CHECK), mirroring the other option ints.
ALTER TABLE "plans" ADD COLUMN "critical_float_threshold" INTEGER NOT NULL DEFAULT 0;

-- Which float total float is measured from. Default FINISH is the P6 default and
-- behaviour-preserving (the engine currently computes finish float); the DEFAULT
-- backfills every existing plan. Stored now; the engine consumes it in a later M6 task
-- (F3). Read with the plan row, never filtered across plans, so no index.
ALTER TABLE "plans" ADD COLUMN "total_float_mode" "TotalFloatMode" NOT NULL DEFAULT 'FINISH';

-- Mark open-ended activities (no successors) critical (ADR-0035 §20). Default false is
-- P6/behaviour-preserving; the DEFAULT backfills every existing plan. Stored now; the
-- engine consumes it in a later M6 task (F4). Read with the plan row, never filtered
-- across plans, so no index.
ALTER TABLE "plans" ADD COLUMN "make_open_ends_critical" BOOLEAN NOT NULL DEFAULT false;

-- Down (forward-only in prod; documented for completeness): fully reversible —
--   ALTER TABLE "plans" DROP COLUMN "make_open_ends_critical";
--   ALTER TABLE "plans" DROP COLUMN "total_float_mode";
--   ALTER TABLE "plans" DROP COLUMN "critical_float_threshold";
--   ALTER TABLE "plans" DROP COLUMN "critical_path_definition";
--   DROP TYPE "TotalFloatMode";
--   DROP TYPE "CriticalPathDefinition";
