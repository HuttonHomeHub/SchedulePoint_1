---
'@repo/api': patch
---

The staff console's Run diagnostics now takes one consistent, read-only snapshot and gives up on any single statement that runs past three seconds, instead of running thirty-two separate unbounded queries.
