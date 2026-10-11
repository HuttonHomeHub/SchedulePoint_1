---
'@repo/api': patch
---

Two reads got cheaper with no change to what they return. A batch's history probe (a delete, restore or group
move over many activities) no longer fetches the latest history entry's change document, which a batch never
reads, and a plan's baseline list counts snapshot rows for the baselines on the page instead of grouping every
organisation's snapshot rows.
