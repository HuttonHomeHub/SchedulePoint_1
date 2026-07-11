---
'@repo/web': minor
---

Add **reposition-in-time** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind the
OFF-by-default `VITE_TSLD_EDITING` flag. In Select mode a writer drags an activity bar's body
sideways to move it in time: the drag shows an instant ghost of the moved bar, and on drop the
new start is imposed as an **SNET constraint** via the existing activity update (carrying the
live `version` for optimistic locking) and the schedule recalculates authoritatively — the
engine still owns the working-day placement (a bar may settle a day or two off the ghost on a
non-working day). A press without moving simply selects the bar. If someone else changed the
plan first, the stale-`version` 409 surfaces as a non-destructive conflict banner and the move
is not re-sent. Editing remains off in the default build.
