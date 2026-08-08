---
'@repo/web': minor
---

Canvas multi-select — the bulk-operation foundations (still dark; behind
`VITE_CANVAS_MULTI_SELECT`, default off).

Adds the pure and data-layer half of the three bulk operations: a mode-aware row builder that turns
a plural drag into complete placement rows (EARLY pins an `SNET`, Visual writes `visualStart`, a
lane-only move leaves every date field alone), a chain planner that orders a selection by time and
refuses one that would close a cycle **against the resulting graph**, the client hooks for the
placements / bulk-delete / restore-batch endpoints, and the two undo commands — a bulk move that
threads versions through every batch response, and a bulk delete whose undo is one id-stable batch
restore so the links between the deleted activities survive it.
