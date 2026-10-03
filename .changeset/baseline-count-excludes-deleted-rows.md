---
'@repo/api': patch
---

A baseline's activity count now counts only live snapshot rows. The count read every row, relying on
the snapshot being stamped deleted together with its baseline; stating the filter makes the number
mean the same thing as the baseline's detail view and cannot drift from it.
