---
'@repo/api': minor
---

The organisation export's format moves to `1.1`: `activities` gains `derivedDurationMinutes`, appended as its last column — the working minutes a WBS summary's or level-of-effort activity's calculated span covers. It stays empty until the scheduling engine writes it and the plan is recalculated, and is empty for every other activity type. The database gains the matching `activities.derived_duration_minutes` column (nullable, never negative); no existing data changes.
