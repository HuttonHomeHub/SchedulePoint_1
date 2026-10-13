---
'@repo/web': patch
---

In the Gantt, a mouse press on the left edge of a row's three-dots menu or on the Float left heading no longer moves the divider between the table and the chart instead. The three dots now sit inside the table, with a small empty margin at its right edge, so nothing in the table lies under the divider's grab area. The table is 48 px wider by default and the Activity column keeps its width. The time-scale presets (Month, Quarter) now frame the chart's width less those 48 px, so each day is slightly narrower than before and the same stretch of the plan fits in view.
