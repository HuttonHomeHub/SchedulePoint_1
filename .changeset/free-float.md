---
'@repo/api': minor
'@repo/types': minor
---

CPM engine now computes **free float** (M6-F1, ADR-0035 §17–§20): how far each activity can slip without
delaying the early start of any successor. It is measured on the activity's own working calendar
(ADR-0037 §4), computed alongside total float, persisted to the new engine-owned `activities.free_float`
column by the recalc's batched write, and exposed as `freeFloat` (whole working days) on the activity
schedule response and the `ActivitySummary` shared type. An open end (no successors) carries its total
float; free float is always ≤ total float. Existing rows read `null` until the plan is recalculated, and
the golden/parity path is byte-identical.
