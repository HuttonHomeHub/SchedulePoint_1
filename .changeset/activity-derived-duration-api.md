---
'@repo/api': minor
'@repo/types': minor
---

Every activity read, and the shared-plan read, now carries `derivedDurationMinutes` and `derivedDurationDays`: the working time a WBS summary's or Level-of-Effort activity's calculated span covers, written by the scheduling engine on each recalculation. They are empty for every other activity type, for a summary with no children, for a Level-of-Effort with no resolvable span, and until the plan is next recalculated.
