-- ADR-0125 / CQ-1 Option B: the recalculation records the criticality rule it ACTUALLY RAN WITH.
--
-- WHY. `activities.is_critical` and `.total_float` are the OUTPUT of a rule the plan holds
-- (plans.critical_path_definition / .critical_float_threshold_minutes / .total_float_mode /
-- .make_open_ends_critical). Those columns are the plan's CONFIGURATION and are not evidence of
-- which rule produced the persisted output: a settings PATCH writes them without recalculating and
-- without marking the schedule stale (plans.service.ts:154-163; the web says so itself at
-- PlanScheduleSettings.tsx:36-38 — "a later Recalculate applies the new definition/measure"). So a
-- planner can move the definition, capture a baseline, and the frozen critical set reflects a rule
-- the plan no longer holds, with nothing in the database able to say which rule that was.
--
-- These four ENGINE-OWNED mirrors close that. They are written by the recalculation's existing
-- freshness stamp (`stampScheduleComputedAt`, called inside the plan advisory lock and the recalc
-- transaction) from the SAME object spread into ComputeOptions — one derivation, so the engine
-- input and the mirror cannot disagree. A revision comparison can then say SETTINGS_MATCH /
-- SETTINGS_DIFFER about two COMPUTATIONS rather than about two configurations.
--
-- WHY THESE FOUR AND NOT THE OTHER SEVEN PLAN SCHEDULING OPTIONS. Verified against the engine
-- (compute.ts:668-696): these four change is_critical / total_float and move NO date.
-- progress_recalc_mode, use_expected_finish_dates, ignore_external_relationships, level_resources,
-- level_within_float_only and scheduling_mode all change the network, so movement they cause is real
-- movement a comparison is right to report without a caveat. Mirroring the whole option set would
-- make `plans` an engine-input run record, which invites a reader to treat it as one.
--
-- LEVELLING IS ORTHOGONAL. The ADR-0041 pass runs inside this same transaction and this same stamp,
-- and its overlay writes only the leveled_* / leveling_* columns (level.ts:170-177, :296-299) —
-- is_critical and total_float stay the pure NETWORK values on a levelled plan and an unlevelled one
-- alike (ADR-0041 Q2). So the mirror means the same thing either way, and level_resources /
-- level_within_float_only are correctly NOT mirrored.
--
-- NULLABLE, NO DEFAULT, AND THAT IS THE LOAD-BEARING DECISION. NULL means "the rule that produced
-- this plan's persisted is_critical is UNKNOWN" — never recalculated, or recalculated before this
-- shipped. It is a sentinel, never a claim. The four client-settable source columns carry constant
-- DEFAULTs legitimately, because a NEW plan genuinely starts there; a plan that has ALREADY been
-- computed has not, so a DEFAULT here would state, in a NOT NULL column that offers a reader no way
-- to doubt it, a rule the recalculation may never have used. The governing precedent is one column
-- along: plans.schedule_computed_at — engine-owned, nullable, no default, no backfill, NULL =
-- "never calculated". THE VALUES ARE UNBACKFILLABLE: nothing surviving records which rule produced
-- an existing persisted schedule, so inventing one would be a fabrication rather than a migration.
--
-- MEASURED, not assumed, against a 200,000-row plans-shaped table on PostgreSQL 16.13:
--   ADD COLUMN x4 (2 enum-typed, nullable, no default)   1.276 ms, pg_relation_filenode UNCHANGED
--   three CHECKs, NOT VALID + VALIDATE                   ~91.9 ms
--                                                  TOTAL ~93.2 ms, no table rewrite
-- The ADR-0053 M3 two-migration enum rule does NOT apply here: this migration adds no enum label,
-- and both types were committed by 20260716180000. One file is correct.

ALTER TABLE "plans"
  ADD COLUMN "schedule_critical_path_definition"         "CriticalPathDefinition",
  ADD COLUMN "schedule_critical_float_threshold_minutes" INTEGER,
  ADD COLUMN "schedule_total_float_mode"                 "TotalFloatMode",
  ADD COLUMN "schedule_make_open_ends_critical"          BOOLEAN;

-- FAIL-CLOSED ALL-OR-NONE (the ck_notes_exactly_one_parent tradition). A half-recorded rule has no
-- meaning, and forbidding it is what makes the three-state read TOTAL: a caller may test
-- `schedule_critical_path_definition IS NULL` and be right about all four columns. Written as an
-- explicit IN (0, 4) membership test rather than `= 0 OR = 4`, so adding a fifth mirrored setting
-- later fails loudly against the literal instead of passing silently.
ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_schedule_criticality_all_or_none" CHECK (
  num_nonnulls(
    "schedule_critical_path_definition",
    "schedule_critical_float_threshold_minutes",
    "schedule_total_float_mode",
    "schedule_make_open_ends_critical"
  ) IN (0, 4)
) NOT VALID;
ALTER TABLE "plans" VALIDATE CONSTRAINT "ck_plans_schedule_criticality_all_or_none";

-- Range: the same 0 … 5_256_000 working minutes (about ten years) as the source column's
-- ck_plans_critical_float_threshold_minutes_range, plus the nullable-safe guard the source does not
-- need. A mirror must not be able to hold a value its source would refuse — and that matters MORE
-- here than on `baselines`, because this column is written by a raw parameterised UPDATE that
-- bypasses every Prisma and DTO guard, so this constraint is the only thing behind it.
ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_schedule_critical_float_threshold_minutes_range" CHECK (
  "schedule_critical_float_threshold_minutes" IS NULL
  OR "schedule_critical_float_threshold_minutes" BETWEEN 0 AND 5256000
) NOT VALID;
ALTER TABLE "plans" VALIDATE CONSTRAINT "ck_plans_schedule_critical_float_threshold_minutes_range";

-- A MIRROR MAY NEVER EXIST WITHOUT THE CURSOR IT DESCRIBES. This constraint has NO analogue on
-- `baselines` (a baseline's captured_at is when the snapshot was taken, not when the schedule was
-- computed, so coupling to it would relate two different events). The premise of this whole change
-- is that the four mirrors and `schedule_computed_at` describe the SAME recalculation — guaranteed
-- today only by there being exactly one write site. That is a fact about code, which the database
-- does not know. Stating it here means a second write path that populated the mirrors without
-- stamping fails loudly, and such a path is precisely the defect class this migration removes. It
-- also makes the sentinel's wording a checkable claim: a rule with no cursor is unrepresentable.
ALTER TABLE "plans" ADD CONSTRAINT "ck_plans_schedule_criticality_requires_cursor" CHECK (
  "schedule_critical_path_definition" IS NULL
  OR "schedule_computed_at" IS NOT NULL
) NOT VALID;
ALTER TABLE "plans" VALIDATE CONSTRAINT "ck_plans_schedule_criticality_requires_cursor";

-- No index on any of the four. They are read only alongside their own row, by primary key.
