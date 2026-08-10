-- CSP violation reports (staff console M4; docs/TECH_DEBT.md #8).
--
-- See docs/DATABASE.md "CspReport" and the model docblock in schema.prisma for the full reasoning.
-- Four things are worth repeating at the point somebody reads the SQL:
--
--   1. NOT the audit shape. This is deduplicated telemetry about a POLICY, written from an
--      UNAUTHENTICATED PUBLIC endpoint, and the dedup upsert is an UPDATE — which `audit_events`'
--      append-only triggers make impossible. Modelling attacker-supplied strings on a table that
--      refuses UPDATE and DELETE would also make a prober's junk permanent, and the one thing that
--      must stay possible here is throwing it away. Do not add a trigger to this table. (The
--      reflex after ADR-0072 is to reach for that shape; `mail_events` carries the same warning.)
--   2. The dedup key is a HASH of the three identifying columns, not the columns themselves —
--      measured, below, because the failure it avoids is a hostile caller DENYING the reporting
--      this table exists to collect.
--   3. Retention is 30 days and NOTHING ENFORCES IT. There is no scheduler in this application
--      (verified against apps/api/package.json: no @nestjs/schedule, no BullMQ, no Redis), so the
--      period is a CEILING, NOT A PROMISE, and the true retention today is forever.
--      `last_seen_at` is the sweep predicate — deliberately not `first_seen_at`, since a violation
--      that is still happening must not expire out from under the decision it informs.
--   4. The two URI columns are deliberately UNBOUNDED by any CHECK. This endpoint answers 204
--      whatever happens and the producer swallows its write failures, so a refused row is a
--      SILENTLY DROPPED report; on the two columns that are themselves the evidence, losing the row
--      is worse than losing the tail of a URL, and a length constraint would be reachable by
--      exactly the hostile input this table exists to survive the moment the producer's cap and the
--      constraint disagreed. The bound lives at the boundary (`MAX_FIELD_LENGTH` = 1,024 and the
--      body cap in csp-report-body.ts). The database's job here is to make a hostile length
--      HARMLESS, not to refuse it — which is what `dedupe_hash` buys.
--
-- Fully additive: one table, no existing table touched, no existing index altered. The CPM engine
-- never reads it, so the ADR-0034 recalculation parity gate is structurally unaffected.

CREATE TABLE "csp_reports" (
    "id" UUID NOT NULL,
    "dedupe_hash" TEXT NOT NULL,
    "effective_directive" TEXT NOT NULL,
    "blocked_uri" TEXT NOT NULL,
    "document_uri" TEXT NOT NULL,
    "disposition" TEXT,
    "source_file" TEXT,
    "line_number" INTEGER,
    "column_number" INTEGER,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csp_reports_pkey" PRIMARY KEY ("id")
);

-- THE DEDUP KEY, and the decision this table turns on.
--
-- MEASURED on this database before it was written (PostgreSQL 16.13, incompressible input, a plain
-- btree UNIQUE over the three text columns):
--
--   * blocked_uri 2,600 chars — accepted.
--   * blocked_uri 2,700 chars — ERROR: index row size 2776 exceeds btree version 4 maximum 2704.
--   * blocked_uri 8,192 chars — ERROR: index row requires 8264 bytes, maximum size is 8191.
--
-- Both URI columns arrive from an unauthenticated POST, so indexing them directly hands a stranger
-- a way to make the INSERT FAIL rather than deduplicate. A fixed 64 hex characters in the index
-- makes length unreachable.
--
-- Worth recording alongside it, because it invalidates the obvious test: the SAME experiment with
-- repeat('a', 8192) was ACCEPTED by the plain three-column index. A btree compresses an index tuple
-- that would not otherwise fit, and 8 KB of one repeated character compresses to nothing — so a
-- hostile-length test built from a repeated character passes whether or not this hash exists.
--
-- The hash is computed by the PRODUCER (`sha256Hex`, the Invitation/PlanShare precedent in
-- common/tokens/token.ts:21) rather than by the database, and the alternatives were tried here
-- rather than reasoned about:
--
--   * A GENERATED ALWAYS AS (...) STORED column and an index expression both require IMMUTABLE
--     functions, and convert_to(text,'UTF8') is STABLE (pg_proc.provolatile = 's'), so
--     sha256(convert_to(...)) is refused outright: "generation expression is not immutable" /
--     "functions in index expression must be marked IMMUTABLE". pgcrypto's digest() is not
--     installed, the app role is not superuser (pg_user.usesuper = f), and pgcrypto is not a
--     trusted extension, so a migration cannot install it. THIS DATABASE CANNOT COMPUTE A STRONG
--     HASH. It can compute md5 — and md5 over attacker-controlled input, on a table whose purpose
--     is to be evidence, hands a prober a way to merge a real violation into another row.
--   * A generated column also drifts: declared as an ordinary column, `prisma migrate diff` reports
--     `Altered column dedupe_hash (changed from Nullable to Required, default changed from
--     Some(DbGenerated(...)) to None)` and exits 2 — the CI failure TECH_DEBT #54 was. Silencing it
--     needs `String? @default(dbgenerated("md5(...)"))`, i.e. a client type of `string | null` for a
--     column that is never null, plus the SQL expression restated in the model where a later
--     migration can quietly disagree with it.
CREATE UNIQUE INDEX "csp_reports_dedupe_hash_key" ON "csp_reports"("dedupe_hash");

-- The newest-first cursor read the spec asks for (US-6, §4.6), AND the retention sweep's ranged
-- DELETE on its leftmost prefix. Not discretionary — without it the sweep has no support at all.
-- ASC, read backwards: both keys descend together, so `ORDER BY last_seen_at DESC, id DESC` is a
-- plain backward scan (measured: `Index Scan Backward`, 0.44 ms for the first page at 500,000
-- rows; 0.16-0.25 ms at 5,000). Declaring it ASC keeps it expressible in schema.prisma, where a
-- DESC index would introduce this schema's first `sort:` for no gain — the `mail_events` argument.
CREATE INDEX "csp_reports_last_seen_at_id_idx" ON "csp_reports"("last_seen_at", "id");

-- NO INDEX ON `count`, and that is a measurement rather than an omission. The staff panel also
-- wants most-frequent-first, so this was measured both ways on this database:
--
--   * 500,000 rows (174 MB) — `ORDER BY count DESC, id DESC LIMIT 50` costs 49.8-55.1 ms as a
--     parallel Seq Scan + top-N heapsort touching 22,404 buffers. A `(count, id)` index takes it to
--     0.30-0.39 ms (`Index Scan Backward`) for 19 MB. A 130-180x speed-up.
--   * 5,000 rows (1.7 MB) — the SAME unindexed sort costs 1.32-1.36 ms.
--
-- 5,000 distinct violations is already generous: a correct policy yields tens, and the number is
-- bounded by distinct violations rather than by traffic, which is what the dedup buys. The 50 ms
-- case needs a sustained hostile flood AND is a staff-only read behind a throttle. So the index is
-- not shipped, and the numbers are recorded so adding it later is one step rather than a
-- rediscovery (the ADR-0073 C1 rule: measure, and put the measurement in the migration).

-- `dedupe_hash` is a sha256 hex digest, and this asserts exactly that — a fact about the COLUMN.
--
-- A CHECK that RECOMPUTES the producer's hash was tried and works: Postgres does not enforce
-- immutability inside a CHECK, so `encode(sha256(convert_to(d||E'\x1f'||b||E'\x1f'||u,'UTF8')),
-- 'hex')` was verified here to accept a correct hash and reject repeat('0',64). It is deliberately
-- NOT shipped. It would make the separator and the field order a database constant, so changing
-- either in the producer refuses EVERY row — and because this endpoint swallows its own write
-- failures, the symptom is total, silent loss of reports rather than a failing test. A benign
-- duplicate row from a producer bug is the better residual.
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_dedupe_hash_shape" CHECK (
  "dedupe_hash" ~ '^[0-9a-f]{64}$'
);

