-- RE-ENCODE CROSS-PLAN LAGS AS WORKING MINUTES ON THE RESOLVED LAG CALENDAR — cross-plan-day-boundary
-- M2-T2 (docs/TECH_DEBT.md #385).
--
-- Spec: docs/specs/cross-plan-day-boundary/feature-spec.md §4.4, E6/E23/E28/E29/E30; design by the
-- database-architect agent in the agreement round (agreement-round.md §b, B1-B5, and the
-- re-confirmation corrections), CQ-1 (re-encode) and CQ-2 (PROJECT_DEFAULT means the successor
-- plan's calendar in both directions).
--
-- WHY. `cross_plan_dependencies.lag_minutes` has been written as `lagDays x 1440` whatever the
-- calendar (cross-plan-dependencies.service.ts:31,178) and read back as `/ 1440`, while the in-plan
-- `dependencies.lag_minutes` is working minutes on the relationship's lag calendar (ADR-0068 §4,
-- lag-day-factor.ts). From this release a cross-plan lag means what an in-plan lag means, so every
-- stored value is rewritten into that unit:
--
--   new_lag_minutes = round(lag_minutes::numeric * factor / 1440)::integer
--
-- where `factor` is the resolved lag calendar's `hours_per_day_minutes`, or 1440.
--
-- THE LAG CALENDAR, PER ROW. The rule M2-T3's one TypeScript function implements, which the
-- migration test compares against row by row (spec B2). Every plan is reached through the ENDPOINT
-- ACTIVITY's `plan_id`, never through the link's denormalised `predecessor_plan_id` /
-- `successor_plan_id` (spec B5):
--   TWENTY_FOUR_HOUR  no calendar; factor pinned at 1440, so the row is unchanged.
--   PROJECT_DEFAULT   the successor activity's plan's calendar (CQ-2).
--   PREDECESSOR /     that endpoint's scheduling calendar, `schedulingCalendarId`
--   SUCCESSOR         (activities/day-factor.ts:45-62): its driving resource's calendar for a
--                     RESOURCE_DEPENDENT activity with an active driver, else its own calendar,
--                     else ITS OWN plan's calendar.
--   no calendar id    DEFAULT_HOURS_PER_DAY_MINUTES, 1440 (packages/types, lag-day-factor.ts:69).
-- The CASE has no ELSE because `LagCalendarSource` has exactly these four labels
-- (20260715120000_activity_dependency_baseline_minutes) and the migration test pins each one.
--
-- THE DRIVING-RESOURCE JOIN CANNOT FAN OUT. It carries the predicate of the partial unique index
-- `uq_resource_assignments_activity_driving` EXACTLY (`is_driving AND deleted_at IS NULL`,
-- 20260717020000_m7_resource_model/migration.sql:168), so it matches at most one assignment per
-- activity. It also carries the guards `loadDrivingResourceCalendarRows` applies
-- (driving-calendars.ts:25-34): the activity is RESOURCE_DEPENDENT and not soft-deleted, and the
-- resource is not soft-deleted. So a soft-deleted endpoint falls back to its own calendar, which is
-- what the TypeScript resolver answers for it (spec E29). The index constrains DRIVING rows only:
-- an activity may hold any number of live non-driving assignments, and a join that dropped
-- `is_driving` would fan out on them.
--
-- THE CALENDAR JOIN CARRIES NO deleted_at FILTER, matching `findHoursPerDayMinutes`
-- (calendar.repository.ts:366-384, spec E30): an activity may be bound to an archived or deleted
-- calendar, and the TypeScript side reads its factor too.
--
-- `numeric` ARITHMETIC, AND WHY IT IS NOT OPTIONAL (spec B1, E28). In int4 the product overflows
-- before the division: at factor 1440 from 1,036 days, at factor 480 from 3,107 days, and at the
-- +/-3,650-day CHECK bound for any factor of 409 or more. The WITH form evaluates the expression
-- for EVERY row, including the factor-1440 rows it then leaves alone. An overflow here is an error
-- inside `prisma migrate deploy` on a populated table, i.e. ADR-0107's restart loop on the deployed
-- host, and a pristine CI database cannot exhibit it. The cast back to integer is safe because
-- `hours_per_day_minutes` is BETWEEN 1 AND 1440 (ck_calendars_hours_per_day_minutes_range), so
-- abs(new) <= abs(old), and the lag-range CHECK cannot fail either (spec E23).
--
-- A STORED VALUE THAT IS NOT A MULTIPLE OF 1440 converts by the same formula, with no RAISE. The
-- API only ever accepted whole days (`@IsInt`, create-cross-plan-dependency.dto.ts:43), so for every
-- row it wrote the `round` changes nothing. Any other row converts by the formula (720 at factor
-- 480 becomes 240; 1 can become 0) and is recorded with its prior value, so the reverse restores it
-- exactly. A RAISE on populated data would be the same restart loop.
--
-- EVERY ROW, SOFT-DELETED INCLUDED. A restored link must not come back in the old unit.
--
-- EVERY RESOLVED ROW IS RECORDED, INCLUDING ROWS WHOSE VALUE DOES NOT CHANGE, AND ONLY CHANGED
-- ROWS ARE UPDATED. So the converted set is a STRICT SUBSET of the recorded set, by construction:
-- the INSERT records every resolved link, and the UPDATE is driven from the INSERT's RETURNING,
-- filtered on `new_lag_minutes <> prior_lag_minutes`. Recording the unchanged rows is required
-- twice over. M2-T3's differential compares each record's `day_factor_minutes` with the
-- TypeScript resolver's factor, and the failure it exists to catch (an eight-hour link wrongly
-- resolved to 1440) leaves the value unchanged; unrecorded, the check would have nothing to compare
-- and would pass. And the reverse's step 3 reads "no record" as "created after the release"; a
-- pre-release link skipped here would be converted a second time by it.
--
-- `version` IS BUMPED ON CHANGED ROWS; `updated_at` IS NOT TOUCHED. A planner-owned input is
-- rewritten, so optimistic locking must see it (the ADR-0148 strip and the ADR-0155 re-encoding do
-- the same). There is no update route for a cross-plan link (spec E32), so the bump invalidates no
-- in-flight edit. `updated_at` is left because nobody updated the link, and there is no trigger on
-- this table that would set it. Unchanged rows keep `lag_minutes`, `version` and `updated_at`.
--
-- THE UNIQUE (cross_plan_dependency_id) DIVERGES FROM THE PRECEDENT, AND CANNOT FIRE HERE.
-- `finish_milestone_date_migrations` has no unique constraint because a refusal would fail the
-- migration and therefore the API's boot (schema.prisma, FmDateMigration). This one cannot refuse
-- inside this file:
--   * the table is created empty by this same file, and the statement below runs once;
--   * each link yields exactly one resolved row, because every join is at most one-to-one: the two
--     endpoint activities and their plans by primary key through NOT NULL RESTRICT foreign keys,
--     the driving assignment through the partial unique index's own predicate, the resource and
--     the calendar by primary key, and the LATERAL by construction (it returns one row).
-- It is kept because the reverse depends on one record per link: its step 3 reads "no record" as
-- "created after the release". It also makes a manual re-run of the statement refuse rather than
-- convert a second time: every pre-release link is already recorded, so the INSERT fails and the
-- whole statement rolls back. (If NO link existed at migration time the record is empty and that
-- guard is absent, so do not re-run the statement by hand after the API has served: links written
-- since are already in the new unit. The reverse is the only supported manual step.)
--
-- THE RECORD. `cross_plan_lag_migrations`, on the `finish_milestone_date_migrations` precedent:
-- write-once (no version, no timestamps pair, no soft delete); `plan_id` is the successor
-- activity's plan, FK ON DELETE CASCADE with a plain index so a plan hard-delete (ADR-0096 expiry)
-- finds the rows; `organization_id` copied from the link, FK RESTRICT, no index (organisations are
-- never hard-deleted); no FK on the link id or the calendar id, because the record must outlive
-- both. ONE migration for the table and the rewrite: Prisma runs a file in one transaction, so the
-- record and the rewrite exist together or not at all.
--
-- THE MARKER. `_prisma_migrations.finished_at` for this migration is the boot re-derivation's
-- marker (spec D8, M3): plans computed before it recalculate once. No date is written into code.
--
-- NO ENGINE-OWNED COLUMN IS WRITTEN. A linked plan's stored dates stay as the old rule computed
-- them until it is recalculated (M3's boot re-derivation does that once).
--
-- COST, MEASURED (docs/specs/cross-plan-day-boundary/m2/migration-cost.md has the method and every
-- run). PostgreSQL 16.13, all 70 prior migrations replayed, then 100,000 activities in 20 plans
-- (2,000 RESOURCE_DEPENDENT), 12 calendars (one soft-deleted), 2,800 resource assignments (2,000
-- live drivers, 400 soft-deleted drivers, 400 live non-driving) and 10,000 links over all four lag
-- calendars (500 soft-deleted, 20 at +/-3,650 days):
--   EXPLAIN (ANALYZE, BUFFERS) of this statement as shipped, five runs, each rolled back with a
--   VACUUM ANALYZE between: 351.7-399.5 ms execution (median 362.3), 4.7-7.5 ms planning. Shape:
--   two sequential scans of `activities` hash-joined to the links (a tenth of the table, so a
--   hash join is the right plan), the small tables hashed, `resource_assignments` scanned on the
--   partial index's predicate; the record's two FK triggers take 35-39 and 41-45 ms over 10,000
--   calls; the UPDATE hash-joins the 5,355 changed links back from the CTE. Without the VACUUM the
--   rolled-back updates' dead tuples inflate later runs to 440-482 ms.
--   `prisma migrate deploy` on that database: 415 ms as Prisma records it (finished_at -
--   started_at), 2.95 s wall clock including Prisma's own start-up. 10,000 links recorded, exactly
--   the 5,355 whose value changes rewritten, each with version + 1 and nothing else; every other
--   column of `cross_plan_dependencies`, and `activities`, `plans`, `calendars` and
--   `resource_assignments`, byte-identical by md5; the drift check clean on the populated database.
--   The docs/DEPLOYMENT.md reverse on the same database: 0.19 s, every link's (id, lag_minutes)
--   md5-identical to before the migration, and a second run refused at its LOCK.
-- A once-ever statement under half a second, run before the API serves (ADR-0018): no batching and
-- no new index. The table holds curated links only, created one at a time with no bulk path (spec
-- E32).
--
-- NOT COVERED BY THE CI SCHEMA-DRIFT CHECK beyond the table itself: the rewrite is DML, and on the
-- empty database CI provisions it is a silent no-op (ADR-0107). The migration test
-- (apps/api/test/cross-plan-lag-migration.e2e-spec.ts) seeds every resolution path, runs this
-- file's last statement read from this file, and asserts hand-written expected values.
--
-- REVERSE (forward-only in production, ADR-0018). A redeploy of the previous image alone would read
-- working minutes as `x 1440` days and write new links in the old unit, mixing two encodings in one
-- column. The compensating procedure is docs/DEPLOYMENT.md "Rolling back past the cross-plan lag
-- release": a factor-drift check, then with the API stopped and as one transaction, LOCK the record
-- (a one-shot guard), restore recorded rows, convert unrecorded rows with this file's `resolved`
-- CTE copied verbatim, two checks, DROP the record and delete this migration's
-- `_prisma_migrations` row. The migration test runs that script as written.

-- CreateTable: the record. One row per cross-plan link this file resolved, changed or not.
CREATE TABLE "cross_plan_lag_migrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "cross_plan_dependency_id" UUID NOT NULL,
    "lag_calendar" "LagCalendarSource" NOT NULL,
    "lag_calendar_id" UUID,
    "day_factor_minutes" INTEGER NOT NULL,
    "prior_lag_minutes" INTEGER NOT NULL,
    "new_lag_minutes" INTEGER NOT NULL,
    "migrated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cross_plan_lag_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one record per link. The reverse's step-3 selector ("no record => created after the
-- release") needs exactly one. It cannot fire inside this file: see the header.
CREATE UNIQUE INDEX "cross_plan_lag_migrations_cross_plan_dependency_id_key" ON "cross_plan_lag_migrations"("cross_plan_dependency_id");

-- CreateIndex: (plan_id), for the CASCADE. A plan hard-delete must find these rows; without it every
-- ADR-0096 expiry would sequentially scan this table. No application read, so no second column.
CREATE INDEX "cross_plan_lag_migrations_plan_id_idx" ON "cross_plan_lag_migrations"("plan_id");

-- AddForeignKey: organization_id -> organizations (RESTRICT, matching every sibling).
ALTER TABLE "cross_plan_lag_migrations" ADD CONSTRAINT "cross_plan_lag_migrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: plan_id -> plans (CASCADE: the row dies with its plan, which keeps it out of the
-- hierarchy-expiry delete list).
ALTER TABLE "cross_plan_lag_migrations" ADD CONSTRAINT "cross_plan_lag_migrations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The resolution, the record and the rewrite: ONE statement, last in the file. `resolved` computes
-- each link's calendar, factor and new value once; `recorded` inserts a row for every resolved link
-- and returns it; the UPDATE converts only the returned links whose value changes. The record id is
-- a UUID v7 built from clock_timestamp(), the expression the ADR-0148 strip verified and the
-- ADR-0155 re-encoding reused (the table has no database default; Prisma's @default(uuid(7)) is
-- application-side). The docs/DEPLOYMENT.md reverse copies `resolved` verbatim, and the migration
-- test asserts that it does.
WITH resolved AS (
  SELECT
    d."id" AS "cross_plan_dependency_id",
    d."organization_id" AS "organization_id",
    s."plan_id" AS "plan_id",
    d."lag_calendar" AS "lag_calendar",
    k."calendar_id" AS "lag_calendar_id",
    COALESCE(c."hours_per_day_minutes", 1440) AS "day_factor_minutes",
    d."lag_minutes" AS "prior_lag_minutes",
    round(d."lag_minutes"::numeric * COALESCE(c."hours_per_day_minutes", 1440) / 1440)::integer AS "new_lag_minutes"
  FROM "cross_plan_dependencies" d
  JOIN "activities" p ON p."id" = d."predecessor_id"
  JOIN "plans" pp ON pp."id" = p."plan_id"
  JOIN "activities" s ON s."id" = d."successor_id"
  JOIN "plans" sp ON sp."id" = s."plan_id"
  LEFT JOIN "resource_assignments" pa
    ON pa."activity_id" = p."id" AND pa."is_driving" AND pa."deleted_at" IS NULL
    AND p."type" = 'RESOURCE_DEPENDENT' AND p."deleted_at" IS NULL
  LEFT JOIN "resources" pr ON pr."id" = pa."resource_id" AND pr."deleted_at" IS NULL
  LEFT JOIN "resource_assignments" sa
    ON sa."activity_id" = s."id" AND sa."is_driving" AND sa."deleted_at" IS NULL
    AND s."type" = 'RESOURCE_DEPENDENT' AND s."deleted_at" IS NULL
  LEFT JOIN "resources" sr ON sr."id" = sa."resource_id" AND sr."deleted_at" IS NULL
  CROSS JOIN LATERAL (
    SELECT CASE d."lag_calendar"
      WHEN 'TWENTY_FOUR_HOUR' THEN NULL::uuid
      WHEN 'PROJECT_DEFAULT' THEN sp."calendar_id"
      WHEN 'PREDECESSOR' THEN COALESCE(pr."calendar_id", p."calendar_id", pp."calendar_id")
      WHEN 'SUCCESSOR' THEN COALESCE(sr."calendar_id", s."calendar_id", sp."calendar_id")
    END AS "calendar_id"
  ) k
  LEFT JOIN "calendars" c ON c."id" = k."calendar_id"
),
recorded AS (
  INSERT INTO "cross_plan_lag_migrations" (
    "id", "organization_id", "plan_id", "cross_plan_dependency_id", "lag_calendar",
    "lag_calendar_id", "day_factor_minutes", "prior_lag_minutes", "new_lag_minutes"
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
    r."organization_id",
    r."plan_id",
    r."cross_plan_dependency_id",
    r."lag_calendar",
    r."lag_calendar_id",
    r."day_factor_minutes",
    r."prior_lag_minutes",
    r."new_lag_minutes"
  FROM resolved r
  RETURNING "cross_plan_dependency_id", "prior_lag_minutes", "new_lag_minutes"
)
UPDATE "cross_plan_dependencies" d
   SET "lag_minutes" = rec."new_lag_minutes",
       "version"     = d."version" + 1
  FROM recorded rec
 WHERE d."id" = rec."cross_plan_dependency_id"
   AND rec."new_lag_minutes" <> rec."prior_lag_minutes";
