---
'@repo/api': minor
'@repo/types': minor
---

Add the read-side schedule summary: `GET
/organizations/:orgSlug/plans/:planId/schedule/summary` (permission
`schedule:read`, every member) returns a plan's computed schedule roll-up from a
single aggregate over the persisted engine columns — no recompute. It returns the
identical `PlanScheduleSummary` shape as recalculate (data date, project finish,
activity/critical/near-critical/parked counts), now a shared type in `@repo/types`.
Null-safe for a never-calculated plan (null finish) and a plan with no start date
(null data date).
