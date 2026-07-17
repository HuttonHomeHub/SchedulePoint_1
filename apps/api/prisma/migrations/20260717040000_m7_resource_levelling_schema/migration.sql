-- M7 resource-levelling — L1: capacity & levelling schema (dark, additive)
-- (Engine Conformance Framework, ADR-0034/0035 §28 + N21, governed by ADR-0041;
-- builds on ADR-0039/0040/0037/0036).
--
-- This slice is SCHEMA + ADR only — NO behaviour (the opt-in levelling pass and its
-- recalc wiring are L2, not this migration; NOTHING reads the new columns yet). It
-- lays down the four inputs and the engine-owned overlay that L2 will consume:
--   * ACTIVATE the per-resource CAPACITY ceiling ADR-0039 RESERVED "for levelling"
--     (resources.max_units_per_hour) — the availability input;
--   * the client-settable levelling TIE-BREAK (activities.leveling_priority);
--   * the engine-owned leveled OVERLAY (activities.leveled_start / leveled_finish /
--     leveling_delay_minutes + the produce-and-flag bools leveling_window_exceeded /
--     self_over_allocated) — Q2: an ADDITIVE overlay, the pure network float/critical
--     is NOT recomputed on the leveled dates and stays authoritative;
--   * the two plan OPT-IN flags (plans.level_resources — the parity switch;
--     plans.level_within_float_only — ADR-0041 §4).
--
-- DIRECTION: forward-only in prod (ADR-0018 — the self-migrating image applies
-- migrations forward on boot; there is no down-migration path in production). A
-- documented, reversible Down block is at the foot for completeness.
--
-- FULLY ADDITIVE & BYTE-PARITY. With levelling off (plans.level_resources DEFAULT
-- false) the pass never runs and every prior golden + scenario recalculates
-- byte-identically (the ADR-0034/0039/0040 parity gate). No column is dropped or
-- rewritten; every add on an existing table is metadata-only in Postgres 11+:
--   * NULLABLE columns with NO default (max_units_per_hour, leveling_priority,
--     leveled_start/finish, leveling_delay_minutes) — a new nullable column is a
--     catalog-only change (no table rewrite, no full scan). NULL is the parity value:
--     NULL max_units_per_hour = UNCAPPED (never over-allocated); NULL leveling_priority
--     = UNSET (engine sorts NULL last, ADR-0035 §28); NULL leveled_*/delay = "not yet
--     levelled". A DEFAULT is DELIBERATELY omitted on max_units_per_hour (a DEFAULT 0
--     would mean "zero capacity" and silently over-allocate every existing resource)
--     and on leveling_priority (so "unset" is never conflated with an arbitrary
--     sentinel), mirroring the units_per_hour / expected_finish / visual_start
--     precedents.
--   * NOT NULL BOOLEAN … DEFAULT false (leveling_window_exceeded, self_over_allocated,
--     level_resources, level_within_float_only) — a NOT NULL column with a CONSTANT
--     default is metadata-only on PG 11+ (no table rewrite, no full-table scan, only a
--     brief ACCESS EXCLUSIVE for the catalog update). Every existing row backfills to
--     false in the same statement (same posture as constraint_violated /
--     resource_driver_missing; docs/DATABASE.md).
--
-- TYPE / DEFAULT DECISIONS recorded here (and in docs/DECISIONS.md):
--   * resources.max_units_per_hour: DECIMAL(18,4)?, NULL = uncapped. Exact numeric like
--     the assignment quantities (docs/DATABASE.md: exact data uses exact types). No
--     DEFAULT — see parity note above. Client-settable; N21 CHECK below.
--   * activities.leveling_priority: INT?, NULL = unset (lower = higher priority; engine
--     defines NULL ordering — NULL last). Nullable-no-default over a defaulted INT so
--     "no preference" is distinct from an explicit 0 (= top priority), matching the
--     optional-Planner-input precedent (expected_finish / visual_start) rather than the
--     always-present laneIndex/scheduleAsLateAsPossible defaults. No CHECK — priority is
--     an unconstrained ordering key (any integer is valid; the composite tie-break is
--     total).
--   * activities.leveled_start/leveled_finish: DATE?, engine-owned, mirroring
--     early_start/early_finish (nullable/no-default, NULL = not levelled).
--   * activities.leveling_delay_minutes: INT?, engine-owned working-minutes delay,
--     mirroring the engine-owned nullable ints total_float/free_float/visual_drift_days
--     (nullable/no-default over @default(0) so NULL cleanly means "not yet levelled",
--     not "levelled with zero delay").
--   * activities.leveling_window_exceeded / self_over_allocated: BOOLEAN NOT NULL
--     DEFAULT false, engine-owned produce-and-flag, mirroring constraint_violated /
--     resource_driver_missing exactly.
--   * plans.level_resources / level_within_float_only: BOOLEAN NOT NULL DEFAULT false,
--     mirroring the other plan option flags (use_expected_finish_dates /
--     make_open_ends_critical); default false = the parity/behaviour-preserving switch.
--
-- ENGINE-OWNED COLUMNS. leveled_start/finish, leveling_delay_minutes,
-- leveling_window_exceeded, self_over_allocated are written ONLY by the recalc's batched
-- `unnest` UPDATE (L2), NEVER by a user-facing write DTO, and NEVER touch
-- version/updated_at/updated_by, so a recalc stays invisible to optimistic locking
-- (ADR-0022). They join the engine-owned-column contract alongside early_*/is_critical.
--
-- NO NEW INDEX. Every new column is read as part of the already plan-scoped/org-scoped
-- loads (max_units_per_hour on the org-scoped resource demand load served by
-- (organization_id, created_at, id); the activity columns on the plan-scoped activity
-- load served by (plan_id, created_at, id)) and the flag bools are aggregated over that
-- same scope for the plan-level counts (computed in the schedule summary at read time —
-- NO plan count column, the constraint_violated precedent). No predicate ever targets a
-- new column in isolation, so an index would only cost writes for no read benefit
-- (docs/DATABASE.md: index real query patterns, not columns).

