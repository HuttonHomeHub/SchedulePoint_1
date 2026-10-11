# M1-T0 measurement: the plan-set queries behind #449 (ADR-0142)

- **Date:** 2026-10-11
- **Harness:** `apps/api/test/measure/calendar-plan-set.measure.ts` (`vitest.measure.config.mts`)
- **Database:** the local CI-shaped Postgres 17 (`app_test`), freshly migrated, `ANALYZE` run after the load.
  A container, not the target envelope: read the shape of the plans, not the milliseconds.

## Data

One organisation, 1,800 plans and 9,000 activities (five per plan). One shared ORG calendar reaches plans
by each route:

- 600 plans have it as their own calendar;
- 600 plans have one activity on it;
- 600 plans have an activity with a resource on it assigned.

The routes overlap in places, so the calendar query returns **1,262 distinct plans**. That is a harsher
fan-out than the plan's "about 200 plans on one ORG calendar", chosen so a scaling problem would show.

## Results

| Measurement                                                                 | Result                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------- |
| Calendar plan-set query, `EXPLAIN (ANALYZE, BUFFERS)`, planner's own choice | 4.7 ms execution, 0.8 ms planning                    |
| Same, `enable_seqscan = off`                                                | 6.2 ms                                               |
| Resource plan-set query, planner's own choice                               | 8.7 ms (sequential scan of `activities`, 9,000 rows) |
| Same, `enable_seqscan = off`                                                | 4.4 ms                                               |
| Repository call, wall clock including the round trip                        | 6 to 13 ms                                           |
| `markScheduleInputsChanged` over those 1,262 plans (five runs)              | 31, 32, 33, 43, 57 ms                                |

## Index use

- `idx_plans_calendar_id`, `idx_activities_calendar_id` and `idx_resource_assignments_resource_id` are used
  by the calendar query in **both** arms, so the three `calendar_id` lookups never sequentially scan.
- The resource query joins through `activities` by primary key. At 9,000 rows the planner prefers to hash
  the whole table; forced off sequential scans it uses `idx_resource_assignments_activity_id_fk` and is
  faster. Both are single-digit milliseconds at this size. That branch is bounded by the number of
  assignments of one resource, and runs only on a resource edit that changes the calendar or the ceiling.

## Verdict

No sequential scan on a path that grows with the whole database matters at this scale, so **no index is
proposed and no schema change is needed** (CLAUDE.md 19.3 does not trigger). The stamp over 1,262 plans
costs about 30 to 60 ms in one transaction, which holds those plan rows locked until commit.

**Not measured:** a database an order of magnitude larger, and the lock wait a concurrent plan-settings
save would see during that window. The database-architect review the spec recommends (query plan and lock
order) was not run by this build.
