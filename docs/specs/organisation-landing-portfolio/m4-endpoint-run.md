# M0-T4 — `GET …/overview`, measured for the first time

- **Taken:** 2026-09-15T12:20:24.282Z
- **Reps:** 30 after 5 warm-up, per shape
- **Paced:** one request per 660 ms — the endpoint is behind the global 100/60 s throttle, so these are NOT back-to-back
- **Shapes:** ADR-0098's own, from the index migration's measurement table
- **Seeding:** organisations/clients/projects via the REST API; plans and activities bulk-inserted in SQL (see the docblock)

## FC-2 — endpoint latency (bar: p95 < 200 ms)

| Shape                 | Plans | Activities | Rows returned |  p50 | **p95** | min–max   | Verdict  |
| --------------------- | ----: | ---------: | ------------: | ---: | ------: | --------- | -------- |
| typical installation  |    16 |       2880 |             8 | 19.1 |    23.2 | 16.5–25.9 | **PASS** |
| scale tier (ADR-0066) |    10 |      20000 |             8 | 25.5 |    30.5 | 22.0–30.7 | **PASS** |
| breadth               |   459 |      18360 |             8 | 24.6 |    31.4 | 20.2–33.4 | **PASS** |
| extra-large           |  3000 |     120000 |             8 | 50.8 |    60.9 | 47.3–78.9 | **PASS** |

The min–max column is the run-to-run spread. A later delta smaller than it is **INDETERMINATE**, not a pass (ADR-0128).

## FC-3 — no JIT cliff (bar: no `JIT:` node, estimated total cost < 100,000)

| Shape                 | Estimated total cost | `jit_above_cost` | `JIT:` node? | Verdict  |
| --------------------- | -------------------: | ---------------: | ------------ | -------- |
| typical installation  |                   84 |           100000 | no           | **PASS** |
| scale tier (ADR-0066) |                   56 |           100000 | no           | **PASS** |
| breadth               |                 2137 |           100000 | no           | **PASS** |
| extra-large           |                13973 |           100000 | no           | **PASS** |

## FC-3 (M3) — the standing query, same bar

| Shape                 | Plans graded | Estimated total cost | `JIT:` node? | Verdict  |
| --------------------- | -----------: | -------------------: | ------------ | -------- |
| typical installation  |            8 |                  201 | no           | **PASS** |
| scale tier (ADR-0066) |            8 |                  222 | no           | **PASS** |
| breadth               |            8 |                  245 | no           | **PASS** |
| extra-large           |            8 |                  642 | no           | **PASS** |

The standing read is bounded by the recently-changed page (≤ 8 plans), so its cost should be flat across shapes. A cost that tracks the shape means the aggregate is not using the plan-id filter, which is the failure the milestone stops on.

## FC-3 (M4) — the ORG-WIDE standing query, same bar

| Shape                 | Rows after cap | Estimated total cost | `JIT:` node? | Verdict  |
| --------------------- | -------------: | -------------------: | ------------ | -------- |
| typical installation  |              8 |                 3051 | no           | **PASS** |
| scale tier (ADR-0066) |              8 |                 2129 | no           | **PASS** |
| breadth               |              8 |                95602 | no           | **PASS** |
| extra-large           |              8 |               578024 | **yes**      | **FAIL** |

This is the rung M4 is gated on, and the one whose cost is **expected** to track the shape — it computes the aggregate for every plan in the organisation before the cap chooses eight. The question is not whether it grows but whether it crosses `jit_above_cost` (100,000) at the extra-large shape. **If it does, R3 is withdrawn with this number recorded, not tuned.**

## `EXPLAIN (ANALYZE, BUFFERS)` — the org-wide variant, per shape

### typical installation — org-wide standing

