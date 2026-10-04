# M3-T1 — what ADR-0096 expiry costs when the plan carries history

**Measured 2026-10-04** by `apps/api/test/measure/hierarchy-expiry-history.measure.ts` (run with
`vitest.measure.config.mts` against a scratch database after `prisma migrate deploy`). Raw readings are
the three runs below (the third added the interleaved order); the harness writes them as JSON through
`MEASURE_OUT`.

**Machine:** the same shared container as TECH_DEBT #443 — 4 vCPU, API and PostgreSQL 16.14 (not 17) on
one host. These are **container figures, not the deployed host's**; the ratio is a quotient of two costs
measured on the same machine, which travels better than either number, but it is not established there.

## Method

One client → project → plan scope per case: 2,000 activities, a 1,999-link chain, and `K` history rows
per activity inserted by one SQL statement (~0.4 KB of `changes` each), then `ANALYZE`. `deleteExpiredScope`
runs in one transaction with the 60 s timeout lifted, so a slow case reports its real duration. Two
repetitions per case, each on a freshly seeded scope. The harness asserts that the returned
`activityHistoryEntries` equals the rows seeded, so a partial delete cannot pass as a fast one; it held in
every case.

Two physical orders. **Clustered**: `CROSS JOIN generate_series`, every activity's rows adjacent on disk.
**Interleaved**: the series outermost and `ORDER BY g, random()`, so each activity's rows are scattered
across the heap as history accrued over months across all the activities would be. Real history is the
second; the first was the original measurement.

## Readings (ms for the whole scope)

**Clustered** (runs 1 and 2, then run 3; rep 1 / rep 2):

| History rows | Run 1         | Run 2         | Run 3         |
| ------------ | ------------- | ------------- | ------------- |
| 0            | 179 / 143     | 162 / 134     | 156 / 130     |
| 100,000      | 198 / 246     | —             | —             |
| 250,000      | 546 / 1,320   | —             | —             |
| 500,000      | 1,203 / 3,747 | 1,915 / 2,351 | 681 / 1,103   |
| 1,000,000    | 3,568 / 4,019 | 3,622 / 4,657 | 3,535 / 4,003 |
| 2,000,000    | —             | 7,729 / 8,629 | —             |

**Interleaved** (run 3 only):

| History rows | rep 1 / rep 2 |
| ------------ | ------------- |
| 500,000      | 2,526 / 2,807 |
| 1,000,000    | 7,636 / 7,825 |

Interleaved costs about 2–2.2× the clustered order at 1,000,000 rows, and at least 2× at 500,000.

## Derived

- **Per activity:** 130–179 ms ÷ 2,000 = **65–90 µs**, with its links, in a scope with no history.
- **Per history row, clustered:** whole-scope time ÷ rows is 3.6–4.7 µs steady at 500k–2M rows (noise is
  large: the 500,000-row case read 0.7 s to 3.7 s across runs).
- **Per history row, interleaved:** 5.0–5.6 µs at 500,000 rows and **7.6–7.8 µs at 1,000,000**
  (about 7.5 µs after subtracting the empty scope). The per-row cost rose with size.
- **The quotient** (per-activity ÷ per-row): 17 clustered at the central figures (80 ÷ 4.7), and
  **8.3–10.4 interleaved** (65–78 µs ÷ 7.8 µs, or ÷ 7.5 µs marginal). That is below the 10 the first
  version of this file set the constant to, so the constant is now **`HISTORY_ROWS_PER_ACTIVITY = 5`**.
  Cold or scattered rows cost more per row, which pushes the true ratio **down** towards and below 10,
  and 5 leaves about 1.7–2× headroom for that unmeasured factor. A higher constant would be the unsafe
  move: charging too little overruns the 60 s transaction, charging too much only slows a backlog's drain
  (20,000 activity-equivalents an hour is now 100,000 history rows per run, about 2.4 million a day).
- **At the plan's named size** (2,000 activities, 500,000 rows) the whole scope took 0.7–1.1 s clustered
  and **2.5–2.8 s interleaved** (1.2–3.7 s in the earlier runs).

## The 60 s batch timeout

At 7.5–7.8 µs per interleaved row a 2,000-activity scope reaches 60 s at about **7.7 million history
rows**, extrapolated from the 1,000,000-row measurement. That is **likely optimistic**, because per-row cost
rose from 500,000 to 1,000,000 rows. The clustered order extrapolated to 8–15 million, and the measured
2,000,000-row clustered case (8.6 s worst) is the largest ever run.

**Row rate, re-derived from the spec's own figures.** 50–300 entries/day is 18k–110k entries a year, which
the spec sizes as 6–55 MB. Adding 20–40 % for links and resources at about 0.4 KB an entry gives about
**18,000 rows a year at the low end (6 MB × 1.2 ÷ 0.4 KB) and about 190,000 at the high end (55 MB × 1.4 ÷
0.4 KB)**; by entry count the high end is 154,000. An earlier version of this file said 140,000, which
dropped the uplift. CQ-2's retention trigger fires at 1,000,000 entries on one plan, about **five years at
the pessimistic rate**, against about 7.7 million rows for 60 s: roughly 40× on warm-cache figures.

**That margin is two caveats deep, and neither is closed.** (1) **Cache temperature:** the rows were
written moments before the delete. A scope that sat in the bin for months is partly read from disk.
(2) **Physical order:** the clustered figures flattered it; the interleaved reading above is the measured
bound for that one. Cold or scattered rows cost more per row, which lowers the quotient and the 60 s
figure, so it is the cold reading, not a warm one, that would decide whether a pre-pass is needed. **No
pre-pass is proposed until a scope is measured cold and interleaved on the deployed host (TECH_DEBT
#443);** the fallback in data-model §3 stays unbuilt.

## What this does not cover

- **Cold cache.** Unmeasured; likely dearer per row. See above.
- **Even spread.** History was uniform over the activities; a hub carrying thousands of rows was not
  seeded. The `activity_id IN (…)` delete is index-driven, so concentration should not change the total,
  but that was not run.
- **Links and knock-ons** were present as dependency rows only; no `link:` history items were seeded, so
  the row _content_ is field edits. Row size, not kind, drives a delete, but that is inferred.
- **Concurrent load.** Nothing else ran against the database.
