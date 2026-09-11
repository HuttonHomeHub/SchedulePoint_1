---
'@repo/web': patch
---

The Gantt's Start and Finish cells accept a typed date again, and now actually write one. Typing a
start date in Early mode pins the activity there (the same constraint dragging its bar's start edge
writes) and shortens the duration so the finish stays put; in Visual mode it hand-places the bar and
writes no constraint at all. Typing a finish date changes the duration in both modes and pins
nothing — which is exactly what dragging the finish edge does, so the grid and the diagram cannot
come to mean different things.

The first time it happens in a session the product says what it just did, and every edit is
undoable with Ctrl+Z. An activity carrying a mandatory constraint refuses the edit and says where to
change it instead, rather than silently replacing a constraint the whole downstream chain depends
on.

Dates are read in the format the cell displays (`05 Mar 2026`) or the wire format (`2026-03-05`).
All-numeric dates like `05/03/2026` are refused on purpose: they mean two different days to two
different readers, and a scheduling tool guessing is worse than one asking.
