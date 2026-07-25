---
'@repo/api': minor
'@repo/types': minor
---

feat(api): give calendars a project scope tier (ADR-0053, M1 — backend only, no user-visible change yet)

A calendar now belongs to one of two tiers: `ORG` (the shared organisation library — what every
calendar was before, and still the default) or `PROJECT` (local to one project), so a one-off
shutdown calendar no longer permanently pollutes the library every other project picks from.

- `POST/PATCH …/calendars` accept `scope` + `projectId`; every calendar response carries them.
- `GET …/calendars?scope=org|project|all` (default `org`, today's result set) and a new
  `GET …/projects/:projectId/calendars` returning the calendars usable in a project (its own
  plus all organisation ones).
- A calendar can be promoted to the shared library at any time; narrowing it to one project is
  refused with 409 `CALENDAR_SCOPE_NARROWING_BLOCKED` while anything outside that project still
  uses it.
- Assigning a project calendar outside its project is refused with 422 `CALENDAR_WRONG_SCOPE`
  (a resource may only hold an organisation-wide calendar: 422 `RESOURCE_REQUIRES_ORG_CALENDAR`).
- Deleting a project now soft-deletes its project calendars with it, and restoring brings them
  back; shared calendars are never touched.
- New `calendar:manage_org` permission gates writes to the shared library, granted to Planner and
  Org Admin — no role loses a capability.

Existing data is entirely unaffected: every existing calendar is `ORG`-scoped and behaves exactly
as before. The CPM engine is untouched and recalculation output is unchanged.
