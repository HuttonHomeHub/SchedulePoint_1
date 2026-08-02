-- Per-assignment cost in the baseline snapshot: baseline_assignments (+ the two columns that
-- make it readable) — ADR-0071 M3 / CQ-1 option (B), product owner 2026-08-02; the second
-- amendment to ADR-0025 after ADR-0042's cost baseline itself.
--
-- WHAT THIS IS FOR. Since ADR-0071 an assignment's cost is time-phased over `[start ⊕ lag,
-- finish)` while the activity's own expense keeps `[start, finish)`, so Planned Value is a
-- cost-component-weighted sum, not one cost over one window. The only frozen number a baseline
-- held was the ACTIVITY TOTAL (`baseline_activities.budgeted_cost`, EV1/ADR-0042), so the shipped
-- read (`laggedPlannedValue`, earned-value.ts) splits that total by LIVE budget shares: exact on
-- the live-budget path, an APPROXIMATION against a captured baseline whose assignment mix has
-- changed since. This slice stores the decomposition instead, making the split exact for every
-- baseline captured after it. NOTHING CONSUMES THESE COLUMNS YET — capture still writes only the
-- activity total and EV still weights by live shares — so this migration is provably inert and
-- separately revertible.
--
-- ============================================================================================
-- THE BACK-FILL IS IMPOSSIBLE. NOT SKIPPED — IMPOSSIBLE.
-- ============================================================================================
--
-- A baseline captured before today froze one number per activity. That number cannot be
-- decomposed after the fact: the assignments it was made of may since have been re-costed,
-- re-lagged, added or unassigned, and their resources' `cost_per_unit` may have moved. Any
-- back-fill would compute a breakdown out of TODAY'S rows and stamp it as history — exactly what
-- ADR-0025's copy-not-reference rule exists to prevent. So old baselines keep the live-shares
-- approximation FOREVER, and the read must carry both paths for good.
--
-- Which makes the following the single most important line in this migration:
--
--     ZERO `baseline_assignments` ROWS IS AMBIGUOUS, SO IT IS NEVER THE SIGNAL.
--
-- A baseline with no rows is either (a) captured before this existed — undecomposable, fall back
-- to live shares — or (b) captured from a plan whose activities genuinely carry NO resource
-- assignments, in which case the snapshot is COMPLETE and PV is exact with no assignment
-- component at all. Those are opposite instructions to Earned Value, and `count(*) = 0` cannot
-- tell them apart. `baselines.cost_snapshot_level` can, and it is the ONLY thing that can:
--
--     ACTIVITY    a per-activity total and nothing about its make-up  → case (a), approximate
--     ASSIGNMENT  total + budgeted_expense + one row per assignment   → case (b) when empty, exact
--
-- The constant DEFAULT is `ACTIVITY`, which is not merely convenient — it is TRUE of every row
-- that already exists, and it is the SAFE direction: a write path that has not been taught the
-- new pass reads as approximate, never as exact-but-empty. A reader must NEVER infer the level
-- from a row count, and never from `budgeted_expense IS NULL` (a corroborating fact, not the
-- decision).
--
-- The pairing between the discriminator and the child rows CANNOT be a CHECK — they are in
-- different tables and a CHECK sees one row of one table. It is a service invariant held inside
-- the one capture transaction (the "exactly one driving assignment" precedent). Fail-closedness
-- lives at the TypeScript boundary: read the level with an exhaustive switch, so a future third
-- level is a compile error rather than a silently mis-scaled PV curve.
--
-- ============================================================================================
-- WHY THIS MIGRATION CANNOT FAIL
-- ============================================================================================
--
-- The API image is SELF-MIGRATING (ADR-0018): the container entrypoint runs `prisma migrate
-- deploy` on start, and the product owner runs the ADR-0047 Watchtower profile, so a released
-- image is pulled and recreated unattended. A migration that CAN fail is the API failing to BOOT
-- — an outage, not a failed deploy step. Every statement below is additive and touches no
-- existing row's data:
--
--   * CREATE TYPE / CREATE TABLE / CREATE INDEX on a brand-new table are catalogue-only. The new
--     table is empty at creation, so its inline CHECKs and its partial unique have nothing to
--     scan and nothing to reject; there is no NOT VALID/VALIDATE two-step because there is no
--     existing data for it to protect (contrast the `baseline_activities` CHECK below). The two
--     FKs take a brief SHARE ROW EXCLUSIVE on `baselines` / `organizations` — a lock, not a scan,
--     and no row of either is read.
--   * Using the enum labels in the same transaction that CREATEs the type is legal precisely
--     because the type is created here: the Postgres restriction is on ALTER TYPE ... ADD VALUE
--     against a PRE-EXISTING type (the two-migration rule of ADR-0053 §3). Same shape as
--     20260718030000_m7_resource_curve_type.
--   * ADD COLUMN "cost_snapshot_level" ... NOT NULL DEFAULT 'ACTIVITY' is METADATA-ONLY on
--     PostgreSQL 11+ (a non-volatile default lands in pg_attribute.attmissingval and is
--     materialised lazily): no rewrite, no scan, no long ACCESS EXCLUSIVE hold on `baselines`
--     however many baselines a tenant has captured.
--   * ADD COLUMN "budgeted_expense" BIGINT (nullable, no default) is likewise metadata-only.
--   * The one CHECK on an EXISTING table (`baseline_activities`) is added NOT VALID then
--     VALIDATEd. It cannot fail on existing data, and the reason is not "no row is known to
--     violate it": EVERY existing row holds SQL NULL in a column that did not exist one statement
--     earlier, and the constraint is nullable-safe (`IS NULL OR >= 0`). The two-step is kept for
--     uniformity with its siblings (…_calendar_hours_per_day, …_assignment_lag_minutes) and so
--     VALIDATE is the statement that scans, under SHARE UPDATE EXCLUSIVE rather than under the
--     ACCESS EXCLUSIVE that a validating ADD CONSTRAINT would hold for the whole scan.
--
-- No data migration, no backfill, no rewrite, nothing destructive. Every existing baseline keeps
-- today's meaning by construction.
--
-- ============================================================================================
-- SHAPE
-- ============================================================================================
--
-- `baseline_assignments` is a SIBLING of `baseline_activities`, modelled on it exactly: a
-- self-contained COPY whose `source_*` ids are plain correlation UUIDs with NO foreign key
-- (ADR-0025), so the snapshot survives the live assignment being re-costed, unassigned or
-- hard-purged; immutable after capture; the full housekeeping set; soft-deleting with its parent
-- baseline under one `delete_batch_id`.
--
-- REJECTED — a JSONB column on `baseline_activities`. Not on taste, on the house rules: money is
-- BIGINT minor units precisely so nothing rounds it (docs/DATABASE.md), and a JSON number is a
-- double in most drivers; the database could enforce neither `cost >= 0` nor the lag range ("the
-- database enforces integrity … the last line of defence"); it would be the schema's FIRST json
-- column, which is an ADR-level precedent rather than a convenience; and its shape would be
-- versioned in application code forever. REJECTED — repeating columns (`assignment_1_cost`, …):
-- an arbitrary arity cap on a 0..n relationship. REJECTED — parallel arrays (`BIGINT[]` +
-- `INT[]`): a CHECK can prove the two are the same length and nothing else, and per-element
-- bounds are not expressible without an immutable helper function.
--
-- `budgeted_cost` and `lag_minutes` are NOT NULL with NO DEFAULT, deliberately unlike their live
-- counterparts (`resource_assignments.lag_minutes DEFAULT 0`). There are no pre-existing rows to
-- default for — the table IS the feature — and a default here would let a capture record a number
-- it never stated, in a table whose entire purpose is that the number was frozen deliberately.
-- Prisma consequently requires both in `create`, so the compiler asks the question.
--
-- BOTH the cost AND the lag are frozen. A snapshot carrying the frozen cost but reading the LIVE
-- lag would time-phase frozen money through a window somebody edited afterwards — the same class
-- of drift this table removes, one field along. `budgeted_units`, `units_per_hour`, `curve_type`
-- and the activity's `accrual_type` are deliberately NOT frozen: PV weights cost and phases it by
-- the ACTIVITY-level accrual (ADR-0044 §32, unchanged by ADR-0071), and the histogram and
-- levelling read live rows by design. A snapshot column nothing reads is a claim nobody checks.
--
-- ============================================================================================
-- INDEXES — MEASURED, NOT ASSUMED (docs/ADR-0053 M4: an index is added on a MEASUREMENT)
-- ============================================================================================
--
-- Measured on PostgreSQL 16.13 against a populated `baseline_assignments`: 200 baselines ×
-- 1,000 components = 200,000 rows (54 MB), ANALYZEd, best of 5 runs after warm-up, reading ONE
-- baseline's whole component set (`WHERE baseline_id = ? AND deleted_at IS NULL`) — which is the
-- only read Earned Value performs, and the exact shape of `loadActiveBaselineCostSnapshot`:
--
--   uq_baseline_assignments_baseline_source_assignment   1.181 ms  bitmap index scan, 10 index
--                                                                  buffers + 1,000 heap blocks
--   no index (enable_indexscan/bitmapscan off)          12.538 ms  parallel seq scan, 199,000
--                                                                  rows removed by filter  ~10.6×
--   + a (baseline_id, source_activity_id) composite      1.188 ms  unchanged (−0.007 ms), 9,736 kB
--
-- So ONE partial unique earns its place three times over — it (1) states the freeze-once
-- invariant in the database (a capture writes each assignment at most once; a duplicate could
-- only ever be a bug, which is what a unique index is for), (2) IS the EV read path via its
-- leftmost prefix, and (3) covers the `baseline_id` FK — and the sibling-shaped
-- `(baseline_id, source_activity_id)` composite is REJECTED on its own measurement: the read
-- loads the whole baseline and groups in memory (as `loadActiveBaselineCostSnapshot` already
-- does), so the second column is never a predicate and the extra index buys 0.007 ms — inside the
-- run-to-run spread — for 9,736 kB and a third index on every bulk capture insert. Note also what
-- the 10.6× understates: the sequential scan's cost grows with every baseline the tenant ever
-- captured, while the index scan's does not. The unique is PARTIAL (`WHERE deleted_at IS NULL`)
-- because baselines soft-delete
-- only, so the FK RESTRICT check never fires — the idx_plan_shares_plan_id /
-- uq_resource_assignments_activity_resource precedent. `organization_id` is a FULL index (its FK
-- RESTRICT + org-scoped IDOR loads), like every denormalised-org sibling.
--
-- No index on the two new columns of the existing tables: `cost_snapshot_level` is read with its
-- own baseline row by id and is never a predicate (the `scheduling_mode` / `curve_type`
-- precedent), and `budgeted_expense` is read as part of a snapshot loaded whole.
--
-- DIRECTION: forward-only in production (docs/DATABASE.md). A documented Down block is at the
-- foot; it is genuinely safe here, because everything it drops was created by this migration.

-- CreateEnum: what a baseline's cost snapshot decomposes to. 'ACTIVITY' is what every existing
-- baseline is, and is the constant DEFAULT below. MUST stay in lock-step with @repo/types when
-- Earned Value surfaces it.
CREATE TYPE "BaselineCostSnapshotLevel" AS ENUM ('ACTIVITY', 'ASSIGNMENT');

-- AddColumn: the discriminator that makes "no rows" unambiguous (see the block above — this is
-- the load-bearing statement of the migration). Metadata-only: constant, non-volatile DEFAULT.
ALTER TABLE "baselines"
  ADD COLUMN "cost_snapshot_level" "BaselineCostSnapshotLevel" NOT NULL DEFAULT 'ACTIVITY';

-- AddColumn: the ACTIVITY-EXPENSE half of the frozen activity total, so the decomposition is
-- stated rather than derived as `budgeted_cost − Σ(rows)` — arithmetically exact today, and
-- silently wrong the day the total is computed by a rule the subtraction does not know about.
-- Nullable with no default: NULL = "not decomposed" (an ACTIVITY-level baseline), which is
-- honest, where a NOT NULL DEFAULT 0 would be the claim "this activity had no expense" on rows
-- where that is unknowable. Corroborating only — `cost_snapshot_level` is the decision.
ALTER TABLE "baseline_activities" ADD COLUMN "budgeted_expense" BIGINT;

-- CheckConstraint (raw SQL — Prisma cannot express CHECK). Nullable-safe, mirroring the live
-- ck_activities_budgeted_expense_nonneg exactly. NOT VALID + VALIDATE per the boot-safety
-- argument above; it cannot fail, because every existing row holds NULL in a column that did not
-- exist one statement earlier.
ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_budgeted_expense_nonneg"
  CHECK ("budgeted_expense" IS NULL OR "budgeted_expense" >= 0) NOT VALID;
ALTER TABLE "baseline_activities" VALIDATE CONSTRAINT "ck_baseline_activities_budgeted_expense_nonneg";

-- CreateTable: one resource assignment's frozen cost inside a baseline. The three source_* ids
-- are PLAIN correlation UUIDs with NO foreign key (ADR-0025's copy-not-reference rule);
-- organization_id is DENORMALISED from the parent baseline. budgeted_cost is BIGINT minor units
-- (docs/DATABASE.md money rule); lag_minutes is working minutes (the *_minutes naming rule — the
-- unit is in the name because a day/minute confusion has already cost two defects).
CREATE TABLE "baseline_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "baseline_id" UUID NOT NULL,
    "source_assignment_id" UUID NOT NULL,
    "source_activity_id" UUID NOT NULL,
    "source_resource_id" UUID NOT NULL,
    "budgeted_cost" BIGINT NOT NULL,
    "lag_minutes" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "baseline_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: full org index backing the FK (RESTRICT) + org-scoped IDOR loads.
CREATE INDEX "baseline_assignments_organization_id_idx" ON "baseline_assignments"("organization_id");

-- AddForeignKey: baseline_assignments.organization_id → organizations (RESTRICT — never
-- hard-deleted; guards against orphaning). ON UPDATE CASCADE is Prisma's default.
ALTER TABLE "baseline_assignments" ADD CONSTRAINT "baseline_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: baseline_assignments.baseline_id → baselines (RESTRICT — a baseline and its
-- snapshot rows soft-delete together under one delete_batch_id; the referential check never
-- fires, so RESTRICT is defence in depth). This is the ONLY FK on the table: the three source_*
-- ids deliberately have none.
ALTER TABLE "baseline_assignments" ADD CONSTRAINT "baseline_assignments_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL). A frozen cost may never be negative — plain, NOT nullable-safe,
-- because the column is NOT NULL (the ck_activity_steps_percent_complete_range precedent). The
-- backstop behind the capture path, not a user-facing reject: nothing client-supplied reaches
-- this table, so a violation here means a capture computed a negative cost.
ALTER TABLE "baseline_assignments" ADD CONSTRAINT "ck_baseline_assignments_budgeted_cost_nonneg" CHECK ("budgeted_cost" >= 0);

-- CheckConstraint (raw SQL). The frozen lag repeats the live column's bounds exactly
-- (ck_resource_assignments_lag_minutes_range): unsigned — a resource cannot join before the work
-- starts, and the read-model applies a lag only when `> 0`, so a negative would be SILENTLY
-- DISCARDED — and capped at 5,256,000 (≈ 10 years), the same magnitude as every other
-- working-minute ceiling in the schema, so there is ONE answer to "how large may a working-minute
-- quantity be" rather than four.
ALTER TABLE "baseline_assignments" ADD CONSTRAINT "ck_baseline_assignments_lag_minutes_range" CHECK ("lag_minutes" BETWEEN 0 AND 5256000);

-- Partial unique index (Prisma cannot express `WHERE ...`, so schema.prisma declares NO @@index
-- for it — a declared index the database does not have breaks prisma:check-drift, TECH_DEBT #54).
-- ONE index doing three jobs, per the measurement above: the freeze-once invariant, the EV
-- read path (leftmost prefix `baseline_id`), and the baseline_id FK.
CREATE UNIQUE INDEX "uq_baseline_assignments_baseline_source_assignment" ON "baseline_assignments" ("baseline_id", "source_assignment_id") WHERE "deleted_at" IS NULL;

-- Partial index for batch restore (set only on rows soft-deleted together with their baseline).
CREATE INDEX "idx_baseline_assignments_delete_batch_id" ON "baseline_assignments" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Down (forward-only in prod, ADR-0018; documented for completeness). Safe in a way most of its
-- siblings are not — everything below was created by this migration, so dropping it destroys only
-- data authored after it shipped:
--   DROP TABLE "baseline_assignments";
--   ALTER TABLE "baseline_activities" DROP CONSTRAINT "ck_baseline_activities_budgeted_expense_nonneg";
--   ALTER TABLE "baseline_activities" DROP COLUMN "budgeted_expense";
--   ALTER TABLE "baselines" DROP COLUMN "cost_snapshot_level";
--   DROP TYPE "BaselineCostSnapshotLevel";
