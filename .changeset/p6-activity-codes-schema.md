---
'@repo/api': patch
---

Adds the database tables that will hold a plan's P6 activity codes, and lets a baseline remember each activity's code for the code its swimlanes are drawn from. Nothing uses them yet, and nothing changes for existing plans or baselines; the update adds well under a second to the first start after it.
