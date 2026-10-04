# M3-T1 — what ADR-0096 expiry costs when the plan carries history

**Measured 2026-10-04** by `apps/api/test/measure/hierarchy-expiry-history.measure.ts` (run with
`vitest.measure.config.mts` against a scratch database after `prisma migrate deploy`). Raw readings are
the two runs below; the harness writes them as JSON through `MEASURE_OUT`.

**Machine:** the same shared container as TECH_DEBT #443 — 4 vCPU, API and PostgreSQL 16.14 (not 17) on
one host. These are **container figures, not the deployed host's**; the ratio is a quotient of two costs
measured on the same machine, which travels better than either number, but it is not established there.

## Method

One client → project → plan scope per case: 2,000 activities, a 1,999-link chain, and `K` history rows
per activity inserted by one SQL statement (`generate_series` over the plan's activities, ~0.4 KB of
`changes` each), then `ANALYZE`. `deleteExpiredScope` runs in one transaction with the 60 s timeout
lifted, so a slow case reports its real duration. Two repetitions per case, each on a freshly seeded scope.

## Readings (ms for the whole scope)

| History rows | Run 1 (rep 1 / rep 2) | Run 2 (rep 1 / rep 2) |
| ------------ | --------------------- | --------------------- |
| 0            | 179 / 143             | 162 / 134             |
| 100,000      | 198 / 246             | —                     |
| 250,000      | 546 / 1,320           | —                     |
| 500,000      | 1,203 / 3,747         | 1,915 / 2,351         |
| 1,000,000    | 3,568 / 4,019         | 3,622 / 4,657         |
| 2,000,000    | —                     | 7,729 / 8,629         |

## Derived

- **Per activity:** 134–179 ms ÷ 2,000 = **67–90 µs**, with its links, in a scope with no history.
- **Per history row:** whole-scope time ÷ rows is **3.6–4.7 µs steady** at 500k–2M rows (2.0–7.5 µs at
  the extremes of the run-to-run noise, which is large: the 500,000-row case read 1.2 s and 3.7 s in one
  run). The marginal cost over the empty scope at 2M rows is 4.2 µs.
- **The ratio:** 80 µs ÷ 4.7 µs ≈ 17 rows per activity; at the worst readings (90 µs ÷ 7.5 µs) 12. The
  product's constant is **`HISTORY_ROWS_PER_ACTIVITY = 10`**, the pessimistic end rounded down.
- **At the plan's named size** (2,000 activities, 500,000 rows) the whole scope took **1.2–3.7 s**.

## The 60 s batch timeout

Linear growth held through 2,000,000 rows (8.6 s worst), so extrapolating: a 2,000-activity scope reaches
60 s at **about 8 million history rows on the worst single reading (7.5 µs/row) and about 13–15 million on
the steady figure (4.0–4.7 µs/row)** — 4,000–7,500 rows per activity. That is **extrapolated beyond the
largest measured case (2M)**, not measured to the timeout.

**Not realistic.** The spec's estimate is 6–55 MB a year on a busy plan, plus 20–40 % for links and
resources — at ~0.4 KB an entry, roughly 15,000–140,000 rows a year — and ADR-0174's retention trigger
(CQ-2) fires at 1,000,000 entries on one plan, which is 8× below the pessimistic 60 s figure. So no
pre-pass is proposed; the fallback in data-model §3 stays unbuilt. That judgement rests on the unmeasured
real row rate, which is M3-T2.

## What this does not cover

- **Warm cache.** The rows were written moments before the delete. A scope that has sat in the bin for
  months is partly cold, and per-row cost there is likely higher. Unmeasured.
- **Even spread.** History was uniform over the activities; a hub carrying thousands of rows was not
  seeded. The `activity_id IN (…)` delete is index-driven, so concentration should not change the total,
  but that was not run.
- **Links and knock-ons** were present as dependency rows only; no `link:` history items were seeded, so
  the row _content_ is field edits. Row size, not kind, drives a delete, but that is inferred.
- **Concurrent load.** Nothing else ran against the database.
