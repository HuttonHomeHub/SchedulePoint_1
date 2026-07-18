-- M7 cost/EV rung — EV1: cost & %-complete-type schema + cost baseline (dark, additive)
-- (Engine Conformance Framework, ADR-0034/0035 §29 + N22–N24, governed by ADR-0042;
-- amends ADR-0025; builds on ADR-0039/0040/0037/0038/0023/0033).
--
-- This slice is SCHEMA + ADR only — NO behaviour. Earned Value is a PURE READ-MODEL
-- (computed on a read endpoint in EV2, a sibling of float-paths.ts / baseline-variance):
-- there is NO write pass, NO engine-owned EV column, and NOTHING reads any of these
-- columns yet. It lays down the cost + %-complete-type inputs EV2 will consume:
--   * ACTIVATE the resource COST RATE ADR-0039 RESERVED "for the cost rung"
--     (resources.cost_per_unit) — money per unit of work (P6 "Price/Unit");
--   * the assignment cost inputs (resource_assignments.budgeted_cost override /
--     actual_cost / actual_units);
--   * the activity %-complete-type + physical %-complete + lump-sum expenses
--     (activities.percent_complete_type / physical_percent_complete /
--     budgeted_expense / actual_expense);
--   * the plan EV options (plans.eac_method — the default EAC forecast; plans.currency_code);
--   * the COST BASELINE (baseline_activities.budgeted_cost) — the ADR-0025 snapshot
--     amendment giving the active baseline a committed PV / BCWS reference.
--
-- DIRECTION: forward-only in prod (ADR-0018 — the self-migrating image applies migrations
-- forward on boot; there is no down-migration path in production). A documented, reversible
-- Down block is at the foot for completeness.
--
-- FULLY ADDITIVE & BYTE-PARITY. EV never enters computeSchedule and persists no output, so
-- the CPM parity gate (ADR-0034/0039/0040/0041) is STRUCTURALLY trivial — the recalc write
-- path is not touched at all and every prior golden + scenario recalculates byte-identically.
-- No column is dropped or rewritten; every add on an existing table is metadata-only in
-- Postgres 11+:
--   * NULLABLE columns with NO default (currency_code, physical_percent_complete,
--     budgeted_expense, actual_expense, cost_per_unit, budgeted_cost on both assignments and
--     baseline_activities) — a new nullable column is a catalog-only change (no table
--     rewrite, no full scan). NULL is the parity value everywhere: NULL cost/rate/expense =
--     "no cost, contributes 0"; NULL physical_percent_complete = "unset" (distinct from an
--     explicit 0); NULL currency_code = "unset / inherit the org default"; NULL
--     baseline budgeted_cost = "pre-rung capture, PV falls back to the live budget & flags
--     costBaselineMissing". A DEFAULT is DELIBERATELY omitted so we never silently stamp a
--     value (a DEFAULT currency would mislabel existing plans; a DEFAULT 0 cost/rate is the
--     same zero but obscures "no rate set") — the units_per_hour / max_units_per_hour /
--     expected_finish precedent (ADR-0040/0041).
--   * NOT NULL … DEFAULT <const> (percent_complete_type DEFAULT 'DURATION', eac_method
--     DEFAULT 'CPI', resource_assignments.actual_cost DEFAULT 0, actual_units DEFAULT 0) — a
--     NOT NULL column with a CONSTANT default is metadata-only on PG 11+ (no table rewrite,
--     no full scan, only a brief ACCESS EXCLUSIVE for the catalog update). Every existing row
--     backfills to the behaviour-preserving default in the same statement (DURATION = today's
--     duration-based percent; CPI = P6's headline EAC; 0 actual = nothing spent yet).
--
-- MONEY REPRESENTATION (Q6, database-architect decision — docs/DATABASE.md philosophy #5 &
-- Data types: money is integer minor units + an explicit currency, never floats/Decimal).
-- All money columns are BIGINT minor units (e.g. pence/cents) in the plan's currency_code:
--   * BIGINT (not INTEGER): construction BACs exceed the INT minor-unit ceiling (~£21M at
--     1e2 minor units); BIGINT covers ~£9e16, ample headroom.
--   * BIGINT (not DECIMAL): the schema's DECIMAL(18,4) columns (budgeted_units,
--     units_per_hour, max_units_per_hour, actual_units) are physical QUANTITIES, not money.
--     Money uses exact integer minor units so rounding is explicit and consistent end-to-end
--     (rounding happens once, at each derived index in the EV2 module — ADR-0035 §29).
--   * cost_per_unit is COST-PER-UNIT (P6 "Price/Unit"), so it multiplies the assignment's
--     budgeted_units directly (assignment budgeted cost = budgeted_units × cost_per_unit),
--     aligned with the ADR-0040 units backbone rather than re-deriving hours. It is a RATE
--     COEFFICIENT, so DECIMAL(18,4) like the sibling rates units_per_hour / max_units_per_hour
--     (the house rule: rate coefficients are Decimal(18,4); stored money amounts are BIGINT
--     minor units) — Decimal keeps a composite rate (e.g. £52.3750/unit) exact rather than
--     rounding it to a whole minor unit before the multiply, so rounding happens once at the
--     derived amount. Expressed in MINOR UNITS per unit of work (e.g. 5237.5000 pence/unit),
--     so a derived budget is round(budgeted_units × cost_per_unit) minor units — no
--     major/minor conversion.
--   * currency_code is CHAR(3) ISO-4217 — a genuine fixed-width code (the docs/DATABASE.md
--     "text unless a real limit applies" exception), format-guarded below. Single currency
--     per plan; multi-currency/FX is out of scope (CLAUDE.md §17).
--
-- NEGATIVE-CASE GUARDS (raw SQL — Prisma cannot express CHECK; docs/DATABASE.md: enforce
-- invariants in the DB, not only in code). Every money/rate/quantity column is `>= 0`
-- (nullable-safe where nullable) — the DB backstops behind the DTO @Min(0) rejects: N22
-- (negative cost/rate/expense) across resources.cost_per_unit, the assignment cost pair,
-- and the activity expenses + baseline budgeted_cost; N23 (physical %-complete outside
-- 0–100). They mirror ck_resource_assignments_budgeted_units_nonneg (N14) /
-- _units_per_hour_nonneg (N19) / ck_resources_max_units_per_hour_nonneg (N21) and
-- ck_activities_percent_complete (0–100). N24 (actual cost/units on a not-started activity)
-- is a WARN, not a reject (surfaced as a count by the EV2 read), so it is NOT a CHECK.
--
-- NO NEW INDEX. Every new column is read as part of an already plan-scoped or org-scoped
-- load (cost_per_unit on the org-scoped resource load served by (organization_id,
-- created_at, id); the assignment cost columns on the assignment load; the activity columns
-- on the plan-scoped activity load served by (plan_id, created_at, id); the plan options
-- with the single plan row; baseline budgeted_cost with the whole snapshot). No predicate
-- ever targets a new column in isolation, so an index would only cost writes for no read
-- benefit (docs/DATABASE.md: index real query patterns, not columns).

