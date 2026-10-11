---
'@repo/api': patch
---

Moving, arranging or applying levelling to many activities while the plan recalculates can no longer fail with an unexplained error: both now take their activity row locks in the same order. Deleting a summary activity also waits for an in-flight recalculation instead of racing it.
