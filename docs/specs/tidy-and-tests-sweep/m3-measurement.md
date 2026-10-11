# Measurement record: #444 (batch history probe) and #441 (baseline count)

- **Date:** 2026-10-11
- **Method:** ADR-0142 (measure the remedy before building it), ADR-0113 (measure the problem). Both rows ask a cost
  question, so the numbers below decided what was built.
- **Machine (ADR-0128):** the shared 4-vCPU development container, PostgreSQL **16.15** (production is 17), default
  `shared_buffers` 128 MB, other agents' work running on the same host. These are **indicative** figures. The
  verdicts below rest on plan shape and on ratios between arms measured in the same run, not on absolute
  milliseconds.
- **Database:** a scratch database created for this run (`prisma migrate deploy` on an empty database), never
  `app_test`.

## 1. #444: the batch probe reads a document it never uses

**Reading of the code (not evidence by itself).** `ActivityHistoryRecorder.probe` selected `*` from the latest
`activity_history_entries` row per activity and returned `e.changes`. `planRecord` reads `latest.changes` only behind
`joinable`, and `joinable` requires `!write.isBatch` (`activity-history.diff.ts:334-349`). So a batch never reads it.

**The first measurement left this open.** The M2-T5 harness's survivors had no history, so the probe returned `NULL`
for the column (`docs/specs/activity-change-history/implementation-plan.md:549-552`). The harness now has a
`longHistoryProbe` arm: 2,000 survivors, each with one latest entry carrying an incompressible `changes` document
(md5 text, so it is stored large rather than compressed under the TOAST threshold). It runs the **old statement
shape** (`SELECT *` inside the `LATERAL`) and the **new shape** (`changes` selected as `NULL`) against the same rows,
interleaved, in one process, two warm-up runs discarded.

| Run | Document (stored) | Pairs | Wide probe, median (min to max) | Narrow probe, median (min to max) | Saving at the median |
| --- | ----------------- | ----- | ------------------------------- | --------------------------------- | -------------------- |
| 1   | 6,195 B           | 8     | 197.0 ms (146.5 to 224.4)       | 25.4 ms (18.1 to 61.5)            | 171.6 ms (7.8x)      |
| 2   | 2,099 B           | 12    | 98.0 ms (75.8 to 155.1)         | 24.0 ms (19.6 to 84.6)            | 74.0 ms (4.1x)       |

**Ship rule (plan M3-T1):** ship only if the saving exceeds the spread of the before-arm's repeats. Taking the spread
as the standard deviation of the wide arm (24.4 ms and 27.8 ms), the savings of 172 ms and 74 ms are 7.0x and 2.7x
that spread. The two arms' ranges do not overlap in run 1; in run 2 they overlap by one outlier (the slowest narrow
repeat, 84.6 ms, is above the fastest wide one, 75.8 ms). The rule is met in both runs on that reading, and the claim
made is the one the data supports: **the saving scales with the stored document size, and is zero when survivors
carry no history** (the narrow arm is flat at about 24 ms in both runs). Even the smaller document (2 KB, near the TOAST threshold) shows the narrow shape faster in every one of the 12 pairs, and in all 8 of run 1.
The narrow probe is the same size as the old probe against history-free survivors, which is the previously measured
case, so the change cannot make that case worse.

**Built.** The batch probe selects `NULL::jsonb AS changes` and an explicit column list in the `LATERAL`; the
single-object path is unchanged and still reads the document. Tenant scoping is unchanged: `organization_id` still
comes from the activity row (`a.organization_id`). A unit test passes `planRecord` a batch write and a latest entry
whose `changes` getter throws, so the day a batch starts reading the document the build says so instead of the
recorder planning against a `NULL`. The statement count is unchanged (lock, probe, write).

The route-level arms (`placements`, `branchDelete`) were run on the narrowed code in the same invocation. Their
survivors have no history, so they are not expected to move and are not evidence for or against this change: 2,000
survivors, branch delete 110 to 113 ms without recording and 280 to 290 ms with; placements 387 to 400 ms without and
529 to 563 ms with. Those added times are larger than ADR-0174's 2026-10-04 figures (+98 to +114 ms and +68 to +80
ms) on a more heavily shared host, and are recorded here only so nobody compares them with the original run
unqualified.

