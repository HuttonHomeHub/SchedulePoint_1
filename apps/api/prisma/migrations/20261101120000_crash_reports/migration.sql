-- Browser crash reports (browser-crash-reports M1-T1; docs/TECH_DEBT.md #551).
--
-- Spec: docs/specs/browser-crash-reports/spec.md §4.4 (what the table must and must NOT hold, and the
-- six queries Q-a..Q-f); plan M1-T1. Designed by the database-architect agent (CLAUDE.md §19.3). See
-- docs/DATABASE.md "CrashReport" and the model docblock in schema.prisma for the full reasoning. The
-- closest precedent is `csp_reports` (20260809160000 and 20260809170000); four things are worth
-- repeating where somebody reads the SQL:
--
--   1. NOT the audit shape, and ordinary. No trigger, no soft delete, no `version`, no
--      `organization_id` and NO FOREIGN KEY. The ADR-0087 sweep deletes these rows, and a RESTRICT
--      from telemetry must never block an organisation delete. Do not add a trigger to this table.
--   2. NO PERSONAL DATA, by column list. No user/organisation/plan/project/client/activity id, email,
--      IP, full user agent, full or resolved URL, query string or correlation id (a correlation id
--      joins the row to a Pino line carrying the principal id). `crash-reports.fields.structural.spec.ts`
--      asserts that over the model's DMMF field list, so a column added here later fails the build.
--   3. The dedupe key is a producer-computed sha256 HASH, not the key columns themselves — the
--      `csp_reports` measurement (a plain btree over long text fails at ~2,700 incompressible bytes)
--      applies to `message` and the frames, which come from a browser.
--   4. EVERY CHECK BELOW IS ONE THE PRODUCER STRUCTURALLY CANNOT VIOLATE. `csp_reports` learned that a
--      constraint a browser can reach is a constraint that deletes a report. Here the cleaners and
--      normaliser (spec §2 "Validation rules") ship in the same API image as this migration and run
--      before the write, so producer and constraints cannot skew across a release. A refusal is also
--      not silent as it is for CSP — the endpoint answers `reference: null` and logs a warn — but it
--      is still a lost report, so the M1-T2 e2e posts at-cap fixtures for every bounded column: a
--      producer cap raised without a migration then fails CI rather than production.
--
-- RETENTION: 30 days on `last_seen_at` (RETENTION_CRASH_REPORTS_DAYS, plan M1-T3), enforced by the
-- hourly ADR-0087 sweep. `last_seen_at`, not `first_seen_at`: a crash still happening must not expire.
--
-- NOT MEASURED HERE, and said so (ADR-0073 C1): this migration was authored without a database (the
-- shared local Postgres was held by another agent), so the index argument below rests on the
-- identical `csp_reports_last_seen_at_id_idx`, whose numbers are in 20260809160000, and on the row
-- cap. The M1-T2 review takes EXPLAIN (ANALYZE, BUFFERS) of Q-b..Q-f at 1,000 rows and records them.
--
-- EXPAND-ONLY: one new table, nothing existing touched, no data step (ADR-0107 does not apply — a
-- pristine and a populated database run identical statements on an empty table). The CPM engine never
-- reads it, so the ADR-0034 recalculation parity gate is structurally unaffected.

CREATE TABLE "crash_reports" (
    "id" UUID NOT NULL,
    "dedupe_hash" TEXT NOT NULL,
    "boundary" TEXT NOT NULL,
    "error_name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "route_pattern" TEXT,
    "web_version" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "browser_major" INTEGER,
    "stack" TEXT,
    "component_stack" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crash_reports_pkey" PRIMARY KEY ("id")
);

-- Q-a's conflict target. The upsert is `INSERT … ON CONFLICT (dedupe_hash) DO UPDATE`, and Q-b's
-- "is this hash already here?" is one probe of the same index.
CREATE UNIQUE INDEX "crash_reports_dedupe_hash_key" ON "crash_reports"("dedupe_hash");

-- ONE index serves Q-c, Q-d, Q-e and Q-f, all of which range or order on `last_seen_at` with `id` as
-- the tie-break. ASC, read backwards where the read is newest-first: both keys descend together, so
-- `ORDER BY last_seen_at DESC, id DESC` is a plain `Index Scan Backward` (measured on the identical
-- csp_reports index: 0.16-0.25 ms for a first page of 50 at 5,000 rows). Declared ASC so it stays
-- expressible in schema.prisma with no `sort:`.
--
--   Q-c staff list    ORDER BY last_seen_at DESC, id DESC LIMIT 50 — backward scan, stops at 50.
--   Q-d 7-day summary count(*) WHERE last_seen_at >= now() - 7 d — range scan of the leading column
--                     (index-only once vacuumed); max(last_seen_at) is the backward scan's first tuple.
--   Q-e retention     DELETE … WHERE ctid IN (SELECT ctid … WHERE last_seen_at < $cutoff
--                     ORDER BY last_seen_at, id LIMIT 1000) — the ADR-0087 D6 shape: a forward range
--                     that already yields rows in the ORDER BY, so there is no sort.
--   Q-f oldest        ORDER BY last_seen_at ASC, id ASC LIMIT 1 — the forward scan's first tuple.
--
-- The write-side cost is csp_reports': `last_seen_at` is indexed and rewritten on every repeat, so no
-- repeat is a HOT update (measured there: n_tup_hot_upd = 0 over 2,000 spaced repeats). On a table
-- throttled at 10 reports a minute per address that is nothing, and it buys every read above.
CREATE INDEX "crash_reports_last_seen_at_id_idx" ON "crash_reports"("last_seen_at", "id");

--
-- Q-b, THE CAP CHECK, GETS NO INDEX, and the reason is the cap itself. The recommended statement
-- (docs/DATABASE.md "CrashReport") inserts through `INSERT … SELECT … WHERE EXISTS (SELECT 1 … WHERE
-- dedupe_hash = $h) OR (SELECT count(*) FROM (SELECT 1 FROM crash_reports LIMIT 1000) s) < 1000
-- ON CONFLICT …`, so a repeat always counts and a new hash is admitted only below the cap. The EXISTS
-- is a unique-index probe; the count is bounded by its own LIMIT at 1,000 tuples whatever the table
-- holds, so an overshoot from a race (accepted by the spec) cannot make it slower. A counter row or a
-- trigger-maintained total would be a second write per report to save a sub-millisecond bounded scan.

-- A sha256 hex digest — a fact about the column, not about the producer's concatenation. A CHECK
-- that RECOMPUTES the hash is deliberately not shipped (csp_reports' reasoning: it would make the
-- separator and field order a database constant).
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_dedupe_hash_shape" CHECK (
  "dedupe_hash" ~ '^[0-9a-f]{64}$'
);

