---
'@repo/interchange': minor
---

An XER export now writes a plan's swimlanes in SchedulePoint's own fields: the source, the WBS level and the swimlane names in order (an empty swimlane included), and for a hand-made plan each activity's swimlane and its lane inside it. A SchedulePoint file round trip keeps them. A plan without swimlanes exports exactly the file it did before, and an MSPDI export reports the swimlanes as not written.
