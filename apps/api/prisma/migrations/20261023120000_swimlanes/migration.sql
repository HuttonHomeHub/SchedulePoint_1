-- LABELLED SWIMLANES — swimlanes M1-T1 (schema part).
--
-- Spec: docs/specs/swimlanes/feature-spec.md; schema: docs/specs/swimlanes/schema-design.md
-- (designed by the database-architect agent, CLAUDE.md §19.3), approved with the spec 2026-10-22.
--
-- Two enums, two columns on `plans`, one on `activities`, and two new tables: `swimlanes` (a plan's
-- hand-made swimlanes) and `activity_swimlane_lanes` (an activity's in-swimlane lane PER BASIS, so
-- switching source, moving between swimlanes and restoring a deleted swimlane each return the exact
-- lane last written there — schema-design §2).
--
-- EXPAND-ONLY. Nothing is renamed, retyped, dropped or backfilled, and no contract step is owed.
-- Every statement is DDL whose result does not depend on existing rows: the new columns are
-- nullable or carry a constant default, and every constraint on an existing table is trivially true
-- of existing data (swimlane_id all NULL, swimlane_source all 'NONE'). So a pristine database and a
-- populated one exercise the same code (ADR-0107: nothing here a pristine database cannot test).
--
-- LOCKS. The API migrates at boot before it serves (ADR-0018), so nothing waits on these. The
-- composite FK validates by scanning `activities` under SHARE ROW EXCLUSIVE, and
-- idx_activities_swimlane_id_fk builds by scanning it (plain CREATE INDEX inside the migration's
-- transaction; NOT VALID + VALIDATE would buy nothing in one transaction). Both scans find nothing.
--
-- LOCK ORDER THE APPLICATION MUST KEEP (schema-design §5; enforced in services, not here):
--   * positions batch / activity create: activity rows FOR NO KEY UPDATE in id order, then the named
--     swimlanes FOR SHARE in id order (deleted_at IS NULL, same plan), then UPDATE activities, then
--     INSERT … ON CONFLICT into activity_swimlane_lanes. A total order activities → swimlanes,
--     matching the plan cascade, which locks every plan activity before it stamps a swimlane.
--   * swimlane reorder: the plan's live swimlanes SELECT … ORDER BY id FOR NO KEY UPDATE, then
--     UPDATE … FROM unnest (the #440 reason).
--   * swimlane create: the plan advisory lock, recheck the plan is live, count against the cap of
--     100, INSERT. Swimlane restore: client and project FOR SHARE top-down, then the plan advisory
--     lock, recheck, UPDATE. Without the plan lock a swimlane written after the cascade's sweep read
--     would be live under a deleted plan (the #520 shape); the FK's KEY SHARE does not catch it.
--   * lane rows need no order of their own: each is written only under its activity's row lock.
--   No calendar is bound, so ADR-0201's calendar-first order is untouched.
--
-- HARD DELETES. Every new FK is ON DELETE RESTRICT. Swimlanes and lane rows are hard-deleted only by
-- the ADR-0096 expiry and interchange's failure compensation, which must delete lane rows before
-- activities and swimlanes after activities but before plans (schema-design §6); the expiry's DMMF
-- census fails the build until they do. ROLLBACK HAZARD, stated rather than hidden: a pre-feature
-- image run after swimlane or lane rows exist fails expiry and compensation with 23503 on plans that
-- have them, until the image moves forward again. Nothing is lost.
--
-- TWO CONSTRUCTS THIS SCHEMA HAS NOT USED BEFORE (docs/DATABASE.md "Indexes" records both rules):
--   * uq_activity_swimlane_lanes_basis is UNIQUE … NULLS NOT DISTINCT, hand-edited below because
--     Prisma 6 cannot express it, and DECLARED in the model as a plain @@unique of the same name
--     because `migrate diff` emits DROP INDEX for an undeclared unique on plain columns but compares
--     a declared one by name and columns only (schema-design §8.2). Verified: `prisma:check-drift`
--     reports no difference on a pristine PostgreSQL 16.15 and a pristine postgres:17-alpine 17.11.
--   * uq_swimlanes_plan_name is the first CASE-INSENSITIVE unique: (plan_id, lower(name)), partial.
--     Folding outside ASCII is the collation's. MEASURED on postgres:17-alpine 17.11 (the deployed
--     and CI image; musl, database collation en_US.utf8, libc provider): 'Électrique' then
--     'éLECTRIQUE' in one plan is refused 23505, and a soft-deleted 'électrique' is admitted beside
--     the live one. Also refused on PostgreSQL 16.15 / glibc C.UTF-8. The M1 API e2e still asserts it
--     on CI's own database, because a container here is not CI.
--
-- ONE CORRECTION TO THE DESIGN'S SQL TEXT. schema-design.md §3.2 and §3.5 write the level branches as
-- `level BETWEEN 1 AND 3`. For a NULL level that is NULL, and a CHECK ADMITS NULL, so both CHECKs
-- admitted the very row they exist to refuse — probed: `UPDATE plans SET swimlane_source = 'WBS'`
-- with no level returned UPDATE 1, and a NO_WBS_SUMMARY lane row with no level was inserted. Both
-- branches here read `level IS NOT NULL AND level BETWEEN 1 AND 3`, which is the design's stated
-- invariant ("required when the source is WBS"); after the change both are refused 23514.
-- schema-design.md is amended to match (its "Amended 2026-10-23 at landing" note).
--
-- MEASUREMENTS (schema-design §8.3). Taken 2026-10-23 on postgres:17-alpine 17.11 in Docker on a
-- shared 4-vCPU / 15 GB container, NOT the deployed host. Synthetic rows written by SQL, not the
-- seed catalogue: the catalogue seeds through the REST API and was not run for this; the migration's
-- cost depends only on how many `plans` and `activities` rows it scans, so row counts bracket it.
--   1. Migration duration, whole file in one transaction (rolled back), 3 reps each, including psql
--      connection set-up: 1 plan × 2,000 activities (the torture fixture's size) 97–105 ms;
--      50 × 2,000 = 100,000 activities 126–140 ms; 500 × 2,000 = 1,000,000 activities 456–510 ms.
--   2. Expiry of one 2,000-activity plan holding 100 swimlanes, every activity assigned, 4,000 lane
--      rows (one SWIMLANE + one WBS_SUMMARY per activity) and 4,000 history rows, both written in
--      random order so they are interleaved on disk, inside a database of 50 such plans (100,000
--      activities, 200,000 lane rows). The runner's order, literal `IN` lists of 2,000 ids, warm,
--      reps 2–3 of 3 (rep 1 in brackets):
--        all indexes:  lanes 44–48 ms (76) · history 22–25 ms (36) · activities 232–236 ms (331) ·
--                      swimlanes 9.2–9.3 ms (14)
--        without idx_activity_swimlane_lanes_summary_fk:  activities 26.6–27.9 s (25.8) — each
--                      deleted activity's RESTRICT check scans all 200,000 lane rows. ~115×.
--        without idx_activity_swimlane_lanes_swimlane_id_fk:  swimlanes 1,254–1,341 ms — each
--                      deleted swimlane scans all 200,000 lane rows. ~140×.
--        without idx_activities_swimlane_id_fk:  swimlanes 33–48 ms (36), ~3.5–5×. NOT a full scan,
--                      which corrects schema-design §3.3's stated reason: the composite key contains
--                      plan_id, so the check `plan_id = $1 AND swimlane_id = $2` falls back to
--                      activities_plan_id_created_at_id_idx and walks the plan's 2,000 just-deleted
--                      entries (EXPLAIN ANALYZE of the generic plan, 0.43 ms per swimlane). The index
--                      still pays for itself at ~0.3 ms per deleted swimlane against one tiny partial
--                      index whose only write cost is on a change of membership, so it stays.
--   3. LANE_ROWS_PER_ACTIVITY (for budgetCharge). From the same runs: a lane row cost 10.9–11.9 µs
--      warm (19 µs rep 1), a history row 5.6–6.4 µs, an activity 116–118 µs. So a lane row costs
--      1.7–2.1 history rows. The history constant's own measurement (HISTORY_ROWS_PER_ACTIVITY = 5,
--      hierarchy-expiry.service.ts) is the calibrated one, so scaling it by that ratio gives 2.4–2.9
--      lane rows per activity; the direct quotient here (activity ÷ lane row, 8.7–10.8) would allow
--      ~5, but this run's history quotient (18–21) disagrees with that measurement's (8.3–10.4) by 2×,
--      so this run's activity figure is not trusted on its own. Charging too much only slows a
--      backlog's drain and charging too little overruns the 60 s batch transaction, so the safe
--      reading is the lower one: LANE_ROWS_PER_ACTIVITY = 2. Warm only, like the history figure;
--      TECH_DEBT #443's cold re-measure on the deployed host covers this constant too.

-- 1. Enums. CREATE TYPE and its use in one transaction is legal; only ALTER TYPE … ADD VALUE
-- plus use is not, so this is one migration, not two (the ActivityHistoryScope precedent). No
-- @@map: a new enum's Postgres type is its PascalCase name (docs/DATABASE.md "Naming").
CREATE TYPE "SwimlaneSource" AS ENUM ('NONE', 'MANUAL', 'WBS');

CREATE TYPE "SwimlaneLaneBasis" AS ENUM ('SWIMLANE', 'NO_SWIMLANE', 'WBS_SUMMARY', 'NO_WBS_SUMMARY');

-- 2. plans: where its swimlanes come from. A constant DEFAULT and a nullable column are both
-- metadata-only on PostgreSQL 11+: no rewrite, no backfill. 'NONE' is true of every existing plan.
ALTER TABLE "plans" ADD COLUMN     "swimlane_source" "SwimlaneSource" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "swimlane_wbs_level" SMALLINT;

-- Fail-closed (CASE … ELSE false): a fourth source added later is REJECTED until it gets a
-- branch here. Spec §2 Validation verbatim: the level is required for WBS and absent otherwise.
-- `IS NOT NULL AND` is load-bearing, not redundant: `NULL BETWEEN 1 AND 3` is NULL, and a CHECK
-- ADMITS a NULL result, so without it ('WBS', NULL) passes (probed: UPDATE 1).
-- Validates by scanning `plans`, which is small; every existing row is ('NONE', NULL).
ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_swimlane_source_level" CHECK (
  CASE "swimlane_source"
    WHEN 'NONE'   THEN "swimlane_wbs_level" IS NULL
    WHEN 'MANUAL' THEN "swimlane_wbs_level" IS NULL
    WHEN 'WBS'    THEN "swimlane_wbs_level" IS NOT NULL AND "swimlane_wbs_level" BETWEEN 1 AND 3
    ELSE false
  END
);

