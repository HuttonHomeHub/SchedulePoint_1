# M0-T4 — `GET …/overview`, measured for the first time

- **Taken:** 2026-09-15T11:29:25.985Z
- **Reps:** 30 after 5 warm-up, per shape
- **Paced:** one request per 660 ms — the endpoint is behind the global 100/60 s throttle, so these are NOT back-to-back
- **Shapes:** ADR-0098's own, from the index migration's measurement table
- **Seeding:** organisations/clients/projects via the REST API; plans and activities bulk-inserted in SQL (see the docblock)

## FC-2 — endpoint latency (bar: p95 < 200 ms)

| Shape                 | Plans | Activities | Rows returned |  p50 | **p95** | min–max   | Verdict  |
| --------------------- | ----: | ---------: | ------------: | ---: | ------: | --------- | -------- |
| typical installation  |    16 |       2880 |             8 | 20.4 |    25.7 | 15.1–45.8 | **PASS** |
| scale tier (ADR-0066) |    10 |      20000 |             8 | 28.5 |    32.3 | 26.9–32.5 | **PASS** |
| breadth               |   459 |      18360 |             8 | 37.2 |    51.9 | 32.3–64.0 | **PASS** |
| extra-large           |  3000 |     120000 |             8 | 45.5 |    59.3 | 41.5–72.8 | **PASS** |

The min–max column is the run-to-run spread. A later delta smaller than it is **INDETERMINATE**, not a pass (ADR-0128).

## FC-3 — no JIT cliff (bar: no `JIT:` node, estimated total cost < 100,000)

| Shape                 | Estimated total cost | `jit_above_cost` | `JIT:` node? | Verdict  |
| --------------------- | -------------------: | ---------------: | ------------ | -------- |
| typical installation  |                   88 |           100000 | no           | **PASS** |
| scale tier (ADR-0066) |                   50 |           100000 | no           | **PASS** |
| breadth               |                 2155 |           100000 | no           | **PASS** |
| extra-large           |                13951 |           100000 | no           | **PASS** |

## FC-3 (M3) — the standing query, same bar

| Shape                 | Plans graded | Estimated total cost | `JIT:` node? | Verdict  |
| --------------------- | -----------: | -------------------: | ------------ | -------- |
| typical installation  |            8 |                 3185 | no           | **PASS** |
| scale tier (ADR-0066) |            8 |                 3853 | no           | **PASS** |
| breadth               |            8 |                 2438 | no           | **PASS** |
| extra-large           |            8 |                 1388 | no           | **PASS** |

The standing read is bounded by the recently-changed page (≤ 8 plans), so its cost should be flat across shapes. A cost that tracks the shape means the aggregate is not using the plan-id filter, which is the failure the milestone stops on.

## `EXPLAIN (ANALYZE, BUFFERS)` per shape

### typical installation

```
Limit  (cost=88.15..88.17 rows=8 width=123) (actual time=0.442..0.444 rows=8 loops=1)
  Buffers: shared hit=89
  ->  Sort  (cost=88.15..88.19 rows=16 width=123) (actual time=0.441..0.442 rows=8 loops=1)
        Sort Key: (GREATEST(p.updated_at, COALESCE(act.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: quicksort  Memory: 29kB
        Buffers: shared hit=89
        ->  Nested Loop Left Join  (cost=0.42..87.83 rows=16 width=123) (actual time=0.142..0.407 rows=16 loops=1)
              Buffers: shared hit=83
              ->  Nested Loop Left Join  (cost=0.41..87.27 rows=16 width=165) (actual time=0.112..0.352 rows=16 loops=1)
                    Buffers: shared hit=83
                    ->  Nested Loop  (cost=0.00..3.73 rows=16 width=124) (actual time=0.061..0.104 rows=16 loops=1)
                          Join Filter: (pr.id = p.project_id)
                          Rows Removed by Join Filter: 128
                          Buffers: shared hit=19
                          ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.017..0.032 rows=9 loops=1)
                                Join Filter: (cl.id = pr.client_id)
                                Rows Removed by Join Filter: 36
                                Buffers: shared hit=10
                                ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.011..0.012 rows=9 loops=1)
                                      Buffers: shared hit=1
                                ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=5 loops=9)
                                      Buffers: shared hit=9
                          ->  Seq Scan on plans p  (cost=0.00..1.50 rows=16 width=98) (actual time=0.003..0.007 rows=16 loops=9)
                                Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus") AND (organization_id = '01a0a4d4-341c-7680-89c6-467e4aa9cee7'::uuid))
                                Rows Removed by Filter: 17
                                Buffers: shared hit=9
                    ->  Limit  (cost=0.41..5.21 rows=1 width=41) (actual time=0.015..0.015 rows=1 loops=16)
                          Buffers: shared hit=64
                          ->  Index Scan using idx_activities_plan_updated_at on activities act  (cost=0.41..841.08 rows=175 width=41) (actual time=0.015..0.015 rows=1 loops=16)
                                Index Cond: (plan_id = p.id)
                                Buffers: shared hit=64
              ->  Limit  (cost=0.01..0.02 rows=1 width=41) (actual time=0.003..0.003 rows=0 loops=16)
                    ->  Sort  (cost=0.01..0.02 rows=1 width=41) (actual time=0.003..0.003 rows=0 loops=16)
                          Sort Key: dep.updated_at DESC
                          Sort Method: quicksort  Memory: 25kB
                          ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=41) (actual time=0.001..0.001 rows=0 loops=16)
                                Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
Planning:
  Buffers: shared hit=741
Planning Time: 2.301 ms
Execution Time: 0.572 ms
```

