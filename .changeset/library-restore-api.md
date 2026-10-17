---
'@repo/api': minor
'@repo/types': minor
---

Deleted resources and calendars can now be restored (ADR-0195). `POST …/resources/:resourceId/restore`
brings back a resource, or a resource group with everything deleted with it; `POST
…/calendars/:calendarId/restore` brings back a calendar with the exceptions deleted alongside it and
marks the plans that already use it "edited since calculated". Both are all-or-nothing and refuse
with a reason the caller can act on: the parent group or project is still deleted, a resource's
calendar is deleted, a live row holds the name or code (archived ones included), or the parent is no
longer a group or sits too deep. They need the new `resource:restore` and `calendar:restore`
permissions (Planner and Org Admin), and restoring an organisation calendar also needs
`calendar:manage_org`. Each is audited (`resource.restored`, `calendar.restored`).

`GET …/deleted` now lists resources and calendars too. Its items gain `subtype` and `expiresAt`
(null for a row no timer ever removes), `kind` widens to `resource` and `calendar`, and `blockedBy`
gains `relation` (`parent` or `calendar`) and can name a resource group or a calendar.
