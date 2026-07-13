---
'@repo/web': minor
---

feat(web): canvas-first authoring — unified auto-recalculate (ADR-0032, M3)

Behind `VITE_CANVAS_AUTHORING`: after any structural edit — from the canvas **or** the activities
table — the CPM schedule recalculates automatically, so the canvas plots new/changed rows without a
manual Recalculate (the original pain of adding via the table). A plan-scoped `usePlanAutoRecalc`
coalescer (trailing ~500 ms debounce + single-flight) drives it: the workspace model watches the
activity/dependency count for creates/deletes (any surface) and the canvas edit callbacks `notify()`
for repositions; the manual Recalculate button becomes a `flush()`. Guarded on role + pen + a start
date. The recalculate endpoint and ADR-0022's engine-owned batched write are unchanged — only the
client cadence. Flag-off keeps the per-edit inline recalc byte-for-byte.
