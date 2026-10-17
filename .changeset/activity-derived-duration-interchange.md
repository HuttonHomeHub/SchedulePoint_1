---
'@repo/interchange': minor
---

An MS Project (MSPDI) export now writes a WBS summary's and a Level-of-Effort activity's `<Duration>` as the working time its calculated span covers, instead of the stored zero, when the plan has been recalculated. A task's duration, and the XER export, are unchanged.
