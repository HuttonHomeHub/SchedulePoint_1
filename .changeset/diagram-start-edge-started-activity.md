---
'@repo/web': patch
---

The diagram no longer lets you drag the start edge of an activity that has already started or finished. That edge did nothing useful there: the schedule uses the actual start, so the drag only changed the duration and moved the finish. The start edge now offers no grab handle, and if a start-edge change is attempted anyway the diagram says why it can't be done, matching the Gantt.
