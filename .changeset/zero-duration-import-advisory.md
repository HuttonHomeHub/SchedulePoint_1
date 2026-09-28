---
'@repo/interchange': minor
'@repo/api': minor
---

An import now names each activity it brought in as a task with no duration, under **Advisories** in
the import review, from both P6 (`.xer`) and Microsoft Project (`.xml`) files. The activity is
imported unchanged; the advisory suggests converting it to a milestone afterwards. The import
report's API response documents the optional `advisories` array, which is absent when there is
nothing to advise.
