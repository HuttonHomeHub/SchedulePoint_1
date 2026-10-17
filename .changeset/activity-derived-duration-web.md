---
'@repo/web': minor
---

A WBS summary and a Level-of-Effort activity now show how long they last. The Duration column of the activities table and the Gantt (and its print), the figure under a bar on the diagram, the spoken description of an activity, the Schedule CSV and the editor's Work section all state the working time the activity's calculated span covers, once the plan has been recalculated — instead of a dash for a summary and a false "0 d" for a Level-of-Effort. A summary shows the figure alone, without a float clause. Where there is nothing to state (an empty summary, a Level-of-Effort with no span, a plan not yet recalculated) the dash remains.