```
Limit  (cost=3051.41..3051.43 rows=8 width=253) (actual time=2.335..2.338 rows=8 loops=1)
  Buffers: shared hit=238
  ->  Sort  (cost=3051.41..3051.45 rows=16 width=253) (actual time=2.334..2.336 rows=8 loops=1)
        Sort Key: (((max(act.early_finish)) - bl.captured_project_finish)) DESC NULLS LAST, ((((COALESCE((count(*) FILTER (WHERE act.constraint_violated)), '0'::bigint) + COALESCE((count(*) FILTER (WHERE act.loe_no_span)), '0'::bigint)) + COALESCE((count(*) FILTER (WHERE act.resource_driver_missing)), '0'::bigint)) + COALESCE((count(*) FILTER (WHERE act.visual_conflict)), '0'::bigint))) DESC, (GREATEST(p.updated_at, COALESCE((max(act.updated_at)), '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: quicksort  Memory: 29kB
        Buffers: shared hit=238
        ->  WindowAgg  (cost=182.18..3051.09 rows=16 width=253) (actual time=2.252..2.261 rows=16 loops=1)
              Buffers: shared hit=226
              ->  Nested Loop Left Join  (cost=182.18..3050.53 rows=16 width=193) (actual time=0.345..2.222 rows=16 loops=1)
                    Buffers: shared hit=226
                    ->  Nested Loop Left Join  (cost=182.04..2919.65 rows=16 width=153) (actual time=0.329..2.185 rows=16 loops=1)
                          Buffers: shared hit=210
                          ->  Nested Loop Left Join  (cost=182.03..2919.25 rows=16 width=145) (actual time=0.308..2.127 rows=16 loops=1)
                                Buffers: shared hit=210
                                ->  Nested Loop  (cost=0.28..10.83 rows=16 width=93) (actual time=0.133..0.190 rows=16 loops=1)
                                      Join Filter: (pr.id = p.project_id)
                                      Rows Removed by Join Filter: 192
                                      Buffers: shared hit=53
                                      ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.019..0.050 rows=13 loops=1)
                                            Join Filter: (cl.id = pr.client_id)
                                            Rows Removed by Join Filter: 78
                                            Buffers: shared hit=14
                                            ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.010..0.013 rows=13 loops=1)
                                                  Buffers: shared hit=1
                                            ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=7 loops=13)
                                                  Buffers: shared hit=13
                                      ->  Index Scan using plans_organization_id_idx on plans p  (cost=0.28..8.60 rows=16 width=83) (actual time=0.004..0.009 rows=16 loops=13)
                                            Index Cond: (organization_id = '01a0a502-ddff-7fb1-a3d4-ce7100f0a400'::uuid)
                                            Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus"))
                                            Buffers: shared hit=39
                                ->  Aggregate  (cost=181.75..181.76 rows=1 width=52) (actual time=0.120..0.120 rows=1 loops=16)
                                      Buffers: shared hit=157
                                      ->  Bitmap Heap Scan on activities act  (cost=4.78..180.92 rows=47 width=16) (actual time=0.030..0.103 rows=180 loops=16)
                                            Recheck Cond: ((plan_id = p.id) AND (deleted_at IS NULL))
                                            Heap Blocks: exact=100
                                            Buffers: shared hit=157
                                            ->  Bitmap Index Scan on idx_activities_plan_updated_at  (cost=0.00..4.77 rows=47 width=0) (actual time=0.026..0.026 rows=180 loops=16)
                                                  Index Cond: (plan_id = p.id)
                                                  Buffers: shared hit=57
                          ->  Limit  (cost=0.01..0.02 rows=1 width=8) (actual time=0.003..0.003 rows=0 loops=16)
                                ->  Sort  (cost=0.01..0.02 rows=1 width=8) (actual time=0.003..0.003 rows=0 loops=16)
                                      Sort Key: dep.updated_at DESC
                                      Sort Method: quicksort  Memory: 25kB
                                      ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=8) (actual time=0.000..0.000 rows=0 loops=16)
                                            Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
                    ->  Limit  (cost=0.14..8.16 rows=1 width=40) (actual time=0.002..0.002 rows=0 loops=16)
                          Buffers: shared hit=16
                          ->  Index Scan using uq_baselines_plan_name on baselines bl  (cost=0.14..8.16 rows=1 width=40) (actual time=0.002..0.002 rows=0 loops=16)
                                Index Cond: (plan_id = p.id)
                                Filter: is_active
                                Buffers: shared hit=16
Planning:
  Buffers: shared hit=965
Planning Time: 2.872 ms
Execution Time: 2.670 ms
```

### scale tier (ADR-0066) — org-wide standing

