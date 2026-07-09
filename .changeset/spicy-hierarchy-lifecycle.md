---
'@repo/api': minor
'@repo/web': patch
---

Add the hierarchy authorisation and lifecycle foundation: `client|project|plan`
read/create/update/delete/restore permission codes (read for every member,
write for Planner + Org Admin), a shared `HierarchyLifecycleService` implementing
cascade soft-delete + batch restore (one `delete_batch_id` per delete, top-down
`PARENT_DELETED` invariant, `NAME_TAKEN` on colliding restore), and the
`ClientSummary`/`ProjectSummary`/`PlanSummary`/`PlanStatus`/`DeletedHierarchyItem`
cross-boundary types.
