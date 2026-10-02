---
'@repo/web': patch
---

A Progress-tab draft — reported progress, value measure or weighted steps — now survives a visit to another tab in the activity editor, and the tab's unsaved marker no longer outlives (or hides) the draft. Two saves started before the first finished now each record their undo step, show "Saved." and announce, instead of only the last one.
