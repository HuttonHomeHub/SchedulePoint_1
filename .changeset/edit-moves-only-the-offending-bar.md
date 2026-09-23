---
'@repo/web': minor
---

An edit never leaves two activities drawn on top of each other. When a stretch, a drag or a
recalculation makes two bars overlap, only the bar that caused it moves, to the nearest free row. The
move is announced, shown in the dock with Undo, and is its own undo step. A bar dropped onto an
occupied row goes on to the next free row in the direction it was moving, in the same write
(ADR-0153).
