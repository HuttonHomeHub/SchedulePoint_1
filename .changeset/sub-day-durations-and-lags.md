---
'@repo/api': minor
---

Author sub-day durations and lags through the public API (TECH_DEBT #78)

ADR-0036 moved storage and the CPM engine to working-**minutes** and shipped intraday shift
calendars, but the public DTOs exposed only whole days. The asymmetry was the defect: the
interchange commit writes `duration_minutes` directly, so a 4-hour activity **imported and scheduled
correctly** — and then no client, including the web app, could create a comparable one, and any edit
touching the duration silently rounded it to whole days.

`durationMinutes` joins `durationDays` on the activity create/update DTOs, and `lagMinutes` joins
`lagDays` on the dependency ones. Each pair is mutually exclusive: sending both is a 422 naming the
pair, not a silent preference for one — a client sending `durationDays: 2` and `durationMinutes: 240`
has a bug, and picking a winner hides it behind a schedule that is quietly not what was asked for.

Both minute fields are also exposed on the **read** DTOs. Without that, a client could author a
4-hour activity and only ever see it as `durationDays: 0` — a write path that is technically present
and practically useless.

Two things the debt entry did not anticipate, both found while wiring it:

- The milestone-must-be-zero rule keyed off `durationDays` alone, so a milestone could have acquired
  a duration by being asked for in minutes. It now covers both fields and names whichever it fired on.
- The ADR-0040 duration-type recompute used `durationDays !== undefined` as its "is this a duration
  edit?" test. A minutes-only edit would have skipped it silently, leaving
  `Units = Duration × Units/Time` false with nothing saying so. It now takes an explicit boolean.

The day fields are unchanged for every existing client, and the CPM engine is untouched — minutes
were always the unit it schedules on.
