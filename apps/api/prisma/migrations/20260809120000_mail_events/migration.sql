-- Operational telemetry: mail failures (staff console M1-T1; docs/TECH_DEBT.md #100).
-- See docs/DATABASE.md "MailEvent" and docs/specs/staff-console/feature-spec.md §4.7.
--
-- `SmtpMailService` emits `event: 'mail.send_failed'` at four sites and nothing acts on
-- it. This table is the durable half of that signal: one row per failed or abandoned
-- send, so a staff member can read a history and the alerter (M1-T2) has something to
-- count.
--
-- THIS IS NOT THE AUDIT SHAPE, AND THAT IS THE POINT OF THIS COMMENT. The reflex in
-- this repository after ADR-0072 is to model a new "things that happened" table on
-- `audit_events`, and here that would be a defect rather than a style choice:
--
--   * `audit_events` refuses UPDATE and DELETE in the database itself — BEFORE UPDATE
--     OR DELETE and BEFORE TRUNCATE triggers, declared ENABLE ALWAYS so the application
--     role cannot bypass them.
--   * This row holds a CUSTOMER'S FULL EMAIL ADDRESS. That is a decided input
--     (staff-console CQ-1, product owner 2026-08-09, overruling the domain-only
--     proposal), not an oversight.
--   * So the audit shape here would write customer addresses into a permanently
--     unerasable table — precisely the collision ADR-0085 D3 spent an entire decision
--     avoiding for ONE column (`audit_events.subject_label`), and it would do it for
--     every failed send.
--
-- `mail_events` is therefore an ORDINARY table: updatable, deletable, expirable. All
-- three verbs are requirements. Updatable, so ADR-0085 D1's actor tombstone can reach
-- `recipient` and scrub it in place. Deletable and expirable, so retention can take
-- whole rows. This is telemetry about a machine, meant to be expired; it is not
-- evidence about a person. Do not add a trigger to this table.
--
-- RETENTION IS 12 MONTHS, and nothing here enforces it. The number is deliberately the
-- same as ADR-0085 D3's `auth.*` `subject_label` period rather than a second one — two
-- periods for one class of data is a question nobody can answer later. It is a CEILING,
-- NOT A PROMISE: this application has no scheduler (no `@nestjs/schedule`, no BullMQ,
-- no Redis — verified against apps/api/package.json), so no sweep runs and the true
-- retention today is forever. When one is built it is a single ranged
-- `DELETE FROM mail_events WHERE occurred_at < now() - interval '12 months'`, served by
-- the leading column of the one index below.
--
-- Fully additive: one table create, no existing table touched, no existing index
-- altered. The CPM engine (`compute.ts`) never reads it and the recalculation write
-- path is untouched, so the ADR-0034 parity gate is structurally unaffected.

-- CreateTable. No created_at/updated_at (the producer writes inside the catch block that
-- observes the failure, so both would equal occurred_at); no `version` (nothing edits a
-- row concurrently); no `deleted_at` (a soft delete that leaves the address in place
-- defeats the one property that makes this table ordinary); no `organization_id`
-- (verification and reset mail precede any membership, so it would be null for the rows
-- most often read and present only for invitations — the staff read is installation-wide
-- and `correlation_id` reaches the log line where the request context lives).
CREATE TABLE "mail_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "recipient" TEXT,
    "error_class" TEXT,
    "correlation_id" TEXT,

    CONSTRAINT "mail_events_pkey" PRIMARY KEY ("id")
);

