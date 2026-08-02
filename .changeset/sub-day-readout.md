---
'@repo/web': minor
---

Read a sub-day duration or lag back exactly (ADR-0070 M4, behind `VITE_SUB_DAY_DURATIONS`).

The activities table's Duration column and the logic panel's Lag column now show the exact stored
value when it is not a whole number of days — `4h`, `2d 4h`, `+90m` — instead of rounding it to
`0 d`, which is also what the table prints for a milestone. A whole-day value keeps the shape it has
always had, so nothing changes on a plan with no sub-day work in it. Each lag row resolves its own
lag calendar, because `lagCalendar` is per-link and one page of logic can need several factors.