-- Closed value lists, fail-closed: an unhandled future value is refused rather than admitted. Both
-- are produced by the API's own code (the normaliser maps `boundary`; `browserOf()` derives `browser`
-- from the User-Agent with `other` as its catch-all), so neither is reachable from a browser. A third
-- boundary (spec Q4's `window`) is one DROP + ADD here; TEXT rather than an enum for exactly that.
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_boundary" CHECK (
  "boundary" IN ('route', 'app')
);
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_browser" CHECK (
  "browser" IN ('chrome', 'edge', 'firefox', 'safari', 'other')
);

-- The spec's `^[A-Za-z_$][\w$]{0,63}$`, written as explicit ASCII ranges because Postgres' `\w`
-- follows the database locale and JavaScript's is ASCII. The producer substitutes `Error` for
-- anything that does not match, so the shape is a guarantee, not a filter.
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_error_name_shape" CHECK (
  "error_name" ~ '^[A-Za-z_$][A-Za-z0-9_$]{0,63}$'
);

-- A TanStack route ID (`/_authed/orgs/$orgSlug/plans/$planId`), never a resolved path. Two halves:
-- the shape, and NO UUID-SHAPED RUN, because this is the one column a producer mistake (passing
-- `location.pathname`) would fill with identifiers, and a route id never holds one. The producer
-- applies the same two rules and stores NULL on failure, so the report survives without the column.
-- What this cannot refuse is a resolved org slug, which fits the shape; the producer reading the id
-- from `router.state.matches` is the only guard for that, and the model docblock says so.
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_route_pattern_shape" CHECK (
  "route_pattern" IS NULL OR (
    "route_pattern" ~ '^[A-Za-z0-9_$/.-]{1,200}$'
    AND "route_pattern" !~ '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'
  )
);

-- A loose version TOKEN (SemVer, a pre-release, or `unknown`), deliberately not a SemVer regex: the
-- database is not the authority on how a version is spelled, and the token shape alone is enough to
-- keep a URL or a sentence out of a key column.
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_web_version_shape" CHECK (
  "web_version" ~ '^[0-9A-Za-z.+-]{1,32}$'
);

-- Lengths at exactly the spec's caps, and that is the decision this table makes differently from
-- csp_reports, whose URI columns are unbounded. Two reasons. (a) This table promises a STORAGE bound
-- — ~1,000 rows of at most ~6.3 k characters of text — and that bound is a fact only if the database
-- holds it. (b) The cleaners cap as their LAST step in UTF-16 units or code points, both >= Postgres'
-- char_length, so a capped value cannot exceed these; the at-cap e2e fixtures catch a cap that moves
-- without a migration. `message` may be '' (a name and no message).
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_message_length" CHECK (
  char_length("message") <= 300
);
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_stack_length" CHECK (
  "stack" IS NULL OR char_length("stack") <= 4000
);
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_component_stack_length" CHECK (
  "component_stack" IS NULL OR char_length("component_stack") <= 2000
);

-- Parsed from the caller's own User-Agent header, so the producer must take at most four digits or
-- store NULL (model docblock, obligation 3). The upper bound is that rule, not a guess at browsers.
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_browser_major" CHECK (
  "browser_major" IS NULL OR "browser_major" BETWEEN 0 AND 9999
);

-- A count that has gone backwards, or a row seen before it first appeared, means the upsert is wrong.
-- `ck_crash_reports_seen_order` is KEPT beside the `GREATEST(clock_timestamp(), first_seen_at)`
-- clamp: the clamp makes it unviolable (both sides are rounded to the same millisecond grid, and a
-- value at or above a grid point rounds to at or above it), it is true, and it is the constraint that
-- surfaced csp_reports' #311. A statement that ever drops the clamp fails the 16-way burst e2e here
-- instead of writing an impossible pair.
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_count_positive" CHECK ("count" >= 1);
ALTER TABLE "crash_reports" ADD CONSTRAINT "ck_crash_reports_seen_order" CHECK (
  "last_seen_at" >= "first_seen_at"
);
