-- ADR-0125 / CQ-1: a baseline freezes the criticality RULE its snapshot was COMPUTED under.
--
-- WHY. `baseline_activities.is_critical` and `.total_float` are the OUTPUT of a rule, not properties
-- of an activity. Until now a baseline froze the output and not the rule, so a planner who changed
-- the definition, the threshold, the float measure or the open-ends option and recalculated got a
-- different critical set with EVERY COMPUTED DATE BYTE-IDENTICAL — and a comparison against an older
-- baseline reported that as activities "entering the critical path". The product could not say so;
-- it could not even detect it.
--
-- WHY THESE FOUR AND NOT THE OTHER SEVEN PLAN SCHEDULING OPTIONS. Verified against the engine
-- (compute.ts:675-696): these four change is_critical / total_float and move NO date.
-- progress_recalc_mode, use_expected_finish_dates, ignore_external_relationships, level_resources,
-- level_within_float_only and scheduling_mode all change the network, so movement they cause is real
-- movement a comparison is right to report without a caveat. total_float_mode is IN the set — the
-- feature spec named only three — because it selects which of two computed spans is exposed as
-- `total_float`, which is BOTH the TOTAL_FLOAT criticality predicate's left-hand side AND the number
-- this feature reports as float movement. The set is the frozen image of `CriticalityRule`
-- (src/modules/schedule/criticality-rule.ts), whose `Required<Pick<ComputeOptions, …>>` projection
-- makes a fifth criticality option a compile error rather than a silent omission here.
--
-- WHERE THE VALUES COME FROM, AND WHY NOT THE OBVIOUS PLACE. NOT from the plan's client-settable
-- critical_* columns: those are its CONFIGURATION, and a settings PATCH writes them without
-- recalculating and without marking the schedule stale, so they may name a rule the snapshot's
-- numbers never came from. They are copied from the ENGINE-OWNED mirrors added by
-- 20260905120000_plan_schedule_criticality_mirror, read inside the plan advisory lock the capture
-- already holds — so the rule is paired with the recalculation that produced the rows being frozen.
--
-- NULLABLE, NO DEFAULT, AND THAT IS THE LOAD-BEARING DECISION. NULL means "the rule under which this
-- snapshot's is_critical was computed is UNKNOWN". It is a sentinel, never a claim. Two independent
-- reasons, and either alone would decide it:
--   (1) A constant DEFAULT would follow the shape of baselines.hours_per_day_minutes DEFAULT 1440
--       while discarding its justification — that default was legal because 1440 was TRUE of every
--       existing row (nothing could author a non-full-day calendar). These four settings have been
--       planner-writable since 20260716180000_m6_plan_float_options, so defaulting an existing
--       baseline to TOTAL_FLOAT/0/FINISH/false would state, in a NOT NULL column that offers a
--       reader no way to doubt it, a rule that baseline may never have been computed under.
--   (2) The SOURCE is nullable. plans.schedule_critical_path_definition is NULL for every plan not
--       recalculated since the mirror shipped, so a NOT NULL column here would have nothing to copy
--       and the capture would have to invent a value.
-- The governing precedent is one table along: baseline_activities.budgeted_expense (ADR-0071 M3),
-- which rejected NOT NULL DEFAULT 0 in this same model family because "0 is a claim". THE VALUES ARE
-- UNBACKFILLABLE: no surviving artefact records which rule produced a historic snapshot.
--
-- UNLIKE THE PLANS MIRROR, THIS SENTINEL IS PERMANENT. A plan's mirror self-clears on its next
-- recalculation; a capture cannot be re-run, so a baseline captured before this reads UNKNOWN
-- forever. That is the true statement, and it is why M0-T6 ships a release ahead: every
-- recalculation in between converts a plan from "next capture is permanently unknown" to "next
-- capture records a real rule".
--
-- MEASURED, not assumed, against a 200,000-row copy of this table (CREATE TABLE … LIKE baselines
-- INCLUDING ALL) on PostgreSQL 16.13:
--   ADD COLUMN x4 (2 enum-typed, nullable, no default)   2.233 ms, pg_relation_filenode UNCHANGED
--   ADD CONSTRAINT x2, NOT VALID                         1.007 / 0.686 ms
--   VALIDATE CONSTRAINT x2                              31.712 / 23.838 ms
--                                                 TOTAL ~59.5 ms, no table rewrite
-- pg_attribute.atthasmissing is FALSE for all four (no attmissingval), as expected for nullable
-- columns with no default: existing rows are not read, not rewritten and not widened. A real
-- baselines table holds a handful of rows per plan, so the figures above are an upper bound by
-- orders of magnitude. Safe under the self-migrating entrypoint (ADR-0018), no maintenance window.
-- The ADR-0053 M3 two-migration enum rule does NOT apply: this migration adds no enum label, and
-- both types were committed by 20260716180000. One file is correct.
--
-- PARITY. The CPM engine never reads `baselines` — it is handed activities, edges, calendars and
-- ComputeOptions built from `plans`. computeSchedule's signature, inputs and outputs are unchanged,
-- so the ADR-0034 recalculation parity gate is untouched by construction. The capture writes four
-- more scalars inside the transaction and the advisory lock it already holds.

