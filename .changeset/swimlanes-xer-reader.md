---
'@repo/interchange': minor
---

The XER reader understands the swimlane fields a SchedulePoint file can carry: each activity's swimlane name and its lane inside it, and one project-level field naming where the plan's swimlanes come from and listing them in order. Names are held to the same shape as a swimlane made by hand (1 to 80 characters, no control characters, unique ignoring case), at most 100 are kept, and everything refused is counted in the report. The import report gains `swimlanes` and `swimlaneMembers` counts. No SchedulePoint release writes these fields yet, so only a hand-edited file carries them.
