---
'@repo/api': minor
---

Add the projects REST API — the middle level of the Client → Project → Plan
hierarchy. Create and list are nested under a parent client
(`GET/POST /organizations/:orgSlug/clients/:clientId/projects`); item operations
are flat by id (`GET/PATCH/DELETE /organizations/:orgSlug/projects/:projectId`
and `POST .../projects/:projectId/restore`). Reads are open to any member;
create/update/delete/restore are Planner + Org Admin. The parent client is
resolved active and in-org first (404 otherwise) and its organisation id is
copied onto the project (never taken from input); names are unique per client
among active rows; updates use optimistic locking; delete is a soft cascade to
the project's plans; and restore brings the batch back but requires the parent
client to be active (`PARENT_DELETED` otherwise).
