-- M7 rung 4: Duration types & the resource-units model (Engine Conformance Framework,
-- ADR-0034/0035 §26–§27, governed by ADR-0040; builds on ADR-0039/0036).
--
-- This slice is SCHEMA + ADR only — NO behaviour (the pure `resolveTriad` recompute and
-- its wiring are F2/F3, not this migration). It makes the (static) ADR-0039 resource
-- model DYNAMIC: it adds the per-activity P6 `duration_type` (which of the triad
-- {Duration, Units, Units/Time} is recomputed vs held on an edit) and the per-assignment
-- `units_per_hour` (the planned rate, the `Units/Time` term), so the identity
-- `Units = Duration × Units/Time` can be kept true at the write boundary.
--
-- Fully additive and byte-parity: with no `units_per_hour` on any driving assignment the
-- triad is INERT (`duration_minutes` stays as entered) and every prior golden + scenario
-- recalculates byte-identically (the ADR-0034/0037/0039 parity gate). The two new columns
-- on existing tables need no data migration:
--   * `activities.duration_type` is an enum NOT NULL DEFAULT 'FIXED_DURATION_AND_UNITS_TIME'
--     — a NOT NULL column with a constant default is metadata-only in Postgres 11+ (no
--     table rewrite); every existing row reads the fixture's dominant default.
--   * `resource_assignments.units_per_hour` is a NEW-NULLABLE Decimal with NO default —
--     NULL everywhere until a planner enters a rate (a new nullable column is metadata-only
--     too). A DEFAULT is DELIBERATELY omitted: a `DEFAULT 0` would silently activate the
--     triad on every existing assignment (ADR-0040 §4).
--
-- Invariants the DB cannot express are SERVICE-enforced (recorded in ADR-0040), each to
-- be unit-tested when F2/F3 land:
--   * the identity `budgetedUnits = (durationMinutes / 60) × unitsPerHour` (a CHECK cannot
--     span the activity + assignment rows);
--   * duration derives only under FIXED_UNITS / FIXED_UNITS_TIME, only on the complementary
--     edit, and only for the DRIVING assignment;
--   * the derived field is server-computed, never trusted from the client;
--   * N20 — a zero `units_per_hour` on a units-driven recompute (`D := U / R`) is rejected
--     BEFORE any division (a CHECK cannot read the activity's `duration_type` to know the
--     rate is a divisor), so `resolveTriad` is total (never NaN/Infinity).

-- CreateEnum: the four P6 duration types. FIXED_DURATION_AND_UNITS_TIME is the dominant
-- DEFAULT. MUST stay in lock-step with the `DurationType` union in @repo/types.
CREATE TYPE "DurationType" AS ENUM ('FIXED_DURATION_AND_UNITS_TIME', 'FIXED_DURATION_AND_UNITS', 'FIXED_UNITS', 'FIXED_UNITS_TIME');

-- AddColumn: the activity's client-settable P6 duration type (ADR-0040). NOT engine-owned
-- (a Planner picks it, like `type`/`constraint_type`); the recompute it governs is a
-- pure service-boundary concern (F2/F3), the CPM engine reads the resolved
-- `duration_minutes` unchanged. Constant DEFAULT backfills every existing row, so the
-- byte-parity golden path is unchanged. Unindexed — read only on the full-plan recalc
-- load, never a query predicate (the secondary_constraint_type precedent).
ALTER TABLE "activities" ADD COLUMN "duration_type" "DurationType" NOT NULL DEFAULT 'FIXED_DURATION_AND_UNITS_TIME';

-- AddColumn: the driving assignment's planned rate — the `Units/Time` term of the triad
-- (ADR-0040). An EXACT numeric (DECIMAL(18,4)) like budgeted_units. NULLABLE with NO
-- default: NULL = the triad is inert (parity gate); a DEFAULT is deliberately omitted so
-- existing assignments are untouched.
ALTER TABLE "resource_assignments" ADD COLUMN "units_per_hour" DECIMAL(18,4);

-- CheckConstraint (raw SQL — Prisma cannot express CHECK; docs/DATABASE.md: enforce
-- invariants in the DB, not only in code). units_per_hour may never be negative — the DB
-- backstop behind the DTO @Min(0) boundary reject (N19, ADR-0035 §25), mirroring
-- ck_resource_assignments_budgeted_units_nonneg (N14). NULLABLE-SAFE (`IS NULL OR …`) so
-- it never blocks the common no-rate path (NULL = triad inert).
ALTER TABLE "resource_assignments" ADD CONSTRAINT "ck_resource_assignments_units_per_hour_nonneg" CHECK ("units_per_hour" IS NULL OR "units_per_hour" >= 0);

-- Down (forward-only in prod, ADR-0018; documented for completeness). Reversible in this
-- order — drop the CHECK + the two columns, then the new type:
--   ALTER TABLE "resource_assignments" DROP CONSTRAINT "ck_resource_assignments_units_per_hour_nonneg";
--   ALTER TABLE "resource_assignments" DROP COLUMN "units_per_hour";
--   ALTER TABLE "activities" DROP COLUMN "duration_type";
--   DROP TYPE "DurationType";
