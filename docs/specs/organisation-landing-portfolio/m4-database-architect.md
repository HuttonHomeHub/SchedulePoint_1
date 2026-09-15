# M4-T2 — database-architect measurements (2026-09-15)

PostgreSQL 16.13, `postgresql://app:app@localhost:5432/app`, random_page_cost=4, shared_buffers=128MB,
jit_above_cost=100000, jit_inline/optimize_above_cost=500000.
Bench orgs `…1789474820740`: typical 16x180, scale 10x2000, breadth 459x40, xl 3000x40.
`activities` 325,361 rows / 9,570 pages; `plan_id` correlation -0.028 (INTERLEAVED seeding).
`dependencies` and `baselines` were EMPTY as found.

## 1. Cost decomposition of the 578,024 (reproduced exactly)

plans/projects/clients nested loop 207.81 0.04%
3,000 x Aggregate(184.33) over activities 552,990 95.7%
3,000 x dependencies lateral (0.025) 75 0.01%
3,000 x baselines lateral (8.18) 24,540 4.2%
WindowAgg + Sort 165
JIT timing on that run: Generation 3.8 + Inlining 88.1 + Optimization 307.3 + Emission 205.4
= 604.7 ms of 770 ms wall clock (78%). Cost also crosses the 500,000 inline/optimize thresholds.

## 2. Final sweep, both index shapes (interleaved heap, child tables empty = the harness's world)

shape ADR-0098 as shipped extended with INCLUDE factor
typical(16x180) 3,103.37 no JIT 3.1ms 251.40 no JIT 1.8ms 12.3x
scale(10x2000) 1,943.82 no JIT 10.2ms 161.34 no JIT 4.8ms 12.1x
breadth(459x40) 88,766.03 no JIT 20.7ms 6,950.20 no JIT 13.4ms 12.8x
xl(3000x40) 580,134.48 JIT 750ms 45,812.52 no JIT 76.5ms 12.7x
Identical figures with dependencies at 1.60/activity + one active baseline per plan (<0.1% change).

## 3. Clustered heap (production-like layout, correlation 1.0)

typical 1,615.69 / scale 1,014.02 / breadth 46,088.31 / xl 301,195.20 (JIT, 196ms) [as shipped]
typical 315.40 / scale 201.34 / breadth 8,786.20 / xl 57,812.52 (no JIT, 73ms) [extended]
Per-plan Aggregate 184.33 (interleaved) -> 91.35 (clustered). The cliff still fires at XL.

## 4. The cliff, located empirically (probe orgs of N plans x 40 activities)

N=460 85,779 no JIT 19.0ms | N=490 91,370 no JIT 24.3ms | N=510 95,097 no JIT 20.4ms
N=520 96,961 no JIT 22.3ms | N=560 104,415 JIT 83.2ms
Crossing at ~536 plans. +7.7% plans => +273% latency.

## 5. Estimate instability for a FIXED organisation

breadth (459 plans, data never changed) measured 85,816 / 88,484 / 88,766 / 95,602 (harness) /
102,513 across the session, purely from other tenants' rows and ANALYZE state. 19% swing; the top
of that range is over the bar.

## 6. Write cost: 5 date-moving recalculations of a 2,000-activity plan, fillfactor 90

variant HOT WAL/row index before -> after
ADR-0098 as shipped 28.4% 354 B 96 kB -> 184 kB (+92%)
extended with INCLUDE 0.0% 406 B 120 kB -> 656 kB (+447%)
HOT 0 of 10,000 is deterministic: btree INCLUDE columns are HOT-blocking in PG16.

## 7. Index size

(plan_id, updated_at DESC) WHERE deleted_at IS NULL 13,238,272 B 40.7 B/live row

- INCLUDE(early_finish + 4 flags) 19,177,472 B 58.9 B/live row (+45%)
  separate (plan_id) INCLUDE(6 cols) 19,177,472 B 58.9 B/live row
  Extending costs +18.2 B/live row; a separate index costs +58.9 B/live row and a second index to maintain.

## 8. Visibility-map decay (index-only scan), XL, no VACUUM

interleaved heap: 1 plan dirtied 1,400 heap fetches 125ms | 10 plans 13,987 98ms
300 plans 130,380 188ms | all 240,000, estimate 45,813->263,119, JIT, 311ms
clustered heap: 1 plan dirtied 95 heap fetches 80ms

## 9. Declines

- baselines (plan_id) INCLUDE(name, captured_project_finish, hours_per_day_minutes)
  WHERE is_active AND deleted_at IS NULL -- CHOSEN by the planner, cost UNCHANGED at 8.30/plan,
  total unchanged at 68,668.81. 312 kB for zero. Declined.
- separate new covering index -- identical plan and identical cost to extending; 3.2x the disk
  and a second index on the write path. Declined in favour of extending.

## 10. Rewrites measured (no index change)

set-aggregate, no org filter : 2,939 / 1,845 / 14,470 / 16,652 -- but Parallel Seq Scan over the
WHOLE activities table: 7.2 / 40 / 140 / 108 ms. O(table), not O(org). Disqualifying.
set-aggregate + org filter : 747 / 1,824 / 10,516 / 15,219, no JIT, but 14.9 / 87 / 49 / 150 ms
-- slower in wall clock at three of four shapes.
rank by last_touched_at, aggregate only the 8: 4,008 at XL, 42 ms -- but withdraws the slip rank.

## 11. ADR-0098 recently-changed query -- no regression from extending

typical 156.72 -> 156.71 | breadth 4,234.67 -> 4,234.40 | xl 27,642.08 -> 27,640.30
0.912/11.880/56.351 ms -> 1.189/13.670/52.631 ms (indistinguishable).

## Database restored

dependencies 0, baselines 0, no probe/neighbour orgs, act_clone dropped, no candidate indexes,
`idx_activities_plan_updated_at` back to the ADR-0098 definition, plan_id correlation -0.0038.
NOTE: the heap was CLUSTERED and then re-clustered on activities_pkey to restore the interleaving;
the four shapes re-measure at 3,103 / 1,944 / 88,766 / 580,134 (XL matches the harness to 0.4%,
breadth reads 7% lower than the harness's 95,602 -- ANALYZE-state drift).
