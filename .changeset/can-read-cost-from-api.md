---
'@repo/api': patch
'@repo/web': patch
'@repo/types': patch
---

Plan responses now carry `canReadCost`, the caller's own cost permission, and the activity editor's Cost tab follows it instead of deriving it from the role. Who can see cost is unchanged.
