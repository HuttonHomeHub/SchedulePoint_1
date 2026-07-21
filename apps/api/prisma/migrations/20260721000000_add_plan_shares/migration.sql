-- Stage F — PlanShare (ADR-0051): External-Guest per-plan share links. A revocable,
-- optionally-expiring, READ-ONLY link that grants someone OUTSIDE the organisation
-- (a client rep, a subcontractor) view access to EXACTLY ONE plan, with no Better
-- Auth account and no org membership. See docs/DATABASE.md "PlanShare" and
-- docs/adr/0051-external-guest-share-links.md §1.
--
-- NON-SCHEDULING. A share link is NOT a CPM input: the engine (`compute.ts`) never
-- reads it and the recalc write path is untouched. So this migration is fully additive
-- and byte-parity — a single table create, no rewrite of any existing table, every
-- prior golden/scenario recalculates identically.
--
-- A FULL house-standard org-scoped record, modelled like invitations / notes: UUID v7
-- PK, snake_case columns, timestamptz UTC, soft delete + delete_batch_id, TEXT audit
-- ids (Better Auth ids are opaque TEXT — `created_by` IS who minted the link),
-- optimistic-locking `version`, scoped indexes. It carries a DENORMALISED
-- organization_id (service-copied from the plan inside the create transaction, NEVER
-- client input — the PlanLock/Note pattern) as the tenant scope tag.
--
-- token_hash stores the SHA-256 HEX of the raw bearer token — the raw value is returned
-- ONCE on create and NEVER stored (the invitations.token_hash precedent), so a database
-- leak never yields a usable link. UNIQUE across ALL rows (including revoked / soft-
-- deleted) so a hash resolves to at most one grant and is never reused.
--
-- The plan FK is ON DELETE RESTRICT (NOT the ephemeral PlanLock's CASCADE): a link is a
-- preserved domain record. It PARTICIPATES in the plan soft-delete cascade — the plan-
-- cascade (HierarchyLifecycleService, F-M1 Task 4) stamps a plan's live links with the
-- plan's delete_batch_id, so a deleted plan's links stop resolving and a restore brings
-- exactly that batch back. RESTRICT is defence in depth (the referential check never
-- fires because we never hard-delete) and guards against an accidental hard delete
-- orphaning links.

-- CreateTable: one share grant. organization_id is DENORMALISED from the plan; plan_id
-- is the ONE plan this link grants; token_hash is the SHA-256 hex (unique below).
CREATE TABLE "plan_shares" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "last_accessed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "delete_batch_id" UUID,

    CONSTRAINT "plan_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the guest lookup key. UNIQUE across ALL rows (full, not partial on
-- deleted_at) so a token hash resolves to at most one grant and is never reused — the
-- invitations.token_hash precedent.
CREATE UNIQUE INDEX "plan_shares_token_hash_key" ON "plan_shares"("token_hash");

-- CreateIndex: org FK (RESTRICT) + org-scoped IDOR / audit loads (the denormalised-org
-- sibling pattern; links are never listed org-wide, so no composite here).
CREATE INDEX "plan_shares_organization_id_idx" ON "plan_shares"("organization_id");

-- AddForeignKey: plan_shares.organization_id → organizations (RESTRICT — never hard-
-- deleted; guards against orphaning). ON UPDATE CASCADE is Prisma's default.
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: plan_shares.plan_id → plans (RESTRICT — links soft-delete only; the
-- plan-cascade sweeps them with the plan under one delete_batch_id, F-M1 Task 4).
-- RESTRICT is defence in depth (the check never fires because we never hard-delete).
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial index (Prisma cannot express `WHERE …`). "List a plan's LIVE links" (the
-- management list) + the plan-cascade filter: `WHERE plan_id = ? AND deleted_at IS NULL`.
-- Partial on `deleted_at IS NULL` (active only) keeps it tight — the idx_plans_calendar_id
-- / idx_notes_activity_created precedent. A full composite backing the plan FK is NOT
-- needed: plans soft-delete only, so the FK RESTRICT check never fires.
CREATE INDEX "idx_plan_shares_plan_id" ON "plan_shares" ("plan_id") WHERE "deleted_at" IS NULL;

-- Partial index (Prisma cannot express `WHERE …`) for batch restore (set only on links
-- soft-deleted together with their plan). Tiny — only soft-deleted rows carry a value;
-- the delete_batch_id sibling precedent.
CREATE INDEX "idx_plan_shares_delete_batch_id" ON "plan_shares" ("delete_batch_id") WHERE "delete_batch_id" IS NOT NULL;

-- Down (forward-only in prod; documented for completeness). Reversible — drop the table
-- (which drops its FKs and indexes):
--   DROP TABLE "plan_shares";