### scale tier (ADR-0066)

```
Limit  (cost=50.10..50.12 rows=8 width=123) (actual time=0.347..0.349 rows=8 loops=1)
  Buffers: shared hit=74
  ->  Sort  (cost=50.10..50.12 rows=10 width=123) (actual time=0.346..0.348 rows=8 loops=1)
        Sort Key: (GREATEST(p.updated_at, COALESCE(act.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: quicksort  Memory: 27kB
        Buffers: shared hit=74
        ->  Nested Loop Left Join  (cost=0.42..49.93 rows=10 width=123) (actual time=0.164..0.310 rows=10 loops=1)
              Buffers: shared hit=68
              ->  Nested Loop Left Join  (cost=0.41..49.58 rows=10 width=165) (actual time=0.133..0.264 rows=10 loops=1)
                    Buffers: shared hit=68
                    ->  Nested Loop  (cost=0.00..4.80 rows=10 width=124) (actual time=0.086..0.120 rows=10 loops=1)
                          Join Filter: (pr.id = p.project_id)
                          Rows Removed by Join Filter: 80
                          Buffers: shared hit=28
                          ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.018..0.033 rows=9 loops=1)
                                Join Filter: (cl.id = pr.client_id)
                                Rows Removed by Join Filter: 36
                                Buffers: shared hit=10
                                ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.011..0.012 rows=9 loops=1)
                                      Buffers: shared hit=1
                                ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=5 loops=9)
                                      Buffers: shared hit=9
                          ->  Seq Scan on plans p  (cost=0.00..2.65 rows=10 width=98) (actual time=0.004..0.009 rows=10 loops=9)
                                Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus") AND (organization_id = '01a0a4d4-34f4-7c63-ba4e-7f386a43b8aa'::uuid))
                                Rows Removed by Filter: 33
                                Buffers: shared hit=18
                    ->  Limit  (cost=0.41..4.47 rows=1 width=41) (actual time=0.014..0.014 rows=1 loops=10)
                          Buffers: shared hit=40
                          ->  Index Scan using idx_activities_plan_updated_at on activities act  (cost=0.41..2429.72 rows=599 width=41) (actual time=0.014..0.014 rows=1 loops=10)
                                Index Cond: (plan_id = p.id)
                                Buffers: shared hit=40
              ->  Limit  (cost=0.01..0.02 rows=1 width=41) (actual time=0.004..0.004 rows=0 loops=10)
                    ->  Sort  (cost=0.01..0.02 rows=1 width=41) (actual time=0.004..0.004 rows=0 loops=10)
                          Sort Key: dep.updated_at DESC
                          Sort Method: quicksort  Memory: 25kB
                          ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=41) (actual time=0.001..0.001 rows=0 loops=10)
                                Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
Planning:
  Buffers: shared hit=741
Planning Time: 2.149 ms
Execution Time: 0.481 ms
```

### breadth

