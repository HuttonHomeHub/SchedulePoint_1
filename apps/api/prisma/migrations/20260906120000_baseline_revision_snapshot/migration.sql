-- THE REVISION SNAPSHOT EXTENSION — a baseline freezes the plan's SHAPE, not only its output.
-- The FOURTH amendment to ADR-0025's snapshot-copy model, after ADR-0042's cost baseline,
-- ADR-0071 M3's cost decomposition and ADR-0125's criticality rule.
-- Spec: docs/specs/revision-compare-changes/feature-spec.md (§0.1, §4.6, CQ-1/CQ-2/CQ-3 answered
-- by the product owner 2026-09-06).
--
-- WHY. A baseline froze WHERE the work was and WHAT it was called, and nothing about HOW THE PLAN
-- WAS BUILT. Enumerated against schema.prisma, eight of the fourteen change classes a planner is
-- asked about fall out of columns that already exist; six do not, and they are the ones argued
-- over in the meeting — the logic, the constraints, the calendars, the WBS, the lane and the
-- progress. So the product could report that an activity moved and could not report that somebody
-- re-sequenced the work, which is the change a Gantt-shaped competitor structurally cannot show
-- and the reason this half of the feature is worth more than parity.
--
-- ITS VALUE IS ENTIRELY PROSPECTIVE, AND THAT WAS PUT IN FRONT OF THE DECISION RATHER THAN LEFT IN
-- A CONSEQUENCES SECTION (CQ-1). No baseline captured before this migration can ever be told what
-- its logic, constraints, calendars, WBS or progress were: the data was never recorded, a capture
-- cannot be re-run, and a backfill could only stamp TODAY's shape as history — precisely what
-- ADR-0025's copy-not-reference rule exists to prevent. The clock starts here. Every baseline that
-- exists on any host today reads `revision_snapshot_level = 'NONE'`, which is the literal truth
-- about it, and the read model states that as a sentence in the change list's own position rather
-- than omitting the class or reporting a silent "no change".
--
-- WHAT IS NOT HERE, NAMED SO THE OMISSION IS NOT READ AS AN OVERSIGHT. `activities
-- .percent_complete_type` and `.physical_percent_complete` are NOT frozen: they select and carry
-- the earned-value PERFORMANCE percentage, which never changes a CPM date, and belong to a cost/EV
-- comparison class that is out of scope. CQ-1's permanence applies to them exactly as it applies
-- to the ten columns below — the same argument, the same unbackfillability — so this is a scope
-- decision with a real cost rather than a free one.
--
-- BOOT SAFETY (ADR-0018 — the API self-migrates on start, and the host pulls and recreates the
-- image unattended under ADR-0047, so a migration that CAN fail is the API failing to BOOT, an
-- outage rather than a failed deploy step). Every statement below is additive and touches no
-- existing row's data:
--   * CREATE TYPE / CREATE TABLE / CREATE INDEX on a brand-new table are catalogue-only. The new
--     table is empty at creation, so its CHECKs have nothing to scan and nothing to reject, and
--     there is no NOT VALID/VALIDATE two-step because there is no existing data to protect
--     (contrast the `baseline_activities` CHECKs below). Its two FKs take a brief SHARE ROW
--     EXCLUSIVE on `baselines` / `organizations` — a lock, not a scan.
--   * ADD COLUMN of a nullable column with no default is metadata-only: existing rows are neither
--     read nor rewritten.
--   * ADD COLUMN with a constant, non-volatile DEFAULT (`revision_snapshot_level`) is likewise
--     metadata-only since PostgreSQL 11 — the default is stored once in the catalogue rather than
--     written into every row.
--   OBSERVED rather than asserted, by querying `pg_attribute` after applying this file to a real
--   PostgreSQL 16.13 database: all ten `baseline_activities` columns read
--   `atthasmissing = f, attmissingval = NULL` (nothing to fill in, because they are NULL), and
--   `baselines.revision_snapshot_level` reads `atthasmissing = t, attmissingval = {NONE}` — the
--   fast-default catalogue entry, which is what a rewrite would NOT have produced.
--   * The four `baseline_activities` CHECKs use NOT VALID + VALIDATE, which takes only SHARE
--     UPDATE EXCLUSIVE and cannot block a reader. They cannot fail: every existing row holds NULL
--     in columns that did not exist one statement earlier.
--
-- ONE MIGRATION IS CORRECT, AND THIS WAS RE-VERIFIED RATHER THAN ASSUMED. The two-migration rule
-- (ADR-0053 M3) is about `ALTER TYPE … ADD VALUE`, which PostgreSQL forbids using in the
-- transaction that added it. This migration adds no label to an existing type: it CREATEs a new
-- one and uses it in the same transaction, which is legal — and is already the shipped precedent
-- one table along (20260802140000_baseline_assignment_costs creates
-- "BaselineCostSnapshotLevel" and defaults a column to 'ACTIVITY' in the same file). Re-proved
-- against PostgreSQL 16.13 before this was written, both ways round: CREATE TYPE + use in one
-- explicit transaction COMMITs; ALTER TYPE … ADD VALUE + use in one transaction raises 55P04
-- ("unsafe use of new value"). The negative control is what makes the positive result mean
-- something.
--
-- PARITY. The CPM engine never reads `baselines` or any of its children — it is handed activities,
-- edges, calendars and ComputeOptions built from `plans`. `computeSchedule`'s signature, inputs
-- and outputs are unchanged and nothing under src/modules/schedule/engine/ is touched, so the
-- ADR-0034 recalculation parity gate is untouched BY CONSTRUCTION.

