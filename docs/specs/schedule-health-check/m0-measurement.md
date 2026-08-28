# M0 — the measurement record

> **Method note.** Everything below was established by running commands against a real database and a
> real API on 2026-08-27, per this epic's M0 tasks. Environment: the local e2e Postgres
> (`app_test`), the API at `nest start` against it, the seed catalogue seeded fresh into a new
> organisation (`m0-measurement-org`). Numbers from this dev container are **shapes and bounds, not
> production figures** — the spread caveat in M0-T2 step 4 applies to every timing here.

## M0-T1 — the fourteen metrics against live data

Seeded: the full capability tier, the 129-activity fixture (`plan:fixture-p6-torture-v1`, lands as
147 rows — 126 non-summary + 21 `WBS_SUMMARY`), `plan:scale-500` (540 rows), and a 2,000-activity
scale plan. The fixture and scale plans were then recalculated **through the API** so the persisted
CPM columns are real engine output, not seeded values.

All fourteen answering queries ran clean (`m0-metrics.sql`, kept beside this file in the working
notes; the queries are the §3.1 table row by row, including the CQ-3 typed exclusion rule and the
CQ-5 narrowings). Results:

| Metric             | Fixture (126 activities, 188 links)                                                          | Scale-500 (500 activities, 600 links)             |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1 Missing logic    | **8 offenders** (6 no-pred + 2 no-succ), 1 start-MS + 1 finish-MS excluded by the typed rule | **7 offenders** (3 + 4), 1 start-MS excluded      |
| 2 Leads            | **4**                                                                                        | **23**                                            |
| 3 Lags             | 31 of 188 (16.5 % — FAIL vs ≤ 5 %)                                                           | 48 of 600 (8 % — FAIL)                            |
| 4 Types            | FS 143 / SS 25 / FF 17 / **SF 3**                                                            | FS 488 / SS 50 / FF 54 / SF 8                     |
| 5 Hard constraints | **7** of 126 (5.6 % — FAIL by a hair, a good boundary case)                                  | 0                                                 |
| 6 High float       | **17**                                                                                       | **248 of 500 (49.6 % — FAIL by a mile)**          |
| 7 Negative float   | **65**                                                                                       | 0                                                 |
| 8 High duration    | 0 of 96                                                                                      | 0 of 478                                          |
| 9 Invalid dates    | **8** forecast-before-data-date, 0 actual-after                                              | 0 / 0                                             |
| 10 Resources       | 80 of 104 unassigned                                                                         | **478 of 478** (the plan has no resources at all) |
| 11/13/14           | no baseline (until one is captured — see below)                                              | baseline captured via `POST …/baselines`          |

**Conclusion the milestone exists for: every metric with a persisted answer has a live, non-trivial
oracle in the catalogue, on both sides.** The fixture fails 1, 2, 3, 5 (by 0.6 pp — a boundary
case), 7 and 9; scale-500 fails 2, 3 and 6 and passes 5, 7, 8 and 9. Nothing had to be
hand-built to make a metric fire, and nothing passes vacuously.

### The three load-bearing claims, confirmed by observation

1. **`total_float` is whole working days on the activity's own calendar.** On
   `plan:capability-shift-calendars` — six activities of identical work on six different intraday
   calendars (8 h, split, nights, 12 h, two-shift, 24 h) — the stored floats are **6, 6, 6, 7, 8, 9**.
   Small comparable integers across calendars whose minutes-per-day differ by 3×; a minutes reading
   would differ by hundreds. Direct integer comparison for metrics 6 and 7 confirmed.
