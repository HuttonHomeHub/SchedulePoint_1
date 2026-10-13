---
'@repo/api': patch
---

Deleting a plan, project or client no longer fails with a server error when a recalculation is running or someone is dragging bars at the same moment. The delete now waits its turn instead, and restoring a single activity does the same.
