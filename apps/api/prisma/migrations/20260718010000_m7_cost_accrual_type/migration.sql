-- M7 rung 5 — F1 Cost accrual: activities.accrual_type (Engine Conformance Framework,
-- ADR-0034 / ADR-0035 §32, governed by ADR-0044 §1; builds on ADR-0042 EV read-model).
--
-- The first of three independently shippable rung-5 slices (cost accrual → weighted steps
-- → resource curves). This slice is SCHEMA + ADR only — NO behaviour. It adds ONE enum
-- input governing WHEN an activity's expense lump-sum is recognised in the Earned-Value /
-- cost read-model's PV & AC time-phasing (the cost / cash-flow S-curve). Earned Value is a
-- PURE READ-MODEL (ADR-0042): accrual changes no CPM date, writes no engine-owned column,
-- and nothing on the recalc write path is touched — so the CPM parity gate
-- (ADR-0034/0039/0040/0041) is STRUCTURALLY trivial and every prior golden + scenario
-- recalculates byte-identically. The read-model consumes accrual_type in the F1-2 task:
-- START recognises the full amount at the activity start, END at the finish, UNIFORM
-- linearly (exactly today's math).
--
-- DIRECTION: forward-only in prod (ADR-0018 — the self-migrating image applies migrations
-- forward on boot; there is no down-migration path in production). A documented, reversible
-- Down block is at the foot for completeness.
--
-- FULLY ADDITIVE & BYTE-PARITY. The single new column is a NOT NULL column with a CONSTANT
-- default (UNIFORM), which is metadata-only on Postgres 11+ (no table rewrite, no full scan,
-- only a brief ACCESS EXCLUSIVE for the catalog update). Every existing row backfills to
-- UNIFORM in the same statement — UNIFORM is today's linear cost phasing, so an unset value
-- yields byte-identical EV. A non-constant default was rejected: it would silently re-phase
-- every existing plan's cost curve (the F1-1 risk).
--
-- NO NEW INDEX. accrual_type is read only as part of the already plan-scoped EV activity
-- load ((plan_id, created_at, id)); no predicate ever targets it, and a low-cardinality
-- enum read with the whole plan's activities would only cost writes for no read benefit
-- (docs/DATABASE.md: index real query patterns, not columns — the percent_complete_type /
-- is_driving precedent).

-- CreateEnum: the three cost-accrual timings. UNIFORM (linear) is the behaviour-preserving
-- DEFAULT. MUST stay in lock-step with the `AccrualType` union in @repo/types.
CREATE TYPE "AccrualType" AS ENUM ('START', 'UNIFORM', 'END');

-- AddColumn: the activity cost-accrual timing (ADR-0044 §1). Client-settable definition;
-- constant DEFAULT 'UNIFORM' is behaviour-preserving (today's linear phasing). Selects how
-- the EV read-model time-phases the expense lump-sum; it NEVER changes a CPM date.
ALTER TABLE "activities" ADD COLUMN "accrual_type" "AccrualType" NOT NULL DEFAULT 'UNIFORM';

-- Down (forward-only in prod, ADR-0018; documented for completeness). Reversible — drop the
-- column, then the enum type:
--   ALTER TABLE "activities" DROP COLUMN "accrual_type";
--   DROP TYPE "AccrualType";
