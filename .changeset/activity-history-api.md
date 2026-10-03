---
'@repo/api': minor
'@repo/types': minor
---

Record who changed an activity, and when. Every single-activity write now writes its change, in its own
transaction, to a per-activity history: the editor's definition and progress saves, a link created, edited
or deleted (on both of its activities) and a resource assignment created, edited or removed, including the
duration the units triad derives in the same request. Consecutive saves by one person merge, and a change
undone inside the window leaves no entry. `GET /organizations/:orgSlug/activities/:activityId/history`
serves it to every member, with money withheld from anyone without `cost:read`. This is working memory, not
an audit trail (ADR-0174). Permanent deletion of an activity now removes its history first and counts it.
