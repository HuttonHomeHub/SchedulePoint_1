---
'@repo/api': minor
---

Restoring a client, project, plan or activity (and the batch restore that undo uses) is now refused
with 409 `CALENDAR_DELETED` when a plan or activity it brings back uses a calendar that has been
deleted, instead of silently scheduling that work round the clock. `details.calendar` names the
calendar to restore first. A project's own calendars, deleted with it, still come back with it. Recently
deleted now reports the same blocker on plan, project and client rows (`blockedBy.relation: "calendar"`).