ALTER TABLE "baselines"
  ADD COLUMN "critical_path_definition"         "CriticalPathDefinition",
  ADD COLUMN "critical_float_threshold_minutes" INTEGER,
  ADD COLUMN "total_float_mode"                 "TotalFloatMode",
  ADD COLUMN "make_open_ends_critical"          BOOLEAN;

-- FAIL-CLOSED ALL-OR-NONE (the ck_notes_exactly_one_parent tradition; the same shape as
-- ck_plans_schedule_criticality_all_or_none on the mirror this copies from, because it expresses the
-- same invariant and a reader comparing the two tables should find it written the same way). A half
-- frozen rule has no meaning, and forbidding it is what makes the three-state read TOTAL: a caller
-- may test `critical_path_definition IS NULL` and be right about all four columns — which is what
-- lets the capture's own non-null assertions be legitimate rather than hopeful. Written as an
-- explicit IN (0, 4) membership test rather than `= 0 OR = 4`, so adding a fifth frozen setting later
-- fails loudly against the literal instead of passing silently.
ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none" CHECK (
  num_nonnulls(
    "critical_path_definition",
    "critical_float_threshold_minutes",
    "total_float_mode",
    "make_open_ends_critical"
  ) IN (0, 4)
) NOT VALID;
ALTER TABLE "baselines" VALIDATE CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none";

-- Range: the same 0 … 5_256_000 working minutes (about ten years) as the ultimate source column's
-- ck_plans_critical_float_threshold_minutes_range, plus the nullable-safe guard that source does not
-- need. A frozen copy must not be able to hold a value its source would refuse — and the value
-- reaches this table through TWO hops (a raw parameterised UPDATE onto plans, then a Prisma insert
-- here), so this constraint is the last thing standing behind it. NOT VALID + VALIDATE mirrors
-- ck_baselines_hours_per_day_minutes_range on this same table; both constraints enforce every new
-- and updated row from the moment they commit, and VALIDATE takes only SHARE UPDATE EXCLUSIVE.
ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range" CHECK (
  "critical_float_threshold_minutes" IS NULL
  OR "critical_float_threshold_minutes" BETWEEN 0 AND 5256000
) NOT VALID;
ALTER TABLE "baselines" VALIDATE CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range";

-- NO THIRD CHECK, and that is a decision rather than an omission. The mirror carries
-- ck_plans_schedule_criticality_requires_cursor ("a rule may never exist without the
-- schedule_computed_at it describes") because there the rule and the cursor are written by ONE
-- statement, so the constraint pins a genuine co-write invariant. This table has no such column:
-- `captured_at` is NOT NULL DEFAULT now(), so an analogous coupling would be a tautology that can
-- never refuse anything — worse than no constraint, because it reads as protection. Coupling instead
-- to `captured_project_finish` was considered and rejected: it would relate the frozen rule (copied
-- from the plan) to the snapshot's computed extent (derived from the activity rows) — two facts
-- about different events, which is the same objection that rules out `captured_at`, and it buys
-- nothing the service's SCHEDULE_NOT_CALCULATED guard does not already refuse.

-- No index on any of the four. They are read only alongside their own row, by primary key, when the
-- comparison loads a baseline; there is no new WHERE/JOIN/ORDER BY predicate anywhere in the feature
-- and no route filters, sorts or groups baselines by a criticality setting. Index query patterns,
-- not columns (docs/DATABASE.md) — the same sentence 20260801120000 closes with for
-- hours_per_day_minutes. Revisit ONLY if such a route is added.

-- Down (forward-only in production; documented for completeness):
--   ALTER TABLE "baselines" DROP CONSTRAINT "ck_baselines_critical_float_threshold_minutes_range";
--   ALTER TABLE "baselines" DROP CONSTRAINT "ck_baselines_criticality_snapshot_all_or_none";
--   ALTER TABLE "baselines" DROP COLUMN "make_open_ends_critical";
--   ALTER TABLE "baselines" DROP COLUMN "total_float_mode";
--   ALTER TABLE "baselines" DROP COLUMN "critical_float_threshold_minutes";
--   ALTER TABLE "baselines" DROP COLUMN "critical_path_definition";
-- A down here is IRREVERSIBLE in the only way that matters, and unlike the plans mirror's: those
-- repopulate on the next recalculation, these are gone with the captures that produced them.
