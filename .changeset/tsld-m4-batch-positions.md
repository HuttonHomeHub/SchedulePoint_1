---
'@repo/api': minor
---

Add a batch **lane-position** endpoint for the Time-Scaled Logic Diagram (M8 M4, ADR-0026):
`PATCH /organizations/:orgSlug/plans/:planId/activities/positions`. It moves one or more of a
plan's activities to new lanes (`laneIndex`) in a single **all-or-nothing** transaction —
backing on-canvas lane drag and the upcoming auto-arrange. Every id must be an active activity
in the plan+org (anti-IDOR) and still match its optimistic-lock `version`, or the whole batch
is rejected (409) and nothing moves. Requires `activity:update` (Planner/Org Admin). It is
layout only: no dates change and no CPM recalculation runs (x = time is engine-owned; y = lane
is stored). A `DUPLICATE_POSITION_ID` (422) guards a batch that names the same activity twice.
