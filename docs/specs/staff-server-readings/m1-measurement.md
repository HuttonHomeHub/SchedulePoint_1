# M1-T1 measurement: the three history diagnostics (#443 / ADR-0174 M3-T2)

What M1-T1 of [the plan](./implementation-plan.md) ran, and what it found. ADR-0140's bar is "no query
whose cost is unknown ships" and each statement must run in **≤ 500 ms**. Every figure below was
produced by the command named beside it.

## Method

- **Instrument:** `apps/api/scripts/measure-history-diagnostics.mts`, run as
  `HD_COST_URL=postgresql://…/app_cost_hist HD_ROWS=<n> HD_OUT=<file> pnpm --filter @repo/api exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-history-diagnostics.mts`.
  The SQL is **read from the shipped registry** (`DIAGNOSTICS`), so the measured text is the shipped text.
- **Estate:** a throwaway database built by `prisma migrate deploy`, then
  `docs/specs/zero-duration-task/m0-dilute.sql` (102,000 activities, 40 plans, one organisation,
  103,020 assignments), so the readings sit beside the registry's other costs.
- **History:** topped up to `HD_ROWS` by `INSERT … SELECT … ORDER BY random()`, so the rows are
  physically **interleaved** across the heap (the bound `hierarchy-expiry-history.measure.ts`
  established). `first_recorded_at` is spread over the previous 90 days (31 % fall in the 28-day
  window), 40 % of rows are `LOGIC` or `RESOURCES`, and 10 % are above 512 bytes. The existing harnesses seed per plan and activity through the application's tables; this one needed random timestamps, scopes and sizes over the diluted estate, so the seeding is a short `INSERT … SELECT` inside the measuring script rather than a third seeder.
- **Order:** the six statements are run round-robin (each warmed once, then five rounds of all six), so
  no statement benefits from running last. `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, median of five.
- **Whole press:** every registry statement once, in registry order, timed ten times with and without the
  three new entries, interleaved.
- **Machine:** the 4-vCPU container the other costs were taken on (Linux 6.18, 15 GB RAM), PostgreSQL
  16.14 (Ubuntu), default configuration (`shared_buffers` 128 MB, so the 1,000,000-row heap of 468 MB
  is served from the OS cache). Date: 2026-10-05.

## Readings

| Statement                              | 100,000 rows (median / max ms) | 1,000,000 rows (median / max ms) | Plan at 1,000,000                                                   |
| -------------------------------------- | -----------------------------: | -------------------------------: | ------------------------------------------------------------------- |
| H-1 denominator (all entries)          |                    17.6 / 18.2 |                    101.0 / 121.4 | parallel sequential scan                                            |
| H-1 numerator (28 days, plans, orgs)   |                    71.0 / 76.8 |                **524.0 / 546.6** | seq scan of history, hash join to `activities`, sort for `DISTINCT` |
| H-2 denominator (28 days)              |                    25.7 / 36.5 |                    118.0 / 122.3 | parallel sequential scan                                            |
| H-2 numerator (+ `LOGIC`/`RESOURCES`)  |                    52.4 / 68.4 |                    185.2 / 198.5 | as H-1 numerator, parallel                                          |
| H-3 denominator (all entries)          |                    17.9 / 18.6 |                     98.1 / 106.1 | parallel sequential scan                                            |
| H-3 numerator (`pg_column_size > 512`) |                    70.4 / 71.0 |                **537.7 / 540.2** | as H-1 numerator                                                    |

Counts returned at 1,000,000 rows (a check against the seeding arithmetic): H-1 310,997 of 1,000,000 across
40 plans in 1 organisation; H-2 124,497 of 310,997; H-3 100,000 of 1,000,000.

| Whole press (26 statements before, 32 after) | Without the three entries | With them (median / max) |
| -------------------------------------------- | ------------------------: | -----------------------: |
| 100,000 history rows                         |                  395.5 ms |            575.8 / 666.5 |
| 1,000,000 history rows                       |                  334.8 ms |        1,693.3 / 1,869.2 |

(The without-history press differs between the two sittings by about 60 ms with nothing changed, which is
the noise the other figures sit in.)

## Verdict against ≤ 500 ms per statement

- **At 100,000 rows every statement passes** (largest 71 ms).
- **At 1,000,000 rows four pass and two do not**: the H-1 and H-3 numerators read 524 and 538 ms. Both are
  dominated by the sort behind `count(DISTINCT a.plan_id)` over the joined rows, not by the scan.
- **The default is applied: ship, with a re-arm trigger the entry observes itself.** The live host holds
  hundreds of activities today. There are **two triggers and the first fires much earlier**: the whole press
  crosses ADR-0140 D7's ~800 ms at roughly 250,000–300,000 rows, and the per-statement 500 ms bar is crossed
  near 950,000 (cost is roughly linear, 71 ms at 100k to 524 ms at 1M). The re-arm observable is therefore
  **H-1 `examined` ≥ 250,000**, recorded in the registry docblock, #443 and `DECISIONS.md`.
- **No index is proposed.** Every statement is a sequential scan, like every other entry in the registry,
  and the cost is the distinct-sort, which an index on `first_recorded_at` would not remove. An index is
  a schema change and would go to database-architect before anything else.
- **ADR-0140 D7's reopen trigger (the whole press near ~800 ms)** is crossed at roughly 250,000–300,000
  history rows on this machine (576 ms at 100,000, 1,693 ms at 1,000,000; the interpolation is linear and the
  baseline press drifts, below). That reopens the throttle decision (6 requests per 60 s) and is reported to
  the product owner rather than decided here. At the live host's size the press cost is unchanged to the
  millisecond.
- **Not established:** how a cold cache (a heap that does not fit in memory) changes these figures; the
  1,000,000-row heap here (468 MB) is smaller than ADR-0174's 710 MB estimate and fits the OS cache.

## A defect in the spec found while building

The spec names the rows "History entries begun in the last 28 days" and "History entries larger than 0.5 KB".
`staff-diagnostics.service.spec.ts` asserts that **no registry label contains a digit** (a label is a
property of the question and carries nothing about the installation), so both fail it. The labels shipped as
"History entries begun in the last four weeks" and "History entries larger than half a kilobyte"; the 28-day
and 512-byte figures stay in the SQL, the docblock and the sentences. The test was not edited.

## Limits of these readings

- **The two kinds of figure are not comparable.** The per-statement times are `EXPLAIN (ANALYZE)` execution
  times and exclude Prisma and the network; the whole-press figures are wall-clock through Prisma. Do not
  subtract one from the other.
- **The baseline drifted.** The press without the three entries read 395.5 ms in one sitting and 334.8 ms in
  the other with nothing changed, so every press figure carries about ±60 ms.
- **The data is synthetic.** 40 plans, one organisation, a uniform random spread of activities and dates. Real
  history is clustered by plan and time, which changes the distinct-sort's input and the hash join's shape.
- **The cache was warm.** The 468 MB heap fits the OS cache, so the readings are the optimistic end and the
  row counts at which the triggers fire are, if anything, high.
