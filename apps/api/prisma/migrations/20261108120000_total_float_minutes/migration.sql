-- TOTAL FLOAT IN WORKING MINUTES: the engine's unrounded total float stored beside the rounded day
-- column, on the live activity and on its frozen baseline copy. The baseline float frame
-- (docs/TECH_DEBT.md #318). Spec: docs/specs/baseline-float-frame/feature-spec.md §4 "Database
-- changes" (approved by the product owner 2026-11-08). Plan T1. Designed by the database-architect
-- agent (CLAUDE.md §19.3).
--
-- WHY. `total_float` is `Math.round(minutes / factor)` on the activity's own calendar
-- (schedule.repository.ts writeResults), and the minutes were thrown away. A baseline therefore
-- froze a figure that cannot be rescaled: after a calendar's hours-per-day changes, a float that did
-- not move reads as moved (round(2400/1440) = 2 against 5 at 480). Keeping the minutes lets every
-- comparison subtract minutes and convert once.
--
-- INTEGER. The engine's `totalFloat` is `cal.workingTimeBetween(...)` (compute.ts), the SIGNED whole
-- number of working minutes between two whole-minute instants over whole-minute shift windows
-- (working-time-calendar.ts; windows are SMALLINT minutes). It is never fractional, may be negative
-- (negative float is valid), and is bounded by the engine's ~200-year horizon (73,200 days x 1,440 =
-- 105,408,000 < 2^31). The duration_minutes / leveling_delay_minutes precedent.
--
-- NULLABLE, NO DEFAULT, NO BACKFILL, AND NO DISCRIMINATOR. A backfill cannot exist: the minutes were
-- never stored, and recomputing them from a rounded day is the defect being fixed. The NULL rule is
-- the contract, and it departs on purpose from the *_snapshot_level rule:
--   * minutes NULL, days set  => calculated/captured before this release (or a plan not
--                                recalculated since); NOT comparable, never read as 0.
--   * both NULL               => not calculated.
-- The product owner decided on 2026-11-08 that every plan is wiped at the 1.0 roll-out and no
-- backwards compatibility is owed, so no capture-level discriminator or plan-level mirror is added.
-- The column comments in schema.prisma say this so the next reader does not "fix" it.
--
-- CONSTRAINTS. One ONE-WAY check per table: minutes never exist without the day figure. A
-- both-or-none check was rejected: every existing row has days and NULL minutes, and a NOT VALID
-- check still applies to UPDATE, so renaming any pre-existing activity would fail. The one-way form
-- is admitted by every existing row, by every write an older image makes (it never names the
-- column), and by the T2 writer (it writes both, both non-NULL). No sign check: negative float is
-- valid. Added NOT VALID then VALIDATEd; the scan reads a column NULL on every row, so it cannot fail.
--
-- NO INDEX. Read only inside the plan-scoped activity load and the whole-baseline snapshot load; no
-- WHERE, JOIN or ORDER BY targets either column (docs/DATABASE.md: index query patterns, not columns).
--
-- BOOT SAFETY (ADR-0018 / ADR-0107). Each ADD COLUMN is nullable with no default, so it is
-- metadata-only and no row is rewritten. A pending migration makes the ADR-0192 pre-migrate copy run
-- on hosts with /backups. OBSERVED rather than asserted (ADR-0107) on a scratch database migrated to
-- 20261107120100 and populated with 5,000 activities in one plan (3,334 with total_float, 1,666
-- NULL, values -3..7) and a 5,000-row baseline copied from them, then migrated by `prisma migrate
-- deploy`: relfilenode unchanged on activities (22793) and baseline_activities (22934), so no
-- rewrite; atthasmissing = f on both columns; both constraints convalidated = t; minutes beside a
-- NULL total_float refused with 23514 on both tables; a rename of a pre-existing row (days set,
-- minutes NULL) accepted, then minutes -2400 beside days -2 accepted; a new row with neither
-- accepted; and `prisma:check-drift` against the result reports "No difference detected".
--
-- ROLLBACK. Redeploying the previous image is safe: its Prisma client selects named columns and its
-- writeResults and capture name neither column. Caveat: once the T2 writer has run, an older image's
-- recalculation rewrites `total_float` and leaves `total_float_minutes` as it was, so the minutes can
-- be stale until the next recalculation on a current image. Accepted with the no-marker decision.
--
-- PARITY. No engine input or output changes; nothing writes or reads these columns until T2/T3.

ALTER TABLE "activities" ADD COLUMN "total_float_minutes" INTEGER;

ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_total_float_minutes_requires_days"
  CHECK ("total_float_minutes" IS NULL OR "total_float" IS NOT NULL) NOT VALID;
ALTER TABLE "activities" VALIDATE CONSTRAINT "ck_activities_total_float_minutes_requires_days";

ALTER TABLE "baseline_activities" ADD COLUMN "total_float_minutes" INTEGER;

ALTER TABLE "baseline_activities" ADD CONSTRAINT "ck_baseline_activities_total_float_minutes_requires_days"
  CHECK ("total_float_minutes" IS NULL OR "total_float" IS NOT NULL) NOT VALID;
ALTER TABLE "baseline_activities" VALIDATE CONSTRAINT "ck_baseline_activities_total_float_minutes_requires_days";
