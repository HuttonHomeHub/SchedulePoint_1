---
'@repo/api': patch
---

Changing an activity's type into or out of WBS summary is now refused when it would break the
schedule's structure: a summary that still has children can no longer be turned into a plain
activity (leaving its children pointing at a non-summary parent), and an activity that still has a
dependency can no longer be turned into a summary (which is not allowed to carry logic). Both
refusals name how many children or dependencies stand in the way.
