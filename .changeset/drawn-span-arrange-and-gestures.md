---
'@repo/web': patch
---

Arrange no longer draws a hand-placed activity on top of its predecessor. Arrange, the keyboard
nudges, the plural drag, bulk move and the finish-edge resize all worked from an activity's early
dates while the diagram draws it where it was placed, so a placed bar could be packed into the same
row as the bar it overlaps, `Alt+→` could move a placement by several days rather than one, and a
resize could write a duration different from the one dragged. The spoken link slack in the logic
summary disagreed with the gap drawn on the canvas for the same reason. They now all work from where
the bar is drawn.
