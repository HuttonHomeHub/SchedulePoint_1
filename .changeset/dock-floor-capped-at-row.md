---
'@repo/web': patch
---

The selection bar's dock floors are capped at the width of the foot row. At 200 % text, where the window's
media queries do not follow the text size, the bar's 36 rem floor could be wider than the row and push its
tail, `Edit` first, off the screen. At normal text size nothing changes.
