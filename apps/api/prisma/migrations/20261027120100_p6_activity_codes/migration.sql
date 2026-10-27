-- P6 ACTIVITY CODES, migration B of 2: the code tables, the swimlane pointer, and what a baseline
-- freezes of them.
--
-- Spec: docs/specs/p6-activity-codes/spec.md; plan M2-T3; schema:
-- docs/specs/p6-activity-codes/database-design.md §5–§13 and §16 (designed by the database-architect
-- agent, CLAUDE.md §19.3). Owner's answers 2026-10-27, not reopened here: codes belong to one plan
-- (Q2); baselines freeze every type only if that adds at most 1 s to the largest capture (Q1, see
-- MEASUREMENTS 4); deleting the swimlane-source type is refused and the limits are 100 types / 1,000
-- values (Q3, Q4; both in the service, a CHECK cannot count); short code ≤ 80, description ≤ 255 and
-- NO parent value column until a real P6 export confirms one (Q5; m0-record.md found ACTVCODE's
-- parent column in one public source only). Migration A (20261027120000_swimlane_source_activity_code)
-- added the ACTIVITY_CODE label alone, because the two CHECKs below name it.
--
-- EXPAND-ONLY. Four new tables (code_types, code_values, code_value_assignments,
-- code_swimlane_lanes); one new unique index on `activities`; nullable or constant-default columns on
-- `plans`, `baselines` and `baseline_activities`; two CHECKs replaced by wider versions of themselves;
-- one new enum. Nothing is renamed, retyped, dropped or backfilled, and no contract step is owed.
-- Every statement's result is independent of existing rows: every existing plan's source is NONE,
-- MANUAL or WBS with a NULL type, every existing baseline is NONE with a NULL type, every new column
-- is NULL or 'NONE'. A pristine database and a populated one exercise the same code (ADR-0107); the
-- populated runs below are for duration, not correctness.
--
-- WHY CODE LANES ARE A TABLE OF THEIR OWN, not two more columns on activity_swimlane_lanes. Widening
-- that table means rebuilding uq_activity_swimlane_lanes_basis with seven columns, and the PREVIOUS
-- image's lane upsert names five (activity.repository.ts, `ON CONFLICT (activity_id, basis,
-- swimlane_id, summary_activity_id, wbs_level)`): PostgreSQL answers 42P10 "no unique or exclusion
-- constraint matching the ON CONFLICT specification" (probed, database-design §5.5). Rolling back to
-- the previous image would then break every positions batch, on every plan. With a separate table the
-- previous image never sees a code lane, and SwimlaneLaneBasis and its fail-closed CHECK are untouched.
--
-- LOCKS. The API migrates at boot before it serves (ADR-0018), so nothing waits on these; what matters
-- is how long the boot takes. CREATE TYPE, CREATE TABLE and nullable or constant-default ADD COLUMN are
-- catalogue-only. uq_activities_plan_id_id takes a SHARE lock on `activities` and scans and sorts it:
-- the one step that grows with the live schedule. The plans key validates by scanning `plans` (every
-- value NULL); the replaced CHECKs scan `plans` and `baselines`; ck_baseline_activities_code_lane_pair
-- scans `baseline_activities`, the largest table touched (every row NULL, so it only reads). Not
-- CONCURRENTLY and not NOT VALID + VALIDATE: neither buys anything inside one transaction with no
-- traffic.
--
-- LOCK ORDER THE APPLICATION MUST KEEP (database-design §15; enforced in services, not here): the plan
-- advisory lock → activities in id order FOR NO KEY UPDATE → code types → code values in id order
-- (FOR SHARE when an assignment names them). Type delete and the swimlane source switch both take the
-- plan advisory lock, which serialises the "refuse deleting the source type" check (Q3). Restore takes
-- ancestors FOR SHARE top-down, then the plan advisory lock. No calendar is bound, so ADR-0201's
-- calendar-first order is untouched. Assignment and lane rows are written only under their activity's
-- row lock, in a write that bumps activities.version.
--
-- HARD DELETES, THE CYCLE AND THE CENSUS EXEMPTION. Every new key is ON DELETE RESTRICT; code rows are
-- hard-deleted only by the ADR-0096 expiry and interchange's failure compensation, which delete code
-- lanes and assignments before activities, then values, then types, then the plan. The swimlane
-- pointer plans (id, swimlane_code_type_id) → code_types (plan_id, id) and code_types.plan_id → plans
-- form a RESTRICT CYCLE: neither row can be deleted first (probed, test/code-schema.e2e-spec.ts). Every
-- hard-delete path therefore runs `UPDATE plans SET swimlane_source = 'NONE', swimlane_code_type_id =
-- NULL` for the plans it deletes before deleting their types. The expiry's DMMF census
-- (hierarchy-expiry.structural.spec.ts) cannot order a cycle, so `Plan→CodeType` is its one stated
-- exemption, paid for by an assertion that the runner clears the pointer before deleting code types
-- (database-design §8.1). Alternatives (no key, SET NULL, DEFERRABLE, a flag on the type) are rejected
-- in §14. ROLLBACK HAZARD, stated rather than hidden: a pre-codes image run after code rows exist fails
-- expiry and compensation with 23503 on plans that hold them, until the image moves forward again;
-- nothing is lost. docs/DEPLOYMENT.md, "Rolling back past the P6 activity codes release", says what a
-- rollback costs once a plan's swimlanes come from a code.
--
-- WRITE THESE RELATIONS THROUGH SCALARS ONLY (database-design §16 D-P1). Prisma 6.19.3's nested writes
-- on these composite keys misbehave silently (a `connect` on the plan pointer rewrites plans.id; two
-- `connect`s sharing code_type_id keep the last). nested-relation-writes.structural.spec.ts fails the
-- build on any nested write to them, and to activities.swimlane (D-P2).
--
-- TWO CONSTRUCTS BY HAND (docs/DATABASE.md "Indexes"): uq_code_swimlane_lanes_basis is NULLS NOT
-- DISTINCT, declared in the model as a plain @@unique of the same name; uq_code_types_plan_name and
-- uq_code_values_type_short_code are case-insensitive partial uniques, raw SQL and undeclared.
-- `prisma:check-drift` reports no difference (PostgreSQL 16.15: from empty, and on an app_test that
-- was at main).
--
-- MEASUREMENTS (database-design §12, plan M2-T3; also in docs/specs/p6-activity-codes/m2-record.md).
-- Taken 2026-10-27 on the local PostgreSQL 16.15 (Ubuntu, glibc) in a shared container, NOT the
-- deployed host and NOT postgres:17-alpine (no Docker daemon here; CI runs the e2e reading on 17).
-- Synthetic rows were written by SQL with time-ordered v7-shaped keys, except where the seed
-- catalogue is named. Times are warm, 3 reps, the range given.
--   1. Duration of this file, whole, in one transaction rolled back, measured inside the transaction:
--        the seed catalogue (`--tier all` seeded through the REST API at migration A: 31 plans,
--          428 activities): 51–58 ms;
--        10 × 5,000 = 50,000 activities: 85–98 ms, of which uq_activities_plan_id_id 35–37 ms;
--        100 × 5,000 = 500,000 activities and 2,000,000 baseline_activities rows: 685–824 ms, of which
--          uq_activities_plan_id_id 276–359 ms and ck_baseline_activities_code_lane_pair's scan
--          337–462 ms.
--   3. Expiry of one coded plan: 5,000 activities, 30 types × 50 values, every activity carrying every
--      type (150,000 assignments, written contiguously as an import writes them), 15,000 code lanes and
--      10,000 history rows interleaved at random, inside a database of ten such plans (1.5 M
--      assignments). The runner's order, literal IN lists, one transaction rolled back:
--        history 27–30 ms · code lanes 7.3–7.4 ms · assignments 68–76 ms (253 ms on the first, cold
--        rep) · activities 264–277 ms · pointer clear 0.8–1.1 ms · values (1,500) 74–118 ms ·
--        types (30) 133–156 ms · plan 2.6–3.4 ms. About 0.6 s in all.
--        WITHOUT idx_code_swimlane_lanes_type_value: values 15.1–16.1 s — each deleted value's
--          RESTRICT check scans all 150,000 lane rows. ~150×.
--        WITHOUT idx_code_value_assignments_type_value: values 177 s — each scans 1.5 M assignments.
--          ~1,800×, and alone three times the 60 s batch transaction. Both indexes stay.
--      ASSIGNMENT_ROWS_PER_ACTIVITY (for budgetCharge). An assignment's cost is its own delete plus
--      the dead index entries the value and type deletes then walk in their RESTRICT checks:
--      (68–76 + 74–118 + 133–156 ms) / 150,000 = 1.8–2.3 µs warm, 3.1 µs on the cold rep; a history
--      row here costs 2.7–3.0 µs. Scaling the calibrated HISTORY_ROWS_PER_ACTIVITY = 5 by that ratio
--      gives 5.8–8.2 warm and 4.4–4.9 cold; charging too little is the unsafe direction, so the lower
--      reading is taken: ASSIGNMENT_ROWS_PER_ACTIVITY = 4. Code lanes cost 0.5 µs a row and are
--      charged at the existing LANE_ROWS_PER_ACTIVITY = 2. Hand-edited codes interleaved on disk were
--      not measured; the lower constant is the headroom for them (TECH_DEBT #443 covers a cold
--      re-measure on the deployed host).
--   4. Q1, one capture of that plan. Copying every type — 150,000 assignments by INSERT … SELECT inside
--      the capture transaction into a two-index frozen table, as database-design §6.2 specified —
--      took 2.20–2.60 s, and its 15,000 code lanes 0.19–0.27 s: 2.4–2.8 s added, over the 1 s
--      ceiling. Decomposed: with the copy table's two foreign keys dropped 1.40 s; with its two
--      indexes dropped 2.02–2.23 s; with v4 ids instead of v7 2.21–2.49 s. The heap and WAL write of
--      150,000 rows alone exceeds 1 s here, so no key or index choice brings it under. THE FALLBACK
--      SHIPS: each captured activity's value and code lane FOR THE FROZEN SWIMLANE SOURCE TYPE only,
--      as three nullable columns on the baseline_activities row the capture already writes
--      (CodeSnapshotLevel SWIMLANE_TYPE). Its added work is two reads of that type (2.6–3.4 ms and
--      3.0–4.4 ms for 5,000 activities) and three more fields per row; no new rows, no new key checks.
--      What it cannot do: place a baseline's removed work in the swimlanes of a code type the plan
--      switched to after the capture; that work is counted instead.
--   5. Round trip. pg_dump -Fc / pg_restore (16.15 tools) of a database migrated from empty to this
--      file: all 299 constraint definitions and the 19 new index definitions identical text for text
--      (pg_get_constraintdef / pg_get_indexdef, diffed). scripts/backup-restore-check.sh on app_test:
--      see m2-record.md. The WBS branches use two comparisons, not BETWEEN, for the reason above them.
--   6. Case folding, PostgreSQL 16.15, glibc, database collation C.UTF-8 (libc provider): 'Électrique'
--      then 'éLECTRIQUE' in one plan refused 23505 by uq_code_types_plan_name; 'Étage' then 'éTAGE' in
--      one type refused 23505 by uq_code_values_type_short_code. CI's postgres:17-alpine reading is
--      test/code-schema.e2e-spec.ts.

-- 1. The baseline code-snapshot level (DB-2, in its fallback shape: see the header). CREATE TYPE and
-- its use in one transaction is legal; only ALTER TYPE … ADD VALUE plus use is not (that is why
-- migration A is a file of its own). No @@map (docs/DATABASE.md "Naming").
CREATE TYPE "CodeSnapshotLevel" AS ENUM ('NONE', 'SWIMLANE_TYPE');

-- 2. activities: the composite FK target for code_value_assignments and code_swimlane_lanes
-- (plan_id, activity_id). The one statement whose cost grows with existing data: a SHARE lock on
-- `activities` and a full scan and sort. Not CONCURRENTLY: that cannot run inside the migration's
-- transaction, and the API migrates before it serves (ADR-0018), so there is no traffic to protect.
-- See the header for the measurement. plan_id and id never change, so it costs nothing on update.
CREATE UNIQUE INDEX "uq_activities_plan_id_id" ON "activities"("plan_id", "id");

-- 3. code_types: a plan's code types.
CREATE TABLE "code_types" (
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

    CONSTRAINT "code_types_pkey" PRIMARY KEY ("id")
);

-- RESTRICT. ON UPDATE CASCADE is Prisma's default for a single-column key and the house default
-- (swimlanes has the same); ids never change, so it is kept as generated (database-design §16 D-P3).
ALTER TABLE "code_types" ADD CONSTRAINT "code_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "code_types" ADD CONSTRAINT "code_types_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FULL unique, declared in the model. The composite FK target for plans (the swimlane pointer),
-- assignments and lanes; its leftmost prefix also backs the plan_id FK, the plan's type list (≤ 100
-- live, sorted in memory by position, id), the cascade sweep and the expiry delete.
CREATE UNIQUE INDEX "uq_code_types_plan_id_id" ON "code_types"("plan_id", "id");

-- Backs the organization FK's RESTRICT check, IDOR loads and the export `org` read.
CREATE INDEX "code_types_organization_id_idx" ON "code_types"("organization_id");

-- Raw SQL, NOT declared (expression + predicate; `migrate diff` ignores it, so no drift). A live
-- name is unique per plan ignoring case; a soft-deleted name does not block reuse, so a restore onto
-- a name taken meanwhile is the service's 409, never a constraint surprise. Folding outside ASCII is
-- the collation's: see the header.
CREATE UNIQUE INDEX "uq_code_types_plan_name" ON "code_types" ("plan_id", lower("name")) WHERE "deleted_at" IS NULL;

-- Raw SQL, NOT declared (partial). The batch restore lookup; tiny, only stamped rows.
CREATE INDEX "idx_code_types_delete_batch_id" ON "code_types" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- The text of ck_swimlanes_name_shape as it landed after PR #1119: two comparisons, NOT BETWEEN, so
-- the stored definition survives pg_dump/pg_restore unchanged (docs/DATABASE.md "Constraints"). A
-- type name labels the UI and arrives from hostile files.
ALTER TABLE "code_types" ADD CONSTRAINT "ck_code_types_name_shape" CHECK (
  char_length("name") >= 1 AND char_length("name") <= 80 AND "name" = btrim("name")
  AND "name" !~ '[[:cntrl:]]'
);

-- Not unique, on purpose (the swimlanes Q1 reasoning). The cap of 100 live types per plan is a
-- service count under the plan advisory lock: a CHECK cannot count rows.
ALTER TABLE "code_types" ADD CONSTRAINT "ck_code_types_position_nonneg" CHECK ("position" >= 0);

-- 4. code_values: the values of a type. Flat: no parent_id. M0 (m0-record.md) found ACTVCODE's
-- parent column in one public source only, so by the owner's Q5 it is not stored yet; adding it is
-- an expand-only follow-up (a nullable column, a composite self-key, a partial FK index).
CREATE TABLE "code_values" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code_type_id" UUID NOT NULL,
    "short_code" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "code_values_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "code_values" ADD CONSTRAINT "code_values_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "code_values" ADD CONSTRAINT "code_values_code_type_id_fkey" FOREIGN KEY ("code_type_id") REFERENCES "code_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FULL unique, declared. The composite FK target for assignments and lanes; its leftmost prefix
-- backs the code_type_id FK, a type's value list (≤ 1,000 live, sorted in memory), the sweeps and
-- the expiry delete.
CREATE UNIQUE INDEX "uq_code_values_type_id_id" ON "code_values"("code_type_id", "id");

-- Backs the organization FK's RESTRICT check and the export `org` read.
CREATE INDEX "code_values_organization_id_idx" ON "code_values"("organization_id");

-- Raw SQL, NOT declared. A live short code is unique per type ignoring case: two values differing
-- only by case would be indistinguishable to a planner, so the import folds them and reports it.
CREATE UNIQUE INDEX "uq_code_values_type_short_code" ON "code_values" ("code_type_id", lower("short_code")) WHERE "deleted_at" IS NULL;

-- Raw SQL, NOT declared (partial). The batch restore lookup.
CREATE INDEX "idx_code_values_delete_batch_id" ON "code_values" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- PROVISIONAL bound (Q5): 80 is the swimlane name's. P6's real ceiling is owed by M0-T2 (a real
-- export); if it is higher, an expand-only follow-up widens this CHECK.
ALTER TABLE "code_values" ADD CONSTRAINT "ck_code_values_short_code_shape" CHECK (
  char_length("short_code") >= 1 AND char_length("short_code") <= 80
  AND "short_code" = btrim("short_code") AND "short_code" !~ '[[:cntrl:]]'
);

-- PROVISIONAL bound (Q5), as above. Empty is stored as NULL, never ''. The OR keeps every comparison
-- inside one parenthesised AND list, which round-trips unchanged (proved: see the header).
ALTER TABLE "code_values" ADD CONSTRAINT "ck_code_values_description_shape" CHECK (
  "description" IS NULL OR (
    char_length("description") >= 1 AND char_length("description") <= 255
    AND "description" = btrim("description") AND "description" !~ '[[:cntrl:]]'
  )
);

ALTER TABLE "code_values" ADD CONSTRAINT "ck_code_values_position_nonneg" CHECK ("position" >= 0);

-- 5. code_value_assignments: which value an activity carries for a type.
CREATE TABLE "code_value_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "code_type_id" UUID NOT NULL,
    "code_value_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "code_value_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "code_value_assignments" ADD CONSTRAINT "code_value_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- COMPOSITE, each carrying its scope column, so the DATABASE refuses an activity of another plan, a
-- type of another plan and a value of another type (23503; asserted by test/code-schema.e2e-spec.ts).
-- ON UPDATE RESTRICT, not CASCADE: a scope column is part of each key, so a cascading update would
-- move rows between plans or types as a side effect.
ALTER TABLE "code_value_assignments" ADD CONSTRAINT "code_value_assignments_plan_id_activity_id_fkey" FOREIGN KEY ("plan_id", "activity_id") REFERENCES "activities"("plan_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "code_value_assignments" ADD CONSTRAINT "code_value_assignments_plan_id_code_type_id_fkey" FOREIGN KEY ("plan_id", "code_type_id") REFERENCES "code_types"("plan_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "code_value_assignments" ADD CONSTRAINT "code_value_assignments_code_type_id_code_value_id_fkey" FOREIGN KEY ("code_type_id", "code_value_id") REFERENCES "code_values"("code_type_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- One value per (activity, type); the upsert arbiter; the (plan_id, activity_id) FK RESTRICT check
-- (leftmost two columns, no predicate); the plan load and the page load; the expiry and
-- compensation delete by plan_id. plan_id leads: with (activity_id, …) the plan load was a
-- sequential scan, 372 ms against 65 ms at 1.5 M rows (database-design §5.4, probed).
CREATE UNIQUE INDEX "uq_code_value_assignments_plan_activity_type" ON "code_value_assignments"("plan_id", "activity_id", "code_type_id");

-- "Activities by value of type T", the per-value counts, and the (code_type_id, code_value_id) and
-- (plan_id, code_type_id) FK RESTRICT checks when expiry deletes values and types. See the header:
-- without it the expiry of one large plan does not finish in the run's transaction.
CREATE INDEX "idx_code_value_assignments_type_value" ON "code_value_assignments"("code_type_id", "code_value_id");

CREATE INDEX "code_value_assignments_organization_id_idx" ON "code_value_assignments"("organization_id");

-- 6. code_swimlane_lanes: an activity's lane inside a code swimlane, per (type, value). A table of
-- its own rather than two columns on activity_swimlane_lanes: see the header.
CREATE TABLE "code_swimlane_lanes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "code_type_id" UUID NOT NULL,
    "code_value_id" UUID,
    "lane_index" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "code_swimlane_lanes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "code_swimlane_lanes" ADD CONSTRAINT "code_swimlane_lanes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite, as for assignments. The value key is MATCH SIMPLE: a NULL code_value_id ("no value of
-- this type") is admitted, and the type is still checked through its own key.
ALTER TABLE "code_swimlane_lanes" ADD CONSTRAINT "code_swimlane_lanes_plan_id_activity_id_fkey" FOREIGN KEY ("plan_id", "activity_id") REFERENCES "activities"("plan_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "code_swimlane_lanes" ADD CONSTRAINT "code_swimlane_lanes_plan_id_code_type_id_fkey" FOREIGN KEY ("plan_id", "code_type_id") REFERENCES "code_types"("plan_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "code_swimlane_lanes" ADD CONSTRAINT "code_swimlane_lanes_code_type_id_code_value_id_fkey" FOREIGN KEY ("code_type_id", "code_value_id") REFERENCES "code_values"("code_type_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- HAND-EDITED: Prisma generates this WITHOUT `NULLS NOT DISTINCT`, which Prisma 6 cannot express.
-- Declared in the model as a plain @@unique of the same name (docs/DATABASE.md "Indexes": an
-- undeclared unique on plain columns is drift; a declared one is compared by name and columns only).
-- The clause makes the "no value" row (code_value_id NULL) one per (activity, type), so
-- INSERT … ON CONFLICT (plan_id, activity_id, code_type_id, code_value_id) updates it rather than
-- adding a second. Also the activity FK RESTRICT check (leftmost prefix) and the lanes load.
CREATE UNIQUE INDEX "uq_code_swimlane_lanes_basis" ON "code_swimlane_lanes"("plan_id", "activity_id", "code_type_id", "code_value_id") NULLS NOT DISTINCT;

-- The type and value FK RESTRICT checks when expiry deletes values and types. See the header.
CREATE INDEX "idx_code_swimlane_lanes_type_value" ON "code_swimlane_lanes"("code_type_id", "code_value_id");

CREATE INDEX "code_swimlane_lanes_organization_id_idx" ON "code_swimlane_lanes"("organization_id");

-- Mirrors ck_activity_swimlane_lanes_lane_index_nonneg; the 10,000 ceiling stays in the DTO.
ALTER TABLE "code_swimlane_lanes" ADD CONSTRAINT "ck_code_swimlane_lanes_lane_index_nonneg" CHECK ("lane_index" >= 0);

-- 7. plans: the code type the swimlanes are made from. Nullable: metadata-only.
ALTER TABLE "plans" ADD COLUMN     "swimlane_code_type_id" UUID;

-- COMPOSITE on the plan's OWN id, so a type of another plan is refused (23503). Validates by scanning
-- `plans`; every value is NULL, so nothing is looked up. No index: the referencing side is the plans
-- primary key. It closes a RESTRICT cycle with code_types.plan_id, so every hard-delete path clears
-- this pointer before deleting types: see the header.
ALTER TABLE "plans" ADD CONSTRAINT "plans_id_swimlane_code_type_id_fkey" FOREIGN KEY ("id", "swimlane_code_type_id") REFERENCES "code_types"("plan_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Replaced, fail-closed as before: a fifth source is REJECTED until it gets a branch. The WBS level
-- is two comparisons, not BETWEEN: the branch gains a third conjunct, and a BETWEEN as the left
-- operand of an AND does not survive pg_dump/pg_restore text-for-text (docs/DATABASE.md
-- "Constraints"; the round trip is in the header). `IS NOT NULL AND` stays load-bearing: a CHECK
-- admits NULL. Re-adding validates by scanning `plans`; every existing row has a NULL type and a
-- source of NONE, MANUAL or WBS, so it is trivially true (ADR-0107).
ALTER TABLE "plans" DROP CONSTRAINT "ck_plans_swimlane_source_level";

ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_swimlane_source_level" CHECK (
  CASE "swimlane_source"
    WHEN 'NONE'          THEN "swimlane_wbs_level" IS NULL AND "swimlane_code_type_id" IS NULL
    WHEN 'MANUAL'        THEN "swimlane_wbs_level" IS NULL AND "swimlane_code_type_id" IS NULL
    WHEN 'WBS'           THEN "swimlane_code_type_id" IS NULL AND "swimlane_wbs_level" IS NOT NULL
                              AND "swimlane_wbs_level" >= 1 AND "swimlane_wbs_level" <= 3
    WHEN 'ACTIVITY_CODE' THEN "swimlane_wbs_level" IS NULL AND "swimlane_code_type_id" IS NOT NULL
    ELSE false
  END
);

-- 8. baselines: the frozen swimlane code type (mandatory whatever DB-2 said: without it the first
-- capture of a code-sourced plan fails 23514, database-design §6.1) and the code-snapshot level
-- (DB-2's fallback). The type is a correlation id with NO foreign key (ADR-0025). Nullable and
-- constant-DEFAULT columns: metadata-only. 'NONE' is the literal and permanent truth of every
-- existing baseline.
ALTER TABLE "baselines" ADD COLUMN     "swimlane_code_type_id" UUID,
ADD COLUMN     "code_snapshot_level" "CodeSnapshotLevel" NOT NULL DEFAULT 'NONE';

-- Replaced. The inner CASE is the new ck_plans_swimlane_source_level verbatim, so a frozen copy
-- cannot hold what its source refuses; fail-closed on BOTH discriminators as before. Validates by
-- scanning `baselines`; every existing row has a NULL type and is trivially true.
ALTER TABLE "baselines" DROP CONSTRAINT "ck_baselines_swimlane_snapshot_shape";

ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_swimlane_snapshot_shape" CHECK (
  CASE "swimlane_snapshot_level"
    WHEN 'NONE' THEN "swimlane_source" IS NULL AND "swimlane_wbs_level" IS NULL
                     AND "swimlane_code_type_id" IS NULL
    WHEN 'FULL' THEN
      CASE "swimlane_source"
        WHEN 'NONE'          THEN "swimlane_wbs_level" IS NULL AND "swimlane_code_type_id" IS NULL
        WHEN 'MANUAL'        THEN "swimlane_wbs_level" IS NULL AND "swimlane_code_type_id" IS NULL
        WHEN 'WBS'           THEN "swimlane_code_type_id" IS NULL AND "swimlane_wbs_level" IS NOT NULL
                                  AND "swimlane_wbs_level" >= 1 AND "swimlane_wbs_level" <= 3
        WHEN 'ACTIVITY_CODE' THEN "swimlane_wbs_level" IS NULL AND "swimlane_code_type_id" IS NOT NULL
        ELSE false
      END
    ELSE false
  END
);

-- Fail-closed: SWIMLANE_TYPE says "the frozen swimlane code type's value and lane were recorded on
-- every captured activity", and which type that is comes from the frozen swimlane source, so it
-- requires the swimlane snapshot. A third level is REJECTED until it gets a branch. Validates by
-- scanning `baselines`; every existing row is NONE.
ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_code_snapshot_shape" CHECK (
  CASE "code_snapshot_level"
    WHEN 'NONE'          THEN true
    WHEN 'SWIMLANE_TYPE' THEN "swimlane_snapshot_level" = 'FULL'
    ELSE false
  END
);

-- 9. baseline_activities: each captured activity's code for the frozen swimlane source type (DB-2's
-- fallback; see the header for why not every type). One value per activity, so these are columns on
-- the row the capture already writes, not rows of a new table: the capture adds no INSERTs and no
-- foreign-key checks. Correlation ids with NO foreign key (ADR-0025): the snapshot must outlive the
-- live rows. Nullable, no default: metadata-only, and NULL is the truth of every existing row.
ALTER TABLE "baseline_activities" ADD COLUMN     "code_value_id" UUID,
ADD COLUMN     "code_lane_index" INTEGER,
ADD COLUMN     "code_lane_updated_at" TIMESTAMPTZ(3);

-- A frozen code lane is its index and its tie-break together, or neither ("never placed there"), and
-- an index is never negative (the live ck_code_swimlane_lanes_lane_index_nonneg). The value may be
-- NULL beside a lane: that is the "no value" swimlane's lane. Validates by scanning
-- `baseline_activities`, the one existing table here that can be large: see the header for its cost.
ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_code_lane_pair" CHECK (
  ("code_lane_index" IS NULL) = ("code_lane_updated_at" IS NULL)
  AND ("code_lane_index" IS NULL OR "code_lane_index" >= 0)
);
