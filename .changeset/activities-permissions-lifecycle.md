---
'@repo/api': minor
---

Add the activity authorisation and lifecycle foundation. New permission codes
`activity:read|create|update|delete|restore` follow the same Planner+Org-Admin
"write" rule as the rest of the hierarchy, plus a separate
`activity:update_progress` granted to Contributor upward — the first capability
that distinguishes a Contributor from a Viewer, letting them report progress
(status / % complete / actual dates) without being able to change logic. The
shared `HierarchyLifecycleService` is extended from three levels to four:
deleting a plan (or project, or client) now cascades to its activities in the
same `delete_batch_id`, restoring the parent brings them back, and an activity
can be soft-deleted/restored on its own (restore requires its parent plan to be
active — `PARENT_DELETED` otherwise). Adds the `ActivitySummary`/`ActivityType`/
`ActivityStatus`/`ConstraintType` cross-boundary contracts to `@repo/types`. The
existing 3-level cascade is covered by regression tests.
