---
'@repo/api': minor
---

Add the activity progress endpoint — `PATCH /organizations/:orgSlug/activities/:activityId/progress`.
This is the Contributor-capable path: it requires only `activity:update_progress`
(granted to Contributor upward), so a Contributor can record progress without the
Planner-only `activity:update` that changes logic or definition — the first
capability that distinguishes a Contributor from a Viewer. It moves
`percentComplete` and the actual start/finish dates only; `status` is derived
server-side (finish/100% → COMPLETE, start/any % → IN_PROGRESS, else NOT_STARTED)
so it can never contradict the numbers, and an actual finish must have a start and
cannot precede it (422). Definition endpoints continue to reject progress fields
and vice-versa.
