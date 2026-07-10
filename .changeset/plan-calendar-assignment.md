---
'@repo/api': minor
'@repo/types': minor
---

Wire calendars into plans (M5 Task C1, ADR-0024). Plans gain a nullable
`calendar_id` (FK to calendars, RESTRICT, partial-indexed); a null calendar means
all-days-work (M6 back-compat). Each organisation is seeded a **Standard (Mon–Fri)**
calendar — on org create and backfilled for existing orgs by the migration — and new
plans default to it. A Planner can assign a plan's calendar via `PATCH plans/:id`
(`calendarId`, validated to be an active calendar in the same organisation, else 422;
null clears it), and a calendar referenced by an active plan can no longer be deleted
(409 `CALENDAR_IN_USE`). `Plan.calendarId` is added to `@repo/types` and the plan
response. Recalculation still ignores the calendar until Task C2 wires it into the
engine.
