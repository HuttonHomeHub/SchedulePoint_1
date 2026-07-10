---
'@repo/api': minor
'@repo/types': minor
---

Add the working-day calendar schema and permissions (M5, ADR-0024). New `calendars`
and `calendar_exceptions` tables: an org-scoped calendar is a 7-bit `working_weekdays`
mask (Monday…Sunday) plus dated exceptions (holidays / worked weekends), with a
`working_weekdays > 0 AND <= 127` CHECK, partial-unique names/exception-dates among
live rows, soft delete + batch restore, and the documented indexes (the active
`(calendar_id, date)` unique doubles as the engine's exception load). Adds the
`calendar:read` / `calendar:create` / `calendar:update` / `calendar:delete` permissions
(read for every member; write for Planner + Org Admin) and the shared `@repo/types`
`Calendar`/`CalendarException` shapes plus a pure `WorkingWeekdays` bitmask helper (the
single source of truth the API DTO validates against and the web toggle group binds to).
Schema and permissions only — the CRUD module and engine wiring land next.