-- `kind` and `outcome` are TEXT + a value-list CHECK rather than Postgres enums. The
-- `audit_events.action` precedent, and for its stated reason: Postgres needs TWO
-- migrations to add an enum label and use it, where a CHECK needs one. This vocabulary
-- is OBSERVED to grow, not merely suspected — `test` is specified for the CQ-3 staff
-- send and is not a member of `MailFailureKind` today, so the epic that adds this table
-- already knows the next label. It is permitted here from the start, which is why M3
-- needs no migration at all. Values are lower_snake (not the SCREAMING enum convention)
-- to equal `MailFailureKind`'s members value for value: the producer then needs no
-- mapping table, and a mapping table is where two vocabularies drift apart.
ALTER TABLE "mail_events" ADD CONSTRAINT "ck_mail_events_kind" CHECK (
  "kind" IN ('invitation', 'email_verification', 'password_reset', 'test')
);

-- FAILED = the send rejected (including our own 10 s SEND_TIMEOUT_MS). ABANDONED = an
-- abandoned send later failed. Both rows can exist for one send, which is the fact the
-- pair is for. NOT modelled on the `audit_outcome` enum: that set is closed by
-- construction (every act succeeds, is denied or fails), while these two enumerate
-- today's failure modes on a table named for EVENTS — a third becomes plausible the day
-- the CQ-3 test send wants to record a success, and this way it costs one migration.
ALTER TABLE "mail_events" ADD CONSTRAINT "ck_mail_events_outcome" CHECK (
  "outcome" IN ('FAILED', 'ABANDONED')
);

-- The structural half of "error_class, never error.message". A transport error's message
-- routinely embeds the address it failed to reach, in whatever shape the relay chose;
-- storing the address in a column is a decision, storing it again inside a free-text blob
-- is a leak wearing the decision's clothes. There is deliberately no `message`/`detail`
-- column — and this CHECK makes the remaining hole structural rather than procedural: a
-- constructor name or an errno (`Error`, `TypeError`, `ECONNREFUSED`, `EAUTH`) matches,
-- while any message long enough or punctuated enough to carry an address does not. The
-- producer normalises before inserting; reaching this constraint is a bug, and the
-- producer must swallow its own failure rather than turn a failed send into two errors.
ALTER TABLE "mail_events" ADD CONSTRAINT "ck_mail_events_error_class_shape" CHECK (
  "error_class" IS NULL OR ("error_class" ~ '^[A-Za-z][A-Za-z0-9_]*$' AND length("error_class") <= 64)
);

-- A backstop on the one column that holds personal data, so an unbounded string cannot
-- arrive through a column meant for an address. 320 = RFC 5321's 64-octet local part +
-- '@' + 255-octet domain. Deliberately a LENGTH check and not a format one: a send can
-- fail precisely BECAUSE the address was malformed, and rejecting that row would lose
-- the one record that explains the failure.
ALTER TABLE "mail_events" ADD CONSTRAINT "ck_mail_events_recipient_length" CHECK (
  "recipient" IS NULL OR length("recipient") <= 320
);

-- CreateIndex: the staff list's exact cursor order, the M3 Health panel's "failures in
-- the last 24 hours" count, and the retention sweep's ranged DELETE — all three on this
-- one index (the last two on its leftmost prefix). FULL, not partial, and therefore
-- declared in schema.prisma rather than written here as raw SQL: every row is in the read
-- set (no soft delete, no org scope, no nullable leading column), so none of the
-- audit_events partial-index reasoning applies.
--
-- ASC, read backwards, though the read is newest-first. Both keys descend together, so
-- `ORDER BY occurred_at DESC, id DESC` is a plain backward scan of this index — the same
-- argument the activities/notes (…, created_at, id) composites already make.
-- `audit_events` spells DESC only because its indexes are raw SQL anyway (being partial),
-- where the direction is free.
--
-- No index on `recipient`: erasure is rare, the table is bounded by how often mail
-- breaks, and an index on a plaintext address is a second copy of the address. No index
-- on `kind`/`outcome` either — a filtered read scans a table bounded by the same thing.
-- Add one when a measurement asks for it, with the numbers in the migration (ADR-0073 C1).
CREATE INDEX "mail_events_occurred_at_id_idx" ON "mail_events"("occurred_at", "id");
