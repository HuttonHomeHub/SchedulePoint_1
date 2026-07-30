---
'@repo/api': minor
---

Add `POST …/activities/:activityId/dissolve` — remove a WBS grouping, keep the work.

Promotes the summary's direct children to its own parent (or the top level), then soft-deletes the
now-childless summary, in one transaction under the plan advisory lock, so a child can never be
stranded between the two writes: the count of active activities falls by exactly one.

Deliberately a separate endpoint rather than a flag on `DELETE`, which cascades to the whole
subtree. That cascade is right when the work is genuinely cancelled and catastrophic when the
planner only meant to drop a level of grouping, so the destructive reading must never be the
default. A nested branch keeps its shape — a grandchild stays under its own parent, which simply
moves up a level. Restoring a dissolved summary brings back the summary alone.
