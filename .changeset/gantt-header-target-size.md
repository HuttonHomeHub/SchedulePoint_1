---
'@repo/web': patch
---

The Gantt grid's six sortable column headers — Code, Activity, Duration, Start, Finish, Float —
were 16 px tall, below WCAG 2.2 §2.5.8's 24 px minimum target size. They now clear it, with the
label painted exactly where it was.

Found by extending the target-size sweep to the Gantt view, which an approved plan had specified
and which had never been built for that half.
