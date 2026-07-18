-- Live cross-plan (inter-project) dependencies + the plan schedule freshness cursor
-- (Programme / multi-plan scheduling — ADR-0045, ADR-0035 §30.5–§30.8, Milestone 2,
-- Feature F2).
--
-- Delivers the LIVE cross-plan edge that ADR-0043 Milestone 1 explicitly deferred: a
-- first-class logic edge whose predecessor and successor activities live in DIFFERENT
-- plans of the SAME organisation. At recalc time the SERVICE derives each successor's M1
-- external bounds (activities.external_early_start / external_late_finish) from the linked
-- activity's persisted computed dates — the pure `computeSchedule` never sees this table
-- (parity by construction, ADR-0045 §2). A plan with no cross-plan edges is byte-identical.
--
--   * cross_plan_dependencies — the org-scoped edge, mirroring `dependencies`
--     (ActivityDependency) exactly (type FS/SS/FF/SF, signed working-MINUTE lag_minutes,
--     the lag_calendar resolution seam, soft-delete + delete_batch_id, audit, optimistic
--     version) BUT carrying BOTH plan ids denormalised (predecessor_plan_id,
--     successor_plan_id) for org-scoping, the plan-level cycle walk (§3) and the
--     topological programme order (§4). It is DELIBERATELY SEPARATE from `dependencies`,
--     which asserts a single plan_id for both endpoints (ADR-0021) — that table is NOT
--     touched. It OMITS the engine-owned `is_driving` column (the engine never consumes
--     cross-plan edges — they are derived above it).
--   * plans.schedule_computed_at — an engine-owned nullable freshness cursor stamped by
--     the recalc write (F6). Read-time staleness (§5) is a bounded walk comparing this
--     across a plan's upstream closure. Pull only — no background push in M2.
--
-- Fully additive and reversible; NO data migration / backfill.
--   * cross_plan_dependencies is a brand-new table (nothing to backfill).
--   * plans.schedule_computed_at is nullable with NO DEFAULT ⇒ every existing plan reads
--     NULL ("never calculated", which the derivation treats as an absent upstream bound —
--     N32), so the byte-parity golden path is unchanged (the external_early_start /
--     expected_finish nullable-add precedent). On Postgres 11+ a nullable ADD COLUMN with
--     no DEFAULT is a metadata-only catalog change — no table rewrite, no full scan, only a
--     brief ACCESS EXCLUSIVE for the catalog update — fast/non-locking at any data volume.
-- ADR-0018 self-migrating image applies this cleanly; forward-only in prod (down is
-- documented at the foot for completeness).

-- Cross-plan dependency edge -------------------------------------------------
-- Reuses the existing "DependencyType" and "LagCalendarSource" enums (created by
-- 20260710104109_add_dependencies and 20260715120000_activity_dependency_baseline_minutes);
-- no new enum is defined.
CREATE TABLE "cross_plan_dependencies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "predecessor_plan_id" UUID NOT NULL,
    "successor_plan_id" UUID NOT NULL,
    "predecessor_id" UUID NOT NULL,
    "successor_id" UUID NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lag_minutes" INTEGER NOT NULL DEFAULT 0,
    "lag_calendar" "LagCalendarSource" NOT NULL DEFAULT 'PROJECT_DEFAULT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "cross_plan_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the successor plan is the edge's HOME (ADR-0045 CQ-2). This composite
-- covers loading a plan's INCOMING cross-plan edges (the forward-derivation load), the
-- plan-scoped list AND its cursor sort, and the successor_plan FK (leftmost prefix) in
-- one; it subsumes a standalone successor_plan_id index (the dependencies
-- (plan_id, created_at, id) precedent).
CREATE INDEX "cross_plan_dependencies_successor_plan_id_created_at_id_idx" ON "cross_plan_dependencies"("successor_plan_id", "created_at", "id");

-- CreateIndex — load a plan's OUTGOING edges (the backward-derivation load) and back the
-- predecessor_plan FK (RESTRICT).
CREATE INDEX "cross_plan_dependencies_predecessor_plan_id_idx" ON "cross_plan_dependencies"("predecessor_plan_id");

-- CreateIndex — back the predecessor activity FK (RESTRICT) and the per-activity
-- incident-edge list / cascade sweep (the dependencies direction-index precedent).
CREATE INDEX "cross_plan_dependencies_predecessor_id_idx" ON "cross_plan_dependencies"("predecessor_id");

