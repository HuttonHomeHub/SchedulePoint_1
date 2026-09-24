---
'@repo/api': minor
'@repo/web': patch
'@repo/interchange': minor
---

A P6 (XER) export now carries each activity's hand-placed start and lane, so exporting a plan and importing the file back gives the same picture: every bar where it was placed, in the lane it sat in. The two values travel as SchedulePoint's own user-defined fields. P6 and other tools ignore them and show each activity at its computed dates, and the export report says so in one line. Every other part of the file is byte for byte what it was before. An MSPDI export does not carry them yet and reports the placements as dropped, as before.
