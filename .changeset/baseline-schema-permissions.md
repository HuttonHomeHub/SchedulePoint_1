---
'@repo/api': minor
'@repo/types': minor
---

Add the baseline schema and permissions (M7, ADR-0025). New `baselines` and
`baseline_activities` tables: a baseline is a named, frozen snapshot of a plan's
schedule (the plan of record), and each `baseline_activities` row is a **self-contained
copy** of an activity's identity and captured CPM dates — `source_activity_id` is a
plain correlation UUID with **no foreign key**, so a baseline survives the source
activities' 90-day hard purge and stays faithful even if a live activity is edited or
deleted. A partial unique `uq_baselines_plan_active` guarantees **at most one active
baseline per plan** in the database (not just in code); `uq_baselines_plan_name` keeps
names unique per plan among live rows; both tables carry soft delete + batch restore and
the documented scoped indexes (the `(baseline_id, source_activity_id)` index is the
variance join key). Adds the `baseline:read` / `baseline:create` / `baseline:activate` /
`baseline:delete` permissions (read for every member; write for Planner + Org Admin) and
the shared `@repo/types` `BaselineSummary` / `BaselineDetail` / `BaselineActivitySnapshot`
/ `BaselineVarianceRow` / `PlanVarianceSummary` contracts. Schema and permissions only —
the baselines module, variance read model, and web surface land next.
