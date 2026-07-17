---
'@repo/api': minor
'@repo/types': minor
---

CPM engine now schedules **Level-of-Effort** activities (M5-epic F1–F2, ADR-0035 §21). An LOE is a
hammock: its dates are derived from the span of its earliest SS-predecessor start to its latest
FF-successor finish, in a post-pass after the network is computed. An LOE **never drives or bounds a
neighbour, never appears on the critical path or the project-finish/longest-path sets, and never inherits
negative float** (its late dates are pinned to its early dates, so total float and free float are a
non-negative 0). An LOE with no resolvable span — missing an SS predecessor or an FF successor — is
**produced at a defined fallback and flagged** (N12), never rejected: a new engine-owned
`activities.loe_no_span` boolean, written by the recalc's batched write and exposed as `loeNoSpan` on the
activity schedule response and the `ActivitySummary` shared type, with a plan-level `loeNoSpanCount` on
the schedule summary. With no `LEVEL_OF_EFFORT` activity present the new pass is a no-op and the
golden/parity path is byte-identical; existing rows read `false` until the plan is recalculated.
