---
'@repo/api': patch
---

fix(api): the overview says a plan was "edited since it was calculated" only when a scheduling input changed. Moving a bar to another row, Arrange, the overlap fix, a rename and cost or steps edits no longer raise the warning after a recalculation. A plan where an activity or link was deleted after its last calculation will now correctly show the warning, which it did not before. Calendar and resource-limit edits still do not raise it.
