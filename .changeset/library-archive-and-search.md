---
'@repo/api': minor
'@repo/types': minor
---

feat(api): archive, search and filter the calendar & resource libraries (ADR-0053, M4)

Both shared libraries gain a **retire** action that is not a delete, and server-side search so a
library stays usable past a page of rows.

- **Archive / unarchive** — `POST …/calendars/:id/archive` · `…/unarchive` and
  `POST …/resources/:id/archive` · `…/unarchive` (204, version-gated). An archived calendar or
  resource is still entirely valid: it keeps every existing plan, activity, resource and
  assignment binding, and **keeps scheduling, levelling, loading the histogram and earning value
  exactly as before**. It is simply hidden from the libraries' default lists and from every
  picker.
- **Archiving is deliberately not blocked by use** — that is the whole point, and the contrast
  with delete. It is the only way to retire a calendar that "this calendar is in use" (correctly)
  refuses to delete, and a resource can be retired while it still drives a live activity.
- **Only new usages are refused** — assigning an archived resource to an activity is 422
  `RESOURCE_ARCHIVED`, and binding an archived calendar to a plan, activity or resource is 422
  `CALENDAR_ARCHIVED`. Editing an **existing** assignment still succeeds, and something already
  bound to a calendar that was archived afterwards stays fully editable.
- **Search and filter** — `?q=` on both list endpoints (calendars by name; resources by name or
  code, case-insensitive), plus `?archived=exclude|include|only` on both and `?kind=` on
  resources, all cursor-paginated and combinable with the existing `scope` / `parentId` filters.
- **Import matching** — an import that matches an archived resource now unarchives it and says so
  in the report, instead of silently creating assignments to a retired row.

Every list default reproduces today's result set, `archivedAt` is an additive response field, and
an archived row keeps its name and code so unarchiving can never fail. The CPM engine is untouched
and recalculation output is unchanged.
