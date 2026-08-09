-- CSP violation reports (staff console M4; docs/TECH_DEBT.md #8).
--
-- See docs/DATABASE.md "CspReport" and the model docblock in schema.prisma for the full reasoning.
-- Three things are worth repeating at the point somebody reads the SQL:
--
--   1. NOT the audit shape. This is deduplicated telemetry about a POLICY, and the dedup upsert is
--      an UPDATE — which `audit_events`' append-only triggers make impossible. Do not add a trigger
--      to this table. (The reflex after ADR-0072 is to reach for that shape; `mail_events` carries
--      the same warning for the same reason.)
--   2. The dedup key is a HASH of the three identifying columns, not the columns themselves. A
--      btree index row caps near 2704 bytes and both URI columns arrive from an UNAUTHENTICATED
--      POST, so an 8 KB `blocked_uri` indexed directly would make the INSERT fail rather than
--      dedup — a hostile report could then deny the reporting this table exists to collect.
--   3. Retention is 30 days and NOTHING ENFORCES IT. There is no scheduler in this application (no
--      @nestjs/schedule, no BullMQ, no Redis), so the period is a ceiling, not a promise, and the
--      true retention today is forever. `last_seen_at` is the sweep predicate when one is built.
--
-- Fully additive: one table, no existing table touched. The CPM engine never reads it, so the
-- ADR-0034 recalculation parity gate is structurally unaffected.

CREATE TABLE "csp_reports" (
    "id" UUID NOT NULL,
    "dedupe_hash" CHAR(64) NOT NULL,
    "effective_directive" TEXT NOT NULL,
    "blocked_uri" TEXT NOT NULL,
    "document_uri" TEXT NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'report',
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csp_reports_pkey" PRIMARY KEY ("id")
);

-- The dedup key. Fixed-width by construction, so no report can be too long to deduplicate.
CREATE UNIQUE INDEX "uq_csp_reports_dedupe_hash" ON "csp_reports"("dedupe_hash");

-- "What is breaking most" — the first question a staff member asks this table.
CREATE INDEX "idx_csp_reports_count" ON "csp_reports"("count" DESC, "id");
-- "Is it still happening", and the retention sweep on the leftmost column.
CREATE INDEX "idx_csp_reports_last_seen" ON "csp_reports"("last_seen_at" DESC, "id");

-- Bounds on attacker-controlled text, matching the producer's own caps. Reaching one is a producer
-- bug; they exist because the producer is the only thing between a public endpoint and this table.
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_lengths" CHECK (
  length("effective_directive") <= 1024
  AND length("blocked_uri") <= 1024
  AND length("document_uri") <= 1024
  AND length("disposition") <= 32
);

-- A count that has gone backwards, or a row claiming to have been seen before it first appeared,
-- means the upsert is wrong — cheap to assert, and silent corruption otherwise.
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_count_positive" CHECK ("count" >= 1);
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_seen_order" CHECK ("last_seen_at" >= "first_seen_at");