-- CreateIndex — back the successor activity FK (RESTRICT) and the per-activity
-- incident-edge list / cascade sweep.
CREATE INDEX "cross_plan_dependencies_successor_id_idx" ON "cross_plan_dependencies"("successor_id");

-- CreateIndex — back the org FK (RESTRICT) and the org-scoped adjacency load the
-- plan-level cycle walk (ADR-0045 §3) reads (bounded by plan count, not activities).
CREATE INDEX "cross_plan_dependencies_organization_id_idx" ON "cross_plan_dependencies"("organization_id");

-- AddForeignKey — all four are ON DELETE RESTRICT (a live schedule edge is NEVER
-- cascade-deleted; soft-delete + endpoint-guarded restore is service-owned).
ALTER TABLE "cross_plan_dependencies" ADD CONSTRAINT "cross_plan_dependencies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cross_plan_dependencies" ADD CONSTRAINT "cross_plan_dependencies_predecessor_plan_id_fkey" FOREIGN KEY ("predecessor_plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cross_plan_dependencies" ADD CONSTRAINT "cross_plan_dependencies_successor_plan_id_fkey" FOREIGN KEY ("successor_plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cross_plan_dependencies" ADD CONSTRAINT "cross_plan_dependencies_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cross_plan_dependencies" ADD CONSTRAINT "cross_plan_dependencies_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (docs/DATABASE.md: enforce domain invariants in the DB, not only in
-- code). Prisma cannot express CHECK, so they are raw SQL.
--
-- N31 backstop: a cross-plan edge's endpoints MUST be in DIFFERENT plans — this is what
-- makes it a CROSS-plan edge (a same-plan link must use the intra-plan `dependencies`
-- table, ADR-0021). The service rejects same-plan endpoints with 422
-- CROSS_PLAN_SAME_PLAN before any write; this guarantees a same-plan cross-plan row can
-- never persist even if a future code path or direct SQL bypasses the service. It also
-- subsumes a self-loop CHECK (different plans ⇒ different activities).
ALTER TABLE "cross_plan_dependencies" ADD CONSTRAINT "ck_cross_plan_dependencies_different_plans" CHECK ("predecessor_plan_id" <> "successor_plan_id");

-- lag_minutes is a signed working-minute lag (negative = lead), bounded to the same
-- ±5_256_000 (≈ ±10 y) range as `dependencies` (ck_dependencies_lag_minutes_range).
-- Keeps a typo/overflow from corrupting the derived external bound.
ALTER TABLE "cross_plan_dependencies" ADD CONSTRAINT "ck_cross_plan_dependencies_lag_minutes_range" CHECK ("lag_minutes" BETWEEN -5256000 AND 5256000);

-- Partial unique index (Prisma cannot express `WHERE deleted_at IS NULL`). Mirrors
-- uq_dependencies_pred_succ_type: at most one ACTIVE link of each type between a given
-- ordered (predecessor, successor) pair (the SS+FF "ladder" is allowed, exact duplicates
-- are not). Backs the create N33 DUPLICATE_CROSS_PLAN_DEPENDENCY (409) check; a
-- soft-deleted link frees its (pred, succ, type) triple for reuse.
CREATE UNIQUE INDEX "uq_cross_plan_dependencies_pred_succ_type" ON "cross_plan_dependencies" ("predecessor_id", "successor_id", "type") WHERE "deleted_at" IS NULL;

-- Partial index for batch restore (Prisma cannot express `WHERE ... IS NOT NULL`).
-- delete_batch_id is set only on edges soft-deleted together in one operation; a partial
-- index keeps it tiny while making restore-by-batch an index lookup (the
-- idx_dependencies_delete_batch_id precedent). Edge soft-delete/cascade is service-owned.
CREATE INDEX "idx_cross_plan_dependencies_delete_batch_id" ON "cross_plan_dependencies" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Plan schedule freshness cursor ---------------------------------------------
-- Nullable ADD with NO DEFAULT ⇒ metadata-only, every existing plan reads NULL ("never
-- calculated"). Engine-owned (stamped now() by the recalc write, F6), never a client
-- input; read with the plan row and across a plan's small upstream closure, never
-- filtered/sorted across plans, so no index (the ignore_external_relationships / plan
-- option precedent).
ALTER TABLE "plans" ADD COLUMN "schedule_computed_at" TIMESTAMPTZ(3);

-- Down (forward-only in prod; documented for completeness): fully reversible —
--   ALTER TABLE "plans" DROP COLUMN "schedule_computed_at";
--   DROP TABLE "cross_plan_dependencies";