```
Limit  (cost=2128.65..2128.67 rows=8 width=253) (actual time=12.074..12.080 rows=8 loops=1)
  Buffers: shared hit=871
  ->  Sort  (cost=2128.65..2128.67 rows=10 width=253) (actual time=12.073..12.077 rows=8 loops=1)
        Sort Key: (((max(act.early_finish)) - bl.captured_project_finish)) DESC NULLS LAST, ((((COALESCE((count(*) FILTER (WHERE act.constraint_violated)), '0'::bigint) + COALESCE((count(*) FILTER (WHERE act.loe_no_span)), '0'::bigint)) + COALESCE((count(*) FILTER (WHERE act.resource_driver_missing)), '0'::bigint)) + COALESCE((count(*) FILTER (WHERE act.visual_conflict)), '0'::bigint))) DESC, (GREATEST(p.updated_at, COALESCE((max(act.updated_at)), '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: quicksort  Memory: 27kB
        Buffers: shared hit=871
        ->  WindowAgg  (cost=203.95..2128.48 rows=10 width=253) (actual time=11.970..11.980 rows=10 loops=1)
              Buffers: shared hit=859
              ->  Nested Loop Left Join  (cost=203.95..2128.13 rows=10 width=193) (actual time=1.254..11.910 rows=10 loops=1)
                    Buffers: shared hit=859
                    ->  Nested Loop Left Join  (cost=203.80..2046.33 rows=10 width=153) (actual time=1.235..11.845 rows=10 loops=1)
                          Buffers: shared hit=849
                          ->  Nested Loop Left Join  (cost=203.79..2046.08 rows=10 width=145) (actual time=1.205..11.730 rows=10 loops=1)
                                Buffers: shared hit=849
                                ->  Nested Loop  (cost=0.28..10.64 rows=10 width=93) (actual time=0.122..0.184 rows=10 loops=1)
                                      Join Filter: (pr.id = p.project_id)
                                      Rows Removed by Join Filter: 120
                                      Buffers: shared hit=53
                                      ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.024..0.058 rows=13 loops=1)
                                            Join Filter: (cl.id = pr.client_id)
                                            Rows Removed by Join Filter: 78
                                            Buffers: shared hit=14
                                            ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.016..0.020 rows=13 loops=1)
                                                  Buffers: shared hit=1
                                            ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=7 loops=13)
                                                  Buffers: shared hit=13
                                      ->  Index Scan using plans_organization_id_idx on plans p  (cost=0.28..8.48 rows=10 width=83) (actual time=0.004..0.008 rows=10 loops=13)
                                            Index Cond: (organization_id = '01a0a502-df25-74d3-998c-4a02332d5c41'::uuid)
                                            Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus"))
                                            Buffers: shared hit=39
                                ->  Aggregate  (cost=203.51..203.52 rows=1 width=52) (actual time=1.153..1.153 rows=1 loops=10)
                                      Buffers: shared hit=796
                                      ->  Bitmap Heap Scan on activities act  (cost=4.83..202.59 rows=53 width=16) (actual time=0.167..0.988 rows=2000 loops=10)
                                            Recheck Cond: ((plan_id = p.id) AND (deleted_at IS NULL))
                                            Heap Blocks: exact=598
                                            Buffers: shared hit=796
                                            ->  Bitmap Index Scan on idx_activities_plan_updated_at  (cost=0.00..4.82 rows=53 width=0) (actual time=0.153..0.153 rows=2000 loops=10)
                                                  Index Cond: (plan_id = p.id)
                                                  Buffers: shared hit=198
                          ->  Limit  (cost=0.01..0.02 rows=1 width=8) (actual time=0.009..0.009 rows=0 loops=10)
                                ->  Sort  (cost=0.01..0.02 rows=1 width=8) (actual time=0.008..0.008 rows=0 loops=10)
                                      Sort Key: dep.updated_at DESC
                                      Sort Method: quicksort  Memory: 25kB
                                      ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=8) (actual time=0.001..0.001 rows=0 loops=10)
                                            Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
                    ->  Limit  (cost=0.14..8.16 rows=1 width=40) (actual time=0.005..0.005 rows=0 loops=10)
                          Buffers: shared hit=10
                          ->  Index Scan using uq_baselines_plan_name on baselines bl  (cost=0.14..8.16 rows=1 width=40) (actual time=0.004..0.004 rows=0 loops=10)
                                Index Cond: (plan_id = p.id)
                                Filter: is_active
                                Buffers: shared hit=10
Planning:
  Buffers: shared hit=965
Planning Time: 2.948 ms
Execution Time: 12.398 ms
```

