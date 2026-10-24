---
'@repo/api': minor
---

Importing a SchedulePoint XER that carries swimlanes now restores them. With "Restore the SchedulePoint layout" on (the default), the new plan gets the swimlanes by name in the file's order, the plan's swimlane source, each activity's membership, and a lane for every member inside its swimlane (a lane the file carried is kept; the rest are packed within the swimlane). Names are held to the same rules as a swimlane made by hand, spellings that differ only by case are merged, at most 100 are kept, and anything refused is counted in the report, which also gains `swimlanes` and `swimlaneMembers` counts. No SchedulePoint release writes these fields yet, so only a hand-edited file carries them.
