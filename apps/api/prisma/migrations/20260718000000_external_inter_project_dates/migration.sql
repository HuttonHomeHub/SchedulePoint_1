-- External / inter-project dates: two per-activity imported instants + one plan-level
-- ignore-external scheduling option (Programme / multi-plan scheduling — ADR-0043,
-- ADR-0035 §30, Milestone 1, Task F4.T1).
--
-- Models the conformance fixture's `net_external_*` / `interproject` axis (scenario
-- S09) as STATIC imported dates + a toggle — NOT a live cross-plan solve (deferred to
-- ADR-0043 Milestone 2):
--   * activities.external_early_start  — an SNET-shaped forward LOWER bound imported
--     from an UPSTREAM project (the earliest it hands this activity over).
--   * activities.external_late_finish  — an FNLT-shaped backward UPPER bound imported
--     from a DOWNSTREAM project (the latest it may finish).
--   * plans.ignore_external_relationships — the P6 "ignore relationships to/from other
--     projects" toggle: when true the recalc drops BOTH external bounds.
--
-- The two activity columns are TIMESTAMPTZ (absolute working-instants, the ADR-0037
-- axis), NOT DATE — deliberately UNLIKE constraint_date / actual_start / the CPM
-- *_start/finish columns (all @db.Date calendar days). They are ABSOLUTE interface
-- commitments from another project (a vendor delivery), independent of this plan's data
-- date, so a data-date change must never move them (ADR-0043 "store absolute, not
-- offsets"). They are CLIENT-SETTABLE inputs (a write DTO sets them), NOT engine-owned;
-- the engine clamps early start up to / late finish down to them on the existing
-- forward/backward passes (no new pass), gated on ignore_external_relationships. They
-- are SOFT bounds — never mandatory pins, never set constraint_violated.
--
-- Fully additive and reversible; no data migration.
--   * external_early_start / external_late_finish are nullable with no DEFAULT ⇒ every
--     existing activity reads "no external bound" and the byte-parity golden path is
--     unchanged (the secondary-constraint / expected_finish precedent).
--   * ignore_external_relationships has a constant DEFAULT false ⇒ it backfills every
--     existing plan in the SAME statement (external bounds honoured / inert), so the
--     default is behaviour-preserving (the make_open_ends_critical / level_resources
--     precedent).
-- On Postgres 11+ a nullable ADD COLUMN (no DEFAULT) and an ADD COLUMN with a constant
-- DEFAULT are BOTH metadata-only catalog changes — no table rewrite, no full-table
-- scan, no lock held beyond a brief ACCESS EXCLUSIVE for the catalog update — so this is
-- fast and non-locking at any data volume, even on the (large) activities table (the
-- posture of m2_progress_fields / m4_secondary_constraint / m4_expected_finish;
-- docs/DATABASE.md).
--
-- No new index on any of the three: the two activity instants are read only on the
-- full-plan recalc load (WHERE organization_id / plan_id / deleted_at, served by the
-- existing (plan_id, created_at, id) index) and consumed by the engine's whole-plan
-- pass — never a WHERE/ORDER BY/JOIN predicate (the unindexed secondary_constraint /
-- expected_finish precedent); ignore_external_relationships is a single-row plan column
-- read with the plan, never filtered across plans (the scheduling_mode /
-- make_open_ends_critical precedent). Indexing columns no predicate targets would only
-- cost writes (docs/DATABASE.md: index real query patterns, not columns).

-- Activity external-date instants -------------------------------------------
ALTER TABLE "activities" ADD COLUMN "external_early_start" TIMESTAMPTZ(3);
ALTER TABLE "activities" ADD COLUMN "external_late_finish" TIMESTAMPTZ(3);

-- N26 DB backstop: an external window must be non-inverted — external_late_finish must
-- be at or after external_early_start when BOTH are set. NULLABLE-SAFE (either NULL is
-- legal, so it never blocks the common one-sided / no-external path), mirroring
-- ck_activities_resume_after_suspend exactly. This is the DEFENCE-IN-DEPTH backstop
-- behind the DTO's 422 EXTERNAL_FINISH_BEFORE_START (ADR-0035 §30 N26): the service
-- rejects first, this guarantees a half-checked write can never persist an impossible
-- window even if a future code path bypasses the DTO. Added with the lock-friendly
-- ADD CONSTRAINT … NOT VALID → VALIDATE CONSTRAINT pattern (VALIDATE takes only
-- SHARE UPDATE EXCLUSIVE, not blocking reads/writes); on the freshly-added, uniformly
-- NULL columns there is nothing to validate, so this is purely defensive form.
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_external_finish_after_start"
  CHECK ("external_late_finish" IS NULL OR "external_early_start" IS NULL OR "external_late_finish" >= "external_early_start") NOT VALID;
ALTER TABLE "activities" VALIDATE CONSTRAINT "ck_activities_external_finish_after_start";

-- Plan-level ignore-external option -----------------------------------------
-- Constant DEFAULT false backfills every existing plan in the same statement; the
-- engine honours external bounds unless this is on (S09). Read with the plan row, never
-- filtered across plans, so no index (mirrors make_open_ends_critical).
ALTER TABLE "plans" ADD COLUMN "ignore_external_relationships" BOOLEAN NOT NULL DEFAULT false;

-- Down (forward-only in prod; documented for completeness): fully reversible —
--   ALTER TABLE "plans" DROP COLUMN "ignore_external_relationships";
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_external_finish_after_start";
--   ALTER TABLE "activities" DROP COLUMN "external_late_finish";
--   ALTER TABLE "activities" DROP COLUMN "external_early_start";