-- A SHAPE check, never a value list, and the question is worth answering explicitly because the
-- vocabulary looks closed and is not. `script-src-elem`, `require-trusted-types-for` and
-- `upgrade-insecure-requests` are all newer than the directives this policy names, and browsers add
-- more; a value list would silently discard the reports about whatever arrives next, on the one
-- table whose purpose is to tell us about things we did not anticipate. The shape still refuses a
-- URL, a sentence or 8 KB of junk in the one key column that CANNOT be truncated without changing
-- what "the same violation" means.
--
-- It is also the structural half of a producer obligation: the legacy `violated-directive` field
-- carries the serialised directive, value and all (`script-src 'self'`), and csp-report-body.ts
-- falls back to it verbatim. Stored that way the same violation keys differently depending on which
-- engine reported it, and the count that decides whether to enforce is split across two rows that
-- read as two problems. The producer must take the first token; this refuses it if it does not.
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_directive_shape" CHECK (
  "effective_directive" ~ '^[a-z][a-z0-9-]{0,63}$'
);

-- CSP defines exactly two dispositions, and unlike the directive vocabulary this one IS closed —
-- it is a property of the header we sent, not of what the browser knows about. NULL is permitted
-- and is the interesting case: the Reporting API body always carries `disposition`, the legacy
-- `application/csp-report` body carries it in some engines and not others, so an absent value is
-- absent BY FORMAT rather than by accident. Defaulting it to 'report' would invent the answer, and
-- invent it in the direction that reads a real block as a hypothetical one — on exactly the
-- transition this table exists to inform. NULL says "the report did not say", which is true and is
-- a third fact. (The column is not part of the dedup key, so it is last-writer-wins and reads as
-- "as of last_seen_at, this was the disposition".)
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_disposition" CHECK (
  "disposition" IS NULL OR "disposition" IN ('enforce', 'report')
);

-- A count that has gone backwards, or a row claiming to have been seen before it first appeared,
-- means the upsert is wrong. Cheap to assert, silent corruption otherwise — and `first_seen_at` is
-- what makes "this started when we deployed X" answerable, so it must never move.
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_count_positive" CHECK ("count" >= 1);
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_seen_order" CHECK (
  "last_seen_at" >= "first_seen_at"
);

-- Source location is nullable in both directions of the word: absent by format, and absent when the
-- reporter simply did not say. Not in the dedup key, so last-writer-wins — one worked example,
-- which is all it needs to be. These three earn their place on ADR-0074's own experience: the
-- violation that report-only window found came from Zod 4's `allowsEval()` probe, a DEPENDENCY that
-- appears nowhere in apps/web/src, so `blocked_uri = 'eval'` names what broke and says nothing
-- about what to change. `line_number`/`column_number` must be clamped by the producer — a JSON
-- number outside int4 fails at CAST time, before any CHECK here can see it.
ALTER TABLE "csp_reports" ADD CONSTRAINT "ck_csp_reports_source_position" CHECK (
  ("line_number" IS NULL OR "line_number" >= 0) AND ("column_number" IS NULL OR "column_number" >= 0)
);
