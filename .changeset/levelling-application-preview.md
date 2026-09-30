---
'@repo/api': minor
'@repo/types': minor
---

New read `GET …/plans/:planId/schedule/levelling-application` previews applying a plan's levelled positions as placements: the exact rows to send to the batch placement route, and what writing them would do. Nothing is written by the read. Each target is a working day on the activity's own calendar, and a target the plan's links refuse is left out and reported.
