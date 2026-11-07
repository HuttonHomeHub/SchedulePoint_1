# M0-T3: the cost baseline for FC-10

- **Status:** Taken 2026-11-07, by the M2 builder, in the same sitting as the after figures in
  [`../m2/cost.md`](../m2/cost.md). The M0 builder could not take it (no database to hand), and plan
  M0-T3 asks that M2 re-take baseline and after together, because a cross-sitting figure is not a
  comparison (CLAUDE.md §17). So the baseline here and the after figure there are one measurement.
- **Harness:** `apps/api/scripts/measure-schedule-write.mts` (new in M2; its docblock states where it
  bypasses the product, ADR-0081 §3) and `apps/api/scripts/measure-cross-plan-derivation.mts`
  (existing).

## `writeResults` before the columns

`ScheduleRepository.writeResults` plus `stampScheduleComputedAt` for one plan, in one transaction,
5 warm-ups then 40 samples, nearest-rank percentiles, milliseconds. Pre-M2 `schedule.repository.ts`
(the `22e5cc36` file) against a database migrated without `20261107120000_schedule_instants`. Synthetic
results, rows inserted directly: it times the statement, not the engine.

| Run | N activities | p50   | p95   | min   | max   |
| --- | ------------ | ----- | ----- | ----- | ----- |
| B1  | 2,000        | 106.6 | 148.0 | 72.9  | 179.9 |
| B1  | 5,000        | 243.6 | 349.2 | 180.7 | 480.8 |
| B2  | 2,000        | 99.5  | 138.4 | 77.8  | 155.9 |
| B2  | 5,000        | 260.8 | 322.8 | 178.4 | 389.0 |

Mean p50 at 5,000 activities: **252.2 ms**. An earlier, un-recorded first run on this database also
showed one 3.6 s sample at 2,000 (p95 3,616 ms, p50 111.8 ms), the same first-run outlier the after
database showed (see `m2/cost.md`); it is a cold-start effect of a fresh database, not of the
statement, and is why the figure to read is the p50.

## `buildEngineGraph` query counts

Not a baseline of M2: M2 adds no query, and the harness runs the same loads before and after. The
counts on this build (M1 plus M2, `22e5cc36` plus the columns), at 0, 10 and 100 links each way, on
the harness's fixture (100 downstream activities, 10 remote plans on 11 calendars):

| Links each way | Queries | … on `crossPlanDependency` | Calendar resolutions |
| -------------- | ------- | -------------------------- | -------------------- |
| 0              | 5       | 1                          | 1                    |
| 10             | 17      | 3                          | 12                   |
| 100            | 17      | 3                          | 12                   |

Equal at 10 and at 100, which is FC-10's first limb. (The 2026-09-26 `cross-plan-day-boundary` baseline
read 4 / 6 / 6 queries and 1 / 1 / 1 resolutions; the difference is that change's own M2, which added
remote calendar loads. It is not M2 of this spec.) Timing of the branch on this build, one process,
two rounds: 0 links p50 8.0–8.1 ms (p95 13.1–14.9); 10 links p50 27.4–31.5 ms (p95 42.2–56.8);
100 links p50 36.6–36.8 ms (p95 47.5–56.5). That is not comparable with the September table
(different machine, different code), and no verdict hangs on it: M4 changes the reader.

## The machine

A shared cloud container: `Intel(R) Xeon(R) Processor @ 2.10GHz`, 4 cores, 16 GiB, Node `v22.23.4`,
**PostgreSQL 16.15**. CI and the Compose host run PostgreSQL 17 (CLAUDE.md §3), so these milliseconds
are this machine's.
