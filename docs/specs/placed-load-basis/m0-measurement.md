# M0 measurement record — placed load basis (#413)

Recorded 2026-09-30 against the code at the head of `work-413-m0`, before any behaviour change.

## T0.1 — C5 (Pass 2 after a progressed predecessor): REAL

Engine unit test, `compute.visual.spec.ts` ("Pass 2 after a progressed predecessor (#421)"). Plan
calendar Mon-Fri, data date Mon 2026-01-05, actuals before the data date, FS successor `B` (1 day),
no `visualStart` anywhere.

| Predecessor `A`                                             | `B` early start | `B` `visualEffectiveStart` |
| ----------------------------------------------------------- | --------------- | -------------------------- |
| complete (5 d planned, actuals 12-29 to 12-30)              | 2026-01-05      | 2026-01-12                 |
| in progress (10 d planned, 2 d remaining, started 12-29)    | 2026-01-07      | 2026-01-19                 |
| not started, 10 d planned, expected finish 01-06, option on | 2026-01-07      | 2026-01-19                 |

Cause: Pass 2 (`compute.ts`, `visualPropFinish`) advances from `activity.durationMinutes` and reads
neither the actual finish nor the remaining work that Pass 1 uses. Filed as `docs/TECH_DEBT.md` #421;
the three cases are `it.fails`. The API-level read (`plan:capability-retained-logic`) was not taken:
the engine result already decides the question.

Per the approval, work **stopped here** for a product-owner decision. T0.2 (goldens) and T0.3 (red
cases) are not started: H2's fixture must exclude whatever class C5 finds, which depends on the decision.
