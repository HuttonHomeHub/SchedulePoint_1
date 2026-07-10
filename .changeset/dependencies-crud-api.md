---
'@repo/api': minor
---

Add the Dependency CRUD API — the edges of a plan's schedule network. Dependencies
are created and listed under a plan
(`POST`/`GET /organizations/:orgSlug/plans/:planId/dependencies`, cursor-paginated),
browsed by direction from an activity
(`GET …/activities/:activityId/predecessors` and `…/successors`), and
read/updated/soft-deleted by id (`/organizations/:orgSlug/dependencies/:dependencyId`).
Following the activities module: writes are Planner + Org Admin only, org-scoped
(anti-IDOR), with both endpoints loaded active and asserted to be in the same plan
(no cross-plan links), the organisation/plan ids copied from the parent, per-plan
`(predecessor, successor, type)` uniqueness (`409 DUPLICATE_DEPENDENCY`), a
self-loop guard (`422 SELF_DEPENDENCY`), optimistic locking (type/lag only — the
endpoints are immutable), and soft-delete via the shared lifecycle. Responses embed
the endpoint activity summaries (no N+1). Cycle detection — the DAG guarantee of
ADR-0021 — lands next.
