---
'@repo/api': minor
---

Add the working-day calendar library CRUD API (M5, ADR-0024). A new org-scoped
`calendars` module (controller → `CalendarsService` → `CalendarRepository`) exposes
list / create / get / update / delete calendars plus an exception editor
(add / remove dated holidays and worked-weekends), all under
`/api/v1/organizations/:orgSlug/calendars`. Deny-by-default: reads need
`calendar:read` (every member), writes need `calendar:create|update|delete`
(Planner + Org Admin); every route re-resolves the org scope from the caller's
memberships (anti-IDOR). The weekday mask is validated 1–127 (422), calendar names
are unique per org and exception dates unique per calendar (409
`DUPLICATE_CALENDAR` / `DUPLICATE_EXCEPTION`), updates use optimistic locking, and
delete is a self-contained soft-cascade over the calendar and its exceptions
(adding/removing an exception bumps the calendar's version). The delete-in-use
guard and plan assignment land next (Task C1); nothing consumes a calendar for
scheduling yet.
