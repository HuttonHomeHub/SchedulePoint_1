---
'@repo/api': minor
---

Expose the CPM recalculation over HTTP: `POST
/organizations/:orgSlug/plans/:planId/schedule/recalculate` (permission
`schedule:calculate`, Planner + Org Admin). It runs the engine, persists the
computed columns, and returns the plan schedule summary (`200`); a plan with no
start date returns `422 PLAN_START_REQUIRED`, and the unreachable DAG-invariant
breach is logged distinctly and surfaces as an opaque `500`. Covered by an API
e2e matrix (multi-path critical set, version/updated_by untouched, RBAC 403,
IDOR/cross-org 404, 422 no-start) and a 500-activity performance smoke.
