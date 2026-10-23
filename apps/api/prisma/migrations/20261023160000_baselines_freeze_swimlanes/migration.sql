-- BASELINES FREEZE SWIMLANES — swimlanes M1-T1b (SQ-7 "yes", product owner 2026-10-22).
--
-- Spec: docs/specs/swimlanes/feature-spec.md; schema: docs/specs/swimlanes/schema-design.md §13
-- (designed by the database-architect agent, CLAUDE.md §19.3). The sixth amendment to ADR-0025's
-- snapshot-copy model, after ADR-0042's cost baseline, ADR-0071 M3's cost decomposition, ADR-0125's
-- criticality rule, ADR-0126's revision snapshot and one-planning-surface M-C's placement snapshot.
--
-- One enum, three columns on `baselines` (a level, plus the plan's swimlane source and WBS level AT
-- CAPTURE), one on `baseline_activities` (the activity's hand-made membership at capture) and one
-- new table, `baseline_activity_swimlane_lanes`: every `activity_swimlane_lanes` row of every
-- captured activity, copied verbatim. Together they let a ghost of REMOVED work be drawn in a
-- swimlane instead of only counted (ADR-0126 forbids guessing its lane; ADR-0127 D3 counts it).
-- Every row is copied rather than one "effective" lane frozen, because which lane is effective is
-- the answer of a rule (the source, the level, the WBS tree) and a snapshot records facts, not a
-- rule's answers (schema-design §13.3).
--
-- EXPAND-ONLY. Nothing is renamed, retyped, dropped or backfilled, and no contract step is owed.
-- Every statement is DDL whose result does not depend on existing rows: the new level carries the
-- constant DEFAULT 'NONE', the three other new columns are nullable, the CHECK is true of every
-- existing baseline ('NONE', NULL, NULL), and the new table is empty. So a pristine database and a
-- populated one exercise the same code (ADR-0107: nothing here a pristine database cannot test).
--
-- EVERY EXISTING BASELINE READS 'NONE', AND THAT IS PERMANENT. A backfill to ('FULL', 'NONE') would
-- in fact be true of every baseline captured before swimlanes could be written, and was rejected
-- anyway (schema-design §13.5): such a baseline has no lane rows, so with swimlanes on its removed
-- work would still be counted rather than drawn, and the only thing the backfill would buy is a
-- data-dependent migration resting on a claim about release order.
--
-- LOCKS. The API migrates at boot before it serves (ADR-0018), so nothing waits on these. ADD COLUMN
-- with a constant default or nullable is metadata-only on PostgreSQL 11+ (no rewrite of
-- `baselines` or `baseline_activities`). The CHECK validates by scanning `baselines` (one row per
-- capture, small). The new table is created empty. No existing index is built or rebuilt.
--
-- WHAT THE CAPTURE MUST DO (enforced in the service, not here; schema-design §13.4):
--   * write swimlane_snapshot_level = 'FULL' UNCONDITIONALLY, beside its three sibling levels;
--   * copy plans.swimlane_source / swimlane_wbs_level from the plan row it reads under the plan
--     advisory lock, activities.swimlane_id into baseline_activities.swimlane_id for every row,
--     and every activity_swimlane_lanes row of every captured activity (updated_at → lane_updated_at);
--   * take the plan's live activities FOR SHARE in id order after the plan lock and before reading
--     them. A positions batch does not take the plan lock; it writes lane rows only under the
--     activity row lock (FOR NO KEY UPDATE), so FOR SHARE is what makes the frozen activities and
--     the frozen lanes one moment. Order plan lock → activities matches the plan cascade, and the
--     positions batch never takes the plan lock, so no cycle.
--
-- HARD DELETES. Both new FKs are ON DELETE RESTRICT. The lane copies are hard-deleted only by the
-- ADR-0096 expiry, by baseline_id, BEFORE `baselines`, beside the three other baseline children; the
-- expiry's DMMF census fails the build until the runner does so. Interchange compensation needs no
-- change: an import captures no baseline. ROLLBACK HAZARD, stated rather than hidden: a pre-M1-T1b
-- image run after a FULL capture with lane copies exists fails expiry with 23503 on that plan until
-- the image moves forward again. Nothing is lost.
--
-- MEASUREMENTS (schema-design §13.7). Taken 2026-10-23 on PostgreSQL 16.15 (Ubuntu, glibc) on a
-- shared container, NOT the deployed host; synthetic rows written by SQL, not the seed catalogue.
-- 20 plans × 2,000 activities, 24 baselines each (monthly for two years): 480 baselines, 960,000
-- baseline_activities. Lane copies, once present: two per activity per baseline (one SWIMLANE, one
-- NO_SWIMLANE), 96,000 per plan, 1,920,000 in all. Warm; three reps each.
--   1. This migration, whole file in one rolled-back transaction including psql start-up, on that
--      database before any copy existed: 93–146 ms. Metadata-only, as stated above.
--   2. One capture's lane copy, 4,000 rows by INSERT … SELECT from the live table: 149–200 ms.
--      The activity row lock §13.4 adds (2,000 rows, FOR NO KEY UPDATE in id order): 4.9–6.3 ms
--      (17 ms cold). Together they are what a positions batch on that plan can now wait for.
--   3. Expiry of one plan's 24 baselines, the runner's order, IN lists of 24 ids, copies stored
--      contiguously per baseline (as one createMany writes them): lane copies 73–88 ms (96,000 rows,
--      0.8–0.9 µs a row), baseline_activities 155–416 ms (48,000 rows), baselines 77–108 ms.
--      Rows interleaved at random instead (the worst case): lane copies 294–807 ms.
--      WITHOUT uq_baseline_activity_swimlane_lanes_basis the baselines delete takes 4.06–4.44 s
--      (each deleted baseline's RESTRICT check scans the whole table), ~45×. So the one index is
--      also the FK index the expiry needs; it is not a second index bought for the unique.
--   4. Loading one baseline's lanes (4,000 rows): an index scan on the unique, 0.9 ms.

-- 1. The level enum. CREATE TYPE and its use in one transaction is legal; only ALTER TYPE … ADD VALUE
-- plus use is not, so this is one migration, not two. No @@map (docs/DATABASE.md "Naming").
CREATE TYPE "SwimlaneSnapshotLevel" AS ENUM ('NONE', 'FULL');

-- 2. baseline_activities: the activity's hand-made membership at capture. A plain correlation UUID,
-- NO foreign key (ADR-0025, the parent_id / calendar_id rule). Nullable, no default: under a FULL
-- baseline NULL is "No swimlane", under NONE it is "unknown", and only the level tells them apart.
-- Metadata-only.
ALTER TABLE "baseline_activities" ADD COLUMN     "swimlane_id" UUID;

-- 3. baselines: the level, and the plan's source and WBS level at capture. Constant DEFAULT and
-- nullable columns: metadata-only. 'NONE' is the literal truth of every existing baseline.
ALTER TABLE "baselines" ADD COLUMN     "swimlane_snapshot_level" "SwimlaneSnapshotLevel" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "swimlane_source" "SwimlaneSource",
ADD COLUMN     "swimlane_wbs_level" SMALLINT;

-- Fail-closed on BOTH discriminators. NONE ⇒ nothing frozen. FULL ⇒ the source is frozen, and its
-- level obeys ck_plans_swimlane_source_level VERBATIM, so a frozen copy cannot hold what its source
-- refuses. A NULL source under FULL matches no inner WHEN and falls to ELSE false, so it is refused;
-- a third level or a fourth source is refused until it gets a branch. `IS NOT NULL AND` is the
-- M1-T1 lesson: `NULL BETWEEN 1 AND 3` is NULL and a CHECK admits NULL. Validates by scanning
-- `baselines`; every existing row is ('NONE', NULL, NULL).
ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_swimlane_snapshot_shape" CHECK (
  CASE "swimlane_snapshot_level"
    WHEN 'NONE' THEN "swimlane_source" IS NULL AND "swimlane_wbs_level" IS NULL
    WHEN 'FULL' THEN
      CASE "swimlane_source"
        WHEN 'NONE'   THEN "swimlane_wbs_level" IS NULL
        WHEN 'MANUAL' THEN "swimlane_wbs_level" IS NULL
        WHEN 'WBS'    THEN "swimlane_wbs_level" IS NOT NULL AND "swimlane_wbs_level" BETWEEN 1 AND 3
        ELSE false
      END
    ELSE false
  END
);

-- 4. baseline_activity_swimlane_lanes: every live lane row of every captured activity, frozen.
-- No version, updated_at, actor or lifecycle columns: rows are immutable and live exactly as long
-- as their baseline (a baseline soft-delete leaves them; every read reaches them through a live
-- baseline). lane_updated_at is the live row's updated_at, the projection's collision tie-break.
CREATE TABLE "baseline_activity_swimlane_lanes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "baseline_id" UUID NOT NULL,
    "source_activity_id" UUID NOT NULL,
    "basis" "SwimlaneLaneBasis" NOT NULL,
    "swimlane_id" UUID,
    "summary_activity_id" UUID,
    "wbs_level" SMALLINT,
    "lane_index" INTEGER NOT NULL,
    "lane_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baseline_activity_swimlane_lanes_pkey" PRIMARY KEY ("id")
);

