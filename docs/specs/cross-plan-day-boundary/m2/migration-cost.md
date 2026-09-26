# M2-T2: the cost of the lag re-encoding, measured

- **Status:** Measured 2026-09-26, on the migration as shipped
  (`apps/api/prisma/migrations/20260926120000_cross_plan_lag_working_minutes/migration.sql`).
- **Why this exists:** spec §4.4 "Scale and cost" requires `EXPLAIN ANALYZE` over 10,000 seeded
  rows, five runs, on the SQL as shipped. ADR-0148 recorded a cost comment copied from a review
  without re-derivation, and every part of it was false; this one was run.

## The database

PostgreSQL 16.13 (the local instance `scripts/e2e-local.sh` starts), a fresh database with all 70
earlier migrations applied by `prisma migrate deploy`, then this fixture inserted with SQL:

| Object                    | Rows    | Shape                                                                                                                                                                                                                         |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activities`              | 100,000 | 20 plans × 5,000; every 50th `RESOURCE_DEPENDENT` (2,000); 1 in 10 with its own calendar; 1 in 100 soft-deleted                                                                                                               |
| `plans`                   | 20      | calendars cycling over the 12; two with no calendar                                                                                                                                                                           |
| `calendars`               | 12      | factors 1440, 480, 600, 360, 420, 540 (soft-deleted), 300, 720, 450, 510, 390, 1440                                                                                                                                           |
| `resources`               | 50      | calendars cycling, 1 in 7 with none, 5 soft-deleted                                                                                                                                                                           |
| `resource_assignments`    | 2,800   | a live driver on every `RESOURCE_DEPENDENT` activity; on every fifth, a soft-deleted driver and a live non-driving assignment too                                                                                             |
| `cross_plan_dependencies` | 10,000  | predecessor in plan k, successor in plan k+1; lag calendars cycling over all four; 1 in 10 predecessors `RESOURCE_DEPENDENT`; 500 soft-deleted; 20 at ±3,650 days; the rest −30…+60 days, in the old encoding (`days × 1440`) |

`ANALYZE` was run after seeding. The seed script is not committed: it is a one-off, and what matters
is recorded above and in the result table below.

**One property of this fixture, stated so it is not over-read:** its 500 soft-deleted links all
happen to be `TWENTY_FOUR_HOUR` (`i % 20 = 11` implies `i % 4 = 3`), so none of them changed here.
That says nothing about cost. That soft-deleted links are converted is pinned by the e2e case
`SOFT_DELETED_LINK`, not by this run.

## The statement: five `EXPLAIN (ANALYZE, BUFFERS)` runs

Each run: `VACUUM ANALYZE cross_plan_dependencies`, then `BEGIN`, the file's five DDL statements,
`EXPLAIN (ANALYZE, BUFFERS)` of the file's last statement, a count of the record, `ROLLBACK`. The
script was generated from the migration file (comment lines dropped, split on `;`), never retyped.

| Run | Execution | Planning | FK trigger, org | FK trigger, plan | Recorded | Changed |
| --- | --------- | -------- | --------------- | ---------------- | -------- | ------- |
| 1   | 399.5 ms  | 7.5 ms   | 38.6 ms         | 45.2 ms          | 10,000   | 5,355   |
| 2   | 362.3 ms  | 4.7 ms   | 35.2 ms         | 41.1 ms          | 10,000   | 5,355   |
| 3   | 351.8 ms  | 4.7 ms   | 36.0 ms         | 42.0 ms          | 10,000   | 5,355   |
| 4   | 351.7 ms  | 4.7 ms   | 35.0 ms         | 41.3 ms          | 10,000   | 5,355   |
| 5   | 377.8 ms  | 4.9 ms   | 36.9 ms         | 43.3 ms          | 10,000   | 5,355   |

**351.7–399.5 ms, median 362.3 ms, spread 47.8 ms.**

A first series without the `VACUUM` read **439.9–481.7 ms**, climbing run on run while the planner's
row estimate for the `UPDATE` climbed 9,950 → 25,821. Each rolled-back `UPDATE` leaves 5,355 dead
tuples, so later runs were measuring a bloated heap. The vacuumed series is the honest one. The
unvacuumed one is kept because it is the shape a careless re-run would report.

**The plan** (run 1, identical in shape across all ten runs):

- the links (`Seq Scan`, 10,000 rows) hashed and joined to **two sequential scans of `activities`**
  (predecessor, successor). Each scan reads 100,000 rows, about 23–31 ms. Ten thousand links touch
  a tenth of the table, so a hash join beats 20,000 primary-key probes. The planner chose it, and
  nothing here argues with it.
- `plans`, `resources` and `calendars` hashed (20, 45 and 12 rows).
- `resource_assignments` sequentially scanned with `Filter: (is_driving AND (deleted_at IS NULL))`,
  2,000 of 2,800 rows kept. That is the partial unique index's predicate exactly, which is what
  bounds the join to one row per activity.
- resolution about 160 ms, the `INSERT` about 55 ms, the two FK triggers about 79 ms over 10,000
  calls, the `UPDATE` about 150 ms (`Hash Join` of the 5,355 changed rows from `CTE Scan on recorded`
  back to the links).

## The migration, applied for real

On the same database, with the record table dropped and the migration's `_prisma_migrations` row
deleted so it could be applied again:

- `prisma migrate deploy`: **415 ms** as Prisma records it (`finished_at − started_at`),
  **2.95 s** wall clock including Prisma's own start-up.
- **The result, checked per row** against a snapshot taken before:

  | Check                                              | Value  |
  | -------------------------------------------------- | ------ |
  | links recorded                                     | 10,000 |
  | links whose `lag_minutes` changed                  | 5,355  |
  | … of which `version` went up by exactly 1          | 5,355  |
  | links unchanged but with `version` bumped          | 0      |
  | links disagreeing with their record (prior or new) | 0      |

- **md5 fingerprints** of every other column of `cross_plan_dependencies` (`updated_at` included)
  and of all of `activities`, `plans`, `calendars` and `resource_assignments`: identical before and
  after. Only `lag_minutes` and `version` moved.
- `pnpm --filter @repo/api prisma:check-drift` on the populated database: **no difference**.
- Recorded factors by lag calendar: `TWENTY_FOUR_HOUR` 2,500 rows, all 1440. `PROJECT_DEFAULT` and
  `PREDECESSOR` spread over the ten plan and own-calendar factors. `SUCCESSOR` 360/720/1440,
  because every successor in this fixture has its own calendar.

## The reverse, on the same database

The two `docs/DEPLOYMENT.md` blocks, extracted by their marker lines and run as the runbook says
(`psql -v ON_ERROR_STOP=1 -1 -f reverse.sql`):

- the factor-drift finder: 0 rows (nothing was created after the migration);
- the reverse: **0.19 s**; `UPDATE 5355` (step 2), `UPDATE 0` (step 3), both checks passed;
- `md5` over every link's `(id, lag_minutes)`: **`f43d5dd1…` before the migration, `def46897…`
  after it, `f43d5dd1…` after the reverse**, so every row was restored exactly;
- `version` summed 10,000 → 15,355 → 20,710: bumped by the migration and again by the reverse,
  never backwards;
- a second run: `ERROR: relation "cross_plan_lag_migrations" does not exist` at its `LOCK`, exit 3,
  nothing applied;
- `prisma migrate deploy` afterwards re-applied the migration cleanly.

## What this does not establish

- One machine and one fixture. There is no production copy to measure. The deployed installation
  holds far fewer cross-plan links than 10,000 (the table is curated one row at a time, spec E32),
  so this is an upper-bound shape rather than a forecast.
- The migration test's fixture (`apps/api/test/cross-plan-lag-migration.e2e-spec.ts`) proves
  correctness per resolution path. This run proves cost and whole-table invariants. Neither stands
  in for the other.