-- CreateEnum: the three P6 %-complete types. DURATION is the behaviour-preserving DEFAULT.
-- MUST stay in lock-step with the `PercentCompleteType` union in @repo/types.
CREATE TYPE "PercentCompleteType" AS ENUM ('DURATION', 'UNITS', 'PHYSICAL');

-- CreateEnum: the three EAC forecast methods. CPI (EAC = BAC / CPI) is P6's headline
-- DEFAULT. MUST stay in lock-step with the `EacMethod` union in @repo/types.
CREATE TYPE "EacMethod" AS ENUM ('CPI', 'REMAINING_AT_BUDGET', 'CPI_TIMES_SPI');

-- AddColumn: plan EV options (ADR-0042). eac_method — the default EAC forecast (constant
-- DEFAULT 'CPI', behaviour-preserving). currency_code — NULLABLE, NO default (NULL = unset /
-- inherit org default; never stamp an arbitrary currency on an existing plan).
ALTER TABLE "plans" ADD COLUMN "eac_method" "EacMethod" NOT NULL DEFAULT 'CPI';
ALTER TABLE "plans" ADD COLUMN "currency_code" CHAR(3);

-- CheckConstraint: currency_code, when set, is an uppercase 3-letter ISO-4217 code.
-- NULLABLE-SAFE (`IS NULL OR …`) so it never blocks the common unset path.
ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_currency_code_iso4217" CHECK ("currency_code" IS NULL OR "currency_code" ~ '^[A-Z]{3}$');

-- AddColumn: activity EV inputs (ADR-0042). percent_complete_type — client-settable
-- definition (constant DEFAULT 'DURATION', behaviour-preserving; selects the EV performance
-- measure, changes no CPM date). physical_percent_complete — progress input, SMALLINT,
-- nullable/no-default (NULL = unset). budgeted_expense / actual_expense — optional lump-sum
-- BIGINT minor units, nullable/no-default (NULL = none, contributes 0).
ALTER TABLE "activities" ADD COLUMN "percent_complete_type" "PercentCompleteType" NOT NULL DEFAULT 'DURATION';
ALTER TABLE "activities" ADD COLUMN "physical_percent_complete" SMALLINT;
ALTER TABLE "activities" ADD COLUMN "budgeted_expense" BIGINT;
ALTER TABLE "activities" ADD COLUMN "actual_expense" BIGINT;

-- CheckConstraint: physical_percent_complete is 0–100 (N23) — nullable-safe, mirroring
-- ck_activities_percent_complete. The two expenses are `>= 0` (N22) — nullable-safe.
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_physical_percent_complete_range" CHECK ("physical_percent_complete" IS NULL OR ("physical_percent_complete" >= 0 AND "physical_percent_complete" <= 100));
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_budgeted_expense_nonneg" CHECK ("budgeted_expense" IS NULL OR "budgeted_expense" >= 0);
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_actual_expense_nonneg" CHECK ("actual_expense" IS NULL OR "actual_expense" >= 0);

