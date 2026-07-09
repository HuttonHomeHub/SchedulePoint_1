---
'@repo/api': minor
---

Add the plans REST API — the leaf level of the Client → Project → Plan
hierarchy and the future host of activities and the TSLD. Create and list are
nested under a parent project
(`GET/POST /organizations/:orgSlug/projects/:projectId/plans`); item operations
are flat by id (`GET/PATCH/DELETE /organizations/:orgSlug/plans/:planId` and
`POST .../plans/:planId/restore`). Plans carry `status` (`DRAFT`/`ACTIVE`/
`ARCHIVED`, default `DRAFT`) and an optional date-only `plannedStart`
(`YYYY-MM-DD`, stored without timezone drift and validated as a real calendar
day). Reads are open to any member; create/update/delete/restore are Planner +
Org Admin. The parent project is resolved active and in-org first (404
otherwise) and its organisation id is copied onto the plan; names are unique per
project among active rows; updates use optimistic locking; delete is a soft
delete (a plan is a leaf); and restore requires the parent project to be active
(`PARENT_DELETED` otherwise).
