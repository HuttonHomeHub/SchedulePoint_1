-- Operational telemetry: canvas performance probe results (staff-performance-probe M4;
-- `docs/TECH_DEBT.md` #75). See `docs/DATABASE.md` "PerfProbeResult" and
-- `docs/specs/staff-performance-probe/m4-schema-record.md`.
--
-- A staff member presses "Run measurement" on /staff; their OWN browser runs the scenario and POSTs
-- the numbers. One row per LIMB of one run — ADR-0026 §9 gates two scales, so one press produces two
-- or more judged limbs — grouped by `run_id`.
--
-- THIS IS NOT THE AUDIT SHAPE, AND THAT IS THE POINT OF THIS COMMENT. The reflex in this repository
-- after ADR-0072 is to model a new "things that happened" table on `audit_events`
-- (`docs/DATABASE.md:1406-1414`), and here that would be a defect rather than a style choice:
--
--   * `audit_events` refuses UPDATE and DELETE in the database itself — BEFORE UPDATE OR DELETE and
--     BEFORE TRUNCATE triggers, declared ENABLE ALWAYS so the application role cannot bypass them.
--   * This row names a PERSON'S MACHINE. `gpu_renderer` + `user_agent` + `hardware_concurrency` +
--     `device_memory_gb` is a hardware fingerprint, and `recorded_by_label` is a staff member's
--     address. The GPU string is a decided input (product owner, 2026-09-07), not an oversight.
--   * So the audit shape here would write a named person's machine fingerprint into a permanently
--     unerasable table — precisely the collision ADR-0085 D3 spent an entire decision avoiding for
--     ONE column.
--
-- `perf_probe_results` is therefore an ORDINARY table: updatable, deletable, expirable. All three
-- are requirements. Updatable, so ADR-0085 D1's tombstone can scrub `recorded_by_label` (and
-- `gpu_renderer`) in place. Deletable and expirable, so retention can take whole rows.
-- DO NOT ADD A TRIGGER TO THIS TABLE.
--
-- NO CUSTOMER DATA, BY CONSTRUCTION. No organization_id, no plan, activity, client or project
-- column, and nothing that could hold one — so there is nothing to scope and no IDOR surface exists
-- (ADR-0086 D7). The CPM engine never reads it, and this is one additive table create touching no
-- existing table, column or index, so the ADR-0034 recalculation parity gate is structurally
-- unaffected.
--
-- NO VERDICT COLUMN. The verdict is derived on read from `samples` + `thresholds` by the same pure
-- judge the panel used, so a stored verdict can never disagree with the numbers beside it.
--
-- RETENTION IS 365 DAYS AND IS ENFORCED (ADR-0087) — unlike `mail_events` on the day it landed. This
-- migration ships alongside a fourth RETENTION_POLICIES entry, RETENTION_PERF_PROBE_DAYS, a new
-- `RetentionSweepRunner.deleteBatch` arm, a THIRD branch in `StaffHealthService.retention()` (that
-- method dispatches with a binary ternary today, so a third policy would silently report
-- `mail_events`' oldest row as this table's age — on the panel whose whole design principle is that
-- the answer is derived from the data), and a deliberate edit to
-- `retention-boundary.structural.spec.ts`, whose two-table set equality exists precisely so a third
-- forces this decision to be made rather than absorbed.

CREATE TABLE "perf_probe_results" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" TEXT NOT NULL,
    "recorded_by_label" TEXT,

    "scenario_id" TEXT NOT NULL,
    "scenario_version" INTEGER NOT NULL,
    "limb_id" TEXT NOT NULL,
    "limb_kind" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "px_per_day" DOUBLE PRECISION NOT NULL,
    "activity_count" INTEGER NOT NULL,
    "edge_count" INTEGER NOT NULL,
    "scene_summary" TEXT NOT NULL,

    "samples" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,

    "viewport_width" INTEGER NOT NULL,
    "viewport_height" INTEGER NOT NULL,
    "device_pixel_ratio" DOUBLE PRECISION NOT NULL,
    "idle_interval_ms" DOUBLE PRECISION NOT NULL,
    "hardware_concurrency" INTEGER,
    "device_memory_gb" DOUBLE PRECISION,
    "gpu_renderer" TEXT,
    "user_agent" TEXT NOT NULL,
    "reduced_motion" BOOLEAN NOT NULL,
    "lost_focus_during_run" BOOLEAN NOT NULL,
    "machine_label" TEXT,

    "app_version" TEXT NOT NULL,
    "api_version" TEXT NOT NULL,

    CONSTRAINT "perf_probe_results_pkey" PRIMARY KEY ("id")
);

