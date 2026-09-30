---
'@repo/api': patch
---

Fix: tasks that follow started, finished or expected-finish work are now drawn at the right dates.
Previously they were drawn after the earlier task's full planned duration, so some bars sat too late
and, where remaining work runs longer than planned, some too early. Some bars move, and the stated
project finish can change. Existing plans are corrected once, when the new version starts. A baseline
taken before this release shows the correction as variance.
