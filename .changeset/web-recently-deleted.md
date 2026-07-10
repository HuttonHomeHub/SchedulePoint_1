---
'@repo/web': minor
---

Add the recycle-bin web slice (E3): a "Recently deleted" screen
(`/orgs/:orgSlug/recently-deleted`, linked from the org nav for writers) listing
soft-deleted clients, projects and plans newest-first, each with a Restore
action. An item whose ancestor is still deleted can't be restored on its own, so
its row guides the user to restore the parent first (the top-down invariant);
restoring a client or project brings back everything deleted with it. Restore
outcomes (and name-collision errors) are announced via the shared live region.
