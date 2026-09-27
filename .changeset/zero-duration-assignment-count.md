---
'@repo/api': minor
'@repo/types': minor
'@repo/web': patch
---

Activity responses now carry `resourceAssignmentCount`: for a task with no duration, the number of
live resource assignments it holds, counting neither a removed assignment nor one to a deleted
resource. It is `null` for every other activity, meaning it was not counted for that kind of row, so
a page without such a task costs no extra query. After you assign or unassign a resource, the web
refetches the plan's activities so the count stays current.
