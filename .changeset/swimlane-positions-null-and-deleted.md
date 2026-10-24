---
'@repo/api': patch
---

Fix the swimlane lane write in `PATCH …/activities/positions`: a row's `swimlane.swimlaneId: null` now clears the activity's membership ("No swimlane") and stores the lane against that basis, where it was silently ignored; and a member whose swimlane has been deleted can have a lane written (as "No swimlane", keeping its remembered swimlane for a restore) instead of failing the whole batch with 404.