-- CreateEnum: what a baseline froze of the plan's SHAPE. 'NONE' is what every existing baseline
-- is, and is the constant DEFAULT below. See the RevisionSnapshotLevel docblock in schema.prisma,
-- which ENUMERATES what 'FULL' vouches for; MUST stay in lock-step with @repo/types when the
-- change list surfaces it.
CREATE TYPE "RevisionSnapshotLevel" AS ENUM ('NONE', 'FULL');

-- AddColumn: the discriminator, and the load-bearing statement of this migration.
--
-- WHY A DISCRIMINATOR IS UNAVOIDABLE HERE WHERE ADR-0125's CRITICALITY SET NEEDED NONE. That
-- migration deliberately added no `*_snapshot_level` column, because a fail-closed all-or-none
-- CHECK made "half a rule" unrepresentable and none of its four columns has a legitimate NULL — so
-- `critical_path_definition IS NULL` on the same row IS the discriminator, and a fifth column
-- would have been the two-sources-of-truth defect. THE OPPOSITE IS TRUE OF THE TEN COLUMNS BELOW.
-- Every one of them has a legitimate NULL (or a legitimate zero) in a snapshot that recorded them
-- fully: an activity with no constraint, no parent, no calendar of its own, in lane 0, at 0 %, not
-- yet started. An all-or-none CHECK would therefore be WRONG rather than merely unnecessary, and
-- no per-row test can separate "not recorded" from "recorded as absent". Nor can a ROW COUNT: a
-- plan with no dependencies captures zero `baseline_dependencies` rows under 'FULL' — the
-- `cost_snapshot_level` argument verbatim, one table along. This column is the only thing that can
-- answer the question, and the read must branch on it.
--
-- The pairing between it and the child rows CANNOT be a CHECK: they live in three tables and a
-- CHECK sees one row of one table (again the `cost_snapshot_level` reasoning). It is a SERVICE
-- invariant held inside the single capture transaction, which is why the DEFAULT is the
-- conservative value — a write path not yet taught the new pass reads as 'NONE', never as
-- recorded-but-empty.
ALTER TABLE "baselines"
  ADD COLUMN "revision_snapshot_level" "RevisionSnapshotLevel" NOT NULL DEFAULT 'NONE';

