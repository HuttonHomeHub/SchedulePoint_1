-- SCHEDULE INSTANTS: the exact engine instant beside four computed dates, and the plan-level marker
-- that says whether they are current. Cross-plan instants (docs/TECH_DEBT.md #565, ADR-0212).
-- Spec: docs/specs/cross-plan-instants/feature-spec.md §4.4 (approved by the product owner 2026-11-07,
-- Q1 B, Q2 A). Plan M2-T2. Designed by the database-architect agent (CLAUDE.md §19.3); the full
-- reasoning is docs/specs/cross-plan-instants/m2-schema-design.md.
--
-- WHY. A stored DATE cannot tell two instants apart (a driven start milestone and an SNET-pinned one
-- both store 2027-07-03, cross-plan-milestone-fixture.spec.ts:260-292), so a cross-plan link reading
-- the remote plan's date cannot equal one plan. The engine already holds the instant when it writes
-- the date (compute.ts placedStartInst/placedFinishInst/lsInst/lfInst). This keeps it.
--
-- TIMESTAMPTZ(3), the external_early_start precedent: the engine's absolute minute (civil, no zone,
-- held as UTC). `writeResults` sends int minutes and converts with `timestamptz 'epoch' +
-- make_interval(mins => …)`: exact integer arithmetic, independent of the session TimeZone.
--
-- NULLABLE, NO DEFAULT, NO BACKFILL. An instant needs the engine. NULL reads the date exactly as before
-- (FC-5), and each plan fills on its next recalculation. M3/M4's boot service fills linked plans.
--
-- THE MARKER (plans.schedule_instants_computed_at). Stamped now() in the SAME UPDATE as
-- schedule_computed_at, so a current recalculation leaves them equal. An image that predates this
-- file names its columns in both writes, so it moves the dates and the cursor and leaves the instants
-- and this marker behind. The pair differs and the derivation reads the date. That is why a rollback
-- needs no step for these columns. It is on `plans`, against docs/DATABASE.md's caution about
-- markers, because this fact is per plan (which code wrote its last recalculation), and no
-- _prisma_migrations row can hold it.
--
-- CONSTRAINTS. Both are written so that NO OLDER IMAGE CAN VIOLATE THEM: an older image never writes
-- the instants or the marker, and always writes non-NULL dates and a non-NULL cursor.
--   * ck_activities_schedule_instants_all_or_none_with_dates: four NULL, or four set with their dates.
--     An IN (0, 4)-style literal count, so adding a fifth instant fails loudly (the
--     ck_plans_schedule_criticality_all_or_none tradition).
--   * ck_plans_schedule_instants_requires_cursor: a marker never exists without the cursor it is
--     compared with (the ck_plans_schedule_criticality_requires_cursor shape). NO `<=` CHECK: the cursor
--     can move backwards when two recalculations queue on the plan lock (the earlier-started
--     transaction stamps the earlier now() last), which would fail an older image's recalculation
--     mid-rollback.
--   * No ordering CHECK (start <= finish): the dates have none, and a progressed activity can invert.
--
-- NO INDEX. Only projected: the cross-plan loads filter cross_plan_dependencies and reach the remote
-- activity and plan by primary key; the export reads per plan. No WHERE or ORDER BY targets them.
--
-- BOOT SAFETY (ADR-0018 / ADR-0107). Each ADD COLUMN is nullable with no default, so it is
-- metadata-only and no row is rewritten. Each CHECK is added NOT VALID then VALIDATEd. Inside Prisma's
-- single migration transaction the ACCESS EXCLUSIVE lock is held to commit anyway, and the VALIDATE
-- scans read columns that are NULL on every row, which both constraints admit, so they cannot fail on
-- any data. A pending migration makes the ADR-0192 pre-migrate copy run on hosts with /backups.
-- OBSERVED rather than asserted (ADR-0107: an empty table cannot exhibit a data-shaped failure), on a
-- scratch database migrated to 20261101120000 and populated with 5,000 activities (one plan), then
-- migrated by `prisma migrate deploy`: `relfilenode` unchanged on `activities` (18679) and `plans`
-- (18595) across the apply (no rewrite); `pg_attribute.atthasmissing = f` on all five columns; both
-- constraints read `convalidated = t`; three instants and one NULL, four instants beside a NULL date,
-- and a marker with a NULL cursor are each refused with 23514; an older image's write (dates and
-- cursor only) is accepted by both and leaves `schedule_instants_computed_at = schedule_computed_at`
-- false; and `prisma:check-drift` against the result reports "No difference detected".
--
-- ROLLBACK. Redeploying the previous image is safe: its Prisma client selects named columns, and its
-- writeResults and stampScheduleComputedAt name neither these columns nor the marker. Its
-- recalculations therefore leave instants that the marker then reports as not current. Nothing reads
-- the instants before M4.
--
-- PARITY. No engine input changes; computeSchedule's existing outputs are untouched (FC-4).

ALTER TABLE "activities"
  ADD COLUMN "visual_effective_start_instant"  TIMESTAMPTZ(3),
  ADD COLUMN "visual_effective_finish_instant" TIMESTAMPTZ(3),
  ADD COLUMN "late_start_instant"              TIMESTAMPTZ(3),
  ADD COLUMN "late_finish_instant"             TIMESTAMPTZ(3);

ALTER TABLE "activities" ADD CONSTRAINT "ck_activities_schedule_instants_all_or_none_with_dates" CHECK (
  num_nonnulls(
    "visual_effective_start_instant",
    "visual_effective_finish_instant",
    "late_start_instant",
    "late_finish_instant"
  ) = 0
  OR num_nonnulls(
    "visual_effective_start_instant",
    "visual_effective_finish_instant",
    "late_start_instant",
    "late_finish_instant",
    "visual_effective_start",
    "visual_effective_finish",
    "late_start",
    "late_finish"
  ) = 8
) NOT VALID;
ALTER TABLE "activities" VALIDATE CONSTRAINT "ck_activities_schedule_instants_all_or_none_with_dates";

ALTER TABLE "plans" ADD COLUMN "schedule_instants_computed_at" TIMESTAMPTZ(3);

ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_schedule_instants_requires_cursor" CHECK (
  "schedule_instants_computed_at" IS NULL
  OR "schedule_computed_at" IS NOT NULL
) NOT VALID;
ALTER TABLE "plans" VALIDATE CONSTRAINT "ck_plans_schedule_instants_requires_cursor";

-- Down (forward-only in production, ADR-0018; documented for completeness). Destroys nothing a
-- recalculation could not reproduce:
--   ALTER TABLE "plans" DROP CONSTRAINT "ck_plans_schedule_instants_requires_cursor";
--   ALTER TABLE "plans" DROP COLUMN "schedule_instants_computed_at";
--   ALTER TABLE "activities" DROP CONSTRAINT "ck_activities_schedule_instants_all_or_none_with_dates";
--   ALTER TABLE "activities" DROP COLUMN "late_finish_instant";
--   ALTER TABLE "activities" DROP COLUMN "late_start_instant";
--   ALTER TABLE "activities" DROP COLUMN "visual_effective_finish_instant";
--   ALTER TABLE "activities" DROP COLUMN "visual_effective_start_instant";
