---
'@repo/api': minor
'@repo/web': minor
'@repo/interchange': minor
'@repo/layout': minor
---

Importing a SchedulePoint XER now restores its layout: each activity's hand-placed start and lane, read from two user-defined fields only SchedulePoint writes. Lanes the file carried stay where they were, and activities without one are placed around them. The import dialog shows how many placed starts and lanes it will restore, and offers **Restore the SchedulePoint layout** so a planner can switch it off. The report names placements the logic no longer allows and carried lanes whose bars overlap. A file from another tool imports exactly as before, apart from one new finding counting any user-defined fields it carried that were not imported.

Export does not write these fields yet; that ships in the next release, so this reader is already deployed when the first layout-carrying file exists. A browser tab still running an older SchedulePoint cannot read the two new report counts, which is why the reader ships first.