### breadth — org-wide standing

```
Limit  (cost=95601.83..95601.85 rows=8 width=253) (actual time=22.455..22.461 rows=8 loops=1)
  Buffers: shared hit=3059
  ->  Sort  (cost=95601.83..95602.97 rows=459 width=253) (actual time=22.454..22.459 rows=8 loops=1)
        Sort Key: (((max(act.early_finish)) - bl.captured_project_finish)) DESC NULLS LAST, ((((COALESCE((count(*) FILTER (WHERE act.constraint_violated)), '0'::bigint) + COALESCE((count(*) FILTER (WHERE act.loe_no_span)), '0'::bigint)) + COALESCE((count(*) FILTER (WHERE act.resource_driver_missing)), '0'::bigint)) + COALESCE((count(*) FILTER (WHERE act.visual_conflict)), '0'::bigint))) DESC, (GREATEST(p.updated_at, COALESCE((max(act.updated_at)), '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: top-N heapsort  Memory: 28kB
        Buffers: shared hit=3059
        ->  WindowAgg  (cost=200.34..95592.65 rows=459 width=253) (actual time=21.846..22.002 rows=459 loops=1)
              Buffers: shared hit=3047
              ->  Nested Loop Left Join  (cost=200.34..95576.58 rows=459 width=193) (actual time=2.056..21.292 rows=459 loops=1)
                    Buffers: shared hit=3047
                    ->  Nested Loop Left Join  (cost=200.20..91821.96 rows=459 width=153) (actual time=2.033..20.405 rows=459 loops=1)
                          Buffers: shared hit=2588
                          ->  Nested Loop Left Join  (cost=200.19..91810.49 rows=459 width=145) (actual time=1.995..19.036 rows=459 loops=1)
                                Buffers: shared hit=2588
                                ->  Nested Loop  (cost=0.28..38.23 rows=459 width=93) (actual time=1.815..2.894 rows=459 loops=1)
                                      Join Filter: (pr.id = p.project_id)
                                      Rows Removed by Join Filter: 5508
                                      Buffers: shared hit=235
                                      ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.026..0.078 rows=13 loops=1)
                                            Join Filter: (cl.id = pr.client_id)
                                            Rows Removed by Join Filter: 78
                                            Buffers: shared hit=14
                                            ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.012..0.016 rows=13 loops=1)
                                                  Buffers: shared hit=1
                                            ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.002 rows=7 loops=13)
                                                  Buffers: shared hit=13
                                      ->  Index Scan using plans_organization_id_idx on plans p  (cost=0.28..30.46 rows=459 width=83) (actual time=0.007..0.186 rows=459 loops=13)
                                            Index Cond: (organization_id = '01a0a502-df82-7e93-b1bc-26bdd133ad78'::uuid)
                                            Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus"))
                                            Buffers: shared hit=221
                                ->  Aggregate  (cost=199.91..199.92 rows=1 width=52) (actual time=0.035..0.035 rows=1 loops=459)
                                      Buffers: shared hit=2353
                                      ->  Bitmap Heap Scan on activities act  (cost=4.82..199.00 rows=52 width=16) (actual time=0.014..0.029 rows=40 loops=459)
                                            Recheck Cond: ((plan_id = p.id) AND (deleted_at IS NULL))
                                            Heap Blocks: exact=974
                                            Buffers: shared hit=2353
                                            ->  Bitmap Index Scan on idx_activities_plan_updated_at  (cost=0.00..4.81 rows=52 width=0) (actual time=0.011..0.011 rows=40 loops=459)
                                                  Index Cond: (plan_id = p.id)
                                                  Buffers: shared hit=1379
                          ->  Limit  (cost=0.01..0.02 rows=1 width=8) (actual time=0.002..0.002 rows=0 loops=459)
                                ->  Sort  (cost=0.01..0.02 rows=1 width=8) (actual time=0.002..0.002 rows=0 loops=459)
                                      Sort Key: dep.updated_at DESC
                                      Sort Method: quicksort  Memory: 25kB
                                      ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=8) (actual time=0.000..0.000 rows=0 loops=459)
                                            Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
                    ->  Limit  (cost=0.14..8.16 rows=1 width=40) (actual time=0.002..0.002 rows=0 loops=459)
                          Buffers: shared hit=459
                          ->  Index Scan using uq_baselines_plan_name on baselines bl  (cost=0.14..8.16 rows=1 width=40) (actual time=0.001..0.001 rows=0 loops=459)
                                Index Cond: (plan_id = p.id)
                                Filter: is_active
                                Buffers: shared hit=459
Planning:
  Buffers: shared hit=965
Planning Time: 3.112 ms
Execution Time: 22.783 ms
```

