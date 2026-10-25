---
'@repo/api': minor
---

Exporting a plan as XER now includes its swimlanes: the export reads the plan's active swimlanes and the lane each activity holds inside its swimlane, so importing the file into another project restores them under "restore layout". A plan without swimlanes exports as before.
