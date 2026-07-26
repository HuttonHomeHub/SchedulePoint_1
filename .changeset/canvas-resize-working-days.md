---
'@repo/web': patch
---

fix(web): dragging a bar's end grows it by one working day per column

Resizing an existing activity had the same units bug the previous release fixed for drawing a new
one, one step further along. A 4-day activity that spans a weekend occupies six columns on the
diagram; dragging its end one column right sent seven — read as seven **working** days — and the bar
jumped to nine calendar days. One column of drag now means one working day of growth, on both the
finish and the start edge, and a start dragged onto a weekend lands on the next working day.

The duration shown in the chip while you drag is converted the same way, so it always states the
number the activity will actually have rather than a count of columns.
