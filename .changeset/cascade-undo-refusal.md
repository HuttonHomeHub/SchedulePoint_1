---
'@repo/web': patch
---

When an undo can't apply because a phase the work was filed under has since been deleted, it now says which action recovers it — restore that phase, then undo again — instead of telling you to refresh, which doesn't help.
