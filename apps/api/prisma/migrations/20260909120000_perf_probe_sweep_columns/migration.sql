-- The sitting, and the protocol a reading was taken under.
--
-- Two additive nullable columns on `perf_probe_results`, designed with `database-architect`
-- (CLAUDE.md §19.3 — unconditional for any schema change, because deciding a change is too small to
-- need the agent is the judgement the agent exists to make). Ships DARK: nothing writes either
-- column until the sweep control lands.
--
-- Both are nullable with NO DEFAULT, so PostgreSQL 11+ takes them as metadata-only — no table
-- rewrite, ACCESS EXCLUSIVE held momentarily. This is deliberately NOT the ADR-0107 shape: an
-- `ADD COLUMN NOT NULL` with no default succeeds on an empty table and fails on a populated one, so
-- CI would go green against a pristine container and the deployed host would enter a restart loop.
-- There are real rows on that host; nullable-no-default is safe against them by construction.
--
-- ## Why neither column is backfilled
--
-- `sweep_id` NULL means **this reading was a single press**, which is true of every row written
-- before this migration and of every future single run. A DEFAULT would claim membership of a
-- sitting that does not exist — the ADR-0126 rule that a DEFAULT invents a fact. The ADR-0068
-- `hours_per_day_minutes DEFAULT 1440` precedent licenses nothing here: 1440 was demonstrably true
-- of every pre-existing row, and no value is true of these.
--
-- `frames_per_phase` NULL means **not recorded**. It is inferable from `samples.length`, because a
-- client-side constant ties frames to repeats — and inferring it would write a fact derived from a
-- bundle version into a column readers will trust. A stored reading whose protocol is unknown says
-- so instead. NULL stays ambiguous forever (written-before-the-column, or a producer omitted it);
-- a NULL on a row whose `recorded_at` is after this migration is a **producer bug**, not a historic
-- gap, and that sentence is the only way a later reader can tell the two apart. Making the DTO
-- field required would remove the ambiguity and permanently re-introduce the release-skew failure
-- below, which is worse.
--
-- ## No parent table, no foreign key
--
-- The same reasons `run_id` gives. A `perf_probe_sweeps` parent would give the ADR-0087 retention
-- sweep a two-table ordered delete — the class `docs/TECH_DEBT.md` #256 records, where five e2e
-- resets hand-ordered the schema and were already wrong about one table, found only by an unrelated
-- spec failing on a constraint it does not recognise — and reproduces the ADR-0126 M4 shape where a
-- fourth child table broke 557 API e2e tests at once on a RESTRICT foreign key.
--
-- (Both the create migration and `schema.prisma` cited **#253** for this argument. That row is
-- closed and ledgered, and its number now points at an unrelated entry, so a reader following it
-- landed somewhere else. `schema.prisma`'s citation is corrected in this commit — noticing drift
-- and walking past it leaves the register exactly as wrong as not noticing, ADR-0071's lesson.
-- **The create migration's is deliberately NOT corrected**: a landed migration is checksummed
-- (CLAUDE.md §19.3), so editing its comment would make `prisma migrate deploy` refuse on the
-- deployed host — a documentation fix bought at the price of an outage. The stale pointer is
-- recorded here instead, which is where a reader of that file's successor will meet it.)
--
-- ## No CHECK tying `sweep_id` to `run_id`, and the reason matters
--
-- Three candidates were considered and all three rejected. "A row with a `sweep_id` must also have
-- a `run_id`" can never be false — `run_id` is NOT NULL — and a CHECK that cannot fire is noise in
-- a file whose comments are load-bearing. "Two rows may share a `sweep_id` with unrelated
-- `run_id`s" is the whole point of the column, and a row-level CHECK sees one row anyway.
--
-- `sweep_id <> run_id` is the only one with a motive, and it is the one that must NOT ship: the DTO
-- structurally cannot mirror it, because the client does not know `run_id` — the server mints it
-- after the body is validated. This table's stated posture is that the DTO refuses first and the
-- CHECK is the backstop; a CHECK with no first wall is the ONLY refusal, and there is no
-- CHECK-violation mapping in this codebase. It would be an unmapped 500 that loses the whole press,
-- bought to prevent an input a client can only produce by deliberately replaying an id out of a
-- GET. The ambiguity that motivates it is removed one layer up for free, by namespacing the
-- client's grouping key (`sweep:<id>` / `run:<id>`) so the two id spaces cannot collide.
--
-- ## The sign bound extends the existing constraint rather than adding its own
--
-- DROP + ADD, the `20260809150000_audit_actor_shape_staff` precedent. The table already holds two
-- nullable-int sign bounds in exactly this shape (`hardware_concurrency`, `device_memory_gb`), and
-- a constraint named for one column sets the precedent that the next nullable int gets its own too,
-- fragmenting "where are this table's sanity bounds" into N places.
--
-- **The hazard, stated because nothing in CI can catch it:** restating ten clauses is ten chances
-- to silently drop one, and `prisma:check-drift` cannot see CHECK constraints at all — they are raw
-- SQL and absent from `schema.prisma`. The ten clauses below are copied verbatim from
-- `20260907140000_perf_probe_results/migration.sql:180-189`, and
-- `perf-probe-sweep-columns.e2e-spec.ts` asserts the shipped definition by reading
-- `pg_get_constraintdef` off the running database rather than this file.
--
-- ## Sign in the database, range on the DTO
--
-- `frames_per_phase > 0` is a fact about a count. "Between 30 and 180" is a **protocol**, and 30 is
-- a client constant today — encoding it here means the day the product widens it, the database
-- silently refuses rows the product decided to accept, and a migration becomes the cost of changing
-- a guard. That is the create migration's own argument for not restating the plausible-display-clock
-- window, and every other numeric on this table already works this way: the database holds sign,
-- the DTO holds range.
--
-- The DTO's `@Max` is REQUIRED, not decorative: this is int4, `@IsInt()` passes `1e12`, and without
-- a ceiling that value reaches Postgres and raises an out-of-range error the route does not map —
-- a 500 that loses the press. The DTO bound is a strict subset of this CHECK, so a value the
-- database would refuse is always refused first as a 422.
--
-- ## No index, and what would change that
--
-- Unchanged by these columns, because **no query filters on either**. The read is newest-first with
-- a limit capped at 100, and the sitting grouping happens client-side over the page already
-- fetched. The producer is still a person, and the sweep makes presses fewer and larger rather than
-- rows more frequent. What would change the answer: a server-side `?sweepId=` filter, or a cursor
-- page — add one then, with `EXPLAIN (ANALYZE, BUFFERS)` numbers in that migration.
--
-- ## Release ordering is load-bearing
--
-- The global pipe is `whitelist: true, forbidNonWhitelisted: true, errorHttpStatusCode: 422`, and
-- `apps/web`/`apps/api` release as separate images pulled independently (ADR-0027/ADR-0047). So a
-- web bundle posting `sweepId` against an API that has not yet shipped these DTO fields gets a
-- **422 on the whole POST** — every limb of that step lost, on the one machine that can produce a
-- reading, with no way for the client to detect it or degrade. **This migration and its DTO fields
-- must be released and deployed before any client writes them.** Two releases, so the halves fail
-- separately — the ADR-0107 shape.
--
-- The CPM engine never reads this table, so the ADR-0034 recalculation parity gate is untouched by
-- construction.

ALTER TABLE "perf_probe_results" ADD COLUMN "sweep_id" UUID;
ALTER TABLE "perf_probe_results" ADD COLUMN "frames_per_phase" INTEGER;

ALTER TABLE "perf_probe_results" DROP CONSTRAINT "ck_perf_probe_results_measurement_bounds";
ALTER TABLE "perf_probe_results" ADD CONSTRAINT "ck_perf_probe_results_measurement_bounds" CHECK (
  "scenario_version" >= 1
  AND "px_per_day" > 0
  AND "activity_count" >= 0
  AND "edge_count" >= 0
  AND "viewport_width" > 0
  AND "viewport_height" > 0
  AND "device_pixel_ratio" > 0
  AND "idle_interval_ms" > 0
  AND ("hardware_concurrency" IS NULL OR "hardware_concurrency" > 0)
  AND ("device_memory_gb" IS NULL OR "device_memory_gb" > 0)
  AND ("frames_per_phase" IS NULL OR "frames_per_phase" > 0)
);
