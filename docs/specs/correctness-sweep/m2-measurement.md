# M2-T0 and T3 measurement: the placement and recalculation deadlock (#440)

- **Date:** 2026-10-11
- **Harness:** `apps/api/test/measure/placement-recalc-deadlock.measure.ts` (`vitest.measure.config.mts`)
- **Database:** the local CI-shaped Postgres 17 (`app_test`) in a container. Read the shape of the result and
  the counts; the milliseconds are not the target envelope.

## What was run

One plan of 2,000 activities, beside 50 other plans of 2,000 (100,000 other activities), `VACUUM ANALYZE`d so
the planner sees one plan as a small fraction of the table. Then 200 rounds. Each round fires together:

- `PATCH …/activities/placements` over **every** activity of the plan, in **reverse id order**;
- `POST …/schedule/recalculate` on the same plan.

The deadlock count is the server's own `pg_stat_database.deadlocks` delta, not an inference from the API's
log. The HTTP statuses are recorded beside it.

## Results

| Measurement                                    | Before the change      | After the change |
| ---------------------------------------------- | ---------------------- | ---------------- |
| Deadlocks over 200 rounds (`pg_stat_database`) | **3**                  | **0**            |
| HTTP statuses over 400 requests                | 397 x 200, **3 x 500** | 400 x 200        |
| Serial recalculation, median of 15             | 277 ms                 | 321 ms           |
| Concurrent round: placement, median            | 522 ms                 | 629 ms           |
| Concurrent round: recalculation, median        | 372 ms                 | 481 ms           |

An earlier run on a table holding only this plan (no other tenants) produced 2 deadlocks in 200 rounds before
the change and 0 after. So the hazard **reproduced**: it is a real `40P01`, answered as an opaque 500 by
`AllExceptionsFilter`, and it landed on the recalculation in the logged instance
(`POST …/schedule/recalculate`, `meta.code: '40P01'`). A single run of 200 rounds is a sample, not a rate: 2 and
3 deadlocks are the observed counts, and the after-change zero is two runs of 200 rounds each with no deadlock,
which is evidence and not proof.

### Why the order, from the plan

`EXPLAIN` of the placement `UPDATE … FROM unnest(…)` shows a **Hash Join** (`Hash Cond: (v.id = a.id)`) over an
index scan on `idx_activities_plan_updated_at`. A hash join emits rows in the order of its probe side, not the
order `unnest` was fed, and the batch's rows are therefore locked in index order. The recalculation's result
write is the same statement shape. So the row's proposed remedy, `ORDER BY id` inside the `unnest`, would not
have changed the lock order. The pre-lock statement shows `LockRows` over `Sort (Sort Key: id)`, which is the
shape the PostgreSQL `SELECT` documentation says locks rows in the order they are returned.

### The cost of the ordered lock, and one thing found on the way

The lock statement alone, on 30 plans x 2,000 activities, takes 8 to 17 ms for 2,000 ids, with the planner's
default plan, a forced custom plan and a forced generic plan alike. The serial recalculation moved 277 to 321 ms
(about +45 ms), but that is one median of 15 in each arm with a spread of about 60 ms, so it is not
distinguishable from noise at this sample size. Under contention each side waits for the other's row locks,
which is the intended effect (~ +100 ms on each median).

**The first version of the lock statement used `id = ANY($1::uuid[])` and was much slower under contention:** the
recalculation's median in the concurrent rounds was 3.2 s against 0.4 s, with the statement in state `active` and
no lock wait recorded by `pg_stat_activity`, on identical data. Writing the ids as
`id IN (SELECT u FROM unnest($1::uuid[]) AS u)` removed it (481 ms). The statement is fast in isolation either
way, so the cause is something the racing case adds. **It was not isolated** (the suspects are the row
re-check that follows a concurrent update, or how the array qual is evaluated against the dead versions a
placement batch leaves); only the before and after were measured, and the seam's docblock says so.

## Verdict

Fix verified against the defect it reproduced (placement batch against recalculation): 3 deadlocks and 3 500s before, 0 and 0 after, with a lock order that holds by
construction rather than by luck. The added time is the lock statement (about 10 to 20 ms at 2,000 rows) plus the
wait the two writers now do for each other. A backend-performance review of that wait was not run by this build.

**Scope of the claim.** Proven here: the placement, lane-position and recalculation writers are ordered. The
multi-row `activity.updateMany` writers in the delete cascades, `bulkDelete` and dissolve still lock in scan order
and were not measured; they are `docs/TECH_DEBT.md` #492.
