-- STRIP THE DRAG-CREATED CONSTRAINTS — one-planning-surface M-I-T1.
--
-- Spec: docs/specs/one-planning-surface/feature-spec.md §4.6; falsification.md FC-10 clauses A, C
-- and D; m-i/premise.md, which re-verified the premise before this file was designed.
-- Designed by the database-architect agent (CLAUDE.md §19.3), against a real PostgreSQL 16.13 with
-- all 67 prior migrations replayed; every number below is that run's, not an estimate.
--
-- WHY. Before M-F, dragging a bar on an EARLY plan wrote a binding SNET at the drop date. M-F
-- replaced that with a first-class `visual_start`, and `apps/web/src` now contains zero live 'SNET'
-- writes — established against the WRITES rather than the 42 surviving mentions, because the
-- constraint type did not go anywhere, only the gesture that wrote it behind a planner's back. The
-- estate therefore carries constraints that are really hand-placements. This converts the BINDING
-- ones once and leaves every other class alone.
--
-- THE FOUR CLASSES (staff-diagnostics.registry.ts:365-373 defines the first three arithmetically):
--   binding        early_start = constraint_date   -> CONVERTED HERE
--   inert          early_start > constraint_date   -> left; converting would place the bar EARLIER
--                                                     THAN LOGIC ALLOWS
--   unclassified   early_start IS NULL OR <        -> left; unmeasured against its constraint
--   already placed visual_start IS NOT NULL        -> left; see the exclusion below
--
-- THE `visual_start IS NULL` EXCLUSION IS ABOUT CONVERTING CORRECTLY, NOT ABOUT SAFETY.
-- `visual_start` is accepted regardless of mode (activities.service.ts:388, :526-528), so a row can
-- carry a stale placement AND a binding SNET, and the naive WHERE overwrites the placement.
-- Measured: removing this one line destroys 706 hand-placements on a 102,000-activity estate, and
-- `prior_visual_start` records all 706 — which demonstrates that column's stated diagnostic job
-- rather than asserting it. FC-10 clause B's unattended bound was WITHDRAWN because the estate is
-- disposable; this exclusion is NOT part of that withdrawal and does not depend on it.
--
-- ONE STATEMENT, AND THE SINGLE STATEMENT IS THE DESIGN. The record and the conversion are the SAME
-- SET BY CONSTRUCTION: the UPDATE targets exactly the ids the INSERT returned, so there is no
-- second WHERE clause to drift out of step (the ADR-0065 one-implementation argument, applied to a
-- migration). It also satisfies FC-10 clause D's "written BEFORE the delete, in the same
-- transaction" absolutely — it is both or neither. The plan's "batched" instruction was written for
-- an application-level runner and is withdrawn: a set-based statement has no `{ in: [...] }` list,
-- so ADR-0096's 16,384-id bind-parameter failure cannot arise here at all.
--
-- `SET visual_start = constraint_date, constraint_date = NULL` USES THE OLD VALUE. Every SET
-- expression is evaluated against the pre-update row. Verified on a real database over 2,826
-- converted rows: `visual_start IS DISTINCT FROM prior_constraint_date` returns 0. It is the kind
-- of thing a later reader "fixes", so the e2e pins it.
--
-- `version` IS BUMPED, A DELIBERATE DEPARTURE FROM EVERY SIBLING DATA MIGRATION. None of the five
-- UPDATE-writing migrations in this repository touches version/updated_at/updated_by, and
-- ADR-0022's reason for that convention is that an ENGINE write must stay invisible to optimistic
-- locking. THIS WRITES A PLANNER-OWNED INPUT AND WANTS THE OPPOSITE. `use-activities.ts:160-176`
-- sends `constraintType`/`constraintDate` on EVERY definition save, seeded from the row the dialog
-- was opened with; `:539-556` (`useBatchPlacements`) additionally sends `visualStart` on every row.
-- So a tab left open across the container recreate that pulls this release would, without the bump,
-- silently re-write the stripped SNET — producing exactly the both-at-once state the fourth class
-- exists to avoid creating — and through the batch route would also CLEAR the placement this
-- migration just wrote, undoing the strip. The bump turns both into the existing non-destructive
-- 409 (activities.service.ts:627-636). It costs nothing measurable: `version` is unindexed.
--
-- `updated_at` / `updated_by` ARE DELIBERATELY NOT TOUCHED, and the reason is semantic rather than
-- performance. Measured, it costs nothing either way (196.3 ms with, 216.9 ms without, over 2,826
-- rows — the update is non-HOT at this scale regardless). What it would cost is meaning: stamping
-- `updated_at` puts every affected plan at the top of the overview's Recently changed feed
-- (ADR-0098's GREATEST(plan, newest activity, newest dependency)), attributed to UNKNOWN because
-- `updated_by` would be null, displacing real recent human work. Left alone, `updated_by` goes on
-- naming the last human who edited the row, which is the more useful fact.
--
-- NO ENGINE-OWNED COLUMN IS WRITTEN. early_*/late_*/total_float/visual_effective_*/visual_conflict*/
-- visual_drift_days/remaining_float/leveled_* stay stale until the plan's next recalculation, and
-- the intermediate state is coherent: the bars read exactly where they read before, the drift and
-- remaining-float read-outs withhold correctly on NULL (render/a11y.ts, render/geometry.ts), and a
-- stripped activity's own float number is UNCHANGED — after recalculation its remaining float
-- equals its total float before, because (LF − E − dur) − d = LF − X − dur. THE PLANNER-FACING
-- NOTICE SAYS "will show more float once this plan is next recalculated" IN THE FUTURE TENSE FOR
-- THIS REASON; "may now show more float" was false at the moment it was read.
--
-- `plans.schedule_computed_at` IS NOT NULLED to force a recalculation, and it is the obvious idea:
-- it would blank every date in the UI, and it would VIOLATE
-- ck_plans_schedule_criticality_requires_cursor on any plan carrying a criticality cursor.
--
-- THE BARS DO NOT MOVE (FC-10 clause C), derived from the engine rather than from the spec. Let E
-- be the unconstrained network-earliest, X the constraint date, dur the duration.
--   Before: clampForwardStart (engine/constraints.ts:155-156) is max(logicEarlyStart, startAbs), so
--           Pass 1 early_start = X; Pass 2 applies the same clamp with no placement, so display = X.
--   After:  Pass 1 early_start = E; Pass 2 has placed = visual_start = X, and `placed ??
--           logicEarliest` is X. IDENTICAL.
--   Successors do not move either, because prop = max(placed, logicEarliest) = X.
--   What DOES change, deliberately, is Pass 1 downstream: a successor's early_start falls to
--   E + dur, its total_float rises, and criticality can change — the float that was never genuinely
--   constrained coming back. PREDECESSORS GAIN NOTHING (an SNET is forward-only: clampBackwardFinish
--   returns the logic value), so the e2e asserts on a SUCCESSOR and not "somewhere downstream".
--
-- A NON-WORKING CONSTRAINT DATE CANNOT REACH THIS STATEMENT, which is a free safety property:
-- `early_start = constraint_date` is itself the proof that the date survived the engine's
-- roll-forward, because a constraint dated on a non-working day rolls forward and the row then
-- reads early_start > constraint_date and classifies INERT. So the conversion can never introduce
-- a shift.
--
-- SECONDARY CONSTRAINTS ARE OUT OF SCOPE AND UNTOUCHED (the drag only ever wrote the primary, and
-- the two drive different passes). A row keeping an SNLT/FNLT secondary may, after recalculation,
-- newly carry visual_conflict_reason = 'LATER_THAN_BOUND'. The NUMBER does not change; what appears
-- is the flag saying WHICH kind of overrun it is, which is what M-D shipped that column for. New
-- signal, not a new fact.
--
-- SOFT-DELETED PLANS AND ACTIVITIES ARE EXCLUDED, matching the ADR-0140 diagnostics' predicate
-- exactly so the dock notice's count reconciles with the staff console. A plan later restored from
-- the recycle bin keeps its binding SNETs, and THAT IS NOT A RESIDUE TO SWEEP LATER: after M-F
-- nothing creates a drag SNET, provenance is unrecoverable, and such a row is indistinguishable
-- from one a planner authored deliberately — which this epic leaves alone by design.
--
-- THE ID IS A UUID v7, NOT gen_random_uuid(). placement_migrations.id has no database default
-- (Prisma's @default(uuid(7)) is application-side), and placement-migration.repository.ts:25-28
-- orders the report on `id` stating "id is UUID v7, so it is monotonic by creation and orders them
-- exactly"; the schema makes the same claim for the (plan_id, id) index. A v4 id would make the
-- shipped DTO's "Oldest first" a false statement about arbitrary order. The expression below was
-- verified over 2,826 real rows: all version-7, all valid-variant, all distinct. Its failure mode
-- is NOT ADR-0107's pristine-database hazard — a malformed cast fails identically on one row and on
-- a million, so CI sees it.
--   THE TWO CLOCKS DIFFER ON PURPOSE AND MUST NOT BE UNIFIED: `migrated_at` takes now() via its
--   column DEFAULT (transaction START — one instant for the whole batch, which is how a batch is
--   identified), while the id takes clock_timestamp() (per row, which is what orders rows within
--   the batch).
--
-- `organization_id` IS COPIED FROM THE PLAN, not from the activity. Same value under the service
-- invariant, but the column's docblock names the plan as its source and the CASCADE hangs off it.
--
-- IDEMPOTENT. A re-run converts nothing, because the predicate no longer matches. `migrate deploy`
-- will not re-run it; a replay from backup or a manual run is harmless.
--
-- COST, MEASURED — AND THE PLAN IS A SEQUENTIAL SCAN, WHICH IS CORRECT.
--   102,000 activities / 2,826 converted: 116-143 ms across four runs, with
--   `Seq Scan on activities` feeding a nested loop from a `Seq Scan on plans` (40 rows), then an
--   `Index Scan using activities_pkey` for the update side. That is the right shape: the predicate
--   (`constraint_type = 'SNET' AND early_start = constraint_date AND visual_start IS NULL`) is a
--   whole-table question with no selectivity any index can offer, and reading 102,000 rows once to
--   answer it is cheaper than driving 40 index lookups. Measured both ways: forcing the index path
--   with `enable_seqscan = off` produces exactly the plan-driven shape (`Index Scan using
--   plans_pkey` -> `Bitmap Index Scan on idx_activities_plan_updated_at`) and costs **211 ms** —
--   1.5-1.8x SLOWER.
--
--   **THIS PARAGRAPH SAID THE OPPOSITE UNTIL THE M-J GATE PASS, AND IT WAS WRONG IN BOTH
--   DIRECTIONS.** It claimed "it does NOT sequentially scan: the planner drives from `plans` and
--   uses idx_activities_plan_updated_at... forcing a sequential scan costs 781-798 ms, so the index
--   path is real and not a coincidence." Measured independently by the backend-performance review
--   and then re-derived here against a fresh database with all 67 prior migrations replayed and the
--   corrected `m0/dilute.sql` fixture (population confirmed identical: 2,826 convertible, 706
--   already-placed, 14,571 SNETs): the natural plan IS the sequential scan, the index-driven plan
--   is the slower one, and the 781-798 ms figure does not reproduce under any planner setting
--   tried. It was inherited from the design review and not re-derived before being written into a
--   FORWARD-ONLY file — which is precisely the ADR-0076 Class 2 failure, committed in the one kind
--   of artefact that cannot be quietly edited afterwards. Corrected while the epic was still on a
--   branch.
--
--   164 activities (ADR-0140's first press on the deployed host) — 5.4 ms.
--   NO NEW INDEX, and the corrected measurement STRENGTHENS that rather than weakening it: an index
--   for a once-ever statement would cost every activity write forever, and the forced index plan is
--   measurably slower here anyway.
--   Under ADR-0018 this runs before the API serves, and WATCHTOWER_ROLLING_RESTART recreates one
--   container at a time, so there is no concurrent writer for the lock to block.
--
-- NOT COVERED BY THE CI SCHEMA-DRIFT CHECK, stated so nobody assumes otherwise: this file is pure
-- DML, so `prisma migrate diff --exit-code` reports "No difference detected" (verified). What
-- covers it is apps/api/test/strip-drag-constraints-migration.e2e-spec.ts, which READS THIS FILE
-- rather than restating it — because a copy passes while the file it claims to test drifts, and
-- because an empty database (which CI provisions) is the one shape on which this migration is a
-- silent no-op (ADR-0107).
--
-- AFTERWARDS, `snet-binding` WILL REPORT A PERMANENT NON-ZERO COUNT — the already-placed
-- exclusions. That is the exclusion working, not a failed strip.
--
-- FORWARD-ONLY. A rollback is a COMPENSATING migration, and this table is what makes one possible,
-- which is the clearest statement of why it exists.
--
-- **THE RECIPE BELOW HAS BEEN RUN ONCE, against the M-I schema, 2026-09-21** — and that sentence
-- is narrower than it looks, which is why it replaces the one it replaces rather than deleting it.
-- The security review of M-J-T1 wrote "it has never been run", correctly at the time; the database
-- review then ran it against a populated post-strip database (102,000 activities, 2,826 converted)
-- and it restored all 2,826 rows exactly — `constraint_type`, `constraint_date` and `visual_start`
-- back to their prior values, 0 left stripped, both guard predicates behaving as documented.
--
-- What that does NOT establish is the half the original note was really about: **nothing in the
-- test suite drives it**, so it will not fail loudly if `activities`' column set changes underneath
-- it. One green run against today's schema is evidence it is correct today, not a gate keeping it
-- correct. Read it as a starting point that must be re-checked against the schema of the day.
--   UPDATE "activities" a
--      SET "constraint_type" = m."prior_constraint_type",
--          "constraint_date" = m."prior_constraint_date",
--          "visual_start"    = m."prior_visual_start",
--          "version"         = a."version" + 1
--     FROM "placement_migrations" m
--    WHERE m."activity_id" = a."id"
--      AND a."constraint_type" IS NULL
--      AND a."visual_start" = m."prior_constraint_date";
-- The last two predicates restore ONLY rows nobody has touched since; a row a planner has edited is
-- left alone rather than silently reverted, and the plan needs a recalculation afterwards either
-- way.

WITH recorded AS (
  INSERT INTO "placement_migrations" (
    "id", "organization_id", "plan_id", "activity_id",
    "activity_code", "activity_name",
    "prior_constraint_type", "prior_constraint_date", "prior_visual_start"
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
    a."constraint_type",
    a."constraint_date",
    a."visual_start"
  FROM "activities" a
  JOIN "plans" p ON p."id" = a."plan_id" AND p."deleted_at" IS NULL
  WHERE a."deleted_at" IS NULL
    AND a."constraint_type" = 'SNET'
    AND a."constraint_date" IS NOT NULL
    AND a."early_start" = a."constraint_date"
    AND a."visual_start" IS NULL
  RETURNING "activity_id"
)
UPDATE "activities" a
   SET "visual_start"    = a."constraint_date",
       "constraint_type" = NULL,
       "constraint_date" = NULL,
       "version"         = a."version" + 1
 WHERE a."id" IN (SELECT "activity_id" FROM recorded);
