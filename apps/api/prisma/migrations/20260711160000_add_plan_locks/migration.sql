-- CreateTable
-- PlanLock — the single-editor edit-lock lease (ADR-0028). Presence = held,
-- absence = free. PK is plan_id (the one-lock-per-plan invariant made physical);
-- no soft-delete / version / attribution columns — it is ephemeral coordination
-- state, not a domain record. Purely additive: no backfill, no ALTER on existing
-- tables, forward-only safe.
CREATE TABLE "plan_locks" (
    "plan_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "holder_user_id" TEXT NOT NULL,
    "acquired_at" TIMESTAMPTZ(3) NOT NULL,
    "heartbeat_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "requested_by_user_id" TEXT,
    "requested_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_locks_pkey" PRIMARY KEY ("plan_id")
);

-- CreateIndex
CREATE INDEX "plan_locks_organization_id_idx" ON "plan_locks"("organization_id");

-- AddForeignKey
ALTER TABLE "plan_locks" ADD CONSTRAINT "plan_locks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- ON DELETE CASCADE (unlike the hierarchy's RESTRICT): the lock is ephemeral state
-- owned by its plan, with nothing to preserve. Plans soft-delete in normal use (the
-- FK never fires); CASCADE only matters on a rare hard purge, where the lock must
-- vanish with the plan and must never block the purge.
ALTER TABLE "plan_locks" ADD CONSTRAINT "plan_locks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
