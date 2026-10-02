---
'@repo/web': minor
---

Gantt: the left end of a bar can now be dragged to change when an activity starts, keeping its finish
(one undo restores it), and a bar that cannot take it — started, finished, a milestone, level-of-effort
or summary — no longer offers the handle. Typing a Start on an activity that has started is now refused
with the reason. This release also corrects what three Gantt controls write: dragging a bar's right end,
typing a Finish and typing a Start now count working days, as the diagram does, so a five-day task
stretched across a weekend keeps the length it was drawn instead of coming back two days longer.
Level-of-effort bars no longer offer a right-end resize the schedule ignored, and a drag, nudge or
resize now announces its real outcome (including a refusal) after the save rather than before it.
