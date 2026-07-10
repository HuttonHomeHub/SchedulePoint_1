---
'@repo/api': minor
---

Extend the shared HierarchyLifecycleService so soft-delete/restore includes
activity dependencies (links). Deleting an activity now also soft-deletes its
incident links (either direction) in the same batch; deleting a plan/project/
client sweeps every link contained in the affected plans; a dependency can also
be soft-deleted directly as its own leaf. Restore reactivates a batch's links
**endpoint-guarded** — only where both endpoint activities are active — so a link
whose other end was deleted separately stays soft-deleted (a bounded, documented
edge case). The four-level M3 cascade/restore is unchanged and fully regression-
covered.
