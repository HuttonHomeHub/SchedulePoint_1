---
'@repo/api': patch
'@repo/web': patch
---

An opened plan now says "Edited since it was last calculated", with a Recalculate button, whenever the organisation overview says it. The plan used to know only about edits made in that browser tab, so a plan edited elsewhere could be flagged on the overview while the plan itself offered no way to recalculate. The plan response gains an `editedSinceCalculated` field.
