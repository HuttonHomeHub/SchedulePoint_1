-- Admit STAFF to the audit actor-shape CHECK (ADR-0086 D5).
--
-- **This migration exists because the feature could not complete a single request without it, and
-- that is worth recording rather than quietly fixing.** `20260809140000_audit_actor_staff` added the
-- `STAFF` enum label; `ck_audit_events_actor_shape` (20260803170000_audit_events:61-72) is a
-- fail-closed `CASE … ELSE false`, so every row with the new label was rejected by the database.
-- The producer uses `record()` rather than `recordBestEffort()` — deliberately, so an unrecordable
-- staff read fails rather than proceeding unlogged — which turned the missing branch into a
-- guaranteed 500 on `GET /api/v1/staff/me` for a correctly-allowlisted, verified staff member.
--
-- The constraint behaved exactly as designed: its own comment says a future actor kind added to the
-- enum without a branch here is "REJECTED rather than admitted with whatever columns happen to be
-- set". It caught this. What did not catch it was the test suite — 1,589 unit tests passed, because
-- every one of them mocks Prisma, and the API e2e gate (`scripts/e2e-local.sh api`) was not re-run
-- after the staff module landed. `test/staff.e2e-spec.ts` now drives the route against a real
-- migrated database for exactly this reason.
--
-- STAFF requires `actor_user_id IS NOT NULL`, matching USER: a staff act is always performed by a
-- known account, which is the entire point of moving these operations off a shared `psql` shell.
ALTER TABLE "audit_events" DROP CONSTRAINT "ck_audit_events_actor_shape";

ALTER TABLE "audit_events" ADD CONSTRAINT "ck_audit_events_actor_shape" CHECK (
  CASE "actor_type"
    WHEN 'USER'      THEN "actor_user_id" IS NOT NULL
    WHEN 'STAFF'     THEN "actor_user_id" IS NOT NULL
    WHEN 'GUEST'     THEN "actor_user_id" IS NULL
    WHEN 'SYSTEM'    THEN "actor_user_id" IS NULL
    WHEN 'ANONYMOUS' THEN "actor_user_id" IS NULL
    ELSE false
  END
);
