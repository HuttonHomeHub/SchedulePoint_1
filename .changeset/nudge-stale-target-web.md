---
'@repo/web': patch
---

Leaving a plan no longer re-sends an earlier keyboard move or resize, which could undo an undo and show a conflict message. A keyboard nudge after an undo or another edit now starts from the row as it is now, not from the value it was nudged to before.
