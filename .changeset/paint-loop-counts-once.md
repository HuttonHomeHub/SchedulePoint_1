---
'@repo/web': patch
---

The TSLD painter and hit-test stop redoing per-frame work: the id→activity index is memoised on
the scene's array identity (the fan-out memo's pattern), each activity's screen rectangle is
computed once per frame and shared by culling, routing and every incident link instead of once per
consumer, and the pointer-move hit-test no longer rebuilds its index and re-sorts every edge on
each mousemove while the lag tool is armed. No visual change — draw order and geometry are
byte-identical; call-count gates pin the new bounds.
