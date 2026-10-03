-- PER-ACTIVITY CHANGE HISTORY — activity-change-history M1-T1 (ADR-0174).
--
-- Spec: docs/specs/activity-change-history/feature-spec.md; data model:
-- docs/specs/activity-change-history/data-model.md (designed by the database-architect agent,
-- CLAUDE.md §19.3, including the M1-T0 extension O1–O7). Approved by the product owner 2026-10-03.
--
-- One row = one person's continuous work on one activity in one write scope. An ORDINARY mutable
-- table — a merge UPDATEs a row, a net-zero edit DELETEs it, the hierarchy expiry DELETEs it — and
-- deliberately NOT the audit_events shape: no append-only trigger, because merging is the design.
--
-- EXPAND-ONLY. Two CREATE TYPEs, one CREATE TABLE, two FKs, two indexes and six CHECKs, all on a
-- new, empty table. No ALTER on a populated table, no backfill, so it behaves identically on a
-- pristine database and on a populated one (ADR-0107: nothing here reads existing rows). The FKs
-- take SHARE ROW EXCLUSIVE on `activities` and `organizations` for the instant it takes to validate
-- against an empty child.
--
-- ENUMS CARRY EVERY LABEL THE EPIC NEEDS. Postgres cannot use an enum label in the transaction
-- that added it, so a later label costs two migrations. The scope enum ships all five; the origin
-- enum ships the three M2's knock-on paths need. A resource-library origin was withdrawn
-- (data-model §10 O4): no library action touches an assignment today.
--
-- ON DELETE RESTRICT ON BOTH FKs, NOT CASCADE (data-model §3). The hierarchy expiry and
-- interchange's failure compensation must delete this table EXPLICITLY, before activities, so the
-- expiry can COUNT the rows and charge them to its per-run budget; the expiry's DMMF census
-- (hierarchy-expiry.structural.spec.ts) fails until it does. ROLLBACK HAZARD, stated rather than
-- hidden: a pre-feature image run after history rows exist fails expiry and import compensation
-- with 23503 on plans that have history, until the image moves forward again. Nothing is lost.
--
-- WRITE PROTOCOL THIS TABLE DEPENDS ON (data-model §4.1–4.2; enforced in the recorder, not here).
-- Every write to this table happens under a transaction-scoped advisory lock in namespace
-- `activity-history`, taken as the transaction's LAST lock, in ONE statement:
--   * single-object writes: pg_advisory_xact_lock_shared(ns, hashtext(plan_id)) per distinct plan,
--     ascending; then pg_advisory_xact_lock(ns, hashtext(activity_id)) per recorded activity,
--     ascending;
--   * batch and knock-on writes: pg_advisory_xact_lock(ns, hashtext(plan_id)) EXCLUSIVE per
--     distinct plan, ascending.
-- One recorder call per transaction. Without that lock two link writes on one activity both read
-- the same latest entry and the second silently overwrites the first's item (a lost update), which
-- is why the table has no `version`. first_recorded_at / last_recorded_at are clock_timestamp()
-- read under that lock, truncated to milliseconds, strictly increasing per activity — never now(),
-- which is the transaction's START and would misorder entries.

CREATE TYPE "activity_history_scope" AS ENUM ('DEFINITION', 'PROGRESS', 'PLACEMENT', 'LOGIC', 'RESOURCES');

CREATE TYPE "activity_history_origin" AS ENUM ('ACTIVITY_DELETED', 'ACTIVITY_RESTORED', 'SUMMARY_DISSOLVED');

-- No plan_id: an activity cannot move plans (UpdateActivityDto has no planId), and the read is
-- per activity. No deleted_at / delete_batch_id: a row lives exactly as long as its activity.
-- actor_user_id is an opaque Better Auth TEXT id with no FK (ADR-0085 D1, the audit_events
-- convention); erasure scrubs the users row and the entry resolves to the tombstone at read time.
CREATE TABLE "activity_history_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "scope" "activity_history_scope" NOT NULL,
    "first_recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "last_recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "edit_count" INTEGER NOT NULL DEFAULT 1,
    "batch_id" UUID,
    "batch_size" INTEGER,
    "origin" "activity_history_origin",
    "has_non_cost_change" BOOLEAN NOT NULL,
    "changes" JSONB NOT NULL,

    CONSTRAINT "activity_history_entries_pkey" PRIMARY KEY ("id")
);

