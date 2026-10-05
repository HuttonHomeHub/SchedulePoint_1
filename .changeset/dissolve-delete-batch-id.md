---
'@repo/api': minor
---

Dissolving a WBS summary now also returns `deleteBatchId`, the batch its own soft-delete was stamped with, so the dissolve can be undone through `restore-batch`.
