---
'@repo/api': patch
---

Adds the database tables that will hold a plan's P6 activity codes, and lets a baseline remember each activity's code for the code its swimlanes are drawn from. Nothing uses them yet, and nothing changes for existing plans or baselines; the update adds well under a second to the first start after it. The organisation export (format 2.2) lists the new files, `code-types`, `code-values`, `code-value-assignments` and `code-swimlane-lanes`, which are empty until codes can be created, and a permanent delete of an expired plan now removes its codes with it.
