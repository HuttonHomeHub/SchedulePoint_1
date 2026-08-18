-- Back the FOUR foreign keys into `activities` whose only supporting index is predicated on
-- `deleted_at`, and which therefore do not support the RESTRICT check at all.
--
-- Deliberately a SEPARATE migration from 20260818120000_recycle_bin_deleted_at_indexes. That one
-- is dark (it serves reads for a feature not yet built) and costs 848 kB of tiny partial indexes.
-- This one FIXES A LIVE PATH and costs ~18 MB on four of the hottest tables in the product, so it
-- has to be revertible on its own.
--
-- THE LIVE PATH. `InterchangeService.compensate` hard-deletes an imported plan's activities when
-- phase 2's recalculation fails (interchange.service.ts:1134, `tx.activity.deleteMany({ where: {
-- planId } })`) — a real `DELETE`, on a request, inside one transaction. CLAUDE.md §17 names it as
-- the only aimable-free hard delete in the system. On a 2,000-activity import that statement was
-- measured below at over three and a half MINUTES. The Recently-Deleted expiry (ADR pending) is the
-- second caller, not the first.
--
-- THE CAUSE, verified rather than reasoned. A RESTRICT check is an AFTER ROW trigger that runs, per
-- deleted row, per referencing FK, the SPI query
--
--     SELECT 1 FROM ONLY public.<child> x WHERE $1 OPERATOR(pg_catalog.=) <fk_col> FOR KEY SHARE OF x
--
-- That query does not mention `deleted_at`. So an index predicated on `deleted_at IS NULL` cannot be
-- proven to serve it and Postgres falls back to a sequential scan of the whole child table — once per
-- deleted row. Eight FKs reference `activities`; four had no usable index:
--
--   activities.parent_id            idx_activities_parent_id       WHERE deleted_at IS NULL AND parent_id IS NOT NULL
--   activity_steps.activity_id      uq_activity_steps_activity_seq WHERE deleted_at IS NULL
--   notes.activity_id               idx_notes_activity_created     WHERE deleted_at IS NULL AND activity_id IS NOT NULL
--   resource_assignments.activity_id uq_resource_assignments_*     WHERE deleted_at IS NULL
--
-- The other four (`dependencies` × 2, `cross_plan_dependencies` × 2) already carry FULL indexes on
-- their endpoint columns and are fine. Every one of the four above was written for a READ — a live
-- list, a live count, a live uniqueness rule — and `deleted_at IS NULL` is right for all of those.
-- Nothing was wrong in any of those four migrations. What nobody had asked is whether the FK the
-- column carries is backed at all, and `docs/DATABASE.md`'s own first index rule ("index every column
-- used in a WHERE, JOIN, ORDER BY, or FOREIGN KEY") is the rule that was missed.
--
-- PROVED, not inferred, with the RI check's own query shape:
--
--   with only the pre-existing partial     Seq Scan on activities x
--                                          Filter: ('ad00…01'::uuid = parent_id)
--   with (parent_id) WHERE parent_id IS NOT NULL
--                                          Bitmap Index Scan on … Index Cond: (parent_id = 'ad00…01')
--
-- and, at executions 6 and 7 of a PREPARE where a GENERIC plan becomes eligible, still
-- `Index Cond: (parent_id = $1)`. That last part is load-bearing: RI checks run through cached SPI
-- plans, so an index that only worked for a custom plan would not have fixed this.
--
-- WHY PARTIAL WHERE ... IS NOT NULL IS ENOUGH, AND A FULL INDEX IS NOT NEEDED. `$1 = parent_id`
-- implies `parent_id IS NOT NULL` because the operator is strict, and Postgres proves exactly that.
-- This is the SAME implication mechanism the sibling migration documents for `deleted_at < :cutoff`;
-- what differs between the two cases is not the mechanism but WHICH QUERY has to be matched — there,
-- the application's; here, one Postgres generates and nobody wrote. Worth 43x on `activities`:
-- 32 kB partial against 1,384 kB full, because only an activity under a WBS summary carries a parent.
-- `activity_steps.activity_id` and `resource_assignments.activity_id` are NOT NULL, so the partial
-- form would be a tautology and they are plain indexes.
--
-- MEASURED — PostgreSQL 16.13 local (CI and the host run 17). 202,000 activities / 200,000 steps /
-- 200,000 notes / 200,000 assignments; the deleted plan holds 2,000 activities, 100 of them WBS
-- summaries in a chain. Harness: docs/specs/recently-deleted/measurements/.
--
--   DELETE FROM activities WHERE plan_id = :id  (2,000 rows)
--     before   227,452 / 232,841 ms      (3m47s / 3m52s)
--     after         82 /  86 /  96 ms
--
--   ablation on a 200-row delete, adding one index at a time:
--     none                                     70,788 ms
--     + activities(parent_id)                  11,061 / 11,963 ms
--     + activity_steps(activity_id)             8,206 /  8,392 ms
--     + notes(activity_id)                      4,485 /  4,319 ms
--     + resource_assignments(activity_id)          16.7 /    16.4 ms
--
-- READ THAT ABLATION BEFORE SHIPPING A SUBSET. Fixing `parent_id` alone — the obvious single cause,
-- and the one this was reported as — removes 84% of the cost and leaves a delete still ~660x slower
-- than it needs to be. A measurement that finds only `parent_id` is a measurement taken on a database
-- whose `notes`, `activity_steps` and `resource_assignments` are empty; all four scans are the same
-- defect and only the table sizes differ. The four ship together.
--
-- WRITE COST, which is real here and was not in the sibling migration. These are indexes on hot
-- tables, not on the soft-deleted minority. Bulk INSERT of 20,000 rows:
--
--   activity_steps         611 / 608 ms  ->  781 / 806 ms   (+29%,  ~8.8 us/row)
--   resource_assignments   746 / 766 ms  ->  871 / 910 ms   (+17%,  ~7 us/row)
--
-- Per row that is single-digit microseconds, and the product writes these a handful at a time (a
-- planner adding steps to an activity, an importer's commit phase), never twenty thousand. The two
-- partial ones are cheaper still: a top-level activity and a PLAN note are excluded by the predicate
-- and do no index maintenance at all.
--
-- NO HOT REGRESSION, probed with a control that proves the probe can see one. All four columns are
-- ALREADY key columns of an existing index (idx_activities_parent_id, uq_activity_steps_activity_seq,
-- idx_notes_activity_created, uq_resource_assignments_activity_resource), so no NEW column enters the
-- indexed set and HOT eligibility cannot move. On a purpose-built 5,000-row table with the same index
-- pair: UPDATE of an unindexed column reports 5,000/5,000 HOT WITHOUT the second index and
-- 5,000/5,000 WITH it, while UPDATE of the indexed column reports 0/5,000 — so the probe distinguishes
-- the cases and the two configurations are identical.
--
-- NOT `CREATE INDEX CONCURRENTLY` (Prisma runs each migration in a transaction). Each takes a SHARE
-- lock — reads continue, writes block — for the build: measured 48 / 179 / 158 / 165 ms at the row
-- counts above.
--
-- WHAT THIS DOES NOT DO. It does not make a hard delete of activities cheap in the way an
-- `ON DELETE CASCADE` would; the RI check still runs eight times per deleted row, it is simply an
-- index probe rather than a table scan now. And it changes nothing about soft delete, which is still
-- every deletion a user can reach.
--
-- NO `@@index` IS ADDED TO schema.prisma for the two PARTIAL indexes (Prisma cannot express a
-- predicate; declaring one the database does not have is TECH_DEBT #54). The two FULL indexes are
-- likewise created here rather than declared, so that all four sit together and are reverted
-- together; the models carry comments pointing at this file.

-- Partial: only an activity under a WBS summary carries a parent (32 kB against 1,384 kB full).
CREATE INDEX "idx_activities_parent_id_fk"
  ON "activities" ("parent_id")
  WHERE "parent_id" IS NOT NULL;

-- Partial: a PLAN note carries no activity_id and is not a child of one.
CREATE INDEX "idx_notes_activity_id_fk"
  ON "notes" ("activity_id")
  WHERE "activity_id" IS NOT NULL;

-- activity_id is NOT NULL on both of these, so a predicate would be a tautology.
CREATE INDEX "idx_activity_steps_activity_id_fk"
  ON "activity_steps" ("activity_id");

CREATE INDEX "idx_resource_assignments_activity_id_fk"
  ON "resource_assignments" ("activity_id");
