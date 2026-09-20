-- PLACEMENT MIGRATIONS — the durable record of a drag-created constraint being converted into a
-- hand-placement. Spec: docs/specs/one-planning-surface/feature-spec.md §4.6 / US-2 / US-9 (CQ-7
-- "strip, on a four-class test"; CQ-8 "no retention window", both answered by the product owner
-- 2026-09-20); falsification.md FC-10 clauses B and D. Milestone M-A-T4.
--
-- WHY. Before this epic a drag in Early mode wrote a binding SNET. The collapse
-- strips those once, on a four-class test: where the constraint was BINDING
-- (`early_start = constraint_date`) the activity's `visual_start` becomes the constraint's date and
-- the constraint is cleared, so THE BAR DOES NOT MOVE and the downstream float it was never
-- genuinely owed comes back. That is an irreversible edit to customer data.
--
-- AND IT IS UNAUDITABLE BY CONSTRUCTION, WHICH IS WHY THIS TABLE EXISTS RATHER THAN A LOG LINE.
-- `PATCH …/activities/:activityId` is classified `REASONS.PLAN_CONTENT`
-- (`audit-coverage.structural.spec.ts:264`), permanently excluded from `audit_events` under
-- ADR-0073's content-edit rule. Nothing in the audit log will ever record a stripped constraint.
-- This table is the only record there will be.
--
-- ITS SECOND JOB IS DIAGNOSTIC, AND ON A DISPOSABLE ESTATE THAT JOB IS WORTH MORE, NOT LESS.
-- FC-10 clause B's unattended bound was WITHDRAWN (product owner, 2026-09-20: every plan on the
-- deployed installation is a test plan they do not mind losing). What survives that withdrawal is
-- this table, and the reason is stated so it is not mistaken for safety work whose premise lapsed:
-- it is how anybody finds out the strip did something nobody predicted. A migration with no record
-- turns a surprising result into a MYSTERY INSTEAD OF A DIFF.
--
-- WRITE-ONCE: NO `version`, NO `created_at`/`updated_at`, NO `deleted_at`/`delete_batch_id`. Soft
-- delete is this schema's default for customer data (docs/DATABASE.md "Soft deletes"), so the
-- omission is SAID rather than left to read as an oversight. The `perf_probe_results` /
-- `mail_events` reasoning applies verbatim: the producer writes each row exactly once inside the
-- migration transaction and nothing ever edits one, so `created_at` would equal `migrated_at` on
-- every row and `version` would guard a concurrent edit that cannot happen. Soft delete is worse
-- than absent here — a record of an irreversible act that the product can make disappear is not a
-- record. Rows die exactly once, with their plan, by the CASCADE below.
--
-- THE FOREIGN KEYS ARE THE DESIGN, AND EACH SHAPE IS DERIVED RATHER THAN PREFERRED.
--
--   * `plan_id` → plans, **ON DELETE CASCADE**. `hierarchy-expiry.structural.spec.ts` derives its
--     completeness census FROM THE PRISMA DMMF and only considers to-one relations whose
--     `relationOnDelete` is `Restrict`. The three candidate shapes therefore behave differently in
--     a way that is not obvious from reading any one of them:
--       - RESTRICT would REQUIRE `hierarchy-expiry.runner.ts` to delete this table before `plans`,
--         and the census would fail until it did (that is the census working, and it is what caught
--         `baseline_dependencies` by hand);
--       - NO FK AT ALL is STRUCTURALLY INVISIBLE to that census, while ADR-0096's expiry
--         hard-deletes the plan out from under these rows — org-scoped customer content orphaned
--         forever, with nothing failing anywhere;
--       - CASCADE is the shape the census EXPLICITLY EXCLUDES because the database already handles
--         it. The row dies with its plan and no hand-maintained list grows. `plan_locks` is the
--         shipped precedent (`hierarchy-expiry.runner.ts:170-171` names it as going by cascade).
--     It is a deliberate DEPARTURE from `plan_shares`, whose docblock explains why its plan FK is
--     RESTRICT where `plan_locks`' is CASCADE ("a link is a preserved domain record, a lock is
--     not"). The discriminator there is SOFT-DELETE PARTICIPATION: a share must survive a plan's
--     soft delete and come back with it, so a database cascade would destroy what the restore
--     needs. THIS ROW HAS NO SOFT DELETE TO PARTICIPATE IN — it is write-once, never restored, and
--     describes a one-time act on a plan. When the plan is permanently gone there is nothing left
--     for the record to be about.
--   * `organization_id` → organizations, **RESTRICT**, matching every sibling. Inert in practice
--     because plan → org RESTRICT fires first. Denormalised from the plan by the migration inside
--     its own transaction, NEVER client input (the PlanLock/PlanShare/Note pattern), purely as the
--     tenant scope tag for the plan-scoped report read.
--   * `activity_id` — a PLAIN CORRELATION UUID with **NO FOREIGN KEY**, on ADR-0025's
--     `source_activity_id` leg: a record that referenced a live row would either block that row's
--     deletion or rot with it, and THE MOMENT THIS RECORD IS MOST WANTED IS AFTER THE ACTIVITY IS
--     GONE — "what happened to the bar that used to be here?" is precisely the question a deleted
--     activity raises. It stands on that leg ALONE. The RESTRICT-trap justification that used to
--     accompany it is WITHDRAWN: `docs/TECH_DEBT.md` #253 records the ADR-0126 breakage it came
--     from as TEST TEARDOWN, since fixed by `clearBaselineTree` — never a production hazard, and
--     gone. Carrying the stale reason is exactly what would lead a reader to extend non-FK to
--     `plan_id`, which is the defect the first bullet exists to prevent.
--
-- IT IS DELIBERATELY OUTSIDE `RETENTION_TABLES` AND TAKES NO WINDOW (CQ-8). That set has never
-- contained organisation-scoped customer content (docs/DATABASE.md "Operational telemetry"), and
-- `retention-boundary.structural.spec.ts:53-58` asserts it BY EQUALITY — so a fourth member is a
-- decision somebody has to make deliberately, and this is that decision written down rather than an
-- omission. The Cascade FK already gives the row the only lifecycle it should have: it lives
-- exactly as long as the plan whose history it describes, and the ADR-0096 expiry that hard-deletes
-- that plan takes it too.
--
-- THE DENORMALISED CODE AND NAME are the `audit_events.subject_label` rule: after a hard delete an
-- id names nothing and the report could otherwise only say "N activities". Shapes copied exactly
-- from the live columns (`activity_code` nullable, `activity_name` NOT NULL), like
-- `baseline_activities.code`/`.name` — a record of a value must be able to hold every value its
-- source could. They are a FROZEN COPY, never refreshed: a rename after the migration does not
-- reach back, exactly as ADR-0025 intends.
--
-- `prior_visual_start` IS EXPECTED TO BE NULL ON EVERY ROW, AND A NON-NULL VALUE IS A FINDING. The
-- four-class test EXCLUDES any activity already carrying a `visual_start` (§4.6 "Already placed" →
-- leave, count, report), precisely because `visual_start` is accepted regardless of mode
-- (`activities.service.ts:388`, `:526-528`) so a row can carry a stale placement AND a binding
-- SNET, and the naive `WHERE` would overwrite the placement. This column records the value the
-- write was about to replace WHATEVER IT WAS — so if that exclusion ever fails, the destroyed
-- placement is in a row rather than gone. A reader who finds the column always NULL and deletes it
-- as dead weight has removed the evidence for the one failure mode nobody could otherwise
-- reconstruct.
--
-- NO UNIQUE CONSTRAINT ANYWHERE, AND THE REFUSAL IS THE POINT. `(plan_id, activity_id)` would be
-- true today — a one-time migration strips an activity at most once — and a unique index does not
-- assert a fact, it REFUSES A ROW. On a table whose second job is telling us the strip did
-- something nobody predicted, refusing the second row turns the surprise this table exists to
-- capture into a failed migration with no record of why. That is `csp_reports`' shape-CHECK lesson
-- verbatim: a refusal on that table was "a silent delete … on the one table whose purpose is to
-- tell us about things we did not anticipate" (20260809170000_csp_reports_refusable_constraints).
-- The only constraints here are the primary key and the two foreign keys.
--
-- BOOT SAFETY (ADR-0018 — the API self-migrates on start, and the host pulls and recreates the
-- image unattended under ADR-0047, so a migration that CAN fail is the API failing to BOOT).
-- CREATE TABLE / CREATE INDEX on a brand-new table are catalogue-only; the table is empty at
-- creation, so there is no NOT VALID/VALIDATE two-step because there is no existing data to
-- protect. Its two FKs take a brief SHARE ROW EXCLUSIVE on `plans` / `organizations` — a lock, not
-- a scan. Verified by applying this file to a POPULATED PostgreSQL 16.13 database (ADR-0107's rule)
-- with the row counts of `plans`, `activities` and `organizations` unchanged across the apply.
--
-- NON-SCHEDULING. The CPM engine never reads this table, so this is a single additive table create
-- and the ADR-0034 recalculation parity gate is untouched BY CONSTRUCTION.
--
-- DARK. M-I writes these rows and M-I-T2 reads them (`GET …/plans/:planId/placement-migration`,
-- the dock notice's source, and the reason this is not a write-only table). At M-A the table exists
-- and is described, and nothing touches it.

-- CreateTable: ONE drag-created constraint's conversion into a placement. See the header for every
-- column's shape; the three `prior_*` columns are the whole point of the row and the thing nothing
-- else in the product will remember. `prior_constraint_type`/`prior_constraint_date` are NOT NULL
-- structurally rather than optimistically — A ROW EXISTS ONLY BECAUSE A CONSTRAINT WAS REMOVED, so
-- both are known at write time, which is also what makes the pair CHECK its nullable siblings need
-- (`ck_baseline_activities_constraint_pair`) unnecessary here: the pair cannot be half-set. The
-- enum rather than TEXT so the database refuses a value the live column could not have held; the
-- strip's WHERE names SNET (the enum's actual label — `start no earlier than` is
-- its comment, not its value) and only that (non-SNET constraints are never touched,
-- §4.6), but recording the TYPE means a future widening says which kind it took.
--
-- `migrated_at` takes `DEFAULT CURRENT_TIMESTAMP` deliberately, NOT a service clock: inside a
-- transaction that is the TRANSACTION START time, so every row written by one batch shares one
-- instant and the batch is identifiable without a correlation column. (The `csp_reports` docblock
-- records the opposite case — two clocks a millisecond apart across two branches of one upsert —
-- which is what makes stamping this from a single database clock worth stating.) It is also why the
-- index below carries `id`: `migrated_at` cannot order rows WITHIN a batch, and `id` is UUID v7.
CREATE TABLE "placement_migrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "activity_code" TEXT,
    "activity_name" TEXT NOT NULL,
    "prior_constraint_type" "ConstraintType" NOT NULL,
    "prior_constraint_date" DATE NOT NULL,
    "prior_visual_start" DATE,
    "migrated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: (plan_id, id) — the report's read (every row for one plan, deterministically ordered
-- because `id` is UUID v7 and `migrated_at` is one instant per batch) AND the plan FK on its
-- leftmost prefix.
--
-- THE FK HALF IS NOT DISCRETIONARY, and this is the one index decision here that is not about a
-- read. ON DELETE CASCADE has to FIND the children, so without this index every plan hard-delete
-- sequentially scans this table — the `idx_activities_parent_id_fk` shape, which docs/DATABASE.md
-- records costing 3m47s for a single 2,000-activity plan. That scan would land inside the ADR-0096
-- retention expiry, which catches its failures, logs `hierarchy_expiry.permanent_failure` and
-- retries hourly forever with nothing user-facing saying so.
CREATE INDEX "placement_migrations_plan_id_id_idx" ON "placement_migrations"("plan_id", "id");

-- CreateIndex: full org index backing the FK (RESTRICT) + org-scoped IDOR loads, like every
-- sibling. Full rather than partial: there is no soft delete, no nullable leading column and no
-- `delete_batch_id`, so every row is in the read set and none of the audit_events partial-index
-- reasoning applies.
CREATE INDEX "placement_migrations_organization_id_idx" ON "placement_migrations"("organization_id");

-- AddForeignKey: organization_id → organizations (RESTRICT — never hard-deleted; guards against
-- orphaning). ON UPDATE CASCADE is Prisma's default.
ALTER TABLE "placement_migrations" ADD CONSTRAINT "placement_migrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: plan_id → plans (CASCADE — see the header; the one shape that keeps this table out
-- of a hand-maintained delete-order list while still dying with its plan).
ALTER TABLE "placement_migrations" ADD CONSTRAINT "placement_migrations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Down (forward-only in production, ADR-0018; documented for completeness). Everything below was
-- created by this migration. It is IRREVERSIBLE in the way that matters: these rows are the ONLY
-- record of an irreversible edit to customer data — nothing in `audit_events` duplicates them, by
-- construction — so dropping the table destroys the record and leaves the edit.
--   DROP TABLE "placement_migrations";
