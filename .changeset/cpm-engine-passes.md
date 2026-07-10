---
'@repo/api': minor
---

Add the CPM engine's forward/backward pass to the pure scheduling library:
early/late start & finish, total float, and critical / near-critical flags,
computed in continuous working-day offsets and mapped to inclusive calendar
dates via the `WorkingDayCalendar` port (ADR-0023). Honours all four
relationship types (FS/SS/FF/SF) with signed lag and zero-duration milestones,
proven against a golden suite of hand-worked networks. Still an internal library
(unwired) — the recalculate endpoint that persists these values lands next.
