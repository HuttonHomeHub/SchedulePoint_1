-- Require plans.planned_start (ADR-0033, M1 Task 1.1).
--
-- This is the ONE irreversible step of ADR-0033: planned_start (the CPM data
-- date, ADR-0023) becomes mandatory + NOT NULL. It is deliberately isolated in
-- its own migration, AFTER the M0 additive slice
-- (…_add_scheduling_modes_columns), so the destructive change ships and is
-- reviewed alone.
--
-- Order within this single migration (Prisma wraps it in one transaction, so the
-- backfill and the SET NOT NULL commit atomically — no window where a NULL row
-- could race the constraint): backfill EVERY NULL first, THEN SET NOT NULL.
--
-- Backfill = the CQ-6 fallback chain, first non-null wins, applied to ALL plans
-- with a NULL planned_start INCLUDING soft-deleted ones (the column is NOT NULL
-- for every row, so soft-deleted plans must be filled too):
--   a. earliest ACTIVE (deleted_at IS NULL) activity constraint_date in the plan,
--   b. else earliest ACTIVE activity actual_start,
--   c. else the plan's created_at::date,
--   d. else CURRENT_DATE (final defensive guard; created_at is NOT NULL so this
--      is effectively unreachable, but COALESCE keeps the UPDATE total).
-- MIN() ignores NULLs and returns NULL over an empty set, so a plan with no
-- active activities (or only SOFT-DELETED ones) cleanly falls through to
-- created_at::date. Correlated subqueries — a single set-based UPDATE, no loop.
DO $$
DECLARE
  backfilled_count INTEGER;
BEGIN
  UPDATE "plans" p
  SET "planned_start" = COALESCE(
    -- a. earliest active constraint_date among this plan's activities
    (
      SELECT MIN(a."constraint_date")
      FROM "activities" a
      WHERE a."plan_id" = p."id"
        AND a."deleted_at" IS NULL
    ),
    -- b. else earliest active actual_start
    (
      SELECT MIN(a."actual_start")
      FROM "activities" a
      WHERE a."plan_id" = p."id"
        AND a."deleted_at" IS NULL
    ),
    -- c. else the plan's own creation day
    p."created_at"::date,
    -- d. else today (defensive; created_at is NOT NULL)
    CURRENT_DATE
  )
  WHERE p."planned_start" IS NULL;

  GET DIAGNOSTICS backfilled_count = ROW_COUNT;
  RAISE NOTICE 'require_plan_planned_start: backfilled planned_start for % plan row(s) before SET NOT NULL', backfilled_count;
END $$;

-- Now the invariant holds for every row — enforce it. Postgres must scan the
-- table once to validate; at the target scale (≤ ~100 plans/org) this is
-- negligible and the ACCESS EXCLUSIVE lock is held only for that brief scan.
ALTER TABLE "plans" ALTER COLUMN "planned_start" SET NOT NULL;

-- Forward-only in prod (docs/DATABASE.md). This migration is intentionally NOT
-- reversible: the DROP NOT NULL would be trivial, but the backfilled dates
-- cannot be distinguished from originals afterward, so "rollback" is a new
-- compensating migration + redeploy of the prior image, not a down-migration.
