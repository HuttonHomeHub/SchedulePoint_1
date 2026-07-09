---
'@repo/api': minor
---

Add the `Client`, `Project`, and `Plan` domain-hierarchy tables (and the
`PlanStatus` enum) plus their migration — the organisation-scoped containers the
scheduling features hang off. Each follows the house standards (UUID v7 PKs,
snake_case columns, timestamptz UTC, soft delete, audit, optimistic-locking
`version`) and adds two reusable conventions: a denormalised `organization_id` on
`Project`/`Plan` (copied from the parent for single-column scope/IDOR checks) and
a `delete_batch_id` correlation column that groups a row and its subtree for
cascade soft-delete and one-shot batch restore. Parent FKs are `ON DELETE
RESTRICT`; name uniqueness is per immediate parent among live rows via partial
unique indexes. Schema and migration only — no module/endpoint behaviour yet.
