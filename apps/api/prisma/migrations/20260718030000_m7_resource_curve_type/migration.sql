-- M7 rung 5 — F3 Resource curves: resource_assignments.curve_type (Engine Conformance
-- Framework, ADR-0034 / ADR-0035 §31, governed by ADR-0044 §3; builds on ADR-0039/0040
-- assignment/units). This is the FINAL rung-5 slice — it closes the last ⚪ capability
-- matrix row (32 ✅ / 0 ⚪).
--
-- SCHEMA + ADR only — NO behaviour. It adds ONE enum naming the P6 resource loading profile
-- that the resource-histogram read-model (a pure sibling of float-paths.ts / earned-value.ts,
-- built in F3-2) distributes an assignment's `budgeted_units` by across the activity duration
-- (span = duration − assignment lag), conserving units. A curve shapes the histogram (and can
-- feed cost time-phasing) — it moves NO date, and it does NOT feed the levelling pass this
-- rung (Q2; level.ts stays flat-rate). The 21-point profile constants are baked into the
-- read-model, not the DB.
--
-- DIRECTION: forward-only in prod (ADR-0018). A documented Down block is at the foot.
--
-- FULLY ADDITIVE & BYTE-PARITY. The single new column is a NOT NULL column with a CONSTANT
-- default (UNIFORM), metadata-only on Postgres 11+ (no table rewrite, no full scan). Every
-- existing row backfills to UNIFORM — a flat load = today's byte-identical histogram & EV
-- (the parity gate). A non-constant default was rejected: it would silently re-shape every
-- existing assignment's loading profile.
--
-- NO NEW INDEX. curve_type is read only as part of the already plan-scoped resource-histogram
-- / EV assignment load; no predicate ever targets it (a low-cardinality enum read with the
-- whole plan's assignments, never filtered across plans), so an index would only cost writes
-- for no read benefit (docs/DATABASE.md — the is_driving / percent_complete_type precedent).

-- CreateEnum: the five named P6 loading profiles. UNIFORM (flat) is the behaviour-preserving
-- DEFAULT. MUST stay in lock-step with the `ResourceCurveType` union in @repo/types.
CREATE TYPE "ResourceCurveType" AS ENUM ('UNIFORM', 'BELL', 'FRONT_LOADED', 'BACK_LOADED', 'DOUBLE_PEAK');

-- AddColumn: the assignment resource-loading curve (ADR-0044 §3). Client-settable; constant
-- DEFAULT 'UNIFORM' is behaviour-preserving (a flat histogram identical to today). Shapes the
-- resource-histogram read-model only; it NEVER changes a CPM date and does not feed levelling.
ALTER TABLE "resource_assignments" ADD COLUMN "curve_type" "ResourceCurveType" NOT NULL DEFAULT 'UNIFORM';

-- Down (forward-only in prod, ADR-0018; documented for completeness). Reversible — drop the
-- column, then the enum type:
--   ALTER TABLE "resource_assignments" DROP COLUMN "curve_type";
--   DROP TYPE "ResourceCurveType";
