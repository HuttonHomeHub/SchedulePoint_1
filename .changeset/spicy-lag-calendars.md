---
'@repo/api': minor
'@repo/types': minor
'@repo/web': minor
---

Per-relationship lag calendars (M3, ADR-0036 §6). Dependencies gain a `lagCalendar`
field (`PREDECESSOR` / `SUCCESSOR` / `TWENTY_FOUR_HOUR` / `PROJECT_DEFAULT`, default
`PROJECT_DEFAULT`) exposed on the create/update/response API, with a lag-calendar selector
on the dependency editor (and a lag-calendar label in the Logic panel's link lists). The CPM
engine now measures each edge's lag on that calendar: `TWENTY_FOUR_HOUR` schedules the lag as
**elapsed** time (e.g. concrete cure's `168h` = 7 elapsed days, not 7 working days), while the
other three coincide with the plan calendar today (Predecessor/Successor become distinct once
per-activity calendars land in M5). The default path is unchanged — a plan with no 24-Hour
lag recalculates byte-identically.
