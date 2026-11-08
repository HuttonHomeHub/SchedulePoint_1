---
'@repo/api': minor
---

Breaking: the four deprecated date fields on each moved row of the revision comparison (`criticalPath.entered[]` and `.left[]` of `revision-compare` and `cross-plan-revision-compare`) are removed. `fromEarlyStart`, `toEarlyStart`, `fromEarlyFinish` and `toEarlyFinish` carried the same values as `fromStart`, `toStart`, `fromFinish` and `toFinish`, which stay. A program that still reads the old names must read the new ones.
