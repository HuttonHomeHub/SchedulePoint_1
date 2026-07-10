---
'@repo/api': minor
---

Add the `Activity` domain table — the leaf of the Client → Project → Plan →
Activity hierarchy and the atomic unit of a schedule — plus the `ActivityType`,
`ActivityStatus` and `ConstraintType` enums and their migration. Each activity is
plan-scoped with a denormalised `organization_id` (copied from the parent plan),
soft-delete + `delete_batch_id`, audit columns (TEXT `created_by`/`updated_by`),
and an optimistic-locking `version`; name — and optional `code` — are unique per
plan among live rows via partial-unique indexes. The full field set is persisted
now (definition: type/duration/constraint/lane; progress: status/percent/actuals;
engine-owned CPM outputs: early/late dates, total float, critical flags; and a
reserved `calendar_id`) so the deferred dependencies/calendars/CPM/canvas slices
are additive. Schema + migration only — no module or endpoint behaviour yet.
