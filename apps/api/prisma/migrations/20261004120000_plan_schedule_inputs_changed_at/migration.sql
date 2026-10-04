-- plans.schedule_inputs_changed_at — "edited since it was calculated" means a SCHEDULING INPUT
-- changed, not that a row was written.
--
-- THE DEFECT. The organisation overview derived `editedSinceCalculated` as
--   GREATEST(plans.updated_at, latest activity updated_at, latest dependency updated_at)
--     > plans.schedule_computed_at
-- (overview.repository.ts findRecentlyChanged and findPlanStanding). `updated_at` is stamped by every
-- write, including writes the CPM engine never reads: a lane move (`PATCH { laneIndex, version }`,
-- `ActivityRepository.updateLanePositions`), Arrange, the ADR-0153 overlap resolve, a rename, a
-- steps replace (activity-steps.service.ts bumps the activity) and every EV/cost field. So a lane move
-- after a calculation made the overview say "Edited since it was calculated, so these figures may have
-- moved" about figures that cannot have moved — reproduced in a browser 2026-10-04, and seen
-- "constantly" by the product owner because three canvas features write lanes without recalculating.
-- `lane_index` is not an engine input: `ScheduleRepository.loadActivities` does not select it.
--
-- THE CHANGE. One plan-level column, stamped by the write paths that change a scheduling input and by
-- nothing else; the overview compares it with `schedule_computed_at` instead of `updated_at`.
-- `updated_at` keeps its house meaning and keeps ordering "Recently changed".
--
-- SEMANTICS: AN UPPER BOUND. Every scheduling-input write to the plan happened at or before this
-- instant. Writers stamp `GREATEST(schedule_inputs_changed_at, now())` with the DATABASE clock — the
-- same clock and transaction-start semantics as `stampScheduleComputedAt`'s `now()`, so an input write
-- and a recalculation in ONE transaction compare equal (not stale), and GREATEST keeps the column
-- monotone when two transactions commit out of start order. The recalculation never writes this
-- column, and nothing here touches `schedule_computed_at`, which cross-plan staleness compares
-- BETWEEN plans (staleness.ts).
--
-- BACKFILL — and why it is not a fabrication (contrast 20260905120000's unbackfillable mirrors). The
-- column claims only an upper bound, and the latest write of ANY kind the old rule could see is a true
-- upper bound on the latest input write. So existing rows get exactly the old rule's instant, widened
-- in one direction: soft-deleted activities and dependencies are included, and their `deleted_at`
-- counted. Deleting an activity is an input change the old rule could not see (it filtered
-- `deleted_at IS NULL`, so a deleted row's stamp vanished with it). Consequences, stated rather than
-- discovered:
--   * every plan the old rule called "edited since" still is, until its next recalculation — including
--     the false positives from lane moves already made, which history cannot distinguish;
--   * a plan with an activity or dependency soft-deleted after its last calculation now reads "edited
--     since", correctly, where it did not before;
--   * no plan goes from "edited since" to "not edited since" at deploy.
-- The rule is the same three tables the old read used. Calendars, resources, assignments and
-- cross-plan links were never in that rule, so the backfill does not invent history for them.
--
-- NOT NULL, DEFAULT now(). A plan's creation is itself an input write (it sets planned_start and
-- calendar_id). ADD COLUMN with a STABLE default is a catalogue-only change (PG >= 11 fast default, no
-- table rewrite); the UPDATE then rewrites every plans row once. Prisma wraps the file in one
-- transaction, so the ACCESS EXCLUSIVE lock from the ALTER is held until the UPDATE finishes — at
-- container start, before the new image serves (ADR-0018).
--
-- MEASURED (database-architect, 2026-10-04; PostgreSQL 16.14 on defaults — production is 17), on a
-- synthetic breadth dataset of 5,000 plans / 600,000 activities / 595,000 dependencies, ~7%
-- soft-deleted, each run inside BEGIN … ROLLBACK: the ALTER took 1.3–1.5 ms and the backfill UPDATE
-- 393–471 ms (median 441 ms over three runs after a warm-up), warm cache. The deployed database holds
-- orders of magnitude less. The aggregates are one
-- sequential scan of each child table (GROUP BY plan_id); the per-plan `(plan_id, created_at, id)`
-- index cannot serve MAX(updated_at), and the partial `(plan_id, updated_at DESC) WHERE deleted_at IS
-- NULL` indexes deliberately exclude the deleted rows this backfill must see.
--
-- NO INDEX: read with its own plan row (the overview already loads `p.schedule_computed_at` beside
-- it), never filtered or sorted across plans — the `schedule_computed_at` precedent. The column is
-- unindexed, so the extra `UPDATE plans` an input write now makes stays HOT-eligible.
--
-- NO CHECK. The one candidate, `schedule_inputs_changed_at >= created_at`, compares two clocks and
-- protects nothing a reader relies on.

-- AlterTable
ALTER TABLE "plans" ADD COLUMN "schedule_inputs_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill. GREATEST ignores NULLs, so a plan with no activities or dependencies takes its own
-- updated_at; GREATEST(updated_at, deleted_at) is updated_at for a live row.
WITH activity_writes AS (
  SELECT plan_id, MAX(GREATEST(updated_at, deleted_at)) AS at
    FROM activities
   GROUP BY plan_id
), dependency_writes AS (
  SELECT plan_id, MAX(GREATEST(updated_at, deleted_at)) AS at
    FROM dependencies
   GROUP BY plan_id
)
UPDATE "plans" AS p
   SET "schedule_inputs_changed_at" = GREATEST(p.updated_at, a.at, d.at)
  FROM "plans" AS p0
  LEFT JOIN activity_writes   AS a ON a.plan_id = p0.id
  LEFT JOIN dependency_writes AS d ON d.plan_id = p0.id
 WHERE p0.id = p.id;