-- AddColumn x10: the frozen shape and progress of one activity. ALL NULLABLE WITH NO DEFAULT.
--
-- `lane_index` IS THE TRAP, and it is worth stating on its own. The live column is `NOT NULL
-- DEFAULT 0`, so copying its shape here is the reflex — and LANE 0 IS A REAL LANE. A `NOT NULL
-- DEFAULT 0` would tell every baseline captured before today that all of its activities sat in one
-- row of the diagram, in a column that offers a reader no way to doubt it, and a future ghost
-- layer would paint that fabricated picture confidently. `percent_complete` is the same trap one
-- column along: 0 % is a real progress figure, not an absence. This is `baseline_activities
-- .budgeted_expense`'s "0 is a claim" (ADR-0071 M3) and ADR-0125's rejected `is_critical DEFAULT
-- false`, in the two places where the live column genuinely IS `NOT NULL` and the pull to mirror it
-- is therefore strongest. The `baselines.hours_per_day_minutes DEFAULT 1440` precedent licenses
-- neither: that default was legal because 1440 was TRUE of every pre-existing row, and none of
-- these ten values is knowable for any row that exists.
--
-- `parent_id` and `calendar_id` are PLAIN correlation UUIDs with NO FOREIGN KEY — the
-- `source_activity_id` rule (ADR-0025): a snapshot that referenced live rows would either block
-- their deletion or rot with them, and `calendars` in particular is HARD-deleted by the ADR-0096
-- retention expiry when its project expires, which would take a frozen row's FK with it.
-- `parent_id` is in the SOURCE activity id space (it names an `activities.id`, matching
-- `source_activity_id`), because the join a change list makes is source-id to source-id.
ALTER TABLE "baseline_activities"
  ADD COLUMN "lane_index"                INTEGER,
  ADD COLUMN "parent_id"                 UUID,
  ADD COLUMN "calendar_id"               UUID,
  ADD COLUMN "constraint_type"           "ConstraintType",
  ADD COLUMN "constraint_date"           DATE,
  ADD COLUMN "secondary_constraint_type" "ConstraintType",
  ADD COLUMN "secondary_constraint_date" DATE,
  ADD COLUMN "percent_complete"          INTEGER,
  ADD COLUMN "actual_start"              DATE,
  ADD COLUMN "actual_finish"             DATE;