-- FULL index, so it is declared in the model too (TECH_DEBT #54 concerns PARTIAL indexes). One
-- index, four jobs: the latest-entry probe (WHERE activity_id = $1 ORDER BY first_recorded_at DESC,
-- id DESC LIMIT 1), the read page's keyset (first_recorded_at, id) < ($t, $id), the activity FK's
-- RESTRICT check (which needs an all-rows index — the 3m47s activity_steps lesson, migration
-- 20260818130000), and the expiry's chunked `activity_id IN (…)` delete. first_recorded_at never
-- changes after INSERT, so a merge UPDATE touches no indexed column and stays HOT-eligible.
CREATE INDEX "idx_activity_history_activity_recorded" ON "activity_history_entries"("activity_id", "first_recorded_at" DESC, "id" DESC);

-- Backs the organization FK's RESTRICT check, like every denormalised-org sibling.
CREATE INDEX "idx_activity_history_organization_id" ON "activity_history_entries"("organization_id");

-- Not indexed, on purpose: batch_id, actor_user_id, recency (no age sweep, CQ-2). There is no read
-- that filters on them.

ALTER TABLE "activity_history_entries" ADD CONSTRAINT "activity_history_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_history_entries" ADD CONSTRAINT "activity_history_entries_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- CHECKs (raw SQL — Prisma cannot express them; each is named in the model's docblock).
-- ---------------------------------------------------------------------------------------------

-- An entry always records at least one item. Empty is never stored: a merge that nets to zero
-- DELETEs the row instead.
ALTER TABLE "activity_history_entries" ADD CONSTRAINT "ck_activity_history_changes_object" CHECK (
  jsonb_typeof("changes") = 'object' AND "changes" <> '{}'::jsonb
);

-- Backstop, not a budget: the recorder caps an entry at 16 keyed items and never stores a
-- description's text. Worst LEGAL entry ≈ 5 KB of field items + 16 × ~1.5 KB assignment items
-- (200-char name + 32-char code in 4-byte UTF-8, plus two states) ≈ 29 KB, so the bound is 32,768
-- rather than audit_events' 8,192 — which would refuse a legal knock-on entry on a hub milestone
-- and so fail the DELETION that caused it (data-model §2 "Bound"). Reaching it is a bug.
ALTER TABLE "activity_history_entries" ADD CONSTRAINT "ck_activity_history_changes_size" CHECK (
  pg_column_size("changes") <= 32768
);

ALTER TABLE "activity_history_entries" ADD CONSTRAINT "ck_activity_history_edit_count_positive" CHECK (
  "edit_count" >= 1
);

ALTER TABLE "activity_history_entries" ADD CONSTRAINT "ck_activity_history_recorded_order" CHECK (
  "last_recorded_at" >= "first_recorded_at"
);

-- batch_id and batch_size are set together or not at all, and a batch records at least one entry.
-- Deliberately NOT a CHECK: "a batch entry has edit_count = 1". Batches never merge, but that is a
-- server constant's policy, and the spec promises those change without a migration.
ALTER TABLE "activity_history_entries" ADD CONSTRAINT "ck_activity_history_batch_pair" CHECK (
  ("batch_id" IS NULL) = ("batch_size" IS NULL) AND ("batch_size" IS NULL OR "batch_size" >= 1)
);

-- Fail-closed (the ck_notes_exactly_one_parent precedent): an origin-tagged entry is always a batch
-- entry — so it can never be merged into — and each origin implies one scope. An origin label
-- added to the enum later without a branch here is REJECTED, not admitted, which is the point.
ALTER TABLE "activity_history_entries" ADD CONSTRAINT "ck_activity_history_origin" CHECK (
  CASE
    WHEN "origin" IS NULL THEN true
    WHEN "origin" IN ('ACTIVITY_DELETED', 'ACTIVITY_RESTORED') THEN "scope" = 'LOGIC' AND "batch_id" IS NOT NULL
    WHEN "origin" = 'SUMMARY_DISSOLVED' THEN "scope" = 'PLACEMENT' AND "batch_id" IS NOT NULL
    ELSE false
  END
);