-- NO foreign key on `recorded_by_user_id`, and no ON DELETE action would be right — the
-- `audit_events.actor_user_id` precedent, for its stated reason ("the event must survive its
-- subject's deletion"). Better Auth HARD-deletes users and `users` carries no `deleted_at` at all,
-- so: RESTRICT would make a library's own delete-user path fail against a table it knows nothing
-- about; CASCADE would destroy the installation's performance history because an account left, which
-- is the opposite of what a measurement about a MACHINE is for; SET NULL would force the column
-- nullable to buy nothing `recorded_by_label` does not already give. A deleted recorder therefore
-- leaves an id pointing at nothing and a LABEL that still reads — which is the record you need after
-- an erasure. Under ADR-0085 D1 the id survives intact and the label is scrubbed to NULL.
--
-- NO foreign key on `run_id` either, and no parent table. It is a plain correlation UUID (the
-- ADR-0073 C3.3 shape, and the `baseline_activities.source_activity_id` non-FK precedent). A
-- `perf_probe_runs` parent was considered and rejected: it would give the ADR-0087 sweep a two-table
-- ORDERED delete, which is the class `docs/TECH_DEBT.md` #253 records thirteen hand-maintained
-- copies of, and the ADR-0126 M4 finding where a fourth child table broke 557 API e2e tests at once
-- on a RESTRICT foreign key. The cost — the machine and provenance columns repeat across a run's two
-- to four limbs — is nothing on a table minted by a person pressing a button.

-- `limb_kind` IS THE ONE VALUE LIST ON THIS TABLE, and the discriminator that earns it is written
-- down so the next column does not copy it by analogy:
--
--   A STRUCTURE DISCRIMINATOR the reader dispatches on gets a value list; a LABEL does not.
--
-- `limb_kind` decides how `samples` is interpreted, so a value the reader does not know is
-- unreadable whatever the database permits, and the DTO must refuse it first regardless — the CHECK
-- adds no failure mode the API does not already have. The `mail_events.outcome` precedent. Adding a
-- third kind costs one migration, knowingly.
ALTER TABLE "perf_probe_results" ADD CONSTRAINT "ck_perf_probe_results_limb_kind" CHECK (
  "limb_kind" IN ('difference', 'absolute')
);

-- `scenario_id`, `limb_id` and `preset` get a SHAPE check and DELIBERATELY NO VALUE LIST — the
-- `ck_audit_events_action_format` position, not the `csp_reports.effective_directive` mistake, and
-- the two are distinguished rather than assumed:
--
--   * On `csp_reports` a refusal is a SILENT DELETE — the endpoint answers 204 whatever happens and
--     the service swallows its own write failures — so even a shape check was wrong there and both
--     reachable constraints were dropped (20260809170000_csp_reports_refusable_constraints).
--   * Here the write is an authenticated POST returning 201 with the stored row. A refusal is a 422
--     an operator is looking at. That makes a backstop safe.
--
-- But a VALUE list would still be wrong, for a reason peculiar to this deployment: `apps/web` and
-- `apps/api` release as separate images with separate versions (ADR-0027) and are pulled
-- independently (ADR-0047). A value list makes the database the authority on a vocabulary authored
-- in the web bundle, so a new scenario shipping in web-vN before api-vM would 422 for the whole skew
-- window — losing a measurement on the one machine that can produce one. Closed-ness is bought in
-- `@repo/types` for the READER instead, exactly as `audit_events.action` does it; an unrecognised
-- scenario id degrades to a row whose title the panel cannot name, and it prints the raw id, because
-- the row carries its own `thresholds` and is therefore judgeable without the registry.
--
-- The DTO must not enum-validate `scenario_id` either, or the skew failure simply moves up a layer.
-- Reaching either of these constraints is a bug in our own producer.
ALTER TABLE "perf_probe_results" ADD CONSTRAINT "ck_perf_probe_results_scenario_shape" CHECK (
  "scenario_id" ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$' AND length("scenario_id") <= 64
  AND "limb_id"  ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$' AND length("limb_id")  <= 64
  AND "preset"   ~ '^[a-z][a-z0-9-]*$'                     AND length("preset")   <= 32
);

-- The JSONB backstops, `ck_audit_events_changes_object` / `_changes_size` verbatim: a type assertion
-- and a size cap, both FACTS ABOUT THE COLUMN rather than about the producer. The array must be
-- non-empty because "zero pairs" is the exact input ADR-0097 Landing C produced a PROCEED from —
-- `undefined >= 120` is `false` — and the client judge already throws on it; this is the second
-- wall, not the first.
--
-- 8192 matches `audit_events`, and the headroom is MEASURED rather than assumed — which mattered,
-- because the figure written here before it was measured was wrong by a factor of four. Inserted on
-- this database and read with `pg_column_size`, at the shipped three-repeat run size:
--
--     limb_kind    samples   counts   thresholds   whole row
--     difference     842 B    132 B         61 B      1537 B
--     absolute       362 B     65 B         41 B       706 B
--
-- So a difference limb sits at 9.7x headroom rather than the "order of magnitude" the unmeasured
-- draft claimed, and the cap first bites at roughly 28 pairs — far past any run size a person waits
-- for. WHAT IT IS DELIBERATELY REFUSING is unchanged: raw per-frame intervals (~2,400 per pair at
-- 60 fps for 40 s, ~20 kB), which are a different decision and belong in a profiler this feature
-- explicitly is not.
ALTER TABLE "perf_probe_results" ADD CONSTRAINT "ck_perf_probe_results_samples_shape" CHECK (
  jsonb_typeof("samples") = 'array' AND jsonb_array_length("samples") >= 1
  AND pg_column_size("samples") <= 8192
);

ALTER TABLE "perf_probe_results" ADD CONSTRAINT "ck_perf_probe_results_counts_shape" CHECK (
  jsonb_typeof("counts") = 'object' AND pg_column_size("counts") <= 4096
);

ALTER TABLE "perf_probe_results" ADD CONSTRAINT "ck_perf_probe_results_thresholds_shape" CHECK (
  jsonb_typeof("thresholds") = 'object' AND pg_column_size("thresholds") <= 4096
);

-- Sign and sanity bounds only. Note what is NOT here: the client's plausible-display-clock window
-- (a few ms to a few tens of ms) is deliberately not restated as a CHECK. Encoding a guard in the
-- schema means the day the product widens it, the database silently refuses rows the product decided
-- to accept — and a migration becomes the cost of changing a guard. `idle_interval_ms > 0` is a fact
-- about a duration; "between 4 and 40" is a policy.
ALTER TABLE "perf_probe_results" ADD CONSTRAINT "ck_perf_probe_results_measurement_bounds" CHECK (
  "scenario_version" >= 1
  AND "px_per_day" > 0
  AND "activity_count" >= 0
  AND "edge_count" >= 0
  AND "viewport_width" > 0
  AND "viewport_height" > 0
  AND "device_pixel_ratio" > 0
  AND "idle_interval_ms" > 0
  AND ("hardware_concurrency" IS NULL OR "hardware_concurrency" > 0)
  AND ("device_memory_gb" IS NULL OR "device_memory_gb" > 0)
);

-- Length backstops on the free-text columns, the `ck_mail_events_recipient_length` position: LENGTH
-- checks, never FORMAT ones. `recorded_by_label` is 320 = RFC 5321's 64-octet local part + '@' +
-- 255-octet domain, and it is a length rather than an address format for the `mail_events` reason —
-- the value of the column is that it says who, even when the value is odd. `user_agent` and
-- `gpu_renderer` are bounded because they are the two longest strings a browser hands us and neither
-- has a natural ceiling.
ALTER TABLE "perf_probe_results" ADD CONSTRAINT "ck_perf_probe_results_text_lengths" CHECK (
  ("recorded_by_label" IS NULL OR length("recorded_by_label") <= 320)
  AND ("machine_label"  IS NULL OR length("machine_label")  <= 200)
  AND ("gpu_renderer"   IS NULL OR length("gpu_renderer")   <= 256)
  AND length("user_agent")     <= 512
  AND length("scene_summary")  <= 200
  AND length("app_version")    <= 64
  AND length("api_version")    <= 64
  AND length("recorded_by_user_id") BETWEEN 1 AND 128
);

-- CreateIndex: the panel's newest-first read and the ADR-0087 sweep's ranged DELETE, on this one
-- index — the second on its leftmost prefix. FULL, not partial, and therefore declared in
-- schema.prisma rather than written here as raw SQL: every row is in the read set (no soft delete,
-- no org scope, no nullable leading column), so none of the `audit_events` partial-index reasoning
-- applies.
--
-- ASC, read backwards, though the read is newest-first. Both keys descend together, so
-- `ORDER BY recorded_at DESC, id DESC` is a plain backward scan of this index — the same argument
-- the `mail_events` and activities/notes composites make. `audit_events` spells DESC only because
-- its indexes are raw SQL anyway, being partial, where the direction is free.
--
-- NO SECOND INDEX, and the reasoning is a bound rather than a measurement, which is said as such.
-- This table has no automated producer: a row exists only because a staff member pressed a button
-- and the run was not refused. Ten runs a day at four limbs each, under a 365-day sweep, is ~14,600
-- narrow rows — three orders of magnitude below the 1M at which ADR-0073 C1 measured a zero-match
-- filter at 681-954 ms. `run_id`, `scenario_id` and `limb_id` are therefore unindexed. WHAT WOULD
-- CHANGE THE ANSWER: a per-limb history longer than one page, or any producer that is not a person.
-- Add one then, with EXPLAIN (ANALYZE, BUFFERS) numbers in that migration.
CREATE INDEX "perf_probe_results_recorded_at_id_idx" ON "perf_probe_results"("recorded_at", "id");
