# FC-9 — the detail-screen child counts, measured

- **Taken:** 2026-09-17T12:23:03.334Z
- **Reps:** 30 after 5 warm-up, × 2 sittings per shape
- **Paced:** one request per 660 ms (global 100/60 s throttle) — NOT back-to-back
- **Bars:** route p95 < 50 ms; added p95 ≤ 25 ms; no `Seq Scan` on a child table; estimate < 100,000

## (a) Route latency

| Shape        | subject                        | client p95 | spread | project p95 | spread | added (sum of count p95) |
| ------------ | ------------------------------ | ---------- | ------ | ----------- | ------ | ------------------------ |
| `deployed`   | 4 proj / 16 plans / 32 act     | 12.3 ms    | 1.5 ms | 12.3 ms     | 0.8 ms | 0.61 ms                  |
| `typical`    | 1 proj / 16 plans / 2880 act   | 11.5 ms    | 0.2 ms | 12.3 ms     | 0.8 ms | 1.19 ms                  |
| `fatClient`  | 500 proj / 6000 plans / 0 act  | 15.3 ms    | 2.9 ms | 11.8 ms     | 0.4 ms | 4.74 ms                  |
| `fatProject` | 1 proj / 60 plans / 120000 act | 13.7 ms    | 2.6 ms | 29.0 ms     | 7.8 ms | 22.39 ms                 |

**Dilution** — the subject's share of each table, which must stay under 33% or the harness refuses to judge:

| Shape        | projects | plans | activities |
| ------------ | -------- | ----- | ---------- |
| `deployed`   | 0.2%     | 0.1%  | 0.0%       |
| `typical`    | 0.1%     | 0.1%  | 0.6%       |
| `fatClient`  | 25.0%    | 25.0% | —          |
| `fatProject` | 0.1%     | 0.2%  | 24.9%      |

Table totals at the end of the run: 2000 projects, 24020 plans, 481568 activities.

## (b) and (c) — plan shape and estimate, per count

| Shape        | Count                   | p95 (vacuumed) | p95 (cold) | estimate | index nodes                                                                   | Seq Scan on a child table | JIT |
| ------------ | ----------------------- | -------------- | ---------- | -------- | ----------------------------------------------------------------------------- | ------------------------- | --- |
| `deployed`   | `client.projectCount`   | 0.12 ms        | 0.12 ms    | 4        | Index Only Scan (uq_projects_client_name)                                     | —                         | no  |
| `deployed`   | `client.planCount`      | 0.18 ms        | 0.18 ms    | 33       | Index Scan (uq_projects_client_name), Index Only Scan (uq_plans_project_name) | —                         | no  |
| `deployed`   | `project.planCount`     | 0.13 ms        | 0.11 ms    | 5        | Index Only Scan (uq_plans_project_name)                                       | —                         | no  |
| `deployed`   | `project.activityCount` | 0.18 ms        | 0.27 ms    | 113      | Index Only Scan (idx_activities_plan_updated_at)                              | —                         | no  |
| `typical`    | `client.projectCount`   | 0.10 ms        | 0.12 ms    | 4        | Index Only Scan (uq_projects_client_name)                                     | —                         | no  |
| `typical`    | `client.planCount`      | 0.14 ms        | 0.19 ms    | 13       | Index Scan (uq_projects_client_name), Index Only Scan (uq_plans_project_name) | —                         | no  |
| `typical`    | `project.planCount`     | 0.12 ms        | 0.15 ms    | 5        | Index Only Scan (uq_plans_project_name)                                       | —                         | no  |
| `typical`    | `project.activityCount` | 0.83 ms        | 3.18 ms    | 148      | Index Only Scan (idx_activities_plan_updated_at)                              | —                         | no  |
| `fatClient`  | `client.projectCount`   | 0.21 ms        | 1.01 ms    | 66       | Index Only Scan (uq_projects_client_name)                                     | —                         | no  |
| `fatClient`  | `client.planCount`      | 4.12 ms        | 12.78 ms   | 1851     | Index Only Scan (uq_plans_project_name)                                       | projects                  | no  |
| `fatClient`  | `project.planCount`     | 0.12 ms        | 0.12 ms    | 5        | Index Only Scan (uq_plans_project_name)                                       | —                         | no  |
| `fatClient`  | `project.activityCount` | 0.29 ms        | 0.25 ms    | 113      | Index Only Scan (idx_activities_plan_updated_at)                              | —                         | no  |
| `fatProject` | `client.projectCount`   | 0.12 ms        | 0.13 ms    | 4        | Index Only Scan (uq_projects_client_name)                                     | —                         | no  |
| `fatProject` | `client.planCount`      | 0.17 ms        | 0.18 ms    | 13       | Index Scan (uq_projects_client_name), Index Only Scan (uq_plans_project_name) | —                         | no  |
| `fatProject` | `project.planCount`     | 0.14 ms        | 0.17 ms    | 10       | Index Only Scan (uq_plans_project_name)                                       | —                         | no  |
| `fatProject` | `project.activityCount` | 21.96 ms       | 21.86 ms   | 522      | Index Only Scan (idx_activities_plan_updated_at)                              | —                         | no  |

**cold** = immediately after a bulk insert, before any `VACUUM`: every row pays a heap fetch
because the visibility map has no bits set. **vacuumed** is the state a deployed database sits in,
and is what the bars are judged against. Both are printed because the true cost moves between
them — every recalculation dirties every activity row in a plan (ADR-0144 §8).

**The clients LIST plan keeps `clients_organization_id_created_at_id_idx`:** YES

```
Limit  (cost=0.28..2.46 rows=20 width=194) (actual time=0.065..0.148 rows=20 loops=1)
  Buffers: shared hit=2 read=16
  ->  Index Scan using clients_organization_id_created_at_id_idx on clients  (cost=0.28..872.18 rows=8005 width=194) (actual time=0.065..0.145 rows=20 loops=1)
        Index Cond: (organization_id = '01a0af51-0340-7a92-af46-9515627d4f52'::uuid)
        Filter: (deleted_at IS NULL)
        Buffers: shared hit=2 read=16
Planning:
  Buffers: shared hit=199
Planning Time: 0.593 ms
Execution Time: 0.168 ms
```

## Verdict

**FAIL** — see the rows above. FC-9's withdrawal clause applies: the counts are withdrawn and the detail screens are enriched from fields already on the wire.

**What this does NOT establish.** One machine, one local PostgreSQL, one sitting pair. The
`added` column is the SUM of the two counts' `EXPLAIN (ANALYZE)` execution times, which is the
conservative end of a range — they are issued concurrently, so the true added wall-clock is
between the max and the sum. And `project.activityCount`'s cost is partly a function of how
recently the project was recalculated: the plan is an index-only scan, so it depends on the
visibility map, and every recalculation rewrites every activity row in a plan (ADR-0144 §8
measured 300 dirtied plans costing 130,380 heap fetches). This harness never recalculates.