### extra-large — org-wide standing

```
Limit  (cost=578024.30..578024.32 rows=8 width=253) (actual time=838.925..838.939 rows=8 loops=1)
  Buffers: shared hit=133253
  ->  Sort  (cost=578024.30..578031.80 rows=3000 width=253) (actual time=170.350..170.361 rows=8 loops=1)
        Sort Key: (((max(act.early_finish)) - bl.captured_project_finish)) DESC NULLS LAST, ((((COALESCE((count(*) FILTER (WHERE act.constraint_violated)), '0'::bigint) + COALESCE((count(*) FILTER (WHERE act.loe_no_span)), '0'::bigint)) + COALESCE((count(*) FILTER (WHERE act.resource_driver_missing)), '0'::bigint)) + COALESCE((count(*) FILTER (WHERE act.visual_conflict)), '0'::bigint))) DESC, (GREATEST(p.updated_at, COALESCE((max(act.updated_at)), '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: top-N heapsort  Memory: 28kB
        Buffers: shared hit=133253
        ->  WindowAgg  (cost=184.75..577964.30 rows=3000 width=253) (actual time=165.916..166.914 rows=3000 loops=1)
              Buffers: shared hit=133241
              ->  Nested Loop Left Join  (cost=184.75..577859.30 rows=3000 width=193) (actual time=8.809..163.197 rows=3000 loops=1)
                    Buffers: shared hit=133241
                    ->  Nested Loop Left Join  (cost=184.61..553319.30 rows=3000 width=153) (actual time=8.776..160.069 rows=3000 loops=1)
                          Buffers: shared hit=130241
                          ->  Nested Loop Left Join  (cost=184.60..553244.30 rows=3000 width=145) (actual time=8.739..154.659 rows=3000 loops=1)
                                Buffers: shared hit=130241
                                ->  Nested Loop  (cost=0.28..207.81 rows=3000 width=93) (actual time=8.173..11.185 rows=3000 loops=1)
                                      Join Filter: (pr.id = p.project_id)
                                      Rows Removed by Join Filter: 36000
                                      Buffers: shared hit=1223
                                      ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.046..0.118 rows=13 loops=1)
                                            Join Filter: (cl.id = pr.client_id)
                                            Rows Removed by Join Filter: 78
                                            Buffers: shared hit=14
                                            ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.023..0.032 rows=13 loops=1)
                                                  Buffers: shared hit=1
                                            ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.002 rows=7 loops=13)
                                                  Buffers: shared hit=13
                                      ->  Index Scan using plans_organization_id_idx on plans p  (cost=0.28..168.28 rows=3000 width=83) (actual time=0.010..0.698 rows=3000 loops=13)
                                            Index Cond: (organization_id = '01a0a502-dfd1-7543-808b-27893ba56056'::uuid)
                                            Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus"))
                                            Buffers: shared hit=1209
                                ->  Aggregate  (cost=184.32..184.33 rows=1 width=52) (actual time=0.047..0.047 rows=1 loops=3000)
                                      Buffers: shared hit=129018
                                      ->  Bitmap Heap Scan on activities act  (cost=4.79..183.49 rows=47 width=16) (actual time=0.011..0.044 rows=40 loops=3000)
                                            Recheck Cond: ((plan_id = p.id) AND (deleted_at IS NULL))
                                            Heap Blocks: exact=120000
                                            Buffers: shared hit=129018
                                            ->  Bitmap Index Scan on idx_activities_plan_updated_at  (cost=0.00..4.78 rows=47 width=0) (actual time=0.007..0.007 rows=40 loops=3000)
                                                  Index Cond: (plan_id = p.id)
                                                  Buffers: shared hit=9018
                          ->  Limit  (cost=0.01..0.02 rows=1 width=8) (actual time=0.001..0.001 rows=0 loops=3000)
                                ->  Sort  (cost=0.01..0.02 rows=1 width=8) (actual time=0.001..0.001 rows=0 loops=3000)
                                      Sort Key: dep.updated_at DESC
                                      Sort Method: quicksort  Memory: 25kB
                                      ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=8) (actual time=0.000..0.000 rows=0 loops=3000)
                                            Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
                    ->  Limit  (cost=0.14..8.16 rows=1 width=40) (actual time=0.001..0.001 rows=0 loops=3000)
                          Buffers: shared hit=3000
                          ->  Index Scan using uq_baselines_plan_name on baselines bl  (cost=0.14..8.16 rows=1 width=40) (actual time=0.001..0.001 rows=0 loops=3000)
                                Index Cond: (plan_id = p.id)
                                Filter: is_active
                                Buffers: shared hit=3000
Planning:
  Buffers: shared hit=965
Planning Time: 2.837 ms
JIT:
  Functions: 41
  Options: Inlining true, Optimization true, Expressions true, Deforming true
  Timing: Generation 3.575 ms, Inlining 170.264 ms, Optimization 298.309 ms, Emission 200.092 ms, Total 672.239 ms
Execution Time: 863.668 ms
```

