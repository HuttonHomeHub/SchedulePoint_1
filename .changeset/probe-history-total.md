---
'@repo/api': patch
'@repo/web': patch
---

The staff performance history now says how many readings exist ("Showing the most recent 50 of 312 readings") instead of silently listing a capped page. The history read returns `meta.total`, and the oldest sitting only hedges its missing-readings note when rows were really withheld.
