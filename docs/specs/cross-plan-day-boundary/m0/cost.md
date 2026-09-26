# M0-T4: the cost baseline for FC-6

- **Status:** Measured 2026-09-26 on today's code. A baseline, not a verdict: FC-6 is judged by
  M2-T8, which re-runs the same harness on the built change.
- **Harness:** `apps/api/scripts/measure-cross-plan-derivation.mts`. Its docblock states where it
  bypasses the product (ADR-0081 §3): it calls the private `buildEngineGraph` directly on the real,
  DI-built `ScheduleService` (no HTTP, no guard chain, no `computeSchedule`, no write), and it inserts
  the activities and the cross-plan links directly. The organisation, the plans, the calendars and
  every recalculation go through the public API, so the remote dates are real persisted engine output.

## The fixture

One downstream plan `D` of 100 three-day tasks, linked FS lag 1 day to 10 other plans, each plan on a
calendar of its own (11 distinct calendars in all). Five of the ten are upstream of `D` and supply the
incoming links; five are downstream and receive the outgoing ones. `D`'s activity _i_ takes the
_i_-th incoming and the _i_-th outgoing link, dealt round-robin across the remote plans.

Three configurations, **with the plans, calendars and activities held fixed** and only which links
are active changing (the rest soft-deleted): 0, 10 and 100 links **in each direction**. At 10 and at
100 all ten remote plans stay linked.

**Non-vacuity, checked by the harness on every run:** at _n_ links each way, exactly _n_ of `D`'s
activities come out of `buildEngineGraph` carrying a derived external early start, and exactly _n_ a
derived external late finish. It throws otherwise, so a branch that loaded links and derived nothing
cannot report a cost.

## The counting shape (FC-6's second limb)

Identical in all three runs. Counted by a proxy around the transaction client (every model call and
raw query) and a spy on `ScheduleService.resolveCalendar`.

| Links each way | Queries in `buildEngineGraph` | … on `crossPlanDependency` | Calendar resolutions |
| -------------- | ----------------------------- | -------------------------- | -------------------- |
| 0              | 4                             | 1 (the guard's `count`)    | 1                    |
| 10             | 6                             | 3 (`count` + 2 `findMany`) | 1                    |
| 100            | 6                             | 3                          | 1                    |

The four ever-present queries are `activity.findMany`, `activityDependency.findMany`,
`calendar.findFirst` (the plan's own calendar) and `crossPlanDependency.count`. So **today the query
count and the calendar resolutions are already equal at 10 and at 100** (6 and 1), and the no-edge
path is exactly 4 queries and 1 resolution. The one calendar resolved is `D`'s own: today's
derivation never resolves a remote calendar (E7, E8). M2 will add remote calendar and plan loads;
FC-6 asks that they be equal at 10 and at 100, not that they equal today's count, and that the
no-edge path stay at 4 and 1.

## The timing (FC-6's first limb)

`buildEngineGraph(D)` in full, inside a `$transaction` as the recalculation runs it, 5 warm-ups then
40 samples, nearest-rank percentiles, milliseconds. Two rounds per process, two processes (the second
and third runs of the harness; the first, before the non-vacuity check was added, gave p95s of 13.6 /
16.9 / 22.7 ms and 13.7 / 18.5 / 27.6 ms and is consistent with these).

| Process | Round | Links each way | p50  | p95  | min  | max  |
| ------- | ----- | -------------- | ---- | ---- | ---- | ---- |
| A       | 1     | 0              | 10.0 | 11.8 | 8.4  | 14.7 |
| A       | 1     | 10             | 13.3 | 16.6 | 10.7 | 17.4 |
| A       | 1     | 100            | 18.6 | 22.0 | 16.1 | 28.1 |
| A       | 2     | 0              | 9.8  | 14.9 | 8.2  | 20.6 |
| A       | 2     | 10             | 15.1 | 21.9 | 11.5 | 24.2 |
| A       | 2     | 100            | 19.6 | 26.6 | 16.0 | 29.3 |
| B       | 1     | 0              | 11.8 | 17.3 | 8.7  | 18.4 |
| B       | 1     | 10             | 15.5 | 21.1 | 11.8 | 23.1 |
| B       | 1     | 100            | 21.7 | 29.0 | 16.4 | 34.7 |
| B       | 2     | 0              | 10.9 | 16.6 | 9.0  | 17.9 |
| B       | 2     | 10             | 13.1 | 16.9 | 10.8 | 17.8 |
| B       | 2     | 100            | 18.9 | 25.6 | 16.4 | 28.5 |

**The baseline FC-6 is judged against:** at 100 links each way, **p95 22.0–29.0 ms** across the four
rounds (p50 18.6–21.7 ms). The cross-plan branch itself, read as the 100-link p50 minus the same
round's 0-link p50, is **8.0–10.0 ms**.

**The spread is large relative to the branch**, and it is stated rather than averaged away: the
100-link p95 spans 7.0 ms across the four rounds (4.6 ms between the two rounds of one process), and the
0-link p95 spans 5.6 ms, on a fixture that did not change. So a 50 ms bar on added p95 is comfortably above the noise here, and a
difference smaller than about 7 ms at p95 between two runs of this harness is not a finding.

## The machine

A shared cloud container, not a quiet benchmark host: `Intel(R) Xeon(R) Processor @ 2.80GHz`, 4 cores,
16 GiB, Node `v22.22.2`, **PostgreSQL 16.13** (Ubuntu 24.04). CI and the Compose host run
PostgreSQL 17 (CLAUDE.md §3), so these milliseconds are this machine's, and M2-T8 should re-run the
baseline and the change on one machine in one sitting rather than compare with these figures.

Run from `apps/api` against a migrated database:

```sh
DATABASE_URL="postgresql://app:app@localhost:5432/app_m0_xplan_seed?schema=public" \
BETTER_AUTH_SECRET=local-m0-seed-secret-at-least-32-characters-long LOG_LEVEL=warn \
  npx vitest run --config scripts/vitest.measure.config.mts scripts/measure-cross-plan-derivation.mts
```

## One disagreement between the spec and the plan, recorded for M2-T8

FC-6 describes "100 cross-plan edges from **10 upstream plans** on 10 distinct calendars". M0-T4
describes "100 incoming and 100 outgoing cross-plan links **from 10 plans**". The harness follows
M0-T4, and it cannot follow FC-6 literally while also measuring the backward direction: ADR-0045 §3
keeps the plan graph acyclic, so a plan upstream of `D` cannot also be downstream of it, and the ten
remote plans are therefore five upstream and five downstream. M2-T8 should judge FC-6 on this fixture,
which covers both directions, and read FC-6's "10 upstream plans" as "10 remote plans".
