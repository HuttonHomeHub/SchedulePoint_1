---
'@repo/api': minor
---

Add the clients REST API — the top level of the Client → Project → Plan
hierarchy. `GET/POST /organizations/:orgSlug/clients`,
`GET/PATCH/DELETE /organizations/:orgSlug/clients/:clientId`, and
`POST .../clients/:clientId/restore`. Reads are open to any member; create/
update/delete/restore are Planner + Org Admin. Every route resolves the org
scope from the caller's memberships (404 for non-members), names are unique per
active org, updates use optimistic locking, and delete is a soft cascade to the
client's projects and plans (restored together as one batch).
