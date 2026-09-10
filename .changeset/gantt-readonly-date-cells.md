---
'@repo/web': patch
---

Gantt: the Start and Finish columns are read-only, instead of opening an editor that refuses every value.

Double-clicking either cell on a calculated plan opened an editor, took a keystroke, and answered
"That value is not something this cell accepts." to a correctly formatted date — shown and spoken.
No value was accepted, so the message read as though the planner had typed the date wrong.

The refusal itself was right: the engine owns those dates, so a typed date has to write the
constraint a drag writes rather than assert an answer the server recomputes. What was wrong is that
the cells were left lit while that write was refused. They are now ordinary read-only columns.

Typing a date into the Gantt remains unbuilt and is specified separately.