-- AddColumn: the resource cost rate (ADR-0039 reserved → ADR-0042 activated). A RATE
-- COEFFICIENT — DECIMAL(18,4) like units_per_hour / max_units_per_hour (NOT a stored money
-- amount), in minor units per unit of work (cost-per-unit). NULLABLE, NO default — NULL = no
-- cost (contributes 0). Client-settable.
ALTER TABLE "resources" ADD COLUMN "cost_per_unit" DECIMAL(18,4);

-- CheckConstraint: cost_per_unit `>= 0` (N22) — nullable-safe, mirroring
-- ck_resources_max_units_per_hour_nonneg (N21).
ALTER TABLE "resources" ADD CONSTRAINT "ck_resources_cost_per_unit_nonneg" CHECK ("cost_per_unit" IS NULL OR "cost_per_unit" >= 0);

-- AddColumn: assignment cost inputs (ADR-0042). budgeted_cost — optional definition OVERRIDE,
-- nullable/no-default (NULL = derive budgeted_units × resource.cost_per_unit at read time).
-- actual_cost — progress, BIGINT minor units, NOT NULL DEFAULT 0. actual_units — progress,
-- DECIMAL(18,4) NOT NULL DEFAULT 0 (mirrors budgeted_units).
ALTER TABLE "resource_assignments" ADD COLUMN "budgeted_cost" BIGINT;
ALTER TABLE "resource_assignments" ADD COLUMN "actual_cost" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "resource_assignments" ADD COLUMN "actual_units" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CheckConstraint: the assignment cost pair `>= 0` (N22, budgeted nullable-safe) and
-- actual_units `>= 0` (N14 precedent), the DB backstops behind the DTO @Min(0) rejects.
ALTER TABLE "resource_assignments" ADD CONSTRAINT "ck_resource_assignments_budgeted_cost_nonneg" CHECK ("budgeted_cost" IS NULL OR "budgeted_cost" >= 0);
ALTER TABLE "resource_assignments" ADD CONSTRAINT "ck_resource_assignments_actual_cost_nonneg" CHECK ("actual_cost" >= 0);
ALTER TABLE "resource_assignments" ADD CONSTRAINT "ck_resource_assignments_actual_units_nonneg" CHECK ("actual_units" >= 0);

-- AddColumn: the cost baseline (ADR-0025 amendment). budgeted_cost — the activity's budgeted
-- cost frozen at capture, BIGINT minor units. NULLABLE, NO default (NULL = pre-rung capture,
-- PV falls back to the live budget). Immutable after capture.
ALTER TABLE "baseline_activities" ADD COLUMN "budgeted_cost" BIGINT;

-- CheckConstraint: baseline budgeted_cost `>= 0` — defence-in-depth (N22 family), nullable-safe.
ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_budgeted_cost_nonneg" CHECK ("budgeted_cost" IS NULL OR "budgeted_cost" >= 0);

-- Down (forward-only in prod, ADR-0018; documented for completeness). Reversible — drop the
-- CHECKs + columns in reverse order, then the two enum types:
--   ALTER TABLE "baseline_activities" DROP CONSTRAINT "ck_baseline_activities_budgeted_cost_nonneg";
--   ALTER TABLE "baseline_activities" DROP COLUMN "budgeted_cost";
--   ALTER TABLE "resource_assignments" DROP CONSTRAINT "ck_resource_assignments_actual_units_nonneg";
--   ALTER TABLE "resource_assignments" DROP CONSTRAINT "ck_resource_assignments_actual_cost_nonneg";
--   ALTER TABLE "resource_assignments" DROP CONSTRAINT "ck_resource_assignments_budgeted_cost_nonneg";
--   ALTER TABLE "resource_assignments" DROP COLUMN "actual_units";
--   ALTER TABLE "resource_assignments" DROP COLUMN "actual_cost";
--   ALTER TABLE "resource_assignments" DROP COLUMN "budgeted_cost";
--   ALTER TABLE "resources" DROP CONSTRAINT "ck_resources_cost_per_unit_nonneg";
--   ALTER TABLE "resources" DROP COLUMN "cost_per_unit";
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_actual_expense_nonneg";
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_budgeted_expense_nonneg";
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_physical_percent_complete_range";
--   ALTER TABLE "activities" DROP COLUMN "actual_expense";
--   ALTER TABLE "activities" DROP COLUMN "budgeted_expense";
--   ALTER TABLE "activities" DROP COLUMN "physical_percent_complete";
--   ALTER TABLE "activities" DROP COLUMN "percent_complete_type";
--   ALTER TABLE "plans" DROP CONSTRAINT "ck_plans_currency_code_iso4217";
--   ALTER TABLE "plans" DROP COLUMN "currency_code";
--   ALTER TABLE "plans" DROP COLUMN "eac_method";
--   DROP TYPE "EacMethod";
--   DROP TYPE "PercentCompleteType";
