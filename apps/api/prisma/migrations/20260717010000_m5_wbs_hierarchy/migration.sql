-- M5 WBS activity hierarchy: the adjacency-list parent link + the WBS_SUMMARY
-- activity type (Engine Conformance Framework, ADR-0035 §24 / M5-epic Feature F5,
-- governed by ADR-0038).
--
-- This slice is schema + validation only — NO scheduling behaviour. It gives an
-- activity an optional WBS parent so activities can be grouped into a Work
-- Breakdown Structure, and adds the WBS_SUMMARY type whose dates will roll up from
-- its branch's earliest start / latest finish (the rollup engine is F6). The WBS
-- parent tree is ORTHOGONAL to the dependency DAG (ADR-0021): a WBS parent is a
-- grouping, never a logic tie, and a cycle in one graph is unrelated to the other.
--
-- Three invariants the FK alone cannot express are service-enforced (ADR-0038):
-- (a) the parent tree is ACYCLIC — no activity is its own ancestor (an ancestor
--     walk on reparent); the ck_activities_parent_not_self CHECK below backs only
--     the trivial 1-node self-parent, the case a CHECK *can* express;
-- (b) parent and child share the SAME plan AND organization (the FK scopes only to
--     `activities`, not to a plan — the same limitation as activities.calendar_id);
-- (c) only a WBS_SUMMARY may be a parent and a SUMMARY carries NO logic — it may
--     never be an endpoint of a dependency edge (ADR-0035 §24).
--
-- Fully additive and reversible. `parent_id` is a NULLABLE column with no default,
-- so every existing row reads NULL ("top-level, no WBS parent") — no backfill, and
-- the byte-parity golden path (no WBS_SUMMARY present) is unchanged. All four
-- statements are metadata-only / non-locking at any data volume:
--   * ALTER TYPE ... ADD VALUE is a catalog-only insert (Postgres 12+; a new label
--     appended to the enum), not a table rewrite. It is kept a STANDALONE statement
--     because a value added by ADD VALUE cannot be *used* elsewhere in the same
--     transaction — but nothing here uses 'WBS_SUMMARY' (the column/FK/index/CHECK
--     never reference it), so the ordering is safe and the rest may follow.
--   * ADD COLUMN of a nullable column with no default is a metadata-only change (no
--     table rewrite, no full scan; a brief ACCESS EXCLUSIVE for the catalog update).
--   * The FK ADD CONSTRAINT validates against an all-NULL column instantly.
--   * CREATE INDEX on the same (empty of non-NULL values) partial predicate is
--     trivially fast; the CHECK ADD CONSTRAINT scans an all-NULL / self-consistent
--     column and passes instantly.

-- AddEnumValue: the WBS hierarchy summary type. Standalone (see header). Appended,
-- so existing enum ordinals are unchanged.
ALTER TYPE "ActivityType" ADD VALUE 'WBS_SUMMARY';

-- AddColumn: the adjacency-list parent link. NULL = a top-level activity (no WBS
-- parent); non-null = grouped under the referenced WBS_SUMMARY.
ALTER TABLE "activities" ADD COLUMN "parent_id" UUID;

-- AddForeignKey (ON DELETE RESTRICT — as activities.calendar_id / every hierarchy
-- child): a summary with children can never be HARD-deleted out from under them.
-- Activities soft-delete only, so this referential check never actually fires; the
-- real delete path is the service-owned cascade soft-delete, which stamps the
-- summary and its whole active subtree with one delete_batch_id (ADR-0038) and
-- restore brings the set back. RESTRICT is defence in depth. The FK does NOT
-- enforce same-plan or same-org — a cross-plan/cross-org parent_id satisfies it —
-- so those scope checks stay in the service (like the calendar picker).
ALTER TABLE "activities" ADD CONSTRAINT "activities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial index (Prisma cannot express `WHERE ...`). Backs the parent self-FK and
-- the "children of this summary" load the rollup engine (F6) and the navigator walk
-- over (`WHERE parent_id = ? AND deleted_at IS NULL`). Restricted to LIVE rows that
-- actually carry a parent so it stays tiny — the majority of activities are
-- top-level (parent_id NULL) and are excluded — mirroring idx_activities_calendar_id
-- exactly. (It does not back the FK RESTRICT referential check, which scans all
-- referencing rows including soft-deleted ones — but activities are soft-deleted
-- only, so that check never fires; the service cascade is the real one.)
CREATE INDEX "idx_activities_parent_id" ON "activities" ("parent_id") WHERE "deleted_at" IS NULL AND "parent_id" IS NOT NULL;

-- CheckConstraint (raw SQL — Prisma cannot express CHECK). Guarantees the trivial
-- 1-node cycle (an activity that is its own parent) can never persist even if the
-- service's ancestor-walk guard is bypassed. Nullable-safe: NULL parent_id (a
-- top-level activity) is always legal. The transitive acyclicity of the wider tree
-- is a graph-wide property a CHECK cannot express — it is the service ancestor walk
-- (ADR-0038), the exact analogue of the dependency DAG walk (ADR-0021).
ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- Down (forward-only in prod; documented for completeness). Reversible in this
-- order — drop the CHECK, index and FK, then the column; the enum value cannot be
-- dropped in place (Postgres has no DROP VALUE — a compensating migration would
-- recreate the type), but a spare unused label is harmless:
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_parent_not_self";
--   DROP INDEX "idx_activities_parent_id";
--   ALTER TABLE "activities" DROP CONSTRAINT "activities_parent_id_fkey";
--   ALTER TABLE "activities" DROP COLUMN "parent_id";
--   -- 'WBS_SUMMARY' stays on the ActivityType enum (no in-place DROP VALUE).