-- 3. swimlanes: a plan's hand-made swimlanes.
CREATE TABLE "swimlanes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "swimlanes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "swimlanes" ADD CONSTRAINT "swimlanes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "swimlanes" ADD CONSTRAINT "swimlanes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FULL unique, declared in the model. The composite FK target for activities (plan_id,
-- swimlane_id); its leftmost prefix also backs the plan_id FK, the plan's swimlane list (at most
-- 100 live rows, sorted in memory by position, id), the cascade sweep and the expiry delete, so
-- there is no separate (plan_id) index and no (plan_id, position) index.
CREATE UNIQUE INDEX "uq_swimlanes_plan_id_id" ON "swimlanes"("plan_id", "id");

-- Backs the organization FK's RESTRICT check, IDOR loads and the export `org` read.
CREATE INDEX "swimlanes_organization_id_idx" ON "swimlanes"("organization_id");

-- Raw SQL, NOT declared (Prisma cannot express an expression or a predicate, and `migrate diff`
-- ignores this index, so it causes no drift). The schema's FIRST case-insensitive unique: a live
-- name is unique per plan ignoring case; a soft-deleted name does not block reuse, so restoring
-- onto a name taken meanwhile is the service's 409 SWIMLANE_NAME_TAKEN rather than a constraint
-- surprise. Folding outside ASCII depends on the database collation: see the header.
CREATE UNIQUE INDEX "uq_swimlanes_plan_name" ON "swimlanes" ("plan_id", lower("name")) WHERE "deleted_at" IS NULL;

