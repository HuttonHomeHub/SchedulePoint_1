---
'@repo/web': minor
---

Add **Auto-arrange lanes** to the Time-Scaled Logic Diagram (M8 M4 4.3, ADR-0026, behind
`VITE_TSLD_EDITING`). A toolbar action repacks the diagram's activities into the **fewest lanes
with no time-overlap** using a pure, deterministic greedy first-fit packer, and persists the
result in one all-or-nothing batch write (no schedule recalculation — it changes only vertical
layout). Because a bulk reorder can move many bars and isn't undoable yet, it's guarded by a
confirm dialog; only the activities whose lane actually changes are written (the minimal diff),
an already-tidy diagram reports "nothing to move", and a concurrent edit is surfaced
non-destructively (the whole pack is refused, nothing moves).
