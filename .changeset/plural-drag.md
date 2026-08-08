---
'@repo/web': minor
---

Dragging one of a plural canvas selection now moves them all.

The selection could already be built, chained and deleted as a set; a drag still moved one bar.
Every activity in the selection now moves by the same delta, as one batch write and one undoable
step, mode-aware exactly as the single-bar drag is. The selection bar says so before you drag.
