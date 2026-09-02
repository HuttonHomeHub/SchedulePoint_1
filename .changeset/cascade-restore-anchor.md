---
'@repo/api': patch
---

Restoring a deleted WBS phase no longer depends on the order Postgres happens to return its rows in. A cascade delete stamps one batch id across the whole subtree, and the restore now anchors on the batch's root — the only member whose parent is active at that moment — rather than on whichever row came back first.
