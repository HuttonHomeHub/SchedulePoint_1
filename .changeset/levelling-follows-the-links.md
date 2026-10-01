---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Levelling now pushes the work that follows a delayed activity: followers have levelled ghosts, the
levelled finish includes them, and Apply levelled dates lets them follow by their links. Existing
levelled plans will show new ghosts and a later levelled finish at their first recalculation after this
release. Apply levelled dates writes no row for a bar that only moved because the work before it moved
(it follows its links), and a hand-placed one moves with it; the preview reports the first as
`followingLinks` and each row's `reason`.
