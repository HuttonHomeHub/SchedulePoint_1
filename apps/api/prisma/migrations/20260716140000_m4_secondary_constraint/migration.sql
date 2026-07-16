-- M4 secondary constraint: a second per-activity schedule constraint pair
-- (Engine Conformance Framework, ADR-0035 §10, M4 Task F3).
--
-- The primary constraint pair (constraint_type/constraint_date) drives the CPM
-- forward pass; this secondary pair drives the backward pass. It is the exact
-- shape of the primary pair and, like it, CLIENT-SETTABLE (a user-facing write
-- DTO sets it) — NOT engine-owned. Both columns are nullable and default to NULL,
-- so every existing activity reads "no secondary constraint" and the byte-parity
-- golden path is unchanged; no data migration is required.
--
-- Fully additive and reversible. Both ADD COLUMNs are nullable with no DEFAULT, so
-- on Postgres 11+ each is a metadata-only catalog change — no table rewrite, no
-- full-table scan, no lock held beyond a brief ACCESS EXCLUSIVE for the catalog
-- update — so this is fast and non-locking at any data volume (same posture as
-- add_scheduling_modes_columns' visual_start; docs/DATABASE.md).
--
-- The CHECK mirrors the primary pair's ck_activities_constraint_pair: a constraint
-- type and its date are set together or not at all (an invariant Prisma can't
-- express, so it lives in raw SQL here). It is validated once against existing
-- rows on ADD — trivially satisfied because both new columns are uniformly NULL —
-- and holds cheaply on every future write.
--
-- No new index: the pair is read only as part of the already plan-scoped activity
-- load (WHERE organization_id / plan_id / deleted_at, served by the existing
-- (plan_id, created_at, id) index) and consumed by the engine's full-plan recalc;
-- no query filters or sorts by it, exactly like the unindexed primary pair. Indexing
-- columns no predicate targets would only cost writes (docs/DATABASE.md: index real
-- query patterns, not columns).
ALTER TABLE "activities" ADD COLUMN "secondary_constraint_type" "ConstraintType";
ALTER TABLE "activities" ADD COLUMN "secondary_constraint_date" DATE;

ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_secondary_constraint_pair"
  CHECK (("secondary_constraint_type" IS NULL) = ("secondary_constraint_date" IS NULL));

-- Down (forward-only in prod; documented for completeness): fully reversible —
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_secondary_constraint_pair";
--   ALTER TABLE "activities" DROP COLUMN "secondary_constraint_date";
--   ALTER TABLE "activities" DROP COLUMN "secondary_constraint_type";