-- CheckConstraints on the frozen shape (raw SQL — Prisma cannot express CHECK, so schema.prisma
-- declares none of these; a declared constraint the database does not have is the CI schema-drift
-- failure of TECH_DEBT #54). Each is the nullable-safe form of the LIVE constraint on the column
-- it copies, and nothing beyond that is invented: a frozen copy must not be able to hold a value
-- its source would refuse, and equally must not refuse a plan the product allows. NOT VALID +
-- VALIDATE per the boot-safety argument above; none can fail, because every existing row holds
-- NULL in a column that did not exist one statement earlier.
--
-- The two pair checks are `IS NULL = IS NULL`, mirroring ck_activities_constraint_pair /
-- ck_activities_secondary_constraint_pair exactly. They say "a frozen constraint has a type and a
-- date or it has neither" and deliberately say NOTHING about whether the pair was RECORDED — that
-- is `revision_snapshot_level`'s question, and a constraint here could not answer it without
-- reading another table.
ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_lane_index_nonneg"
  CHECK ("lane_index" IS NULL OR "lane_index" >= 0) NOT VALID;
ALTER TABLE "baseline_activities" VALIDATE CONSTRAINT "ck_baseline_activities_lane_index_nonneg";

ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_percent_complete_range"
  CHECK ("percent_complete" IS NULL OR ("percent_complete" >= 0 AND "percent_complete" <= 100)) NOT VALID;
ALTER TABLE "baseline_activities" VALIDATE CONSTRAINT "ck_baseline_activities_percent_complete_range";

ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_constraint_pair"
  CHECK (("constraint_type" IS NULL) = ("constraint_date" IS NULL)) NOT VALID;
ALTER TABLE "baseline_activities" VALIDATE CONSTRAINT "ck_baseline_activities_constraint_pair";

ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_secondary_constraint_pair"
  CHECK (("secondary_constraint_type" IS NULL) = ("secondary_constraint_date" IS NULL)) NOT VALID;
ALTER TABLE "baseline_activities" VALIDATE CONSTRAINT "ck_baseline_activities_secondary_constraint_pair";

-- CreateTable: ONE logic edge's frozen snapshot inside a baseline — the sibling of
-- `baseline_activities` and `baseline_assignments`, and the only change class with no partial
-- answer available from the existing columns, because the whole edge set was absent.
--
-- The three source_* ids are PLAIN correlation UUIDs with NO foreign key (ADR-0025's
-- copy-not-reference rule); organization_id is DENORMALISED from the parent baseline, never client
-- input. The endpoints are frozen rather than resolved through `baseline_activities` because an
-- edge whose endpoint was later deleted must still name both ends, and because it lets an added or
-- removed edge be described without a join; their values always equal some
-- `baseline_activities.source_activity_id` of the SAME baseline — a service invariant of the one
-- capture transaction, not an FK (the `baseline_assignments.source_activity_id` precedent).
--
-- EVERY VALUE COLUMN IS `NOT NULL` WITH NO DEFAULT, deliberately unlike its live counterpart, and
-- this is the `baseline_assignments.budgeted_cost` / `.lag_minutes` precedent applied verbatim.
-- `dependencies` defaults `type` to 'FS', `lag_minutes` to 0, `lag_calendar` to 'PROJECT_DEFAULT'
-- and `is_driving` to false because those are the sane values for A NEW EDGE A PLANNER IS
-- CREATING. Here there are no pre-existing rows to default for — the table IS the feature — and a
-- default would let a capture RECORD A FACT IT NEVER READ: a write path that forgot to select
-- `type` would freeze every edge in the plan as Finish-to-Start, a fabricated history of exactly
-- the class this table exists to report, which nothing downstream could ever doubt. Without the
-- defaults Prisma's generated `create` input requires all four, so the compiler asks the question.
-- `lag_minutes` carries its unit in its name for the reason two defects already cost us.
CREATE TABLE "baseline_dependencies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "baseline_id" UUID NOT NULL,
    "source_dependency_id" UUID NOT NULL,
    "source_predecessor_id" UUID NOT NULL,
    "source_successor_id" UUID NOT NULL,
    "type" "DependencyType" NOT NULL,
    "lag_minutes" INTEGER NOT NULL,
    "lag_calendar" "LagCalendarSource" NOT NULL,
    "is_driving" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "baseline_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: (baseline_id, source_dependency_id) — the `baseline_activities` shape, NOT the
-- `baseline_assignments` one, and the difference is deliberate rather than inconsistent. That
-- table's only baseline-keyed index is a PARTIAL unique `WHERE deleted_at IS NULL`, justified in
-- 20260802140000 on the grounds that "baseline rows soft-delete only, so the FK RESTRICT check
-- never fires". ADR-0096 MADE THAT FALSE: the retention expiry hard-deletes baselines, and a
-- RESTRICT check's generated query carries no `deleted_at`, so a `deleted_at IS NULL` predicate is
-- not implied and the check falls back to a sequential scan of the child table once per deleted
-- parent — the measured `idx_activities_parent_id_fk` finding (docs/DATABASE.md), which cost
-- 3m47s for a single plan. A FULL composite covers the FK RESTRICT check, the
-- load-whole-baseline read (leftmost prefix `baseline_id`) and the change list's join key in one,
-- at the same width. It deliberately states no freeze-once UNIQUE: the capture writes each edge
-- once by construction inside one transaction, and a third index on a bulk-insert path was
-- measured and rejected one table along for buying 0.007 ms.
CREATE INDEX "baseline_dependencies_baseline_id_source_dependency_id_idx"
  ON "baseline_dependencies"("baseline_id", "source_dependency_id");

-- CreateIndex: full org index backing the FK (RESTRICT) + org-scoped IDOR loads, like every
-- sibling.
CREATE INDEX "baseline_dependencies_organization_id_idx" ON "baseline_dependencies"("organization_id");

-- AddForeignKey: baseline_dependencies.organization_id → organizations (RESTRICT — never
-- hard-deleted; guards against orphaning). ON UPDATE CASCADE is Prisma's default.
ALTER TABLE "baseline_dependencies" ADD CONSTRAINT "baseline_dependencies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: baseline_dependencies.baseline_id → baselines (RESTRICT). These are the ONLY two
-- FKs on the table: the three source_* ids deliberately have none.
--
-- RESTRICT HERE IS NOT INERT, AND THE CONSEQUENCE IS LOAD-BEARING. Its sibling's comment says the
-- referential check "never fires, so RESTRICT is defence in depth"; that stopped being true at
-- ADR-0096, whose retention expiry permanently deletes an expired plan's baselines. So this table
-- MUST be deleted before `baselines` in `common/hierarchy/hierarchy-expiry.runner.ts`, and it is —
-- added in the same commit as this migration, ahead of `tx.baseline.deleteMany`. Had it not been,
-- the delete would raise 23503, `hierarchy-expiry.service.ts` would catch it and log
-- `hierarchy_expiry.permanent_failure`, and every plan with a post-change baseline would become
-- permanently unexpirable — retried hourly forever, unattended, with nothing user-facing saying
-- so. `hierarchy-expiry.structural.spec.ts` pins the order against a literal list, which catches a
-- REORDER and is structurally blind to a MISSING TABLE; a DMMF-derived completeness census was
-- added beside it in the same commit so the next sibling table cannot repeat this.
ALTER TABLE "baseline_dependencies" ADD CONSTRAINT "baseline_dependencies_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL). The frozen lag repeats the live column's bounds exactly
-- (ck_dependencies_lag_minutes_range): SIGNED — a negative lag is a lead and is a legitimate part
-- of the logic this table exists to record, unlike `baseline_assignments.lag_minutes` which is
-- unsigned because its source is — and capped at ±5,256,000 (≈ 10 years), the same magnitude as
-- every other working-minute ceiling in the schema, so there is ONE answer to "how large may a
-- working-minute quantity be" rather than five. Plain, not nullable-safe, because the column is
-- NOT NULL.
ALTER TABLE "baseline_dependencies" ADD CONSTRAINT "ck_baseline_dependencies_lag_minutes_range"
  CHECK ("lag_minutes" BETWEEN -5256000 AND 5256000);

-- CheckConstraint (raw SQL). A self-loop, mirroring ck_dependencies_no_self_loop. The live table
-- cannot hold one, so a faithful snapshot of it cannot either; a violation here means a capture
-- invented an edge. Note what is deliberately NOT constrained: nothing asserts the two endpoints
-- are rows of this baseline, because that is a cross-table fact a CHECK cannot see (the service
-- invariant above), and nothing asserts acyclicity, which the live table does not assert either —
-- the DAG is an ADR-0021 service invariant and a snapshot must be able to record whatever the plan
-- actually contained.
ALTER TABLE "baseline_dependencies" ADD CONSTRAINT "ck_baseline_dependencies_no_self_loop"
  CHECK ("source_predecessor_id" <> "source_successor_id");

-- Partial index for batch restore (set only on rows soft-deleted together with their baseline).
-- Raw SQL and NO @@index in schema.prisma — Prisma cannot express a WHERE predicate, and a
-- declared index the database does not have breaks prisma:check-drift (TECH_DEBT #54). Tiny: only
-- soft-deleted rows carry a value.
CREATE INDEX "idx_baseline_dependencies_delete_batch_id"
  ON "baseline_dependencies" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Down (forward-only in production, ADR-0018; documented for completeness). Safe in a way most of
-- its siblings are not — everything below was created by this migration, so dropping it destroys
-- only data authored after it shipped. It is nonetheless IRREVERSIBLE in the way that matters:
-- unlike the plans criticality mirror, these values do not repopulate on the next recalculation,
-- they are gone with the captures that produced them.
--   DROP INDEX "idx_baseline_dependencies_delete_batch_id";
--   DROP TABLE "baseline_dependencies";
--   ALTER TABLE "baseline_activities" DROP CONSTRAINT "ck_baseline_activities_secondary_constraint_pair";
--   ALTER TABLE "baseline_activities" DROP CONSTRAINT "ck_baseline_activities_constraint_pair";
--   ALTER TABLE "baseline_activities" DROP CONSTRAINT "ck_baseline_activities_percent_complete_range";
--   ALTER TABLE "baseline_activities" DROP CONSTRAINT "ck_baseline_activities_lane_index_nonneg";
--   ALTER TABLE "baseline_activities"
--     DROP COLUMN "actual_finish", DROP COLUMN "actual_start", DROP COLUMN "percent_complete",
--     DROP COLUMN "secondary_constraint_date", DROP COLUMN "secondary_constraint_type",
--     DROP COLUMN "constraint_date", DROP COLUMN "constraint_type",
--     DROP COLUMN "calendar_id", DROP COLUMN "parent_id", DROP COLUMN "lane_index";
--   ALTER TABLE "baselines" DROP COLUMN "revision_snapshot_level";
--   DROP TYPE "RevisionSnapshotLevel";
