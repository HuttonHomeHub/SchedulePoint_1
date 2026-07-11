---
'@repo/api': minor
---

Add the baselines capture/list/get API (M7 Task B1, ADR-0025). A new plan-scoped
`baselines` module (controller → `BaselinesService` → `BaselineRepository`) exposes
`POST` (capture), `GET` (list, cursor-paginated newest-first) and `GET /:id` (with the
frozen activity snapshots) under `/api/v1/organizations/:orgSlug/plans/:planId/baselines`.
Capturing freezes the plan's currently-persisted computed activities as a self-contained
snapshot **under the plan write-lock** (the same advisory lock as recalculation, ADR-0022),
so a snapshot is never taken mid-recalculation; the batched `createMany` writes up to a
plan's worth of snapshot rows in one statement. The plan's **first** baseline is captured
active; later captures are inactive. Deny-by-default: reads need `baseline:read` (every
member), capture needs `baseline:create` (Planner + Org Admin); every route re-resolves the
org scope from the caller's memberships and the plan within it (anti-IDOR). Capturing an
empty or never-calculated plan is a `422 SCHEDULE_NOT_CALCULATED`; a duplicate name is a
`409 DUPLICATE_BASELINE`. Activate/delete and the variance read model land next.
