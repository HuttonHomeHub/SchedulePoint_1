---
'@repo/api': minor
'@repo/types': minor
---

M7.1 resources module + resource-assignment API (ADR-0039, the resource dimension of the CPM engine).
Adds an org-scoped resource library and the activity↔resource assignment join, mirroring the calendars
module (soft-delete, cursor pagination, optimistic locking, deny-by-default RBAC + org scoping).

New endpoints (all org-scoped): `POST/GET /organizations/:orgSlug/resources`,
`GET/PATCH/DELETE /organizations/:orgSlug/resources/:resourceId`,
`POST/GET /organizations/:orgSlug/activities/:activityId/assignments`, and
`PATCH/DELETE /organizations/:orgSlug/assignments/:id`. New permissions: `resource:read` (every member)
and `resource:create/update/delete/assign` (Planner + Org Admin only).

Service-enforced invariants (ADR-0039): same-org for a resource's calendar and an assignment's
activity/resource (the FK only scopes to the target table); `budgetedUnits` rejects negatives (N14);
a resource in use by an active assignment can't be deleted (`RESOURCE_IN_USE`), and the existing
`CALENDAR_IN_USE` guard now also counts resources; at most one driving assignment per activity — setting
a driver is an in-transaction move; a `MATERIAL` resource may never drive. Adds the shared
`ResourceKind` / `ResourceSummary` / `ResourceAssignmentSummary` types + a `RESOURCE_ERROR` map. The
driving-resource-calendar scheduling (§23) and the `resource_driver_missing` writer follow in M7.2.
