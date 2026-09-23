-- RE-ENCODE FINISH-MILESTONE PLACEMENTS FOR THE END-OF-DAY RULE — finish-milestone-date M2-T3.
--
-- Spec: docs/specs/finish-milestone-date/spec.md §4 "Parity" item 2 and "Database changes" item 2;
-- conditions.md Q1 (product owner, 2026-09-23: decision A) and FC-6.
-- Designed by the database-architect agent (CLAUDE.md §19.3) and applied to a populated
-- PostgreSQL 16.13 database with all 69 prior migrations replayed. Every number below is from that
-- run, not an estimate.
--
-- WHY. Until this release the CPM engine read a FINISH_MILESTONE's `visual_start` (a DATE, the
-- hand placement, ADR-0148) as the START of that day. From this release it reads it as the END of
-- that day. Left alone, every placed finish milestone would sit one working day later and could
-- push its successors. Decision A keeps every diamond where it is: each stored placement D becomes
-- D - 1, so only the printed date changes.
--
-- THE IDENTITY, CHECKED AGAINST THE ENGINE RATHER THAN TAKEN FROM THE SPEC.
--   Old parse of a placement D: rollForwardToWorking(cal, D 00:00) (engine/compute.ts:336-339 at
--   HEAD). New parse of a finish milestone's placement: finishMilestoneDateInstant (engine/
--   instants.ts, M2-T1, in the same release) = rollForwardToWorking(cal, date 00:00 + 1440 min)
--   for a bare date. On D - 1 that is rollForwardToWorking(cal, D 00:00): the old parse of D,
--   identical by construction, on every calendar, before or after the data date, working day or
--   not. It depends on one thing: the engine must receive a BARE `YYYY-MM-DD`, because the helper
--   treats a longer string as an instant and adds no day. The loader passes
--   formatCalendarDate(row.visualStart) (schedule.service.ts:2625), which is
--   toISOString().slice(0, 10). A caller that ever hands the engine a full timestamp for a
--   placement would see every migrated milestone one day early.
--   The spec's longer form, rollForwardToWorking(rollBackwardToWorking(dataDate, end of day)),
--   was also checked with the real helpers (tsx, 2026-09-23), because the spec doubted it before
--   the data date: 1,440 cases over four calendars (24-hour, Mon-Fri 08-17, split shifts with a
--   holiday and a Saturday-overtime exception, a night shift), three data dates (2026-03-01,
--   2026-03-18 13:30, 2026-05-20), and every placement date from 2026-02-20 to 2026-06-19, so up
--   to 89 days before and 110 days after a data date: 0 mismatches. Control, same cases with no
--   rewrite: 1,173 mismatches (the rest are non-working days, where start and end coincide). So
--   either form keeps every placed instant; a data-date floor on the PLACED instant (as opposed to
--   the printed date, FC-7) would be the one way to break it.
--
-- WHAT IS REWRITTEN: `activities.visual_start` where `type = 'FINISH_MILESTONE'` and it is not
-- null. Nothing else. Not `constraint_date` or `secondary_constraint_date` (decision Q2 A moves
-- those deliberately), not the external dates, not actuals, not any other activity type, and not
-- `baseline_activities` (Q3: none are captured on the installation; a baseline froze what the
-- old rule computed and rewriting history would be a false statement about it).
--
-- SOFT-DELETED ROWS ARE INCLUDED, WHICH IS THE OPPOSITE OF THE ADR-0148 STRIP, AND ON PURPOSE.
-- The strip excluded them because after it nothing could tell a drag SNET from a deliberate one.
-- Here there is no provenance question: every stored finish-milestone placement was written under
-- the old rule, and the new engine will read every one of them under the new rule the moment it is
-- restored. Excluding a soft-deleted milestone (or one in a soft-deleted plan, project or client)
-- would make a recycle-bin restore bring it back one working day later than it was deleted, which
-- breaks "restore reactivates exactly the set that was removed". Measured population: 2,266 placed
-- finish milestones, 206 of them soft-deleted, all rewritten.
--
-- THE RECORD IS A NEW TABLE, NOT `placement_migrations`. That table's rows mean "a constraint was
-- removed": `prior_constraint_type`/`prior_constraint_date` are NOT NULL because a row exists only
-- for that reason, and its one reader is the planner-facing dock notice ("N constraints were
-- removed, float will change") behind `GET …/plans/:planId/placement-migration`. Putting these rows
-- there needs both columns made nullable (breaking the stated invariant) and a filter added to the
-- reader, or planners are told constraints were removed from milestones that lost nothing. So this
-- file creates `finish_milestone_date_migrations` with the same write-once shape and the same FK
-- reasoning (docs/DATABASE.md "FmDateMigration").
--
-- ONE MIGRATION FOR THE TABLE AND THE REWRITE. Prisma runs each migration file in one transaction,
-- so the record and the rewrite exist together or not at all. The table is empty at creation, so
-- CREATE TABLE and its index are catalogue-only; there is no existing data to protect and no
-- reason to ship the table a release earlier.
--
-- ONE STATEMENT FOR THE RECORD AND THE REWRITE. The UPDATE targets exactly the ids the INSERT
-- returned, so the recorded set and the rewritten set are the same set by construction (the
-- ADR-0148 strip's shape). `visual_start - 1` is date minus integer, which is a DATE and involves
-- no time zone. SET expressions read the pre-update row.
--
-- NOT RE-APPLIED BY A MANUAL RE-RUN. Re-running the whole file fails at CREATE TABLE before it
-- touches a row. Re-running only the statement skips every activity already in the record
-- (the NOT EXISTS clause). What the record cannot protect is a placement written AFTER this
-- release: it is already in the new encoding and is not in the record, so running the statement
-- by hand after the API has served would move it a day. Do not do that; the reverse below is the
-- only supported manual step.
--
-- `version` IS BUMPED; `updated_at`/`updated_by` ARE NOT. Same reasoning as the ADR-0148 strip
-- (20260921120000_strip_drag_constraints). A tab left open across the container recreate holds the
-- old `visual_start` and resends it: `useBatchPlacements` sends `visualStart` on every row
-- (apps/web/src/features/activities/api/use-activities.ts:536-551), each with its version. Without
-- the bump that resend writes D back, the new engine reads it as the end of D, and the milestone
-- silently moves a day. With it the write is the existing non-destructive 409. `updated_at` is left
-- alone so the overview's Recently changed feed (ADR-0098) is not flooded with every plan holding a
-- placed finish milestone, attributed to nobody.
--
-- NO ENGINE-OWNED COLUMN IS WRITTEN, AND THAT LEAVES A GAP UNTIL EACH PLAN IS RECALCULATED.
-- early_*/late_*/visual_effective_*/leveled_* on finish milestones still hold the dates the OLD
-- rule projected. The new projection is not "old date minus one" (on a Mon-Fri calendar a
-- milestone after a Friday task goes from Monday to Friday), so it cannot be written here, and
-- engine-owned columns are written only by the recalculation pass. The instants are preserved by
-- this file; the stored display dates are not refreshed by it. This applies to every finish
-- milestone, placed or not, and is written up under docs/DATABASE.md "FmDateMigration".
--
-- COST, MEASURED. 102,000 activities (18 MB heap), 40 plans (one soft-deleted), 2,266 placed finish
-- milestones (206 soft-deleted) among 20,400 placed rows of all types:
--   EXPLAIN ANALYZE, five runs rolled back: 113-175 ms. Shape: `Seq Scan on activities` (99,734
--   rows removed by filter) -> `Hash Anti Join` against the empty record -> `Hash Join` to the 40
--   plans -> `Index Scan using activities_pkey` for each of the 2,266 updates. FK checks on the
--   record: ~19 ms of that. `prisma migrate deploy` wall clock, including Prisma's own start-up:
--   2.3 s.
--   The sequential scan is the right shape: the predicate `type = 'FINISH_MILESTONE' AND
--   visual_start IS NOT NULL` is a whole-table question, and the ADR-0148 strip measured the
--   index-driven alternative 1.5-1.8x slower on the same kind of sweep. No new index on
--   `activities`: a once-ever statement does not justify a cost on every activity write forever.
-- Under ADR-0018 this runs before the API serves, so there is no concurrent writer.
--
-- NOT COVERED BY THE CI SCHEMA-DRIFT CHECK beyond the table itself: the UPDATE is DML. On the empty
-- database CI provisions the rewrite is a silent no-op (ADR-0107), so FC-6's API e2e must seed
-- placed finish milestones, run this file's SQL, and compare Pass 2 instants.
--
-- REVERSE (forward-only in production, ADR-0018; this is the documented compensating step, also in
-- docs/DEPLOYMENT.md). Run with the API stopped, BEFORE starting the previous API image, as one
-- transaction (`psql -v ON_ERROR_STOP=1 -1 -f reverse.sql`):
--   -- 0. The one-shot guard: fails if the reverse already ran (the table is gone), so step 1 can
--   --    never apply twice. (Optionally \copy the table out first to keep the record.)
--   LOCK TABLE "finish_milestone_date_migrations" IN ACCESS EXCLUSIVE MODE;
--   -- 1. The rule inverse on every finish-milestone placement present now. After this release
--   --    every one of them is in the new encoding, including placements written after it, so +1
--   --    on all of them keeps every diamond where the new release showed it. The record is not the
--   --    selector because it does not list post-release placements.
--   UPDATE "activities"
--      SET "visual_start" = "visual_start" + 1,
--          "version"      = "version" + 1
--    WHERE "type" = 'FINISH_MILESTONE' AND "visual_start" IS NOT NULL;
--   -- 2. Check against the record: recorded rows not back at their prior value. A non-zero count
--   --    is rows a planner re-placed after the release (their new date is kept, +1), not a failure.
--   SELECT count(*) FROM "finish_milestone_date_migrations" m
--     JOIN "activities" a ON a."id" = m."activity_id"
--    WHERE a."type" = 'FINISH_MILESTONE' AND a."visual_start" <> m."prior_visual_start";
--   -- 3. Drop the record and forget the migration, so a later roll-forward applies it afresh.
--   DROP TABLE "finish_milestone_date_migrations";
--   DELETE FROM "_prisma_migrations"
--    WHERE "migration_name" = '20260923120000_finish_milestone_end_of_day_placements';
-- Measured on the populated database above: step 1 updated 2,266 rows, step 2 returned 0, and every
-- activity's `visual_start` then equalled its pre-migration value. A second run failed at step 0.
-- A milestone whose type was changed away from FINISH_MILESTONE after the release is left alone by
-- step 1 (its date is read start-of-day by both engines). Engine-owned dates stay as the new rule
-- computed them until each plan is recalculated under the previous image.

-- CreateTable: the record. One row per finish milestone whose placement this file moved.
CREATE TABLE "finish_milestone_date_migrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "activity_code" TEXT,
    "activity_name" TEXT NOT NULL,
    "prior_visual_start" DATE NOT NULL,
    "migrated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finish_milestone_date_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: (plan_id) — the plan FK is ON DELETE CASCADE, and a cascade has to find the
-- children; without this every plan hard-delete (ADR-0096 expiry) sequentially scans the table.
-- There is no application read, so no second column. No organization_id index: organisations are
-- never hard-deleted and their ids never change, so the RESTRICT check on that FK never runs.
CREATE INDEX "finish_milestone_date_migrations_plan_id_idx" ON "finish_milestone_date_migrations"("plan_id");

-- AddForeignKey: organization_id → organizations (RESTRICT, matching every sibling).
ALTER TABLE "finish_milestone_date_migrations" ADD CONSTRAINT "finish_milestone_date_migrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: plan_id → plans (CASCADE — the row dies with its plan; the placement_migrations
-- reasoning, which keeps it out of the hierarchy-expiry delete list).
ALTER TABLE "finish_milestone_date_migrations" ADD CONSTRAINT "finish_milestone_date_migrations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The record and the rewrite, one statement. The id is a UUID v7 built from clock_timestamp(),
-- the expression the ADR-0148 strip verified (the table has no database default; Prisma's
-- @default(uuid(7)) is application-side). The plan join has no deleted_at filter: see above.
WITH recorded AS (
  INSERT INTO "finish_milestone_date_migrations" (
    "id", "organization_id", "plan_id", "activity_id",
    "activity_code", "activity_name", "prior_visual_start"
  )
  SELECT
    (
      lpad(to_hex((extract(epoch FROM clock_timestamp()) * 1000)::bigint), 12, '0')
      || '7'
      || lpad(to_hex((random() * 4095)::int), 3, '0')
      || to_hex(8 + (random() * 3)::int)
      || lpad(to_hex((random() * 4095)::int), 3, '0')
      || lpad(to_hex((random() * 281474976710655)::bigint), 12, '0')
    )::uuid,
    p."organization_id",
    a."plan_id",
    a."id",
    a."code",
    a."name",
    a."visual_start"
  FROM "activities" a
  JOIN "plans" p ON p."id" = a."plan_id"
  WHERE a."type" = 'FINISH_MILESTONE'
    AND a."visual_start" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "finish_milestone_date_migrations" m WHERE m."activity_id" = a."id"
    )
  RETURNING "activity_id"
)
UPDATE "activities" a
   SET "visual_start" = a."visual_start" - 1,
       "version"      = a."version" + 1
 WHERE a."id" IN (SELECT "activity_id" FROM recorded);