```
Limit  (cost=2155.13..2155.15 rows=8 width=124) (actual time=5.186..5.189 rows=8 loops=1)
  Buffers: shared hit=1987
  ->  Sort  (cost=2155.13..2156.28 rows=459 width=124) (actual time=5.184..5.186 rows=8 loops=1)
        Sort Key: (GREATEST(p.updated_at, COALESCE(act.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: top-N heapsort  Memory: 28kB
        Buffers: shared hit=1987
        ->  Nested Loop Left Join  (cost=0.42..2145.95 rows=459 width=124) (actual time=1.082..4.985 rows=459 loops=1)
              Buffers: shared hit=1981
              ->  Nested Loop Left Join  (cost=0.41..2129.88 rows=459 width=166) (actual time=1.055..4.131 rows=459 loops=1)
                    Buffers: shared hit=1981
                    ->  Nested Loop  (cost=0.00..30.30 rows=459 width=125) (actual time=0.999..1.522 rows=459 loops=1)
                          Join Filter: (pr.id = p.project_id)
                          Rows Removed by Join Filter: 3672
                          Buffers: shared hit=145
                          ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.017..0.038 rows=9 loops=1)
                                Join Filter: (cl.id = pr.client_id)
                                Rows Removed by Join Filter: 36
                                Buffers: shared hit=10
                                ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.011..0.012 rows=9 loops=1)
                                      Buffers: shared hit=1
                                ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=5 loops=9)
                                      Buffers: shared hit=9
                          ->  Seq Scan on plans p  (cost=0.00..22.53 rows=459 width=99) (actual time=0.008..0.137 rows=459 loops=9)
                                Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus") AND (organization_id = '01a0a4d4-3536-7be3-a455-2a1068bed5c7'::uuid))
                                Rows Removed by Filter: 43
                                Buffers: shared hit=135
                    ->  Limit  (cost=0.41..4.56 rows=1 width=41) (actual time=0.005..0.005 rows=1 loops=459)
                          Buffers: shared hit=1836
                          ->  Index Scan using idx_activities_plan_updated_at on activities act  (cost=0.41..365.55 rows=88 width=41) (actual time=0.005..0.005 rows=1 loops=459)
                                Index Cond: (plan_id = p.id)
                                Buffers: shared hit=1836
              ->  Limit  (cost=0.01..0.02 rows=1 width=41) (actual time=0.001..0.001 rows=0 loops=459)
                    ->  Sort  (cost=0.01..0.02 rows=1 width=41) (actual time=0.001..0.001 rows=0 loops=459)
                          Sort Key: dep.updated_at DESC
                          Sort Method: quicksort  Memory: 25kB
                          ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=41) (actual time=0.000..0.000 rows=0 loops=459)
                                Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
Planning:
  Buffers: shared hit=771
Planning Time: 2.308 ms
Execution Time: 5.334 ms
```

### extra-large

```
Limit  (cost=13950.91..13950.93 rows=8 width=125) (actual time=34.808..34.813 rows=8 loops=1)
  Buffers: shared hit=12943
  ->  Sort  (cost=13950.91..13958.41 rows=3000 width=125) (actual time=34.807..34.811 rows=8 loops=1)
        Sort Key: (GREATEST(p.updated_at, COALESCE(act.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: top-N heapsort  Memory: 28kB
        Buffers: shared hit=12943
        ->  Nested Loop Left Join  (cost=0.43..13890.91 rows=3000 width=125) (actual time=8.231..33.578 rows=3000 loops=1)
              Buffers: shared hit=12937
              ->  Nested Loop Left Join  (cost=0.42..13785.91 rows=3000 width=167) (actual time=8.197..28.833 rows=3000 loops=1)
                    Buffers: shared hit=12937
                    ->  Nested Loop  (cost=0.00..195.06 rows=3000 width=126) (actual time=8.123..10.809 rows=3000 loops=1)
                          Join Filter: (pr.id = p.project_id)
                          Rows Removed by Join Filter: 24000
                          Buffers: shared hit=937
                          ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.020..0.061 rows=9 loops=1)
                                Join Filter: (cl.id = pr.client_id)
                                Rows Removed by Join Filter: 36
                                Buffers: shared hit=10
                                ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.012..0.015 rows=9 loops=1)
                                      Buffers: shared hit=1
                                ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=5 loops=9)
                                      Buffers: shared hit=9
                          ->  Seq Scan on plans p  (cost=0.00..155.53 rows=3000 width=100) (actual time=0.073..0.992 rows=3000 loops=9)
                                Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus") AND (organization_id = '01a0a4d4-3575-7310-8835-d3a3aa2c8c65'::uuid))
                                Rows Removed by Filter: 502
                                Buffers: shared hit=927
                    ->  Limit  (cost=0.42..4.52 rows=1 width=41) (actual time=0.006..0.006 rows=1 loops=3000)
                          Buffers: shared hit=12000
                          ->  Index Scan using idx_activities_plan_updated_at on activities act  (cost=0.42..193.13 rows=47 width=41) (actual time=0.005..0.005 rows=1 loops=3000)
                                Index Cond: (plan_id = p.id)
                                Buffers: shared hit=12000
              ->  Limit  (cost=0.01..0.02 rows=1 width=41) (actual time=0.001..0.001 rows=0 loops=3000)
                    ->  Sort  (cost=0.01..0.02 rows=1 width=41) (actual time=0.001..0.001 rows=0 loops=3000)
                          Sort Key: dep.updated_at DESC
                          Sort Method: quicksort  Memory: 25kB
                          ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=41) (actual time=0.000..0.000 rows=0 loops=3000)
                                Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
Planning:
  Buffers: shared hit=771
Planning Time: 2.380 ms
Execution Time: 35.035 ms
```
