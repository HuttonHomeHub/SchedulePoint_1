-- Audit log (ADR-0072, TECH_DEBT #14).
--
-- APPEND-ONLY, and this migration is where that is enforced. Read ADR-0072 before
-- changing anything below: the trigger at the foot is NOT a stylistic choice and is
-- NOT "business logic in a trigger" — it encodes a constraint Postgres has no
-- declarative syntax for, the same category as the EXCLUDE constraints and fail-closed
-- CHECKs this schema already carries. Two rejected alternatives and why, measured:
--
--   * REVOKE UPDATE, DELETE FROM the app role. Rejected. It DOES bind a table's own
--     owner (the common claim that it is a no-op against the owner is false), but the
--     owner restores it with one GRANT — and on the shipped Compose stack the role is a
--     SUPERUSER (POSTGRES_USER makes it one), which bypasses privilege checks entirely.
--     An enforcement mechanism that is strong in development and absent in production is
--     worse than none, because it is believed.
--   * A restricted second role holding INSERT only. The right control, and recorded in
--     ADR-0072 as the escalation. It needs a second connection string and a role Prisma
--     Migrate does not manage, while ADR-0018's entrypoint runs migrations as the single
--     DATABASE_URL role — which cannot create another. Revisit when the deployment target
--     is decided (TECH_DEBT #5); it composes with this trigger rather than replacing it.
--
-- The trigger binds the TABLE, not the role, so it behaves identically whether the
-- connecting role is a superuser or not. ENABLE ALWAYS closes the
-- session_replication_role = 'replica' bypass (a superuser CAN set that GUC) and keeps
-- it firing under logical-replication apply.
--
-- HONEST LIMIT, stated here so nobody reads more into it than it earns: the application
-- role OWNS this table, so it can ALTER TABLE ... DISABLE TRIGGER or DROP TABLE. This is
-- append-only against accident, against ordinary application code and against a bug. It
-- is tamper-PROOF against nothing. Real immutability needs the record to leave the box.

CREATE TYPE "audit_actor_type" AS ENUM ('USER', 'GUEST', 'SYSTEM', 'ANONYMOUS');
CREATE TYPE "audit_outcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organization_id" UUID,
    "action" TEXT NOT NULL,
    "outcome" "audit_outcome" NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT,
    "subject_label" TEXT,
    "changes" JSONB,
    "correlation_id" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- RESTRICT, not CASCADE. An audit event must OUTLIVE what it records; deleting an
-- organisation must not erase the record of what was done inside it.
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fail-closed actor shape (the ADR-0046 CASE ... ELSE false precedent): a future actor
-- kind added to the enum without a branch here is REJECTED rather than admitted with
-- whatever columns happen to be set.
ALTER TABLE "audit_events" ADD CONSTRAINT "ck_audit_events_actor_shape" CHECK (
  CASE "actor_type"
    WHEN 'USER'      THEN "actor_user_id" IS NOT NULL
    WHEN 'GUEST'     THEN "actor_user_id" IS NULL
    WHEN 'SYSTEM'    THEN "actor_user_id" IS NULL
    WHEN 'ANONYMOUS' THEN "actor_user_id" IS NULL
    ELSE false
  END
);

-- `action` is TEXT so the vocabulary can grow without two migrations per label; these
-- are the DB backstop against a malformed value reaching the table.
ALTER TABLE "audit_events" ADD CONSTRAINT "ck_audit_events_action_format" CHECK (
  "action" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND length("action") <= 64
);

ALTER TABLE "audit_events" ADD CONSTRAINT "ck_audit_events_changes_object" CHECK (
  "changes" IS NULL OR jsonb_typeof("changes") = 'object'
);

-- The service truncates and marks the payload before inserting; reaching this is a bug.
ALTER TABLE "audit_events" ADD CONSTRAINT "ck_audit_events_changes_size" CHECK (
  "changes" IS NULL OR pg_column_size("changes") <= 8192
);

-- PARTIAL indexes (not declarable in Prisma). Each does two jobs: the FK/lookup check and
-- the read's exact cursor order, so no separate single-column index is needed.
CREATE INDEX "idx_audit_events_org_occurred"
  ON "audit_events" ("organization_id", "occurred_at" DESC, "id" DESC)
  WHERE "organization_id" IS NOT NULL;

CREATE INDEX "idx_audit_events_actor_occurred"
  ON "audit_events" ("actor_user_id", "occurred_at" DESC, "id" DESC)
  WHERE "actor_user_id" IS NOT NULL;

-- The append-only enforcement itself. Two triggers because Postgres separates row-level
-- UPDATE/DELETE from statement-level TRUNCATE; both raise 0A000 (feature_not_supported),
-- which is honest — modifying this table is not a permission problem, it is not a thing
-- the table does.
CREATE OR REPLACE FUNCTION "audit_events_reject_mutation"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (attempted %)', TG_OP
    USING ERRCODE = '0A000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_mutation"();

CREATE TRIGGER "trg_audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_reject_mutation"();

-- ENABLE ALWAYS, not the default ENABLE ORIGIN: the default does NOT fire when
-- session_replication_role = 'replica', which a superuser can set — and the shipped
-- Compose role is one.
ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER "trg_audit_events_append_only";
ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER "trg_audit_events_no_truncate";
