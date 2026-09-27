---
'@repo/web': minor
---

A task with no duration can now be turned into a milestone. Select it and choose **Make milestone…**
from the bar at the foot of the diagram, from the Gantt row menu, or from the activities table's row
menu. The dialog offers a finish or a start milestone, says how each is dated, and preselects finish
when the task has a predecessor. Converting keeps every date its successors read, and one undo puts
it back. The action is shaded, with the reason, when you do not hold the edit lock or when the task
has resource assignments (a milestone does no work). Also fixed: an icon-only control's name
tooltip now opens above its control when there is no room below, instead of covering the control
and swallowing the mouse click.
