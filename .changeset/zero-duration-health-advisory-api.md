---
'@repo/api': minor
---

The schedule health check now reports zero-duration tasks in a new `advisories` array beside its
fourteen DCMA metrics. A zero-duration task is usually a milestone entered as a task. The advisory
lists each one with how many resource assignments it holds, gives the count out of the plan's
activities, and says how many of them are resourced. It reads stored durations, so a plan that has
never been calculated is still assessed. It is never counted in the summary, and the fourteen
metrics and their order are unchanged. The health check makes no extra query for it.
