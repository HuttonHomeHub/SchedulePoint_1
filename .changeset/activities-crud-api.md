---
'@repo/api': minor
---

Add the Activity CRUD API — the leaf of the Client → Project → Plan → Activity
hierarchy and the atomic unit of a schedule. Activities are created and listed
under a parent plan (`POST`/`GET /organizations/:orgSlug/plans/:planId/activities`,
cursor-paginated), and read/updated/soft-deleted/restored by id
(`/organizations/:orgSlug/activities/:activityId` + `/restore`). Following the
`plans` module: definition writes (name, code, description, type, duration,
constraint, lane) are Planner + Org Admin only, org-scoped (anti-IDOR), with
per-plan name and code uniqueness, optimistic locking, and soft-delete/restore
via the shared four-level lifecycle (top-down `PARENT_DELETED` invariant). A
milestone's duration is always coerced to 0, and a schedule constraint's type
and date must be set (or cleared) together. Progress fields (status / % / actual
dates) and the engine-owned CPM output columns are deliberately not writable
here — progress gets its own Contributor-capable endpoint next.