-- Both RESTRICT, like every baseline sibling: the expiry deletes this table explicitly, by
-- baseline_id, before `baselines`. source_activity_id, swimlane_id and summary_activity_id have NO
-- foreign key (ADR-0025): the snapshot must outlive the live rows it was copied from.
ALTER TABLE "baseline_activity_swimlane_lanes" ADD CONSTRAINT "baseline_activity_swimlane_lanes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "baseline_activity_swimlane_lanes" ADD CONSTRAINT "baseline_activity_swimlane_lanes_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HAND-EDITED: Prisma generates this WITHOUT `NULLS NOT DISTINCT`, which Prisma 6 cannot express.
-- Declared in the model as a plain @@unique of the same name (docs/DATABASE.md "Indexes": an
-- undeclared unique on plain columns is drift; a declared one is compared by name and columns only).
-- It mirrors uq_activity_swimlane_lanes_basis with baseline_id in front, so a capture that copied a
-- row twice is refused (23505) rather than frozen as an ambiguity for the life of the baseline.
-- FULL (no predicate), and its leftmost prefix is baseline_id, so the one index is also the
-- baseline_id FK RESTRICT check the expiry fires and the load-a-baseline's-lanes read. See the
-- header for the measurement.
CREATE UNIQUE INDEX "uq_baseline_activity_swimlane_lanes_basis" ON "baseline_activity_swimlane_lanes"("baseline_id", "source_activity_id", "basis", "swimlane_id", "summary_activity_id", "wbs_level") NULLS NOT DISTINCT;

-- Backs the organization FK's RESTRICT check and the export `org` read.
CREATE INDEX "baseline_activity_swimlane_lanes_organization_id_idx" ON "baseline_activity_swimlane_lanes"("organization_id");

-- ck_activity_swimlane_lanes_basis_shape VERBATIM: a frozen copy must not be able to hold a row its
-- source would refuse, and a fifth basis is REJECTED until it gets a branch here too.
ALTER TABLE "baseline_activity_swimlane_lanes" ADD CONSTRAINT "ck_baseline_activity_swimlane_lanes_basis_shape" CHECK (
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

-- Mirrors ck_activity_swimlane_lanes_lane_index_nonneg.
ALTER TABLE "baseline_activity_swimlane_lanes" ADD CONSTRAINT "ck_baseline_activity_swimlane_lanes_lane_index_nonneg" CHECK ("lane_index" >= 0);