## `EXPLAIN (ANALYZE, BUFFERS)` per shape

### typical installation

```
Limit  (cost=84.22..84.24 rows=8 width=125) (actual time=0.974..0.978 rows=8 loops=1)
  Buffers: shared hit=123
  ->  Sort  (cost=84.22..84.26 rows=16 width=125) (actual time=0.973..0.976 rows=8 loops=1)
        Sort Key: (GREATEST(p.updated_at, COALESCE(act.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: quicksort  Memory: 29kB
        Buffers: shared hit=123
        ->  Nested Loop Left Join  (cost=0.71..83.90 rows=16 width=125) (actual time=0.289..0.912 rows=16 loops=1)
              Buffers: shared hit=117
              ->  Nested Loop Left Join  (cost=0.70..83.34 rows=16 width=167) (actual time=0.257..0.830 rows=16 loops=1)
                    Buffers: shared hit=117
                    ->  Nested Loop  (cost=0.28..10.83 rows=16 width=126) (actual time=0.177..0.259 rows=16 loops=1)
                          Join Filter: (pr.id = p.project_id)
                          Rows Removed by Join Filter: 192
                          Buffers: shared hit=53
                          ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.026..0.066 rows=13 loops=1)
                                Join Filter: (cl.id = pr.client_id)
                                Rows Removed by Join Filter: 78
                                Buffers: shared hit=14
                                ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.015..0.017 rows=13 loops=1)
                                      Buffers: shared hit=1
                                ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=7 loops=13)
                                      Buffers: shared hit=13
                          ->  Index Scan using plans_organization_id_idx on plans p  (cost=0.28..8.60 rows=16 width=100) (actual time=0.006..0.013 rows=16 loops=13)
                                Index Cond: (organization_id = '01a0a502-ddff-7fb1-a3d4-ce7100f0a400'::uuid)
                                Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus"))
                                Buffers: shared hit=39
                    ->  Limit  (cost=0.42..4.52 rows=1 width=41) (actual time=0.035..0.035 rows=1 loops=16)
                          Buffers: shared hit=64
                          ->  Index Scan using idx_activities_plan_updated_at on activities act  (cost=0.42..193.21 rows=47 width=41) (actual time=0.034..0.034 rows=1 loops=16)
                                Index Cond: (plan_id = p.id)
                                Buffers: shared hit=64
              ->  Limit  (cost=0.01..0.02 rows=1 width=41) (actual time=0.004..0.004 rows=0 loops=16)
                    ->  Sort  (cost=0.01..0.02 rows=1 width=41) (actual time=0.003..0.003 rows=0 loops=16)
                          Sort Key: dep.updated_at DESC
                          Sort Method: quicksort  Memory: 25kB
                          ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=41) (actual time=0.001..0.001 rows=0 loops=16)
                                Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
Planning:
  Buffers: shared hit=771
Planning Time: 3.906 ms
Execution Time: 1.179 ms
```

