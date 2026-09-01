---
'@repo/web': patch
---

Fix three things a planner can see, and one they could not.

**The Gantt's baseline column no longer paints over the chart.** With an active
baseline the `vs baseline` column sat outside the grid pane's width arithmetic,
so the pinned block was 72 px wider than the pane at every width and the column
covered the leftmost bars. Separately, a stored divider position never followed
a floor that moved — so capturing a baseline could leave the grid below the
width its own columns need.

**The activities table's selection checkboxes are a 24 x 24 pointer target.**
They were 16 px, which is below WCAG 2.2 §2.5.8 (AA). The painted box is
unchanged; only the area a pointer may hit is wider.

**A navigation that completes by itself now says why.** When work is saved while
the "leave without saving?" confirmation is open, the page moves with no gesture
from the reader; that is now announced rather than happening in silence — and
the path that does it is now reliable, where before it depended on an unrelated
re-render.
