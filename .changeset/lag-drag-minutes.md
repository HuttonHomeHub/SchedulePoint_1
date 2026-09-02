---
'@repo/web': patch
---

Dragging or nudging a link's lag no longer destroys a sub-day value. The gesture now says how many
whole days it moved and the write carries minutes, so a four-hour cure nudged one day becomes
`1d 4h` rather than two whole days. Undo restores the stored minutes too.