2. **`plans.planned_start` is `NOT NULL` everywhere**: 0 NULLs of 1,667 plans in the shared test
   database (which includes every earlier suite's plans, so the claim held beyond the catalogue).
3. **The catalogue captures no baselines**: `SELECT count(*) FROM baselines` for the seeded
   organisation = **0**. §3.5's "metrics 11/13/14 have no seeded fixture" is right, and M1-T7's
   build-one-through-the-API step is necessary — and proven cheap: one
   `POST …/plans/:id/baselines {"name":"M0 baseline"}` captured 540 rows and was **active on
   creation** (the ADR-0025 first-baseline rule), with `capturedProjectFinish: 2029-02-26` ready to
   serve as metric 13's target.

**Both baseline-metric branches are exercisable without new machinery.** On scale-500 with the
baseline captured at the data date: exactly **1** activity was baselined to finish by the data date
and **0** are complete — so BEI = 0/1, a real FAIL row; and re-capturing on a plan whose baseline
has nothing due exercises `NOT_ASSESSABLE / NOTHING_DUE`. Both sides reachable by fixture choice
alone.

## Findings that contradicted the working assumptions

**F-M0-1 — the fixture and scale tiers land UNCALCULATED.** After a full seed, every capability-tier
plan had `schedule_computed_at` set and CPM columns populated — and the fixture and both scale plans
had **`schedule_computed_at` NULL and every engine column NULL** (`early_start`, `total_float`, all
of them). The seeder recalculates the capability tier and does not recalculate the fixture/scale
tiers. Consequences: (a) the report's `PLAN_NEVER_CALCULATED` reason is not an edge case — it is the
resting state of two of the catalogue's three tiers, and the M1 e2e gets its
never-calculated fixture for free; (b) any M1 test against fixture/scale plans must recalculate
first or metrics 6/7/9 read NULL.

**F-M0-2 — seeding the fixture twice into the same plan leaves it unable to recalculate, and the
failure is an untyped 500.** The fixture was accidentally seeded twice (same seed name → same plan).
`POST …/schedule/recalculate` then returned `500 INTERNAL_ERROR`, and the API log shows the engine's
working-time horizon guard: `addWorkingTime exceeded the working-time horizon (no reachable
minute)` thrown from `engine/working-time` (ADR-0036 N11/N16). A fresh single-seeded fixture
recalculates cleanly (200, 74 ms, 147 activities), so the trigger is the double seed —
**reproducible**: seed `--tier fixture` twice into one project, recalculate, observe the 500.
Two defects hiding in one repro, **neither in this epic's scope, both filed rather than absorbed**
(`docs/TECH_DEBT.md` #205):
(a) the fixture seed path is not re-runnable — the second run's calendar writes leave a working-time
state the engine cannot walk; (b) the engine's horizon guard reaches the client as an **unhandled
500**, where ADR-0071 established the pattern that an engine guard surfaces as a typed 422
(`docs/adr/0071…`: "the engine's own guard is a typed error and a 422, not a 500"). A planner who
authors a calendar shape with no reachable minute would meet the same 500 with no words.

## M0-T2 — the read, measured

The four parallel loads, narrowed to the health check's columns, `EXPLAIN (ANALYZE, BUFFERS)`:

| Load                                                   | Scale-500 | Scale-2000 |
| ------------------------------------------------------ | --------- | ---------- |
| 1 activities (16 health columns)                       | 0.377 ms  | 0.666 ms   |
| 2 dependencies                                         | 0.364 ms  | 0.551 ms   |
| 3 active baseline snapshot (join via `baselines`)      | 0.422 ms  | 0.612 ms   |
| 4 resource-assignment existence (relation-filter join) | 0.329 ms  | 0.952 ms   |

**Context the numbers need:** the whole test database holds 7,196 activities / 1,569 dependencies /
557 baseline rows / 137 assignments, so the planner legitimately chooses sequential scans on the
smaller tables — a seq scan **here** is the optimum, not a missing index, and says nothing about a
production table. The falsification condition stands as written in the plan: the decision input is
the whole-endpoint p95 at 2,000 activities once the endpoint exists (M1), re-measured at M5 by the
security reviewer; today's numbers say the loads are nowhere near the 200 ms budget.

**Scale-2000 method (filled at the M5 gate pass, 2026-08-28):** the catalogue's REST-seeded
2,000-activity plan was lost twice to environment recycles mid-seed (recorded above), so the
Scale-2000 rows were measured against a **synthetic plan built directly in SQL** — 2,000
activities, 2,398 dependencies (chain + 20 % skip links, mixed FS/SS/FF, lead/lag spread), an
active baseline with 2,000 rows, 1,000 resource assignments — then `ANALYZE` and the same
`m0-explain.sql` script. That is a legitimate stand-in for THIS measurement and only this one: it
measures the four **loader queries'** cost at scale, and the loaders read rows, not the write path
(which the seed catalogue exists to prove — ADR-0066's rule about never substituting persisted
rows applies to the engine-input differential, not to an `EXPLAIN`). Total ≈ 2.8 ms summed, ~1 ms
wall (the four run concurrently via `Promise.all`) — nowhere near the 200 ms global-budget line.
The M5 security review **independently re-derived the same conclusion** with its own synthetic
2,000-activity build (1.356 / 1.090 / 0.537 / 2.015 ms — its database held more unrelated rows),
and read `attachDayFactors`/`resolveDayFactorMinutes` to confirm the day-factor lookup is bounded
by distinct calendars, never per-activity. **The global-throttle decision holds at 4× the
originally measured scale**; no tighter per-route throttle is warranted.