-- Raw SQL, NOT declared (partial). The plan-batch restore lookup; tiny, only stamped rows.
CREATE INDEX "idx_swimlanes_delete_batch_id" ON "swimlanes" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Backstops spec §2's validation. The DTO trims first, so this guards rather than rejects ordinary
-- input (the ck_notes_body_length shape); it matters because XER import writes names from hostile
-- files.
--
-- Written as two comparisons, NOT `char_length("name") BETWEEN 1 AND 80`, so that the stored
-- definition survives pg_dump/pg_restore unchanged (scripts/backup-restore-check.sh compares
-- pg_get_constraintdef across the round trip). BETWEEN parses to its own AND node; as the LEFT
-- operand of the outer AND it deparses as a nested `((a >= 1) AND (a <= 80)) AND …`, and re-parsing
-- that text flattens it into one AND list, so the restored definition differed (CI, PR #1119). The
-- level CHECKs below keep BETWEEN because there it is the RIGHT operand, which re-parses unchanged:
-- proven by the same round trip, constraint by constraint.
ALTER TABLE "swimlanes" ADD CONSTRAINT "ck_swimlanes_name_shape" CHECK (
  char_length("name") >= 1 AND char_length("name") <= 80 AND "name" = btrim("name")
  AND "name" !~ '[[:cntrl:]]'
);

-- Not unique, on purpose (schema-design §4 Q1). The cap of 100 live swimlanes per plan is a service
-- count under the plan advisory lock: a CHECK cannot count rows.
ALTER TABLE "swimlanes" ADD CONSTRAINT "ck_swimlanes_position_nonneg" CHECK ("position" >= 0);

-- 4. activities: hand-made membership. Nullable: metadata-only.
ALTER TABLE "activities" ADD COLUMN     "swimlane_id" UUID;

-- COMPOSITE so the database refuses a swimlane of another plan (23503); a NULL swimlane_id is
-- admitted (MATCH SIMPLE). ON UPDATE RESTRICT, not CASCADE: plan_id is part of the key, so a
-- cascading update of swimlanes.plan_id would move activities between plans. Validation scans
-- `activities` under SHARE ROW EXCLUSIVE; every value is NULL, so nothing is looked up.
ALTER TABLE "activities" ADD CONSTRAINT "activities_plan_id_swimlane_id_fkey" FOREIGN KEY ("plan_id", "swimlane_id") REFERENCES "swimlanes"("plan_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Raw SQL, NOT declared (partial; TECH_DEBT #54). Exists ONLY to back the RESTRICT check that runs
-- when expiry or import compensation hard-deletes swimlane rows: the check's query is
-- `plan_id = $1 AND swimlane_id = $2`, which implies the predicate. Partial, so only assigned
-- activities are in it. Builds by scanning `activities` (empty result). See the header for the
-- measurement.
CREATE INDEX "idx_activities_swimlane_id_fk" ON "activities" ("swimlane_id") WHERE "swimlane_id" IS NOT NULL;

-- 5. activity_swimlane_lanes: an activity's lane per basis.
CREATE TABLE "activity_swimlane_lanes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "basis" "SwimlaneLaneBasis" NOT NULL,
    "swimlane_id" UUID,
    "summary_activity_id" UUID,
    "wbs_level" SMALLINT,
    "lane_index" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activity_swimlane_lanes_pkey" PRIMARY KEY ("id")
);

-- All four RESTRICT: every hard-delete path deletes this table explicitly, before activities and
-- swimlanes, and COUNTS it for the expiry budget (the activity_history_entries reason).
ALTER TABLE "activity_swimlane_lanes" ADD CONSTRAINT "activity_swimlane_lanes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_swimlane_lanes" ADD CONSTRAINT "activity_swimlane_lanes_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_swimlane_lanes" ADD CONSTRAINT "activity_swimlane_lanes_swimlane_id_fkey" FOREIGN KEY ("swimlane_id") REFERENCES "swimlanes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_swimlane_lanes" ADD CONSTRAINT "activity_swimlane_lanes_summary_activity_id_fkey" FOREIGN KEY ("summary_activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HAND-EDITED: Prisma generates this index WITHOUT `NULLS NOT DISTINCT`, which Prisma 6 cannot
-- express. It IS declared in the model as a plain @@unique of the same name, because an undeclared
-- unique on plain columns makes `migrate diff` emit DROP INDEX (drift) while a declared one is
-- compared by name and columns only (schema-design §8.2, probed). NULLS NOT DISTINCT is what makes
-- it one row per basis: at least two of the five key columns are NULL for every basis kind, so a
-- default (NULLS DISTINCT) unique would admit any number of rows for one (activity, basis). One
-- index, four jobs: that guarantee, the INSERT … ON CONFLICT (activity_id, basis, swimlane_id,
-- summary_activity_id, wbs_level) arbiter, the activity_id FK RESTRICT check (leftmost prefix, no
-- predicate) and the "lanes of these activities" load.
CREATE UNIQUE INDEX "uq_activity_swimlane_lanes_basis" ON "activity_swimlane_lanes"("activity_id", "basis", "swimlane_id", "summary_activity_id", "wbs_level") NULLS NOT DISTINCT;

-- Backs the organization FK's RESTRICT check and the export `org` read.
CREATE INDEX "activity_swimlane_lanes_organization_id_idx" ON "activity_swimlane_lanes"("organization_id");

-- Raw SQL, NOT declared (partial). Each backs a RESTRICT check a hard delete fires: deleting
-- swimlane rows (expiry, compensation) and deleting summary activities. Without them each deleted
-- parent row scans this whole table.
CREATE INDEX "idx_activity_swimlane_lanes_swimlane_id_fk" ON "activity_swimlane_lanes" ("swimlane_id") WHERE "swimlane_id" IS NOT NULL;

CREATE INDEX "idx_activity_swimlane_lanes_summary_fk" ON "activity_swimlane_lanes" ("summary_activity_id") WHERE "summary_activity_id" IS NOT NULL;

-- Fail-closed like ck_notes_exactly_one_parent: each basis pins exactly which basis columns are
-- set, and a fifth basis is REJECTED until it gets a branch. WBS_SUMMARY carries no level on
-- purpose: a summary's swimlane holds its subtree at whichever level it is a swimlane. The
-- `"wbs_level" IS NOT NULL AND` is load-bearing for the ck_plans_swimlane_source_level reason:
-- without it a NO_WBS_SUMMARY row with no level evaluates to NULL and is admitted (probed).
ALTER TABLE "activity_swimlane_lanes" ADD CONSTRAINT "ck_activity_swimlane_lanes_basis_shape" CHECK (
  CASE "basis"
    WHEN 'SWIMLANE'       THEN "swimlane_id" IS NOT NULL AND "summary_activity_id" IS NULL
                               AND "wbs_level" IS NULL
    WHEN 'NO_SWIMLANE'    THEN "swimlane_id" IS NULL AND "summary_activity_id" IS NULL
                               AND "wbs_level" IS NULL
    WHEN 'WBS_SUMMARY'    THEN "swimlane_id" IS NULL AND "summary_activity_id" IS NOT NULL
                               AND "wbs_level" IS NULL
    WHEN 'NO_WBS_SUMMARY' THEN "swimlane_id" IS NULL AND "summary_activity_id" IS NULL
                               AND "wbs_level" IS NOT NULL AND "wbs_level" BETWEEN 1 AND 3
    ELSE false
  END
);

-- Mirrors ck_activities_lane_index_nonneg; the 10,000 ceiling stays in the DTO.
ALTER TABLE "activity_swimlane_lanes" ADD CONSTRAINT "ck_activity_swimlane_lanes_lane_index_nonneg" CHECK ("lane_index" >= 0);
