---
'@repo/api': minor
---

Add the `ActivityDependency` schema — the typed, lagged logic edge between two
activities that turns a plan's activities (nodes) into a schedule network. The new
`dependencies` table carries a `DependencyType` enum (`FS`/`SS`/`FF`/`SF`, default
`FS`) and a signed working-day `lag_days`, with denormalised `organization_id` and
`plan_id` (both `RESTRICT` FKs, copied from the endpoints, never client input) and
two `RESTRICT` FKs to `activities` via named self-relations
(`Activity.predecessorLinks` / `successorLinks`). Follows the house standards: UUID
v7 PK, snake_case, timestamptz UTC, TEXT audit ids, optimistic-locking `version`,
soft delete + `delete_batch_id`. Integrity is enforced in the DB as defence in
depth: a partial-unique index on `(predecessor_id, successor_id, type)` among live
rows (per-type uniqueness — allows the SS+FF overlap ladder, blocks exact
duplicates), a `CHECK` forbidding self-loops, and a `CHECK` bounding `lag_days` to
−3650…3650, plus direction/plan/org and batch-restore indexes. Schema + migration
only — the CRUD API, `dependency:*` permissions, cycle detection and lifecycle
cascade land in follow-up tasks.
