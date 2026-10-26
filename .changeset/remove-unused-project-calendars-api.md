---
'@repo/api': minor
---

Two new calendar endpoints back clearing a project's leftover calendars. `GET /organizations/:orgSlug/projects/:projectId/calendars/unused` lists the project's own calendars that no active plan, activity or resource uses, with the deleted plans and activities still pointing at each. `POST /organizations/:orgSlug/calendars/bulk-delete` deletes up to 200 at once, all or nothing, under the single delete's permission and in-use rules; each calendar goes to Recently deleted in its own batch with its own audit event and can be restored alone. See ADR-0208.
