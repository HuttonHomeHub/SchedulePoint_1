---
'@repo/api': patch
---

A constraint dated so far ahead that the schedule cannot hold the resulting date is now refused with a clear `SCHEDULE_DATE_OUT_OF_RANGE` message (HTTP 422) instead of an opaque server error.
