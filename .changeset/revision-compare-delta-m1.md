---
'@repo/api': minor
'@repo/types': minor
---

Add the revision comparison read model and its route: what entered and left the critical path
between two computed schedules of one plan, and how far the completion moved.

The route (`GET …/schedule/revision-compare`) ships **dark** — nothing in the web client calls it
yet, and its entry point lands with the comparison dock. The CPM engine is not invoked: both sides
are already-computed persisted output, so the recalculation parity gate is untouched by
construction. It reports what moved and never what caused it.
