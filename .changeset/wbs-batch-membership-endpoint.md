---
'@repo/api': minor
---

Add the batch WBS membership write, `PATCH …/plans/:planId/activities/parents`.

Files one or more of a plan's activities under a summary — or, on a null `parentId`, back at the
top level — in a single all-or-nothing transaction, so managing a summary's whole membership in one
place either lands wholesale or not at all. Modelled on the existing `positions` batch, but
structural: `parentId` feeds the engine's WBS rollup, so a committed batch leaves the plan's
computed dates stale until the next recalculation.

Validated against the **resulting** tree rather than the current one. A row-by-row check against
pre-state would accept a batch like "A under B" plus "B under A" — each row files a childless
top-level summary under another, so each passes alone, while together they close a cycle. The batch
is overlaid on the plan's current edges and the whole result is walked, which is also cheaper than
a per-row ancestor walk.