### scale tier (ADR-0066)

```
Limit  (cost=56.19..56.21 rows=8 width=125) (actual time=0.530..0.533 rows=8 loops=1)
  Buffers: shared hit=99
  ->  Sort  (cost=56.19..56.21 rows=10 width=125) (actual time=0.529..0.531 rows=8 loops=1)
        Sort Key: (GREATEST(p.updated_at, COALESCE(act.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: quicksort  Memory: 27kB
        Buffers: shared hit=99
        ->  Nested Loop Left Join  (cost=0.71..56.02 rows=10 width=125) (actual time=0.210..0.484 rows=10 loops=1)
              Buffers: shared hit=93
              ->  Nested Loop Left Join  (cost=0.70..55.67 rows=10 width=167) (actual time=0.187..0.446 rows=10 loops=1)
                    Buffers: shared hit=93
                    ->  Nested Loop  (cost=0.28..10.64 rows=10 width=126) (actual time=0.122..0.152 rows=10 loops=1)
                          Join Filter: (pr.id = p.project_id)
                          Rows Removed by Join Filter: 120
                          Buffers: shared hit=53
                          ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.020..0.047 rows=13 loops=1)
                                Join Filter: (cl.id = pr.client_id)
                                Rows Removed by Join Filter: 78
                                Buffers: shared hit=14
                                ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.012..0.013 rows=13 loops=1)
                                      Buffers: shared hit=1
                                ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=7 loops=13)
                                      Buffers: shared hit=13
                          ->  Index Scan using plans_organization_id_idx on plans p  (cost=0.28..8.48 rows=10 width=100) (actual time=0.004..0.007 rows=10 loops=13)
                                Index Cond: (organization_id = '01a0a502-df25-74d3-998c-4a02332d5c41'::uuid)
                                Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus"))
                                Buffers: shared hit=39
                    ->  Limit  (cost=0.42..4.49 rows=1 width=41) (actual time=0.029..0.029 rows=1 loops=10)
                          Buffers: shared hit=40
                          ->  Index Scan using idx_activities_plan_updated_at on activities act  (cost=0.42..216.31 rows=53 width=41) (actual time=0.029..0.029 rows=1 loops=10)
                                Index Cond: (plan_id = p.id)
                                Buffers: shared hit=40
              ->  Limit  (cost=0.01..0.02 rows=1 width=41) (actual time=0.003..0.003 rows=0 loops=10)
                    ->  Sort  (cost=0.01..0.02 rows=1 width=41) (actual time=0.003..0.003 rows=0 loops=10)
                          Sort Key: dep.updated_at DESC
                          Sort Method: quicksort  Memory: 25kB
                          ->  Seq Scan on dependencies dep  (cost=0.00..0.00 rows=1 width=41) (actual time=0.001..0.001 rows=0 loops=10)
                                Filter: ((deleted_at IS NULL) AND (plan_id = p.id))
Planning:
  Buffers: shared hit=771
Planning Time: 2.593 ms
Execution Time: 0.731 ms
```

### breadth

