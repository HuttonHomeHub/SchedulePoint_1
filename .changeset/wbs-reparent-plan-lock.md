---
'@repo/api': patch
---

Serialise WBS re-parenting with the plan advisory lock.

`assertValidParent` walks an activity's ancestor chain and then writes on the strength of what it
read, but its two callers — activity create and activity update — ran that read-then-write without
the per-plan advisory lock ADR-0038 invariant (a) assumes. Two concurrent mirror re-parents (A under
B, B under A) could each read a still-acyclic tree, both pass, and leave the WBS parent tree cyclic;
optimistic `version` cannot catch it, because each request writes only its own row at exactly the
version it read.

Both callers now take `acquirePlanWriteLock` — only on the branch that sets a non-null parent, so an
ordinary edit and a top-level create are unchanged, and before the calendar guard's lock so this
service has one acquisition order.
