---
'@repo/web': patch
---

The plan workspace's toolbar no longer rebuilds on every render. The recalculate command kept a
fresh identity each render, which re-created the whole toolbar context and re-ran its layout.
