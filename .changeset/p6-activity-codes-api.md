---
'@repo/api': minor
---

Adds the API for a plan's P6 activity codes. A plan can now hold code types (Area, Trade) with their values, and a planner holding the pen can add, rename, reorder, delete and restore them under `/plans/:planId/code-types` and `/code-values`, up to 100 types per plan and 1,000 values per type. `PATCH /plans/:planId/activities/codes` sets or clears a value on many activities in one write, and the activity list gains a per-page `codes` field that is left out entirely when the plan has no code type, so plans that never use codes answer exactly as before. Deleting a code type or value, and restoring one, is recorded in the audit log, and setting a value is recorded in the activity's history. Nothing in the screens uses these yet.
