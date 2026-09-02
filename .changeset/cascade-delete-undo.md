---
'@repo/web': minor
---

Deleting a WBS phase is now one undo step. Press Ctrl+Z and the phase, the work inside it, its nesting and its links come back with the ids they had — and the rest of your session's history is still there, where before it was cleared.

Deleting or dissolving from the activities panel is now recorded too. The same action was undoable from the diagram and silently not from the table. Note the consequence for Dissolve: it has no inverse, so dissolving from the panel now ends your undo history, as it already did from the diagram.