-- AddColumn: the per-resource capacity ceiling (ADR-0039 reserved → ADR-0041 §2
-- activated). NULLABLE, NO default — NULL = UNCAPPED (parity). Client-settable.
ALTER TABLE "resources" ADD COLUMN "max_units_per_hour" DECIMAL(18,4);

-- CheckConstraint (raw SQL — Prisma cannot express CHECK; docs/DATABASE.md: enforce
-- invariants in the DB, not only in code). max_units_per_hour may never be negative —
-- the DB backstop behind the DTO @Min(0) boundary reject (N21, ADR-0035 §25), mirroring
-- ck_resource_assignments_budgeted_units_nonneg (N14) /
-- ck_resource_assignments_units_per_hour_nonneg (N19). NULLABLE-SAFE (`IS NULL OR …`) so
-- it never blocks the common uncapped path (NULL = uncapped).
ALTER TABLE "resources" ADD CONSTRAINT "ck_resources_max_units_per_hour_nonneg" CHECK ("max_units_per_hour" IS NULL OR "max_units_per_hour" >= 0);

-- AddColumn: the levelling tie-break priority (ADR-0041 §1). CLIENT-SETTABLE, NOT
-- engine-owned. NULLABLE, NO default — NULL = unset (engine sorts NULL last). No CHECK.
ALTER TABLE "activities" ADD COLUMN "leveling_priority" INTEGER;

-- AddColumn: the engine-owned leveled overlay (ADR-0041 §3, Q2 — additive; network
-- float NOT recomputed). Nullable dates/int mirror early_start/early_finish/total_float
-- (NULL = not levelled); the two bools mirror constraint_violated (DEFAULT false,
-- backfilled in the same metadata-only statement). Written ONLY by the L2 recalc UPDATE.
ALTER TABLE "activities" ADD COLUMN "leveled_start" DATE;
ALTER TABLE "activities" ADD COLUMN "leveled_finish" DATE;
ALTER TABLE "activities" ADD COLUMN "leveling_delay_minutes" INTEGER;
ALTER TABLE "activities" ADD COLUMN "leveling_window_exceeded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "activities" ADD COLUMN "self_over_allocated" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn: the two plan opt-in flags (ADR-0041 §4/§7). DEFAULT false = the parity
-- switch (levelling off ⇒ byte-identical). Mirror use_expected_finish_dates /
-- make_open_ends_critical.
ALTER TABLE "plans" ADD COLUMN "level_resources" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plans" ADD COLUMN "level_within_float_only" BOOLEAN NOT NULL DEFAULT false;

-- Down (forward-only in prod, ADR-0018; documented for completeness). Reversible —
-- drop the plan flags, the activity overlay + priority, then the resource CHECK + column:
--   ALTER TABLE "plans" DROP COLUMN "level_within_float_only";
--   ALTER TABLE "plans" DROP COLUMN "level_resources";
--   ALTER TABLE "activities" DROP COLUMN "self_over_allocated";
--   ALTER TABLE "activities" DROP COLUMN "leveling_window_exceeded";
--   ALTER TABLE "activities" DROP COLUMN "leveling_delay_minutes";
--   ALTER TABLE "activities" DROP COLUMN "leveled_finish";
--   ALTER TABLE "activities" DROP COLUMN "leveled_start";
--   ALTER TABLE "activities" DROP COLUMN "leveling_priority";
--   ALTER TABLE "resources" DROP CONSTRAINT "ck_resources_max_units_per_hour_nonneg";
--   ALTER TABLE "resources" DROP COLUMN "max_units_per_hour";
