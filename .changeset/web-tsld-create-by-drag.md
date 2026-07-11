---
'@repo/web': minor
---

Add on-canvas **create-by-drag** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind
the OFF-by-default `VITE_TSLD_EDITING` flag. When enabled for a writer (Planner/Org Admin),
the diagram gains an **Add activity** tool: drag on the timeline to draw a task (a click or
sub-day drag makes a 1-day task), then name it in an inline popover — `Enter` creates it,
`Esc` cancels with nothing persisted. The new activity is placed at the dropped day via an
SNET constraint and the schedule recalculates authoritatively (no client-side CPM); the drag
shows an instant ghost on a dedicated interaction layer so feedback never waits on the network.

Every gesture keeps a keyboard-operable equivalent (the create dialog/table), so nothing is
pointer-only. With the flag off — the default build — the diagram is byte-for-byte the M1
read-only surface.
