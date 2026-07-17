---
'@repo/api': minor
'@repo/types': minor
---

CPM engine now schedules **resource-dependent** activities on their driving resource's calendar (M7.2,
ADR-0035 §23 / ADR-0039). When a `RESOURCE_DEPENDENT` activity has a driving resource assignment, the
schedule service resolves the activity's calendar port to that **resource's** calendar before the pass
runs (fallback chain: driving-resource calendar → the activity's own calendar → the plan default); the
engine then treats the activity exactly like a `TASK` for logic, so its duration advances and its float
is measured on the resource's calendar. A `RESOURCE_DEPENDENT` activity with **no** driving assignment is
**produced at the fallback calendar and flagged** (§23), never dropped: a new engine-owned
`activities.resource_driver_missing` boolean, written by the recalc's batched write and exposed as
`resourceDriverMissing` on the activity schedule response and the `ActivitySummary` shared type, with a
plan-level `resourceDriverMissingCount` on the schedule summary. With no `RESOURCE_DEPENDENT` activity
present the resolution is skipped entirely and the golden/parity path is byte-identical; existing rows
read `false` until the plan is recalculated.
