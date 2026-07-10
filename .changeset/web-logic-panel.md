---
'@repo/web': minor
---

Add the read-only Logic panel for activities. Each activity row on the plan-detail
screen gets a "Logic" action (available to any member) that opens a panel showing
its **predecessors** (what must finish before it) and **successors** (what it
drives) — each a table of the other-end activity, dependency type (FS/SS/FF/SF),
and signed lag. The activities table stays dependency-free: it emits an
`onOpenLogic` callback and the plan-detail route owns the panel. Add/edit/remove
affordances land next.
