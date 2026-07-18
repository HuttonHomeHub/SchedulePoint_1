-- M7 rung 5 — F2 Weighted steps: the activity_steps child table (Engine Conformance
-- Framework, ADR-0034 / ADR-0035 §33 + N27/N28, governed by ADR-0044 §2; builds on
-- ADR-0042 percent_complete_type = PHYSICAL).
--
-- The second of three independently shippable rung-5 slices. This slice is SCHEMA +
-- validation foundation only — NO scheduling behaviour. It introduces a `activity_steps`
-- child table: a weighted checklist per activity (`seq`, `name`, `weight`,
-- `percent_complete`). When an activity has steps, its PHYSICAL %-complete rolls up as the
-- weighted mean Σ(wᵢ·pᵢ)/Σ(wᵢ) and WINS over the manual physical_percent_complete; with no
-- steps the manual field behaves exactly as today (ADR-0042 parity). Steps feed the PHYSICAL
-- Earned-Value measure ONLY — a pure read-model, no CPM engine change, no date moves.
--
-- Fully additive and byte-parity: with no `activity_steps` rows present, every prior golden +
-- scenario recalculates byte-identically (the ADR-0034 parity gate — nothing reads steps
-- until the F2-2/F2-3 rollup lands, and the CPM write path is untouched). A new table is a
-- catalog-only create (no rewrite of any existing table).
--
-- A FULL reference-template child, modelled exactly like resource_assignments /
-- calendar_exceptions: UUID v7 PK, snake_case columns, timestamptz UTC, soft delete +
-- delete_batch_id, TEXT audit ids (Better Auth ids are opaque TEXT), optimistic-locking
-- `version`, scoped indexes. organization_id is DENORMALISED from the parent activity
-- (service-copied inside the create transaction, NEVER client input; invariant:
-- organization_id == activity.organization_id), so an org-scope/IDOR check and the cascade
-- batch filter one indexed column without a join.
--
-- SOFT-DELETE CASCADE (flag for the F2 build — NOT implemented here). There is NO DB cascade.
-- Soft-deleting an activity SHOULD sweep its active steps under the SAME delete_batch_id, and
-- restore should bring exactly that batch back — the identical service-owned mechanism the
-- HierarchyLifecycleService already applies to a soft-deleted activity's incident dependency
-- edges and its resource assignments (ADR-0039 (d)). This is a lifecycle-service follow-on for
-- the F2 CRUD task, NOT a schema change: the FK stays ON DELETE RESTRICT (steps soft-delete
-- only; the referential check never fires — defence in depth), exactly like every other
-- hierarchy child.
--
-- WEIGHT PRECISION (database-architect decision). `weight` is DECIMAL(18,4) — the schema's
-- established exact-quantity precision, mirroring resource_assignments.budgeted_units /
-- actual_units and resources.max_units_per_hour / units_per_hour (docs/DATABASE.md: exact
-- data uses exact types; rate coefficients / quantities are Decimal(18,4), money is BIGINT).
-- A weight is a relative physical quantity, not money — so Decimal, not BIGINT minor units.
--
-- NEGATIVE-CASE GUARDS (raw SQL — Prisma cannot express CHECK; docs/DATABASE.md: enforce
-- invariants in the DB, not only in code). ck_activity_steps_weight_nonneg (`weight >= 0`,
-- the budgeted_units/N14 precedent; all-zero weights are legal — they trigger the N27 rollup
-- fallback, never a divide-by-zero and never a reject) and ck_activity_steps_percent_complete
-- _range (`0 <= percent_complete <= 100`, the N28 DB backstop behind the DTO 422
-- STEP_PERCENT_OUT_OF_RANGE reject, mirroring ck_activities_physical_percent_complete_range —
-- but NOT nullable-safe, because percent_complete is NOT NULL).
--
-- INDEXES. organization_id is a FULL index (backs its FK RESTRICT + org-scoped IDOR loads),
-- like every denormalised-org sibling. There is deliberately NO standalone activity_id index:
-- the partial unique uq_activity_steps_activity_seq (activity_id, seq) WHERE deleted_at IS NULL
-- has activity_id as its leftmost prefix, so it already serves the "load an activity's ACTIVE
-- steps ordered by seq" query (and the index is pre-sorted by seq) — the exact
-- uq_resource_assignments_activity_resource precedent. The FK RESTRICT check would want an
-- all-rows index, but steps soft-delete only so it never fires. The partial
-- idx_activity_steps_delete_batch_id (WHERE ... IS NOT NULL) backs batch restore.

-- CreateTable: the weighted-checklist step. organization_id is DENORMALISED from the parent
-- activity. weight is DECIMAL(18,4) (exact quantity, the budgeted_units precision);
-- percent_complete is SMALLINT NOT NULL DEFAULT 0 (a new step is 0% done).
CREATE TABLE "activity_steps" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "percent_complete" SMALLINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "activity_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: full org index backing the FK (RESTRICT) + org-scoped IDOR loads.
CREATE INDEX "activity_steps_organization_id_idx" ON "activity_steps"("organization_id");

-- AddForeignKey: activity_steps.organization_id → organizations (RESTRICT — never
-- hard-deleted; guards against orphaning). ON UPDATE CASCADE is Prisma's default.
ALTER TABLE "activity_steps" ADD CONSTRAINT "activity_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: activity_steps.activity_id → activities (RESTRICT — steps soft-delete only;
-- the service sweeps them with the activity under one delete_batch_id, ADR-0044 §2 — a
-- HierarchyLifecycleService follow-on for the F2 build). RESTRICT is defence in depth.
ALTER TABLE "activity_steps" ADD CONSTRAINT "activity_steps_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma cannot express CHECK). weight may never be negative —
-- the budgeted_units/N14 precedent (all-zero weights are legal, triggering the N27 rollup
-- fallback, not a reject).
ALTER TABLE "activity_steps" ADD CONSTRAINT "ck_activity_steps_weight_nonneg" CHECK ("weight" >= 0);

-- CheckConstraint (raw SQL). percent_complete is 0–100 — the N28 DB backstop behind the DTO
-- 422 STEP_PERCENT_OUT_OF_RANGE reject, mirroring ck_activities_physical_percent_complete
-- _range (NOT nullable-safe — percent_complete is NOT NULL).
ALTER TABLE "activity_steps" ADD CONSTRAINT "ck_activity_steps_percent_complete_range" CHECK ("percent_complete" >= 0 AND "percent_complete" <= 100);

-- Partial unique index (Prisma cannot express `WHERE ...`). At most ONE ACTIVE step per
-- (activity, seq); a soft-deleted step frees its seq for reuse. Backs the bulk-replace
-- dup-seq (409) check. Its leftmost prefix (activity_id) ALSO serves the "load an activity's
-- active steps ordered by seq" query (the index is pre-sorted by seq), so no standalone
-- activity_id index is added — the uq_resource_assignments_activity_resource precedent.
CREATE UNIQUE INDEX "uq_activity_steps_activity_seq" ON "activity_steps" ("activity_id", "seq") WHERE "deleted_at" IS NULL;

-- Partial index for batch restore (set only on rows soft-deleted together with the activity
-- that owns them).
CREATE INDEX "idx_activity_steps_delete_batch_id" ON "activity_steps" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Down (forward-only in prod; documented for completeness). Reversible — drop the table
-- (which drops its FKs, CHECKs, and indexes):
--   DROP TABLE "activity_steps";
