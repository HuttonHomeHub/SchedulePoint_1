---
'@repo/web': minor
---

Make on-canvas bar dragging **two-dimensional** in the Time-Scaled Logic Diagram (M8 M4,
ADR-0026, behind `VITE_TSLD_EDITING`). A body drag now moves an activity **freely in both axes
at once**: horizontally to a new start day (an SNET constraint that recalculates the schedule —
the existing M2 move) **and** vertically to a new lane (`laneIndex`, layout only — no recalc).
Per-axis snapping gives a half-cell dead-zone, so a mostly-horizontal drag won't accidentally
change lanes (and vice-versa). A drop commits only the axes that actually changed as one
optimistically-locked write: a lane-only move is the cheap `{ laneIndex, version }` PATCH (no
recalc); a time move (with or without a lane change) is one PATCH carrying the SNET constraint
(and the lane) followed by a recalc. Keyboard users get the same reach: **`Alt+↑ / Alt+↓`** on
the focused activity in the parallel listbox nudges it one lane (WCAG 2.1.1). A stale-version
conflict is surfaced non-destructively and never re-sent.
