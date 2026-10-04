---
'@repo/api': patch
---

Permanent deletion of old deleted work now counts an activity's change history at its measured cost. A
history row is about a tenth of an activity's cost to delete, so one hourly run now clears ten times as
many history rows before it stops and waits for the next one. Nothing changes for planners.
