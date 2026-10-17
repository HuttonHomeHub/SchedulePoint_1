---
'@repo/web': minor
---

Recently deleted now lists deleted resources and calendars beside clients, projects and plans, each
with a Restore button. A resource group comes back with everything deleted with it, a calendar with
its exceptions, and a project's own calendars are shown inside the project's row. When a restore
cannot happen the screen says why: a name or code is taken (with a link to the library to rename it),
a parent group or the resource's calendar is still deleted ("Restore resource group first…",
"Restore calendar first…"), or the parent group has stopped being a group. Deleted resources and
calendars never expire, so their rows show no "Expires in…" line. The delete confirmations for
resources, resource groups and calendars now say they can be restored from Recently deleted.
