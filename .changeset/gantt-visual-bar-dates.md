---
'@repo/web': patch
---

Fix the Gantt drawing a Visual-mode plan's bars from the wrong dates.

The chart read each activity's computed **earliest** dates unconditionally while the logic diagram
read the engine's **effective-Visual** dates, so in a plan using Visual scheduling the two views
disagreed about where every hand-placed bar sat — including in the printed programme. Each view was
internally consistent, so the disagreement was visible only to someone opening the same plan both
ways. Plans in the default Early mode were never affected.