## 2. #441: the baseline list's `_count` groups the whole table

**What Prisma emits** (captured with a query log, `findMany` with
`include: { _count: { select: { activities: { where: { deletedAt: null } } } } }`):

```sql
SELECT … , COALESCE("aggr_selection_0_BaselineActivity"."_aggr_count_activities", 0)
FROM "baselines" LEFT JOIN (
  SELECT "baseline_id", COUNT(*) AS "_aggr_count_activities" FROM "baseline_activities"
  WHERE "deleted_at" IS NULL GROUP BY "baseline_id"
) AS "aggr_selection_0_BaselineActivity" ON … WHERE … ORDER BY … LIMIT …
```

So the row's description is right: the grouped side has no `plan_id` or `baseline_id` predicate.

**Data:** 300 baselines across 10 plans, 1,700 live snapshot rows each, **510,000** `baseline_activities` rows
(129 MB with its indexes), `ANALYZE`d. The plan read is one plan's first page, 30 baselines.

**`EXPLAIN (ANALYZE, BUFFERS)` of the current shape:** `Parallel Seq Scan on baseline_activities` (170,000 rows per
worker, 9,273 buffers), `Partial HashAggregate`, `Finalize GroupAggregate`, then a `Nested Loop Left Join` against
the page. Execution **90.7 ms**. The whole table is aggregated to answer for 30 baselines.

**End to end through Prisma** (20 interleaved repeats each after warm-up, p50 and p95, same counts verified equal):

| Page                       | Current `_count` include | Keyed (`findMany` then `groupBy` on the page's ids) |
| -------------------------- | ------------------------ | --------------------------------------------------- |
| 3 baselines (5,100 rows)   | 68.8 ms (p95 107.3)      | 11.0 ms (p95 16.7)                                  |
| 10 baselines (17,000 rows) | 66.2 ms (p95 133.6)      | 22.0 ms (p95 37.2)                                  |
| 30 baselines (51,000 rows) | 67.3 ms (p95 93.8)       | 52.9 ms (p95 60.0)                                  |
| Single read (one baseline) | 6.9 ms (p95 22.1)        | 8.3 ms (p95 12.2) with a second `count` statement   |

- The current cost is **flat at about 67 ms whatever the page holds**, because it is set by the whole table. That is
  the install-wide scaling the spec's section 0 flagged: one tenant's list latency grows with every tenant's
  snapshots.
- The keyed count is cheaper at every page size measured and costs in proportion to the page's own rows. It served
  from `baseline_activities_baseline_id_source_activity_id_idx` (a `Bitmap Index Scan` per baseline), so **no index
  is needed and nothing went to database-architect**.
- The **single read does not benefit**: the planner already restricts that join, 6.9 ms against 8.3 ms with the extra
  statement. Building the spec's second half (`findActiveWithCountByIdInPlan`) would have made it slower, so it is
  **not built**. This is the point of measuring the remedy (ADR-0142) rather than the problem alone.
- **Small-install cost was not separated cleanly.** An attempt to shrink the table to about 5,100 rows inside a
  rolled-back transaction left the heap at 9,324 pages of dead tuples, so both shapes seq-scanned the same pages
  (23.3 ms and 25.1 ms) and the comparison says nothing. It was rolled back. What bounds the small-install cost is
  the added statement, one round trip, which the single-read pair above prices at under 2 ms.

**Decision bar (plan M3-T2):** build if the grouped side aggregates beyond the page's baselines **and** the read is
over 20 ms at that size. Both hold (67 ms; the whole table). **Built for the list only**
(`BaselineRepository.findManyActiveByPlan`): the page is read without `_count`, then one `groupBy` restricted to the
page's ids with `deletedAt: null` stated at the query (ADR-0172), skipped for an empty page. Ids with no live rows
report 0.