```
Limit  (cost=2136.82..2136.84 rows=8 width=125) (actual time=8.728..8.731 rows=8 loops=1)
  Buffers: shared hit=2077
  ->  Sort  (cost=2136.82..2137.96 rows=459 width=125) (actual time=8.727..8.729 rows=8 loops=1)
        Sort Key: (GREATEST(p.updated_at, COALESCE(act.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: top-N heapsort  Memory: 28kB
        Buffers: shared hit=2077
        ->  Nested Loop Left Join  (cost=0.71..2127.64 rows=459 width=125) (actual time=1.909..8.503 rows=459 loops=1)
              Buffers: shared hit=2071
              ->  Nested Loop Left Join  (cost=0.70..2111.57 rows=459 width=167) (actual time=1.882..7.715 rows=459 loops=1)
                    Buffers: shared hit=2071
                    ->  Nested Loop  (cost=0.28..38.23 rows=459 width=126) (actual time=1.812..2.520 rows=459 loops=1)
                          Join Filter: (pr.id = p.project_id)
                          Rows Removed by Join Filter: 5508
                          Buffers: shared hit=235
                          ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.017..0.051 rows=13 loops=1)
                                Join Filter: (cl.id = pr.client_id)
                                Rows Removed by Join Filter: 78
                                Buffers: shared hit=14
                                ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.010..0.012 rows=13 loops=1)
                                      Buffers: shared hit=1
                                ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=7 loops=13)
                                      Buffers: shared hit=13
                          ->  Index Scan using plans_organization_id_idx on plans p  (cost=0.28..30.46 rows=459 width=100) (actual time=0.006..0.161 rows=459 loops=13)
                                Index Cond: (organization_id = '01a0a502-df82-7e93-b1bc-26bdd133ad78'::uuid)
                                Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus"))
                                Buffers: shared hit=221
                    ->  Limit  (cost=0.42..4.51 rows=1 width=41) (actual time=0.011..0.011 rows=1 loops=459)
                          Buffers: shared hit=1836
                          ->  Index Scan using idx_activities_plan_updated_at on activities act  (cost=0.42..212.95 rows=52 width=41) (actual time=0.011..0.011 rows=1 loops=459)
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
Planning Time: 2.811 ms
Execution Time: 8.878 ms
```

### extra-large

```
Limit  (cost=13972.90..13972.92 rows=8 width=125) (actual time=45.752..45.758 rows=8 loops=1)
  Buffers: shared hit=13229
  ->  Sort  (cost=13972.90..13980.40 rows=3000 width=125) (actual time=45.751..45.755 rows=8 loops=1)
        Sort Key: (GREATEST(p.updated_at, COALESCE(act.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(dep.updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone))) DESC, p.id
        Sort Method: top-N heapsort  Memory: 28kB
        Buffers: shared hit=13229
        ->  Nested Loop Left Join  (cost=0.71..13912.90 rows=3000 width=125) (actual time=12.803..44.493 rows=3000 loops=1)
              Buffers: shared hit=13223
              ->  Nested Loop Left Join  (cost=0.70..13807.90 rows=3000 width=167) (actual time=12.771..39.514 rows=3000 loops=1)
                    Buffers: shared hit=13223
                    ->  Nested Loop  (cost=0.28..207.81 rows=3000 width=126) (actual time=12.685..16.229 rows=3000 loops=1)
                          Join Filter: (pr.id = p.project_id)
                          Rows Removed by Join Filter: 36000
                          Buffers: shared hit=1223
                          ->  Nested Loop  (cost=0.00..2.03 rows=1 width=42) (actual time=0.017..0.086 rows=13 loops=1)
                                Join Filter: (cl.id = pr.client_id)
                                Rows Removed by Join Filter: 78
                                Buffers: shared hit=14
                                ->  Seq Scan on projects pr  (cost=0.00..1.01 rows=1 width=48) (actual time=0.010..0.019 rows=13 loops=1)
                                      Buffers: shared hit=1
                                ->  Seq Scan on clients cl  (cost=0.00..1.01 rows=1 width=26) (actual time=0.001..0.001 rows=7 loops=13)
                                      Buffers: shared hit=13
                          ->  Index Scan using plans_organization_id_idx on plans p  (cost=0.28..168.28 rows=3000 width=100) (actual time=0.010..1.050 rows=3000 loops=13)
                                Index Cond: (organization_id = '01a0a502-dfd1-7543-808b-27893ba56056'::uuid)
                                Filter: ((deleted_at IS NULL) AND (status <> 'ARCHIVED'::"PlanStatus"))
                                Buffers: shared hit=1209
                    ->  Limit  (cost=0.42..4.52 rows=1 width=41) (actual time=0.007..0.007 rows=1 loops=3000)
                          Buffers: shared hit=12000
                          ->  Index Scan using idx_activities_plan_updated_at on activities act  (cost=0.42..193.16 rows=47 width=41) (actual time=0.007..0.007 rows=1 loops=3000)
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
Planning Time: 2.442 ms
Execution Time: 45.917 ms
```
